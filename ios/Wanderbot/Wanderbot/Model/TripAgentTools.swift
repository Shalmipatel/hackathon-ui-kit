import CoreLocation
import Foundation

/// Trip CRUD tools for the xAI agents (voice realtime + text chat).
///
/// With OpenClaw retired, the xAI agent is the primary brain and these
/// tools are its hands: they read live state from `TravelStore` and write
/// directly to Firebase RTDB (the same schema the web app reads). Writes
/// are applied optimistically to the local store so the UI moves
/// instantly; the RTDB SSE stream then confirms across devices.
@MainActor
final class TripAgentTools {

    // Strong ref: TravelStore never references back, so no cycle. Weak
    // risked the store being seen as nil at tool-call time → every tool
    // returning "Store unavailable" and the agent claiming it found
    // nothing / can't edit.
    private var travelStore: TravelStore?
    private let rtdb = FirebaseRTDB(databaseURLString: WanderbotConfig.firebaseDatabaseURL)
    private let location = LocationProvider()

    init(travelStore: TravelStore?) {
        self.travelStore = travelStore
    }

    func attach(travelStore: TravelStore) {
        self.travelStore = travelStore
    }

    // MARK: - Tool definitions

    struct ToolDef {
        let name: String
        let description: String
        let parameters: [String: Any]
    }

    private static func str(_ desc: String) -> [String: Any] {
        ["type": "string", "description": desc]
    }
    private static func num(_ desc: String) -> [String: Any] {
        ["type": "number", "description": desc]
    }
    private static func obj(_ props: [String: [String: Any]], required: [String]) -> [String: Any] {
        ["type": "object", "properties": props, "required": required]
    }

