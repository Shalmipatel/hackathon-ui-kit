import Foundation

/// Cross-device connection state — the web app writes to RTDB at
/// `/wanderbot/connections/<slug>` when an integration goes live, and
/// the iOS Connections view reads from the same path.
///
/// Today only Gmail is fully wired into RTDB (`{email, connectedAt}`);
/// other web integrations (Google Calendar, browser apps, social) are
/// scoped per-user inside the OpenClaw gateway and aren't replicated
/// to RTDB yet. We expose the Gmail state live, and surface the rest
/// as "Manage on web" entry points so users can connect them in the
/// same project from their phone.
struct GmailConnection: Codable, Equatable {
    var email: String
    var connectedAt: Double
}

@MainActor
final class ConnectionsStore: ObservableObject {
    @Published private(set) var gmail: GmailConnection?
    /// Tracks whether the initial REST load has completed so the view
    /// can distinguish "still loading" from "we know it's disconnected".
    @Published private(set) var didLoadInitial = false
    @Published var isMutating = false

    private var rtdb: FirebaseRTDB?
    private var subscriptionTask: Task<Void, Never>?

    private static let gmailPath = "wanderbot/connections/gmail"

    init() {
        if WanderbotConfig.firebaseEnabled {
            self.rtdb = FirebaseRTDB(databaseURLString: WanderbotConfig.firebaseDatabaseURL)
        }
    }

    /// Hydrate from REST, then open the SSE stream so any change made
    /// on the web app (or another device) lands here within a second.
    func bootstrap() {
        guard subscriptionTask == nil, let rtdb else { return }
        subscriptionTask = Task { [weak self] in
            let initial: GmailConnection? = await rtdb.loadValue(at: Self.gmailPath)
            await self?.apply(gmail: initial, fromInitial: true)
            for await value: GmailConnection? in await rtdb.subscribeToValue(at: Self.gmailPath) {
                await self?.apply(gmail: value, fromInitial: false)
            }
        }
    }

    private func apply(gmail: GmailConnection?, fromInitial: Bool) {
        self.gmail = gmail
        if fromInitial { didLoadInitial = true }
    }

    /// Mirror of the web's `clearGmailConnection()` — wipes the
    /// shared connection node so every device drops the Gmail badge
    /// at once.
    func disconnectGmail() async {
        guard let rtdb else { return }
        isMutating = true
        defer { isMutating = false }
        let ok = await rtdb.delete(at: Self.gmailPath)
        if ok { gmail = nil }
    }

    deinit { subscriptionTask?.cancel() }
}
