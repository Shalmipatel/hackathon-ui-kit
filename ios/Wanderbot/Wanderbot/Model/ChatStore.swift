import Foundation

/// One chat message. Field names match the web `ChatMessage` shape
/// (`content`, `timestamp`) so the OpenClaw transcript maps cleanly.
struct ChatMessage: Identifiable, Hashable, Codable {
    enum Role: String, Codable { case user, assistant, system }

    var id: String
    var role: Role
    var content: String
    /// Milliseconds since epoch (web uses `Date.now()` which is ms).
    var timestamp: Double
    /// Excluded from the visible UI. Matches the web flag.
    var isHidden: Bool?
    /// Server-issued id for this turn (assistant turns only).
    var responseID: String?
    /// Reserved for future use; we used to chain by previous-id, now
    /// the OpenClaw session key handles it server-side.
    var previousResponseID: String?
    /// `true` while the assistant message is streaming locally —
    /// keeps it pinned in the merged view until OpenClaw catches up.
    var pending: Bool?

    enum CodingKeys: String, CodingKey {
        case id, role, content, timestamp, isHidden, responseID, previousResponseID
    }
}

/// Chat sessions keyed by trip id. The transcript is owned by
/// OpenClaw — we read it via `OpenClawSessionClient.loadHistory` and
/// poll every few seconds while a chat sheet is open so the other
/// device's messages show up. No RTDB, no IndexedDB on this side.
@MainActor
final class ChatStore: ObservableObject {
    /// `tripId → messages (sorted by createdAt asc)`
    @Published var messagesByTrip: [String: [ChatMessage]] = [:]
    @Published var isSending: Set<String> = []

    private let gateway: GatewayClient?
    private let openclaw: OpenClawSessionClient?
    private var pollTasks: [String: Task<Void, Never>] = [:]
    /// Per-trip optimistic messages — user turns we just sent and the
    /// assistant turn that's streaming. They survive a poll refresh
    /// until OpenClaw has the same content, then drop out.
    private var localOptimistic: [String: [ChatMessage]] = [:]

    /// Cadence for OpenClaw polls while a chat sheet is open.
    /// 4 seconds — fast enough to feel live across devices without
    /// hammering the gateway, since OpenClaw doesn't expose a push API.
    private let pollInterval: TimeInterval = 4

    init() {
        self.gateway = GatewayClient()
        self.openclaw = OpenClawSessionClient()
    }

    /// Open the polling loop for one trip's chat. Idempotent — calling
    /// again while already polling is a no-op.
    func ensureSubscription(for tripID: String) {
        guard pollTasks[tripID] == nil else { return }
        guard openclaw != nil else { return }
        pollTasks[tripID] = Task { [weak self] in
            await self?.pollLoop(tripID: tripID)
        }
    }

    func stopSubscriptions() {
        for task in pollTasks.values { task.cancel() }
        pollTasks.removeAll()
    }

