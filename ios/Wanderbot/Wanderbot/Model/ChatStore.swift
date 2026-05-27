import Foundation

/// One persisted chat message. Field names match the web
/// `ChatMessage` shape (`content`, `timestamp`, `isHidden`) so the
/// web mirror writing to RTDB and the iOS reader hit the same JSON.
/// `responseID` / `previousResponseID` are iOS-side extras for
/// OpenClaw conversation chaining — web ignores them.
struct ChatMessage: Identifiable, Hashable, Codable {
    enum Role: String, Codable { case user, assistant, system }

    var id: String
    var role: Role
    var content: String
    /// Milliseconds since epoch (web uses `Date.now()` which is ms).
    var timestamp: Double
    /// Excluded from the visible UI but kept in history. The web flag
    /// — we honour it so context-injection messages don't show up.
    var isHidden: Bool?
    /// Server-issued id for this turn (assistant turns only). Used as
    /// `previous_response_id` on the next user turn so OpenClaw keeps
    /// the transcript across devices.
    var responseID: String?
    /// `previous_response_id` we sent for this turn (user turns).
    var previousResponseID: String?
    /// `true` while the assistant message is still being streamed.
    /// Not persisted — clients show a "typing" indicator locally and
    /// overwrite when the final text lands.
    var pending: Bool?

    enum CodingKeys: String, CodingKey {
        case id, role, content, timestamp, isHidden, responseID, previousResponseID
    }
}

/// Chat sessions keyed by trip id. Persisted under
/// `/wanderbot/chat_sessions/<tripId>/<messageId>` in RTDB so every
/// device sees the same transcript.
@MainActor
final class ChatStore: ObservableObject {
    /// `tripId → messages (sorted by createdAt asc)`
    @Published var messagesByTrip: [String: [ChatMessage]] = [:]
    @Published var isSending: Set<String> = []

    private var rtdb: FirebaseRTDB?
    private var gateway: GatewayClient?
    private var subscriptionTasks: [String: Task<Void, Never>] = [:]

    init() {
        if WanderbotConfig.firebaseEnabled {
            self.rtdb = FirebaseRTDB(databaseURLString: WanderbotConfig.firebaseDatabaseURL)
        }
        self.gateway = GatewayClient()
    }

    /// Open the live SSE subscription for one trip's chat. Idempotent.
    func ensureSubscription(for tripID: String) {
        guard subscriptionTasks[tripID] == nil else { return }
        guard let rtdb else { return }
        subscriptionTasks[tripID] = Task { [weak self] in
            // Initial load + live updates.
            let initial = await rtdb.loadChatSession(tripID: tripID)
            await self?.applyMessages(initial, for: tripID)
            for await snapshot in await rtdb.subscribeToChatSession(tripID: tripID) {
                await self?.applyMessages(snapshot, for: tripID)
            }
        }
    }

    func stopSubscriptions() {
        for task in subscriptionTasks.values { task.cancel() }
        subscriptionTasks.removeAll()
    }

    /// Send a user message, stream the assistant reply, and persist
    /// both to RTDB. Returns the assistant message id so callers can
    /// scroll-to-bottom etc.
    @discardableResult
    func send(tripID: String, text: String) -> Task<Void, Never> {
        Task { [weak self] in
            await self?._send(tripID: tripID, text: text)
        }
    }

