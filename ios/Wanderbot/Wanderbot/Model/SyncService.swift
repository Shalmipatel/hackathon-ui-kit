import Foundation
import UIKit

/// Background trip-discovery sync. Runs the xAI agent loop **itself** —
/// independent of the chat UI — sweeping every connected source (Gmail via
/// `search_email`, connected web accounts via `browse_and_extract`, and any
/// tool we add later) and writing findings to RTDB through the trip tools.
///
/// The user never waits in the chat: they kick off a scan and walk away.
/// Live progress + the last result (success/failure) surface in Settings →
/// Sync, and persist across launches.
@MainActor
final class SyncService: ObservableObject {

    enum SyncState: Equatable {
        case idle
        case running(step: String)
        case done(summary: String, at: Double)
        case failed(reason: String, at: Double)
    }

    @Published private(set) var state: SyncState = .idle
    /// Which trip a per-trip rescan is running for (drives that trip's
    /// button spinner); nil for a full/general sync.
    @Published private(set) var rescanningTripID: String?

    /// Back-compat for existing call sites.
    var isScanning: Bool { if case .running = state { return true }; return false }

    private let client = XAIChatClient()
    private let tools = TripAgentTools(travelStore: nil)
    private var travel: TravelStore?
    private let maxRounds = 14

    private static let lastResultKey = "wanderbot.sync.lastResult"

    init() { state = Self.loadLastResult() }

    func configure(travel: TravelStore) {
        self.travel = travel
        tools.attach(travelStore: travel)
    }

    // MARK: - Public triggers

    /// DISCOVERY scan — finds bookings across all sources and organizes
    /// them into trips (creating new ones as needed).
    func scanForTrips(deep: Bool) {
        let days = deep ? 30 : 7
        let prompt = """
        DISCOVERY SCAN. Find the traveler's travel bookings from the last \(days) \
        days and organize them into trips.

        1. Sweep sources: search_email with several targeted queries \
        (from:airbnb.com, from:booking.com, from known airlines/hotels, \
        subject:(confirmation OR reservation OR itinerary OR "booking confirmed") \
        — always newer_than:\(days)d).\(connectedAccountsClause)
        2. Call get_trips to see what already exists.
        3. GROUP the bookings you find: bookings in the same destination whose \
        dates overlap or fall within ~3 days of each other belong to ONE trip. A \
        flight + hotel + activities for the same city/week = one trip, not many.
        4. For each group, decide: does it match an existing trip (overlapping \
        dates AND same region)? If yes, add the missing bookings to it. If no, \
        create_trip — name it by the primary destination (e.g. "Tokyo", "Lake \
        Atitlán"), set start_date/end_date to span all its bookings (pad ±1 day \
        for travel), then add each booking.
        5. Before adding to ANY trip, call get_itinerary and skip anything already \
        present (match by venue + dates — the same hotel on the same nights is a \
        duplicate even if worded differently).
        6. Don't create a trip from a single ambiguous item unless it clearly \
        implies travel (lodging or a flight to another city). Never invent bookings.

        Finish with one line: trips created and items added.
        """
        run(prompt: prompt, tripID: nil)
    }

    /// UPDATE scan — scoped to ONE existing trip. Fills in missing
    /// bookings/details; never creates new trips.
    func rescanTrip(id: String) {
        let trip = travel?.trips.first(where: { $0.id == id })
        let context = trip.map { "\"\($0.title)\" — \($0.destination), \($0.startDate) to \($0.endDate) (trip_id: \($0.id))" } ?? id
        let prompt = """
        UPDATE SCAN for ONE trip: \(context). Fill in what's missing for THIS trip \
        only — do NOT create any new trips, and do NOT add bookings for other trips.

        1. Call get_itinerary(\(trip?.id ?? id)) to see exactly what's already there.
        2. Sweep sources for bookings that belong to THIS trip: search_email with \
        queries scoped to the destination, hotel/airline names, from:airbnb.com, \
        subject:(confirmation OR reservation OR itinerary), over newer_than:90d \
        (bookings are often made weeks ahead).\(connectedAccountsClause)
        3. A booking belongs to this trip only if its dates fall within the trip's \
        window AND its location matches the destination. Ignore everything else.
        4. Add genuinely missing bookings with add_booking. If a matching booking \
        already exists but the scan has MORE detail (a confirmation number, exact \
        time, address), improve it with update_booking instead of adding a copy. \
        NEVER duplicate (same venue + dates = already there).

        Dates as YYYY-MM-DD; pick the right type (hotel for lodging/Airbnb, flight, \
        restaurant, etc.). Finish with one line: what you added or updated.
        """
        run(prompt: prompt, tripID: id)
    }

    // MARK: - Runner