    static let all: [ToolDef] = [
        ToolDef(
            name: "get_trips",
            description: "List all of the traveler's trips with ids, destinations, and dates.",
            parameters: obj([:], required: [])
        ),
        ToolDef(
            name: "get_itinerary",
            description: "Get the full day-by-day itinerary for a trip, including every booking's "
                + "id, type, title, times, and place. Call this to see current state (always call "
                + "it again after making changes — ids are needed for updates/deletes).",
            parameters: obj(["trip_id": str("The trip id, e.g. trip-zurich-3f2a")], required: ["trip_id"])
        ),
        ToolDef(
            name: "create_trip",
            description: "Create a new trip.",
            parameters: obj([
                "title": str("Short trip title, e.g. 'Tokyo Spring'"),
                "destination": str("City/region + country, e.g. 'Tokyo, Japan'"),
                "start_date": str("First day, YYYY-MM-DD"),
                "end_date": str("Last day, YYYY-MM-DD"),
                "travelers": str("Optional comma-separated traveler names"),
                "summary": str("Optional one-line trip summary"),
            ], required: ["title", "destination", "start_date", "end_date"])
        ),
        ToolDef(
            name: "update_trip",
            description: "Update fields on an existing trip. Only pass the fields to change.",
            parameters: obj([
                "trip_id": str("The trip id"),
                "title": str("New title"),
                "destination": str("New destination"),
                "start_date": str("New first day, YYYY-MM-DD"),
                "end_date": str("New last day, YYYY-MM-DD"),
                "travelers": str("Comma-separated traveler names (replaces the list)"),
                "summary": str("New summary"),
            ], required: ["trip_id"])
        ),
        ToolDef(
            name: "delete_trip",
            description: "Delete a trip AND all of its bookings. Irreversible — confirm with the "
                + "traveler before calling.",
            parameters: obj(["trip_id": str("The trip id")], required: ["trip_id"])
        ),
        ToolDef(
            name: "add_booking",
            description: "Add an item to a trip's itinerary (restaurant, attraction, activity, "
                + "hotel, flight, transport, event, experience). Include coordinates when you "
                + "know the place (search the web for them if needed) so it shows on the map.",
            parameters: obj([
                "trip_id": str("The trip id"),
                "type": ["type": "string", "description": "Booking type",
                         "enum": ["flight", "hotel", "attraction", "experience", "event",
                                  "activity", "restaurant", "transport"]] as [String: Any],
                "title": str("Display title, e.g. 'Dinner at Kiln'"),
                "day": str("Day it happens, YYYY-MM-DD (within the trip dates)"),
                "start_time": str("Optional start time, 24h HH:MM (wall clock at the destination)"),
                "end_time": str("Optional end time, 24h HH:MM"),
                "end_day": str("Optional end day YYYY-MM-DD for multi-day items (hotel check-out, overnight travel)"),
                "place_name": str("Optional venue/place name"),
                "place_address": str("Optional street address"),
                "place_lat": num("Latitude of the place (include with place_name whenever possible)"),
                "place_lng": num("Longitude of the place"),
                "from_name": str("Flights/transport: origin name (e.g. 'ZRH Zurich Airport')"),
                "from_lat": num("Origin latitude"),
                "from_lng": num("Origin longitude"),
                "to_name": str("Flights/transport: destination name"),
                "to_lat": num("Destination latitude"),
                "to_lng": num("Destination longitude"),
                "notes": str("Optional freeform notes"),
                "provider": str("Optional provider/operator, e.g. airline or tour company"),
                "link": str("Optional URL for the booking/venue"),
                "mode": str("Transport only: mode, e.g. train/tram/ferry"),
                "flight_number": str("Flight only: e.g. LX 38"),
                "cost_amount": num("Optional cost amount"),
                "cost_currency": str("Optional ISO currency, e.g. USD/CHF"),
                "party_size": num("Restaurant only: party size"),
                "nights": num("Hotel only: number of nights"),
            ], required: ["trip_id", "type", "title", "day"])
        ),
        ToolDef(
            name: "update_booking",
            description: "Update fields on an itinerary item. Only pass the fields to change. "
                + "Use day/start_time/end_time to move or re-time it.",
            parameters: obj([
                "booking_id": str("The booking id (from get_itinerary)"),
                "title": str("New title"),
                "day": str("New day YYYY-MM-DD (moves the item)"),
                "start_time": str("New start time 24h HH:MM"),
                "end_time": str("New end time 24h HH:MM"),
                "clear_times": ["type": "boolean",
                                "description": "true to remove start/end times (make it untimed)"] as [String: Any],
                "notes": str("New notes"),
                "provider": str("New provider"),
                "link": str("New URL"),
            ], required: ["booking_id"])
        ),
        ToolDef(
            name: "delete_booking",
            description: "Remove an item from the itinerary. Irreversible.",
            parameters: obj(["booking_id": str("The booking id (from get_itinerary)")], required: ["booking_id"])
        ),
        ToolDef(
            name: "get_current_location",
            description: "Get the traveler's exact current location (GPS coordinates + nearest "
                + "address). Call whenever their request depends on where they are right now — "
                + "\"near me\", \"from here\", \"how far am I\", \"what's around\". Asks the OS "
                + "for permission if needed.",
            parameters: obj([:], required: [])
        ),
        ToolDef(
            name: "search_email",
            description: "Search the traveler's connected Gmail inbox and return matching "
                + "messages (headers + body text). Use for finding booking confirmations, "
                + "reservations, and itineraries to add to trips. Query uses Gmail search "
                + "syntax — e.g. 'from:airbnb.com newer_than:60d', "
                + "'subject:(confirmation OR reservation OR itinerary) Zurich newer_than:30d'. "
                + "Run multiple targeted searches rather than one broad one.",
            parameters: obj([
                "query": str("Gmail search query (supports from:, subject:, newer_than:Nd, OR)"),
                "max_results": num("Max messages to return (default 8, cap 20)"),
            ], required: ["query"])
        ),
        ToolDef(
            name: "import_from_url",
            description: "Fetch a public web page and return its readable text — use to import "
                + "itineraries from share links (Wanderlog trip links, Airbnb itineraries, "
                + "Google Docs, blog posts). After reading, create/extend trips with the trip "
                + "tools. If the page comes back empty or unreadable, tell the traveler.",
            parameters: obj(["url": str("The public URL to fetch")], required: ["url"])
        ),
        ToolDef(
            name: "browse_and_extract",
            description: "Drive a real cloud browser to a website and extract information — for "
                + "sites that need a login or heavy JavaScript (Airbnb account reservations, "
                + "Wanderlog private trips). SLOW (several minutes) — tell the traveler it's "
                + "running. Use import_from_url first for public pages; use this only when that "
                + "fails or a login is required.",
            parameters: obj([
                "url": str("Starting URL"),
                "instruction": str("What to do and what data to extract, stated precisely"),
            ], required: ["url", "instruction"])
        ),
    ]