    private func _send(tripID: String, text: String) async {
        let now = Date().timeIntervalSince1970 * 1000
        let lastAssistant = messagesByTrip[tripID]?.last(where: { $0.role == .assistant })
        let previousID = lastAssistant?.responseID

        let userMsg = ChatMessage(
            id: UUID().uuidString,
            role: .user,
            content: text,
            timestamp: now,
            isHidden: nil,
            responseID: nil,
            previousResponseID: previousID,
            pending: nil
        )
        appendLocal(userMsg, for: tripID)
        await rtdb?.upsertChatMessage(tripID: tripID, message: userMsg)

        var assistant = ChatMessage(
            id: UUID().uuidString,
            role: .assistant,
            content: "",
            timestamp: now + 1,
            isHidden: nil,
            responseID: nil,
            previousResponseID: previousID,
            pending: true
        )
        appendLocal(assistant, for: tripID)
        isSending.insert(tripID)
        defer { isSending.remove(tripID) }

        guard let gateway else {
            assistant.content = "Gateway not configured. Set `WanderbotConfig.gatewayURL`."
            assistant.pending = false
            updateLocal(assistant, for: tripID)
            await rtdb?.upsertChatMessage(tripID: tripID, message: assistant)
            return
        }

        do {
            for try await event in gateway.send(text: text, previousResponseID: previousID) {
                switch event {
                case .delta(let chunk):
                    assistant.content += chunk
                    updateLocal(assistant, for: tripID)
                case .completed(let id):
                    /* Hold off on flipping pending=false until the
                       RTDB mirror lands below — pending acts as the
                       "keep me visible locally even if a snapshot
                       arrives mid-flight" flag in applyMessages. */
                    assistant.responseID = id
                    updateLocal(assistant, for: tripID)
                case .failed(let msg):
                    assistant.content += assistant.content.isEmpty ? msg : "\n\n⚠️ \(msg)"
                    updateLocal(assistant, for: tripID)
                }
            }
        } catch {
            /* Include a URL error code where we can — turns a vague
               "the request timed out" into something we can actually
               diagnose (.timedOut vs. .cannotFindHost vs. .notConnectedToInternet
               etc.). Mirrors the NSLog in GatewayClient.stream so the
               UI message + console log agree. */
            let detail: String
            if let urlErr = error as? URLError {
                detail = "\(urlErr.localizedDescription) (URLError \(urlErr.code.rawValue))"
            } else {
                detail = error.localizedDescription
            }
            assistant.content += assistant.content.isEmpty
                ? "Couldn't reach the gateway: \(detail)"
                : "\n\n⚠️ \(detail)"
            updateLocal(assistant, for: tripID)
        }

        /* Mirror first, THEN clear pending. This sequence guarantees
           the message exists on the remote (so applyMessages always
           sees it in `incoming`) before we drop the local pending
           override. */
        await rtdb?.upsertChatMessage(tripID: tripID, message: assistant)
        assistant.pending = false
        updateLocal(assistant, for: tripID)
    }

    // MARK: - Local mutation helpers

    private func appendLocal(_ message: ChatMessage, for tripID: String) {
        var list = messagesByTrip[tripID] ?? []
        list.append(message)
        messagesByTrip[tripID] = list
    }

    private func updateLocal(_ message: ChatMessage, for tripID: String) {
        guard var list = messagesByTrip[tripID] else { return }
        if let idx = list.firstIndex(where: { $0.id == message.id }) {
            list[idx] = message
        } else {
            list.append(message)
        }
        messagesByTrip[tripID] = list
    }

    private func applyMessages(_ incoming: [ChatMessage], for tripID: String) {
        /* Merge remote snapshot onto local state. Two classes of local
           messages must survive a snapshot tick or they'll briefly
           vanish from the UI:
             • pending=true     — assistant currently streaming; not
                                  written to RTDB until the loop ends.
             • not-yet-on-remote — finished assistants (pending=false)
                                  in the gap between the .completed
                                  event and the upsertChatMessage call,
                                  and freshly-appended user messages
                                  whose write hasn't round-tripped yet.
           Once the remote catches up, the incoming copy wins (same id),
           so this never displays stale local state for long. */
        let local = messagesByTrip[tripID] ?? []
        let incomingIDs = Set(incoming.map { $0.id })
        let localPreserved = local.filter {
            $0.pending == true || !incomingIDs.contains($0.id)
        }
        var byID: [String: ChatMessage] = [:]
        for m in incoming where m.isHidden != true { byID[m.id] = m }
        for p in localPreserved { byID[p.id] = p }
        messagesByTrip[tripID] = byID.values
            .sorted { $0.timestamp < $1.timestamp }
    }

    func messages(for tripID: String?) -> [ChatMessage] {
        guard let tripID else { return [] }
        return messagesByTrip[tripID] ?? []
    }
}
