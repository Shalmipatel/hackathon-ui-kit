import Foundation

/// Fires the `wanderbot-sync` slash commands the openclaw skill
/// listens for. Each command is sent as a one-shot
/// `/v1/responses` POST through `GatewayClient` — fire-and-forget,
/// because the skill writes any new trips / bookings directly to
/// RTDB and our `TravelStore` SSE subscription picks them up. No
/// chat persistence required.
///
///   - `scanForTrips(deep:)`  → `/wanderbot-sync shallow|deep`
///     Shallow sweeps the last 7 days; deep sweeps the last 30.
///   - `rescanTrip(id:)`      → `/wanderbot-sync rescan <tripId>`
///     Re-runs the skill scoped to one trip's window.
///
/// In-flight flags drive button spinners. We clear them on completion
/// or after a 12 s safety timeout — matches the web's behaviour
/// (the skill can take a while to stream and we don't want a sticky
/// "loading…" if the stream stalls).
@MainActor
final class SyncService: ObservableObject {
    @Published private(set) var isScanning = false
    @Published private(set) var rescanningTripID: String?

    private let gateway: GatewayClient?

    init() {
        self.gateway = GatewayClient()
    }

    func scanForTrips(deep: Bool) {
        guard !isScanning else { return }
        let command = deep ? "/wanderbot-sync deep" : "/wanderbot-sync shallow"
        isScanning = true
        Task { [weak self] in
            await self?.runCommand(command)
            self?.isScanning = false
        }
    }

    func rescanTrip(id: String) {
        guard rescanningTripID == nil else { return }
        rescanningTripID = id
        Task { [weak self] in
            await self?.runCommand("/wanderbot-sync rescan \(id)")
            self?.rescanningTripID = nil
        }
    }

    /// Pump the streaming response and exit either on `.completed` or
    /// after a 12 s ceiling. The skill writes RTDB as it runs, so
    /// we don't actually need the assistant text — we just want the
    /// call to hold the request open long enough for the skill to
    /// emit its side effects.
    private func runCommand(_ command: String) async {
        guard let gateway else { return }
        do {
            /* Sync commands are fire-and-forget skill invocations
               (`/wanderbot-sync …`) — no per-trip conversation
               context to preserve, so we send without a session key. */
            let stream = gateway.send(text: command, sessionKeyHeader: nil)
            let timeoutTask = Task<Void, Never> {
                try? await Task.sleep(nanoseconds: 12_000_000_000)
            }
            defer { timeoutTask.cancel() }
            for try await event in stream {
                if case .completed = event { break }
                if case .failed = event { break }
                if timeoutTask.isCancelled { break }
            }
        } catch {
            print("[sync] command failed: \(error)")
        }
    }
}
