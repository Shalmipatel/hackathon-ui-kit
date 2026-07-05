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
    private let maxRounds = 20

    private static let lastResultKey = "wanderbot.sync.lastResult"

    init() { state = Self.loadLastResult() }

    func configure(travel: TravelStore) {
        self.travel = travel
        tools.attach(travelStore: travel)
    }

    // MARK: - Public triggers

    /// DISCOVERY scan — its ONLY job is to find which trips exist across
    /// every connected source and create the trip shells. It deliberately
    /// does NOT extract full itineraries; a per-trip scan (`rescanTrip`)
    /// fills each one in. Keeping discovery lightweight means each browser
    /// run only has to LIST trips (fast) rather than extract hundreds of
    /// places in one go — which is what used to blow the timeout.
    ///
    /// `deep` widens the email lookback to a full year (trips are often
    /// booked many months ahead — a short window finds nothing). The
    /// quick scan still looks back 90 days, not 7, for the same reason.
    func scanForTrips(deep: Bool) {
        let days = deep ? 365 : 90
        let prompt = """
        \(deep ? "DEEP " : "")DISCOVERY SCAN. Your ONLY job is to discover which TRIPS the \
        traveler has and create them. Do NOT extract or add individual bookings — a \
        separate per-trip scan fills in each itinerary later. Bookings are often made \
        MONTHS ahead, so don't judge by recency.

        STEP 1 — find trips across EVERY source (fire in parallel):\(discoveryAccountsClause)
        • search_email over a WIDE window (newer_than:\(days)d): from:airbnb.com; \
        from:booking.com; from:(marriott.com OR hilton.com OR hyatt.com OR ihg.com); \
        from:(united.com OR delta.com OR aa.com OR swiss.com OR lufthansa.com OR \
        klm.com); subject:(confirmation OR reservation OR itinerary OR "e-ticket" OR \
        "booking confirmed" OR "your trip"). From each hit, note only the trip's \
        DESTINATION and DATES — not every line item.
        STEP 2 — get_trips to see what already exists.
        STEP 3 — For each distinct trip you found, decide if it's new: a trip is the \
        same when destination + dates overlap. Group items in the same place within \
        ~3 days into ONE trip.
        STEP 4 — For each NEW trip only, create_trip: name it by the primary \
        destination (e.g. "Switzerland", "Maui"), set start_date/end_date to its \
        span. Do NOT recreate trips that already exist, and do NOT add bookings.

        Creating the trip shells is the entire job. Never invent trips. Don't create \
        one from a single ambiguous item unless it clearly implies travel.
        End with one line: N trips created (and their names).
        """
        run(prompt: prompt, tripID: nil)
    }

    /// DETAIL scan — scoped to ONE existing trip. Goes deep across every
    /// connected account + email to pull this trip's FULL itinerary, then
    /// fills in what's missing. Never creates new trips. Because it targets
    /// a single trip, each browser run stays within the timeout.
    func rescanTrip(id: String) {
        let trip = travel?.trips.first(where: { $0.id == id })
        let context = trip.map { "\"\($0.title)\" — \($0.destination), \($0.startDate) to \($0.endDate) (trip_id: \($0.id))" } ?? id
        let dest = trip?.destination ?? trip?.title ?? ""
        let dates = trip.map { "\($0.startDate) to \($0.endDate)" } ?? ""
        let prompt = """
        DETAIL SCAN for ONE trip: \(context). Pull this trip's FULL itinerary and \
        fill in everything that's missing. Do NOT create new trips or touch other trips.

        1. get_itinerary(\(trip?.id ?? id)) to see what's already there.
        2. Go deep on THIS trip across every source:\(detailAccountsClause(destination: dest, dates: dates))
        • search_email scoped to the destination, hotel/airline names, from:airbnb.com, \
        subject:(confirmation OR reservation OR itinerary), newer_than:365d.
        3. A booking belongs here only if its dates fall within the trip window AND its \
        location matches the destination. Ignore everything else.
        4. add_booking for every genuinely missing item (hotels, flights, activities, \
        restaurants — with date, time, place). If a matching booking exists but you \
        now have MORE detail (confirmation number, exact time, address), update_booking \
        instead of adding a copy. NEVER duplicate (same venue + dates = already there).

        Dates as YYYY-MM-DD; pick the right type. Finish with one line: what you added or updated.
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

    private var connectedSitesList: String {
        BrowserConnections.shared.connectedSites
            .map { "\($0.title) — \($0.syncURL)" }.joined(separator: "; ")
    }

    /// Discovery: just LIST the trips in each account (fast — one page).
    private var discoveryAccountsClause: String {
        let sites = BrowserConnections.shared.connectedSites
        guard !sites.isEmpty else { return "" }
        return """

        • browse_and_extract on each connected travel account (you arrive already \
        signed in): \(connectedSitesList). Ask ONLY for the LIST of trips/reservations \
        — each one's name, destination, and dates. Do NOT open individual trips or \
        extract their itineraries; that's a separate per-trip step.
        """
    }

    /// Detail: for ONE trip, open the matching trip in each account and
    /// extract its full day-by-day itinerary.
    private func detailAccountsClause(destination: String, dates: String) -> String {
        let sites = BrowserConnections.shared.connectedSites
        guard !sites.isEmpty else { return "" }
        return """

        • browse_and_extract on each connected travel account (already signed in): \
        \(connectedSitesList). Find the trip/reservation matching "\(destination)" \
        around \(dates), open it, and extract its FULL day-by-day itinerary — every \
        hotel, flight, activity, and restaurant with date (YYYY-MM-DD), time, and \
        place. Return structured items. This is slow (minutes) — that's expected.
        """
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