    private func run(prompt: String, tripID: String?) {
        guard !isScanning else { return }
        state = .running(step: "Starting sync…")
        rescanningTripID = tripID

        // Keep running briefly if the app gets backgrounded mid-sync.
        var bgTask: UIBackgroundTaskIdentifier = .invalid
        bgTask = UIApplication.shared.beginBackgroundTask(withName: "wanderbot.sync") {
            if bgTask != .invalid { UIApplication.shared.endBackgroundTask(bgTask); bgTask = .invalid }
        }

        Task { [weak self] in
            guard let self else { return }
            defer {
                self.rescanningTripID = nil
                if bgTask != .invalid { UIApplication.shared.endBackgroundTask(bgTask); bgTask = .invalid }
            }
            do {
                let (summary, added) = try await self.agentLoop(prompt: prompt)
                let text = summary.isEmpty
                    ? (added > 0 ? "Added \(added) item\(added == 1 ? "" : "s")." : "No new bookings found.")
                    : summary
                self.state = .done(summary: text, at: Self.now())
            } catch {
                let reason = (error as? XAIChatClient.ClientError)?.errorDescription
                    ?? error.localizedDescription
                self.state = .failed(reason: reason, at: Self.now())
                NSLog("[sync] failed: %@", reason)
            }
            self.persistLastResult()
        }
    }

    /// The agent loop, run headlessly (no chat transcript). Reports a
    /// human step per round and counts what got written.
    private func agentLoop(prompt: String) async throws -> (summary: String, added: Int) {
        var sessionTools: [[String: Any]] = [["type": "web_search"], ["type": "x_search"]]
        sessionTools.append(contentsOf: TripAgentTools.realtimeTools)

        var input: [[String: Any]] = [
            ["role": "system", "content": Self.systemPrompt()],
            ["role": "user", "content": prompt],
        ]
        var previousResponseID: String?
        var finalText = ""
        var added = 0

        for _ in 0..<maxRounds {
            let result = try await client.streamTurn(
                input: input, previousResponseID: previousResponseID,
                tools: sessionTools, onDelta: { _ in }
            )
            if !result.text.isEmpty { finalText = result.text }
            if result.toolCalls.isEmpty { break }

            state = .running(step: Self.step(for: result.toolCalls))
            added += result.toolCalls.filter { $0.name == "add_booking" || $0.name == "create_trip" }.count

            var outputs: [[String: Any]] = []
            for call in result.toolCalls {
                let output = await tools.execute(name: call.name, argumentsJSON: call.arguments)
                outputs.append(["type": "function_call_output", "call_id": call.id, "output": output])
            }
            input = outputs
            previousResponseID = result.responseID
        }
        return (finalText, added)
    }

    // MARK: - Prompt bits

    private var connectedAccountsClause: String {
        let sites = BrowserConnections.shared.connectedSites
        guard !sites.isEmpty else { return "" }
        let list = sites.map { "\($0.title) (browse_and_extract on \($0.syncURL) — a saved login "
            + "exists; extract upcoming reservations)" }.joined(separator: "; ")
        return " Also sweep the connected accounts: \(list)."
    }

    private static func systemPrompt() -> String {
        """
        You are Wanderbot's background sync agent. Find the traveler's REAL bookings \
        across their connected sources and record them with the trip tools.

        Sources: search_email (their Gmail); browse_and_extract (a logged-in cloud \
        browser for connected accounts like Airbnb — slow, that's fine, use it for \
        connected accounts). Run several targeted searches, not one broad one.

        Core rules, always:
        • NEVER invent a booking. Only record things you actually found.
        • ALWAYS get_itinerary for a trip before adding to it, and never duplicate: \
        the same venue on the same dates is already there even if worded differently.
        • Dates as YYYY-MM-DD. Convert human dates ("February 5, 2027" → "2027-02-05").
        • Pick the correct type: hotel for lodging/Airbnb/hostel, flight, restaurant, \
        attraction, experience, event, activity, transport.
        • Include place_name and coordinates when you know them so items map.
        • Prefer improving an existing booking (update_booking) over adding a near-duplicate.

        Today's date: \(ISO8601.dayKey(from: Date())).
        """
    }

    private static func step(for calls: [XAIChatClient.ToolCall]) -> String {
        let names = Set(calls.map(\.name))
        if names.contains("browse_and_extract") { return "Checking your connected accounts…" }
        if names.contains("search_email") { return "Searching your inbox…" }
        if names.contains("add_booking") || names.contains("create_trip") { return "Adding what I found…" }
        if names.contains("update_booking") || names.contains("delete_booking") { return "Updating your itinerary…" }
        if names.contains("get_itinerary") || names.contains("get_trips") { return "Reviewing your trips…" }
        return "Working…"
    }

    private static func now() -> Double { Date().timeIntervalSince1970 * 1000 }

    // MARK: - Persistence

    private struct StoredResult: Codable { var ok: Bool; var text: String; var at: Double }

    private func persistLastResult() {
        let stored: StoredResult?
        switch state {
        case .done(let s, let at): stored = StoredResult(ok: true, text: s, at: at)
        case .failed(let r, let at): stored = StoredResult(ok: false, text: r, at: at)
        default: stored = nil
        }
        if let stored, let data = try? JSONEncoder().encode(stored) {
            UserDefaults.standard.set(data, forKey: Self.lastResultKey)
        }
    }

    private static func loadLastResult() -> SyncState {
        guard let data = UserDefaults.standard.data(forKey: lastResultKey),
              let stored = try? JSONDecoder().decode(StoredResult.self, from: data)
        else { return .idle }
        return stored.ok ? .done(summary: stored.text, at: stored.at)
                         : .failed(reason: stored.text, at: stored.at)
    }
}
