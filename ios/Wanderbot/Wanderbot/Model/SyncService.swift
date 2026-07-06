import Foundation
import UIKit

/// Background trip sync, split into two tiers that match how the data
/// actually lives:
///
///  • **Discovery** (`scanForTrips`) fans a browser out across EVERY
///    connected account in parallel — plus a parallel inbox sweep — to
///    LIST the traveler's trips, then has the agent create the trip
///    shells. It does not extract itineraries.
///  • **Detail** (`rescanTrip`) is scoped to one trip: it fans out across
///    the same accounts to pull that trip's full day-by-day itinerary,
///    then the agent fills in the bookings.
///
/// The per-connection fan-out is driven HERE, in code — not left to the
/// model to remember. That guarantees every connected app gets its own
/// browser every run, and they run concurrently.
///
/// Live progress + the last result surface in Settings → Sync and persist
/// across launches; the user never waits in the chat.
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
    private var bgTask: UIBackgroundTaskIdentifier = .invalid

    private static let lastResultKey = "wanderbot.sync.lastResult"

    init() { state = Self.loadLastResult() }

    func configure(travel: TravelStore) {
        self.travel = travel
        tools.attach(travelStore: travel)
    }

    // MARK: - Public triggers

    /// DISCOVERY — list trips across every connected account + inbox, then
    /// create the trip shells. Details are filled in per-trip by rescan.
    func scanForTrips(deep: Bool) {
        guard !isScanning else { return }
        beginRun(tripID: nil)
        Task { [weak self] in
            await self?.finishRun { try await self!.discoveryScan(deep: deep) }
        }
    }

    /// DETAIL — pull ONE trip's full itinerary from every connected
    /// account + inbox and fill in the bookings. Never creates trips.
    func rescanTrip(id: String) {
        guard !isScanning else { return }
        beginRun(tripID: id)
        Task { [weak self] in
            await self?.finishRun { try await self!.detailScan(id: id) }
        }
    }

    // MARK: - Scans

    private func discoveryScan(deep: Bool) async throws -> (summary: String, added: Int) {
        let days = deep ? 365 : 90
        let gathered = await gatherDiscovery(days: days)
        state = .running(step: "Organizing your trips…")
        return try await agentAct(
            prompt: Self.discoveryActPrompt(gathered: gathered),
            tools: Self.actTools(["get_trips", "create_trip", "update_trip"]),
            countTools: ["create_trip"]
        )
    }

    private func detailScan(id: String) async throws -> (summary: String, added: Int) {
        let trip = travel?.trips.first(where: { $0.id == id })
        let dest = trip?.destination ?? trip?.title ?? ""
        let dates = trip.map { "\($0.startDate) to \($0.endDate)" } ?? ""
        let gathered = await gatherTripDetail(destination: dest, dates: dates)
        state = .running(step: "Updating your itinerary…")
        let context = trip.map {
            "\"\($0.title)\" — \($0.destination), \($0.startDate) to \($0.endDate) (trip_id: \($0.id))"
        } ?? id
        var sessionTools = Self.actTools([
            "get_itinerary", "get_trips", "add_booking", "update_booking", "delete_booking",
        ])
        sessionTools.insert(["type": "web_search"], at: 0)   // for coordinates
        return try await agentAct(
            prompt: Self.detailActPrompt(context: context, tripID: trip?.id ?? id, gathered: gathered),
            tools: sessionTools,
            countTools: ["add_booking"]
        )
    }

    // MARK: - Gather (deterministic, parallel)

    private func gatherDiscovery(days: Int) async -> String {
        let sites = BrowserConnections.shared.connectedSites
        NSLog("[sync] discovery gather: %ld connected accounts, %ldd email window", sites.count, days)
        state = .running(step: sites.isEmpty ? "Searching your inbox…" : "Checking your connected accounts…")
        // Discovery just needs the account's trip LIST — read the logged-in
        // page text directly (fast), don't drive the slow Skyvern agent.
        async let browse = fanOut(sites) { url in
            (await BrowserConnections.shared.fetchLoggedInText(urlString: url))
                ?? "(couldn't load this account)"
        }
        async let emails = fanOutEmails(Self.discoveryEmailQueries(days: days))
        let (b, e) = await (browse, emails)
        return "=== TRIPS FROM CONNECTED ACCOUNTS ===\n\(b)\n\n=== BOOKING EMAILS ===\n\(e)"
    }

    private func gatherTripDetail(destination: String, dates: String) async -> String {
        let sites = BrowserConnections.shared.connectedSites
        NSLog("[sync] detail gather: %ld accounts for %@ (%@)", sites.count, destination, dates)
        state = .running(step: sites.isEmpty ? "Searching your inbox…" : "Checking your connected accounts…")
        let tools = self.tools
        let instr = "Find the trip or reservation matching \"\(destination)\" around \(dates). Open it "
            + "and extract its FULL day-by-day itinerary — every hotel, flight, activity and "
            + "restaurant with its date (YYYY-MM-DD), time and place. If this account has no "
            + "matching trip, say so briefly."
        // Detail needs to navigate INTO a specific trip → the agentic browser.
        async let browse = fanOut(sites) { url in
            await tools.browseExtract(url: url, instruction: instr)
        }
        async let emails = fanOutEmails([
            "\(destination) subject:(confirmation OR reservation OR itinerary) newer_than:365d",
            "from:airbnb.com newer_than:365d",
        ])
        let (b, e) = await (browse, emails)
        return "=== \(destination) FROM CONNECTED ACCOUNTS ===\n\(b)\n\n=== EMAILS ===\n\(e)"
    }

    /// Run `fetch` against every connected account concurrently, labelling
    /// each result with its account name.
    private func fanOut(
        _ sites: [BrowserConnections.Site],
        _ fetch: @escaping @Sendable (String) async -> String
    ) async -> String {
        guard !sites.isEmpty else { return "(no connected accounts)" }
        let jobs: [(title: String, url: String)] = sites.map { ($0.title, $0.syncURL) }
        return await withTaskGroup(of: String.self) { group in
            for job in jobs {
                group.addTask {
                    NSLog("[sync] browse %@ (%@)", job.title, job.url)
                    let r = await fetch(job.url)
                    return "── \(job.title) ──\n\(r)"
                }
            }
            var parts: [String] = []
            for await p in group { parts.append(p) }
            return parts.joined(separator: "\n\n")
        }
    }

    /// Run several Gmail queries concurrently.
    private func fanOutEmails(_ queries: [String]) async -> String {
        guard GmailConnector.shared.isConnected else { return "(Gmail not connected)" }
        let tools = self.tools
        return await withTaskGroup(of: String.self) { group in
            for q in queries {
                group.addTask { await tools.emailSearch(query: q, maxResults: 10) }
            }
            var parts: [String] = []
            for await p in group { parts.append(p) }
            return parts.joined(separator: "\n")
        }
    }

    // MARK: - Act (the agent turns gathered data into trips/bookings)

    private func agentAct(
        prompt: String, tools sessionTools: [[String: Any]], countTools: Set<String>
    ) async throws -> (summary: String, added: Int) {
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
            added += result.toolCalls.filter { countTools.contains($0.name) }.count

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

    // MARK: - Run lifecycle

    private func beginRun(tripID: String?) {
        state = .running(step: "Starting sync…")
        rescanningTripID = tripID
        bgTask = UIApplication.shared.beginBackgroundTask(withName: "wanderbot.sync") { [weak self] in
            self?.endBg()
        }
    }

    private func endBg() {
        if bgTask != .invalid { UIApplication.shared.endBackgroundTask(bgTask); bgTask = .invalid }
    }

    private func finishRun(_ work: () async throws -> (summary: String, added: Int)) async {
        defer { rescanningTripID = nil; endBg() }
        do {
            let (summary, added) = try await work()
            let text = summary.isEmpty
                ? (added > 0 ? "Added \(added) item\(added == 1 ? "" : "s")." : "Nothing new found.")
                : summary
            state = .done(summary: text, at: Self.now())
        } catch {
            let reason = (error as? XAIChatClient.ClientError)?.errorDescription
                ?? error.localizedDescription
            state = .failed(reason: reason, at: Self.now())
            NSLog("[sync] failed: %@", reason)
        }
        persistLastResult()
    }

    // MARK: - Prompts

    private static func discoveryEmailQueries(days: Int) -> [String] {
        [
            "from:airbnb.com newer_than:\(days)d",
            "from:booking.com newer_than:\(days)d",
            "from:(marriott.com OR hilton.com OR hyatt.com OR ihg.com) newer_than:\(days)d",
            "from:(united.com OR delta.com OR aa.com OR swiss.com OR lufthansa.com OR klm.com) newer_than:\(days)d",
            "subject:(confirmation OR reservation OR itinerary OR \"e-ticket\" OR \"booking confirmed\") newer_than:\(days)d",
        ]
    }

    private static func discoveryActPrompt(gathered: String) -> String {
        """
        DISCOVERY. Below is everything gathered from the traveler's connected accounts \
        and inbox. Decide which distinct TRIPS these represent and create any that don't \
        already exist. Do NOT add individual bookings — a separate per-trip scan does that.

        1. get_trips to see what already exists.
        2. Group the gathered items by destination + dates: items in the same place whose \
        dates overlap or fall within ~3 days are ONE trip (a flight + hotel + activities \
        for one city/week = one trip, not many).
        3. For each trip NOT already present (no existing trip with overlapping dates AND \
        same region), create_trip — name it by the primary destination (e.g. "Switzerland", \
        "Maui"), set start_date/end_date to span its items (YYYY-MM-DD, pad ±1 day for travel). \
        If a listing shows a date with NO year (e.g. "Jun 19 – 28"), it means the CURRENT \
        calendar year — these lists print the year ONLY when it differs from this year (that's \
        why past/other-year trips show "2025"). So use the current year from today's date for \
        any year-less listing; do NOT assume it's in the future (a month earlier this year is a \
        PAST trip, and that's fine). Never skip a trip just because its year was implicit.

        Only create trips that actually appear in the data below — never invent one. Don't \
        duplicate trips that already exist. Create every distinct trip you see. End with one \
        line: N trips created (their names).

        \(gathered.isEmpty ? "(no data gathered)" : gathered)
        """
    }

    private static func detailActPrompt(context: String, tripID: String, gathered: String) -> String {
        """
        DETAIL for trip: \(context). Below is everything gathered from the traveler's \
        connected accounts + inbox for this trip. Fill in its full itinerary from that \
        data. Do NOT create new trips or touch other trips.

        1. get_itinerary(\(tripID)) to see what's already there.
        2. For each real booking in the data that belongs to THIS trip (dates within the \
        trip window AND location matches the destination), add_booking — hotels, flights, \
        activities, restaurants, with date (YYYY-MM-DD), time and place (include coordinates \
        when you know them; search the web if needed). If a matching booking already exists \
        but you now have more detail, update_booking instead of adding a copy. NEVER \
        duplicate (same venue + dates = already there).

        Pick the correct type; only record what's in the data below. Finish with one line: \
        what you added or updated.

        \(gathered.isEmpty ? "(no data gathered)" : gathered)
        """
    }

    private static func systemPrompt() -> String {
        """
        You are Wanderbot's background sync agent. You are given data that was already \
        gathered from the traveler's connected sources; your job is to record it accurately \
        with the trip tools.

        Core rules, always:
        • NEVER invent a trip or booking. Only record things that appear in the gathered data.
        • ALWAYS call get_itinerary for a trip before adding to it, and never duplicate: the \
        same venue on the same dates is already there even if worded differently.
        • Dates as YYYY-MM-DD. Convert human dates ("February 5, 2027" → "2027-02-05").
        • Pick the correct type: hotel for lodging/Airbnb/hostel, flight, restaurant, \
        attraction, experience, event, activity, transport.
        • Prefer improving an existing booking (update_booking) over adding a near-duplicate.

        Today's date: \(ISO8601.dayKey(from: Date())).
        """
    }

    /// Build a flat-format tool subset by name (for the act phase).
    private static func actTools(_ names: Set<String>) -> [[String: Any]] {
        TripAgentTools.realtimeTools.filter { names.contains(($0["name"] as? String) ?? "") }
    }

    private static func step(for calls: [XAIChatClient.ToolCall]) -> String {
        let names = Set(calls.map(\.name))
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