    static var toolNames: Set<String> { Set(all.map(\.name)) }

    /// Flat shape for the realtime (voice) session.update tools array.
    static var realtimeTools: [[String: Any]] {
        all.map { ["type": "function", "name": $0.name,
                   "description": $0.description, "parameters": $0.parameters] }
    }

    /// Nested shape for chat-completions `tools`.
    static var chatTools: [[String: Any]] {
        all.map { ["type": "function",
                   "function": ["name": $0.name, "description": $0.description,
                                "parameters": $0.parameters] as [String: Any]] }
    }

    // MARK: - Execution

    /// Run one tool call. Always returns a short, model-friendly string —
    /// success confirmations include ids so follow-up edits can chain.
    func execute(name: String, argumentsJSON: String) async -> String {
        let args: [String: Any]
        if let data = argumentsJSON.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            args = parsed
        } else {
            args = [:]
        }
        NSLog("[tools] %@ %@", name, String(argumentsJSON.prefix(300)))

        switch name {
        case "get_trips": return getTrips()
        case "get_itinerary": return getItinerary(args)
        case "create_trip": return await createTrip(args)
        case "update_trip": return await updateTrip(args)
        case "delete_trip": return await deleteTrip(args)
        case "add_booking": return await addBooking(args)
        case "update_booking": return await updateBooking(args)
        case "delete_booking": return await deleteBooking(args)
        case "get_current_location": return await location.describeCurrentLocation()
        case "search_email": return await searchEmail(args)
        case "import_from_url": return await importFromURL(args)
        case "browse_and_extract": return await browseAndExtract(args)
        default: return "Unknown tool: \(name)"
        }
    }

    // MARK: - Reads

    private func getTrips() -> String {
        guard let store = travelStore, !store.trips.isEmpty else { return "No trips yet." }
        return store.orderedTrips.map { t in
            "\(t.id): \"\(t.title)\" — \(t.destination) (\(t.startDate) → \(t.endDate))"
        }.joined(separator: "\n")
    }

    private func getItinerary(_ args: [String: Any]) -> String {
        guard let store = travelStore else { return "Store unavailable." }
        guard let tripID = args["trip_id"] as? String,
              let trip = store.trips.first(where: { $0.id == tripID }) else {
            return "Trip not found. Known trips:\n\(getTrips())"
        }
        var out = ["\(trip.id): \"\(trip.title)\" — \(trip.destination) (\(trip.startDate) → \(trip.endDate))"]
        if let summary = trip.summary, !summary.isEmpty { out.append("Summary: \(summary)") }
        for day in store.itineraryDays(for: trip) {
            out.append("\(day.dayKey):")
            if day.bookings.isEmpty { out.append("  (nothing planned)") }
            for b in day.bookings {
                var line = "  [\(b.id)] \(b.type.rawValue): \(b.title)"
                if let s = b.start { line += " \(Self.hhmm(s))" }
                if let e = b.end { line += "–\(Self.hhmm(e))" }
                if let p = b.place?.name ?? b.to?.name { line += " @ \(p)" }
                if let n = b.notes, !n.isEmpty { line += " (notes: \(n.prefix(80)))" }
                out.append(line)
            }
        }
        return out.joined(separator: "\n")
    }

    // MARK: - Trip writes

    private static let palette = ["#FEEB29", "#F39C6B", "#7CC4A0", "#8FB7E8", "#C7A8E8"]

    private func createTrip(_ args: [String: Any]) async -> String {
        guard let title = args["title"] as? String,
              let destination = args["destination"] as? String,
              let start = args["start_date"] as? String,
              let end = args["end_date"] as? String,
              ISO8601.day(from: start) != nil, ISO8601.day(from: end) != nil
        else { return "Missing/invalid fields — need title, destination, start_date and end_date (YYYY-MM-DD)." }

        let slug = destination.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }.prefix(2).joined(separator: "-")
        let id = "trip-\(slug)-\(String(UUID().uuidString.prefix(4)).lowercased())"

        let count = travelStore?.trips.count ?? 0
        let trip = Trip(
            id: id, title: title, destination: destination,
            startDate: start, endDate: end,
            color: Self.palette[count % Self.palette.count],
            travelers: (args["travelers"] as? String)?
                .components(separatedBy: ",")
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty },
            summary: args["summary"] as? String,
            cover: nil, archived: nil
        )

        travelStore?.trips.append(trip)                      // optimistic
        travelStore?.activeTripId = id
        let ok = await rtdb?.put(trip, at: "wanderbot/trips/\(id)") ?? false
        return ok ? "Created trip \(id) (\"\(title)\", \(start) → \(end))."
                  : "Created locally but the sync write failed — it may not persist."
    }

    private func updateTrip(_ args: [String: Any]) async -> String {
        guard let tripID = args["trip_id"] as? String,
              let store = travelStore,
              let idx = store.trips.firstIndex(where: { $0.id == tripID })
        else { return "Trip not found. Known trips:\n\(getTrips())" }

        var patch: [String: Any] = [:]
        var trip = store.trips[idx]
        if let v = args["title"] as? String { patch["title"] = v; trip.title = v }
        if let v = args["destination"] as? String { patch["destination"] = v; trip.destination = v }
        if let v = args["start_date"] as? String, ISO8601.day(from: v) != nil {
            patch["startDate"] = v; trip.startDate = v
        }
        if let v = args["end_date"] as? String, ISO8601.day(from: v) != nil {
            patch["endDate"] = v; trip.endDate = v
        }
        if let v = args["summary"] as? String { patch["summary"] = v; trip.summary = v }
        if let v = args["travelers"] as? String {
            let list = v.components(separatedBy: ",")
                .map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            patch["travelers"] = list; trip.travelers = list
        }
        guard !patch.isEmpty else { return "Nothing to update — pass at least one field." }

        store.trips[idx] = trip                              // optimistic
        let ok = await rtdb?.patch(patch, at: "wanderbot/trips/\(tripID)") ?? false
        return ok ? "Updated trip \(tripID): \(patch.keys.sorted().joined(separator: ", "))."
                  : "Update failed to sync — try again."
    }

    private func deleteTrip(_ args: [String: Any]) async -> String {
        guard let tripID = args["trip_id"] as? String,
              let store = travelStore,
              store.trips.contains(where: { $0.id == tripID })
        else { return "Trip not found. Known trips:\n\(getTrips())" }

        let bookingIDs = store.bookings.filter { $0.tripId == tripID }.map(\.id)
        store.trips.removeAll { $0.id == tripID }            // optimistic
        store.bookings.removeAll { $0.tripId == tripID }
        if store.activeTripId == tripID { store.activeTripId = store.orderedTrips.first?.id }

        for id in bookingIDs {
            _ = await rtdb?.delete(at: "wanderbot/bookings/\(id)")
        }
        let ok = await rtdb?.delete(at: "wanderbot/trips/\(tripID)") ?? false
        return ok ? "Deleted trip \(tripID) and \(bookingIDs.count) booking(s)."
                  : "Delete failed to sync — try again."
    }

    // MARK: - Booking writes

    private func addBooking(_ args: [String: Any]) async -> String {
        guard let store = travelStore,
              let tripID = args["trip_id"] as? String,
              store.trips.contains(where: { $0.id == tripID })
        else { return "Trip not found. Known trips:\n\(getTrips())" }
        guard let typeRaw = args["type"] as? String,
              let type = BookingType(rawValue: typeRaw)
        else { return "Invalid type — use one of: \(BookingType.allCases.map(\.rawValue).joined(separator: ", "))." }
        guard let title = args["title"] as? String,
              let day = args["day"] as? String, ISO8601.day(from: day) != nil
        else { return "Missing title or day (YYYY-MM-DD)." }

        let id = "bk-\(String(UUID().uuidString.prefix(8)).lowercased())"
        let startTime = args["start_time"] as? String
        let endTime = args["end_time"] as? String
        let endDay = (args["end_day"] as? String) ?? day

        let start = startTime.flatMap { Self.wallClock(day: day, time: $0) }
        let end = endTime.flatMap { Self.wallClock(day: endDay, time: $0) }

        let booking = Booking(
            id: id, tripId: tripID, type: type, title: title,
            dayKey: day,
            position: start.map { Self.secondsIntoDay($0) } ?? 86400,
            start: start, end: end,
            provider: args["provider"] as? String,
            source: .agent,
            notes: args["notes"] as? String,
            link: args["link"] as? String,
            cost: (args["cost_amount"] as? Double).map { amount in
                Cost(amount: amount, currency: (args["cost_currency"] as? String) ?? "USD")
            },
            place: Self.place(args, "place_name", "place_address", "place_lat", "place_lng"),
            from: Self.place(args, "from_name", nil, "from_lat", "from_lng"),
            to: Self.place(args, "to_name", nil, "to_lat", "to_lng"),
            flightNumber: args["flight_number"] as? String,
            mode: args["mode"] as? String,
            partySize: (args["party_size"] as? Double).map(Int.init),
            nights: (args["nights"] as? Double).map(Int.init)
        )

        store.bookings.append(booking)                       // optimistic
        var fields = Self.bookingFields(booking)
        fields["id"] = id
        let ok = await rtdb?.patch(fields, at: "wanderbot/bookings/\(id)") ?? false
        var confirmation = "Added \(type.rawValue) \"\(title)\" on \(day)"
        if let startTime { confirmation += " at \(startTime)" }
        confirmation += " (booking id \(id))."
        return ok ? confirmation : "Added locally but the sync write failed — it may not persist."
    }

    private func updateBooking(_ args: [String: Any]) async -> String {
        guard let store = travelStore,
              let bookingID = args["booking_id"] as? String,
              let idx = store.bookings.firstIndex(where: { $0.id == bookingID })
        else { return "Booking not found — call get_itinerary to get current booking ids." }

        var b = store.bookings[idx]
        var patch: [String: Any] = [:]

        if let v = args["title"] as? String { b.title = v; patch["title"] = v }
        if let v = args["notes"] as? String { b.notes = v; patch["notes"] = v }
        if let v = args["provider"] as? String { b.provider = v; patch["provider"] = v }
        if let v = args["link"] as? String { b.link = v; patch["link"] = v }

        let newDay = (args["day"] as? String).flatMap { ISO8601.day(from: $0) != nil ? $0 : nil }
        let newStartTime = args["start_time"] as? String
        let newEndTime = args["end_time"] as? String
        let clearTimes = (args["clear_times"] as? Bool) ?? false

        if clearTimes {
            b.start = nil; b.end = nil; b.position = 86400
            patch["start"] = NSNull(); patch["end"] = NSNull(); patch["position"] = 86400
        }
        if newDay != nil || newStartTime != nil || newEndTime != nil {
            let day = newDay ?? b.dayKey
            if let d = newDay { b.dayKey = d; patch["dayKey"] = d }
            // Re-anchor start: new time, else keep existing wall-clock on the new day.
            let startTime = newStartTime ?? b.start.map(Self.hhmm)
            if let t = startTime, let s = Self.wallClock(day: day, time: t) {
                b.start = s
                b.position = Self.secondsIntoDay(s)
                patch["start"] = WBDates.formatWallClock(s)
                patch["position"] = b.position
            }
            let endTime = newEndTime ?? b.end.map(Self.hhmm)
            if let t = endTime, let e = Self.wallClock(day: day, time: t) {
                b.end = e
                patch["end"] = WBDates.formatWallClock(e)
            }
        }

        guard !patch.isEmpty else { return "Nothing to update — pass at least one field." }
        store.bookings[idx] = b                              // optimistic
        let ok = await rtdb?.patch(patch, at: "wanderbot/bookings/\(bookingID)") ?? false
        return ok ? "Updated \(bookingID): \(patch.keys.sorted().joined(separator: ", "))."
                  : "Update failed to sync — try again."
    }

    private func deleteBooking(_ args: [String: Any]) async -> String {
        guard let store = travelStore,
              let bookingID = args["booking_id"] as? String,
              let booking = store.bookings.first(where: { $0.id == bookingID })
        else { return "Booking not found — call get_itinerary to get current booking ids." }
        let title = booking.title
        store.deleteBooking(booking)                         // optimistic + RTDB delete
        return "Removed \"\(title)\" (\(bookingID)) from the itinerary."
    }

    // MARK: - Email (Phase 1: on-device Gmail)

    private func searchEmail(_ args: [String: Any]) async -> String {
        guard GmailConnector.shared.isConnected else {
            return "Gmail is not connected. Tell the traveler to connect it in "
                + "Settings > Connections > Gmail, then try again."
        }
        guard let query = args["query"] as? String, !query.isEmpty else {
            return "Missing query."
        }
        let maxResults = Int((args["max_results"] as? Double) ?? 8)
        do {
            let emails = try await GmailConnector.shared.searchEmails(query: query, maxResults: maxResults)
            guard !emails.isEmpty else { return "No emails matched: \(query)" }
            var out: [String] = ["\(emails.count) message(s) for '\(query)':"]
            for (i, e) in emails.enumerated() {
                out.append("""
                --- MESSAGE \(i + 1) ---
                From: \(e.from)
                Subject: \(e.subject)
                Date: \(e.date)
                \(String(e.body.prefix(1800)))
                """)
            }
            // Cap total so one search can't blow the context.
            return String(out.joined(separator: "\n").prefix(16_000))
        } catch {
            return "Email search failed: \(error.localizedDescription)"
        }
    }

    // MARK: - URL import (Phase 2: share links)

    private func importFromURL(_ args: [String: Any]) async -> String {
        guard let raw = args["url"] as? String,
              let url = URL(string: raw), url.scheme?.hasPrefix("http") == true else {
            return "Invalid URL."
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        // Some share pages sniff for browsers before rendering content.
        request.setValue(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            forHTTPHeaderField: "User-Agent"
        )
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                return "Fetch failed: HTTP \((response as? HTTPURLResponse)?.statusCode ?? -1). "
                    + "If this page needs a login or JavaScript, try browse_and_extract."
            }
            let html = String(data: data, encoding: .utf8) ?? ""
            let text = GmailConnector.stripHTML(html)
            guard text.count > 80 else {
                return "The page returned almost no readable text (likely JavaScript-rendered "
                    + "or login-gated). Try browse_and_extract instead."
            }
            return "Readable text from \(url.host ?? raw):\n" + String(text.prefix(15_000))
        } catch {
            return "Fetch failed: \(error.localizedDescription)"
        }
    }

    // MARK: - Cloud browser (Phase 3: Skyvern, config-gated)

    private func browseAndExtract(_ args: [String: Any]) async -> String {
        guard !WanderbotConfig.skyvernAPIKey.isEmpty else {
            return "The cloud browser isn't configured yet (no Skyvern API key). "
                + "Tell the traveler this feature is coming soon; use import_from_url "
                + "for public pages in the meantime."
        }
        guard let rawURL = args["url"] as? String,
              let instruction = args["instruction"] as? String,
              let endpoint = URL(string: "\(WanderbotConfig.skyvernAPIURL)/v1/run/tasks")
        else { return "Missing url or instruction." }

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 60
        request.assumesHTTP3Capable = false   // QUIC to api.skyvern.com is reset on some networks
        request.setValue(WanderbotConfig.skyvernAPIKey, forHTTPHeaderField: "x-api-key")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // skyvern-2.0 = the agentic engine; the default 1.0 engine treats
        // a bare prompt as navigation-only and returns output: null.
        var body: [String: Any] = [
            "prompt": instruction, "url": rawURL, "engine": "skyvern-2.0",
        ]
        // If the traveler connected this site (in-app interactive login →
        // Skyvern profile), run inside a session created from that profile
        // so the browser arrives already signed in. The tasks API takes a
        // session id, not a profile id.
        var syncSessionID: String?
        if let sessionID = await BrowserConnections.shared.sessionForSync(urlString: rawURL) {
            body["browser_session_id"] = sessionID
            syncSessionID = sessionID
        }
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        defer {
            if let syncSessionID {
                Task { await BrowserConnections.shared.closeSession(syncSessionID) }
            }
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let runID = (json["run_id"] as? String) ?? (json["task_id"] as? String)
            else {
                return "Cloud browser task failed to start: HTTP "
                    + "\((response as? HTTPURLResponse)?.statusCode ?? -1) "
                    + (String(data: data, encoding: .utf8)?.prefix(200).description ?? "")
            }

            // Poll for up to ~15 minutes — cloud-browser runs are slow, and
            // this runs in the background sync so the user isn't waiting.
            guard let statusURL = URL(string: "\(WanderbotConfig.skyvernAPIURL)/v1/runs/\(runID)") else {
                return "Bad status URL."
            }
            for _ in 0..<90 {
                try await Task.sleep(nanoseconds: 10_000_000_000)
                var poll = URLRequest(url: statusURL)
                poll.assumesHTTP3Capable = false
                poll.setValue(WanderbotConfig.skyvernAPIKey, forHTTPHeaderField: "x-api-key")
                guard let (pdata, presp) = try? await URLSession.shared.data(for: poll),
                      (presp as? HTTPURLResponse)?.statusCode == 200,
                      let pjson = try? JSONSerialization.jsonObject(with: pdata) as? [String: Any]
                else { continue }
                let status = (pjson["status"] as? String) ?? ""
                if ["completed", "terminated", "failed", "canceled"].contains(status) {
                    let output = pjson["output"].flatMap {
                        (try? JSONSerialization.data(withJSONObject: $0)).flatMap { String(data: $0, encoding: .utf8) }
                    } ?? (pjson["output"] as? String) ?? ""
                    return status == "completed"
                        ? "Cloud browser finished. Extracted: \(String(output.prefix(12_000)))"
                        : "Cloud browser ended with status '\(status)'. \(String(output.prefix(500)))"
                }
            }
            return "Cloud browser task timed out after 15 minutes — it may still finish; try again shortly."
        } catch {
            return "Cloud browser error: \(error.localizedDescription)"
        }
    }

    // MARK: - Helpers

    /// RTDB fields for a new booking — mirrors Booking's coding keys with
    /// wall-clock date strings, skipping nils so the node stays clean.
    private static func bookingFields(_ b: Booking) -> [String: Any] {
        var f: [String: Any] = [
            "id": b.id, "tripId": b.tripId, "type": b.type.rawValue,
            "title": b.title, "dayKey": b.dayKey, "position": b.position,
            "source": b.source.rawValue,
        ]
        if let v = b.start { f["start"] = WBDates.formatWallClock(v) }
        if let v = b.end { f["end"] = WBDates.formatWallClock(v) }
        if let v = b.notes { f["notes"] = v }
        if let v = b.provider { f["provider"] = v }
        if let v = b.link { f["link"] = v }
        if let v = b.cost { f["cost"] = ["amount": v.amount, "currency": v.currency] }
        if let v = b.place { f["place"] = placeFields(v) }
        if let v = b.from { f["from"] = placeFields(v) }
        if let v = b.to { f["to"] = placeFields(v) }
        if let v = b.flightNumber { f["flightNumber"] = v }
        if let v = b.mode { f["mode"] = v }
        if let v = b.partySize { f["partySize"] = v }
        if let v = b.nights { f["nights"] = v }
        return f
    }

    private static func placeFields(_ p: Place) -> [String: Any] {
        var f: [String: Any] = ["name": p.name, "lat": p.lat, "lng": p.lng]
        if let a = p.address { f["address"] = a }
        return f
    }

    /// Build a Place only when name AND coordinates are present — the
    /// Booking decoder requires lat/lng, so a coordinate-less place would
    /// poison the record for every client.
    private static func place(
        _ args: [String: Any],
        _ nameKey: String, _ addressKey: String?, _ latKey: String, _ lngKey: String
    ) -> Place? {
        guard let name = args[nameKey] as? String,
              let lat = args[latKey] as? Double,
              let lng = args[lngKey] as? Double
        else { return nil }
        return Place(name: name,
                     address: addressKey.flatMap { args[$0] as? String },
                     lat: lat, lng: lng)
    }

    private static let utcCalendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    /// "HH:MM" on a yyyy-MM-dd day → wall-clock Date (UTC-anchored,
    /// matching WBDates convention).
    private static func wallClock(day: String, time: String) -> Date? {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        guard parts.count >= 2, let base = ISO8601.day(from: day) else { return nil }
        return utcCalendar.date(byAdding: DateComponents(hour: parts[0], minute: parts[1]), to: base)
    }

    private static func secondsIntoDay(_ date: Date) -> Double {
        let c = utcCalendar.dateComponents([.hour, .minute, .second], from: date)
        return Double((c.hour ?? 0) * 3600 + (c.minute ?? 0) * 60 + (c.second ?? 0))
    }

    private static func hhmm(_ date: Date) -> String {
        let c = utcCalendar.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }
}

