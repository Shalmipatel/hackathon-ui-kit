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
                    assistant.responseID = id
                    assistant.pending = false
                    updateLocal(assistant, for: tripID)
                case .failed(let msg):
                    assistant.content += assistant.content.isEmpty ? msg : "\n\n⚠️ \(msg)"
                    assistant.pending = false
                    updateLocal(assistant, for: tripID)
                }
            }
        } catch {
            assistant.content += assistant.content.isEmpty
                ? "Couldn't reach the gateway: \(error.localizedDescription)"
                : "\n\n⚠️ \(error.localizedDescription)"
            assistant.pending = false
            updateLocal(assistant, for: tripID)
        }

        await rtdb?.upsertChatMessage(tripID: tripID, message: assistant)
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
        // Merge: keep `pending` messages still streaming locally on top
        // of the remote snapshot, since the assistant turn isn't
        // mirrored to RTDB until it completes.
        let local = messagesByTrip[tripID] ?? []
        let localPending = local.filter { $0.pending == true }
        var byID: [String: ChatMessage] = [:]
        for m in incoming where m.isHidden != true { byID[m.id] = m }
        for p in localPending { byID[p.id] = p }
        messagesByTrip[tripID] = byID.values
            .sorted { $0.timestamp < $1.timestamp }
    }

    func messages(for tripID: String?) -> [ChatMessage] {
        guard let tripID else { return [] }
        return messagesByTrip[tripID] ?? []
    }
}