    /// Polling loop: initial load + refresh every `pollInterval`
    /// seconds until cancelled. We just trust whatever OpenClaw
    /// returns — local optimistic messages are merged in `applyRemote`.
    private func pollLoop(tripID: String) async {
        await refresh(tripID: tripID)
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: UInt64(pollInterval * 1_000_000_000))
            if Task.isCancelled { return }
            await refresh(tripID: tripID)
        }
    }

    /// Fetch the OpenClaw transcript for one trip and merge into
    /// `messagesByTrip`. Safe to call at any time.
    func refresh(tripID: String) async {
        guard let openclaw else { return }
        do {
            let remote = try await openclaw.loadHistory(forTripID: tripID)
            applyRemote(remote, for: tripID)
        } catch {
            /* Tolerated — empty/missing session is a normal "first
               open" state; transient network blips will re-attempt
               on the next tick. Log so we can see persistent failures. */
            NSLog("[chat] loadHistory failed for tripID=%@ err=%@", tripID, String(describing: error))
        }
    }

    /// Send a user message, stream the assistant reply, and let the
    /// next poll cycle pick up the canonical state from OpenClaw.
    @discardableResult
    func send(tripID: String, text: String) -> Task<Void, Never> {
        Task { [weak self] in
            await self?._send(tripID: tripID, text: text)
        }
    }

    private func _send(tripID: String, text: String) async {
        let now = Date().timeIntervalSince1970 * 1000

        /* Optimistic local user message — pinned until OpenClaw
           returns a turn with matching content. */
        let userMsg = ChatMessage(
            id: "local:user:\(UUID().uuidString)",
            role: .user,
            content: text,
            timestamp: now,
            isHidden: nil,
            responseID: nil,
            previousResponseID: nil,
            pending: true
        )
        appendOptimistic(userMsg, for: tripID)

        var assistant = ChatMessage(
            id: "local:assistant:\(UUID().uuidString)",
            role: .assistant,
            content: "",
            timestamp: now + 1,
            isHidden: nil,
            responseID: nil,
            previousResponseID: nil,
            pending: true
        )
        appendOptimistic(assistant, for: tripID)
        isSending.insert(tripID)
        defer { isSending.remove(tripID) }

        guard let gateway else {
            assistant.content = "Gateway not configured. Set `WanderbotConfig.gatewayURL`."
            assistant.pending = false
            updateOptimistic(assistant, for: tripID)
            return
        }

        /* Stamp the trip's OpenClaw session-key so this turn lands in
           the same server-side session the web writes to (shared
           transcript across devices). */
        let sessionKey = WanderbotConfig.sessionKeyHeader(forTripID: tripID)

        do {
            for try await event in gateway.send(text: text, sessionKeyHeader: sessionKey) {
                switch event {
                case .delta(let chunk):
                    assistant.content += chunk
                    updateOptimistic(assistant, for: tripID)
                case .completed(let id):
                    assistant.responseID = id
                    updateOptimistic(assistant, for: tripID)
                case .failed(let msg):
                    assistant.content += assistant.content.isEmpty ? msg : "\n\n⚠️ \(msg)"
                    updateOptimistic(assistant, for: tripID)
                }
            }
        } catch {
            let detail: String
            if let urlErr = error as? URLError {
                detail = "\(urlErr.localizedDescription) (URLError \(urlErr.code.rawValue))"
            } else {
                detail = error.localizedDescription
            }
            assistant.content += assistant.content.isEmpty
                ? "Couldn't reach the gateway: \(detail)"
                : "\n\n⚠️ \(detail)"
            updateOptimistic(assistant, for: tripID)
        }

        /* Stream is done. Pull the canonical transcript from OpenClaw
           immediately so the local optimistic placeholders flip over
           to the server's view (and our deltas reconcile with the
           real responseId / final text). Then clear pending so the
           merge starts trusting OpenClaw entirely. */
        await refresh(tripID: tripID)
        assistant.pending = false
        updateOptimistic(assistant, for: tripID)
        /* Mark the user message as no-longer-pending too — by now
           OpenClaw definitely has it, and the next poll will dedupe
           it cleanly. */
        if let idx = localOptimistic[tripID]?.firstIndex(where: { $0.id == userMsg.id }) {
            localOptimistic[tripID]?[idx].pending = false
        }
        await refresh(tripID: tripID)
    }

    // MARK: - Optimistic + remote merge

    private func appendOptimistic(_ message: ChatMessage, for tripID: String) {
        var list = localOptimistic[tripID] ?? []
        list.append(message)
        localOptimistic[tripID] = list
        rebuild(tripID: tripID)
    }

    private func updateOptimistic(_ message: ChatMessage, for tripID: String) {
        guard var list = localOptimistic[tripID] else { return }
        if let idx = list.firstIndex(where: { $0.id == message.id }) {
            list[idx] = message
        } else {
            list.append(message)
        }
        localOptimistic[tripID] = list
        rebuild(tripID: tripID)
    }

    /// Latest remote snapshot — overwrites previous remote view.
    private var remoteByTrip: [String: [ChatMessage]] = [:]

    private func applyRemote(_ remote: [ChatMessage], for tripID: String) {
        remoteByTrip[tripID] = remote.filter { $0.isHidden != true }
        /* Once the remote contains text matching one of our optimistic
           turns, drop the optimistic (the remote copy wins). Match by
           role + trimmed text to avoid double-render. We compare a
           prefix of the text rather than the full string so partially-
           streamed remote turns (web mid-stream) don't fail to match
           our completed optimistic turn or vice-versa. */
        if var local = localOptimistic[tripID], !local.isEmpty {
            local.removeAll { opt in
                /* Streaming assistants stay until completion. */
                if opt.pending == true && opt.role == .assistant { return false }
                /* Streaming user turns get dropped once a matching
                   remote turn shows up — they're cheap to identify by
                   exact content + role. */
                return remoteByTrip[tripID]?.contains(where: { rem in
                    rem.role == opt.role &&
                    rem.content.trimmingCharacters(in: .whitespacesAndNewlines)
                        == opt.content.trimmingCharacters(in: .whitespacesAndNewlines)
                }) ?? false
            }
            localOptimistic[tripID] = local
        }
        rebuild(tripID: tripID)
    }

    /// Rebuild the merged published list = remote + optimistic, sorted
    /// by timestamp. Optimistic always wins on duplicate ids.
    private func rebuild(tripID: String) {
        var byID: [String: ChatMessage] = [:]
        for m in remoteByTrip[tripID] ?? [] { byID[m.id] = m }
        for m in localOptimistic[tripID] ?? [] { byID[m.id] = m }
        messagesByTrip[tripID] = byID.values
            .sorted { $0.timestamp < $1.timestamp }
    }

    func messages(for tripID: String?) -> [ChatMessage] {
        guard let tripID else { return [] }
        return messagesByTrip[tripID] ?? []
    }
}