/// One-shot location fix for the agent's `get_current_location` tool.
/// Requests when-in-use permission on first call; returns a
/// model-friendly string (coordinates + reverse-geocoded address) or a
/// clear "unavailable" message the agent can relay.
@MainActor
final class LocationProvider: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var authContinuation: CheckedContinuation<Void, Never>?
    private var fixContinuation: CheckedContinuation<CLLocation?, Never>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func describeCurrentLocation() async -> String {
        if manager.authorizationStatus == .notDetermined {
            await withCheckedContinuation { c in
                authContinuation = c
                manager.requestWhenInUseAuthorization()
            }
        }
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            break
        default:
            return "Location unavailable — the traveler declined location permission. "
                + "They can enable it in Settings > Wanderbot > Location."
        }

        let fix: CLLocation? = await withCheckedContinuation { c in
            fixContinuation = c
            manager.requestLocation()
        }
        guard let fix else {
            return "Location unavailable right now (no GPS fix). Ask the traveler where they are."
        }

        var parts = [String(
            format: "lat %.5f, lng %.5f (accuracy ±%.0fm)",
            fix.coordinate.latitude, fix.coordinate.longitude, fix.horizontalAccuracy
        )]
        if let placemark = try? await CLGeocoder().reverseGeocodeLocation(fix).first {
            let address = [placemark.name, placemark.locality,
                           placemark.administrativeArea, placemark.country]
                .compactMap { $0 }.joined(separator: ", ")
            if !address.isEmpty { parts.append("near \(address)") }
        }
        return "Traveler's current location: " + parts.joined(separator: " — ")
    }

    // MARK: CLLocationManagerDelegate

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            authContinuation?.resume()
            authContinuation = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in
            fixContinuation?.resume(returning: locations.last)
            fixContinuation = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            fixContinuation?.resume(returning: nil)
            fixContinuation = nil
        }
    }
}
