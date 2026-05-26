import Foundation

/// Firebase Realtime Database client over plain REST + Server-Sent
/// Events. No Firebase SDK dependency.
///
/// Read-only on purpose: bookings flow into the DB from the web app's
/// chat ingestion path; the iOS app mirrors them but doesn't yet write
/// back. Wire `PUT` / `DELETE` requests through `URLSession` when you
/// add inline editing.
///
/// Schema (matches src/features/travel/firebase.ts):
///   /wanderbot/trips/<id>      → Trip object
///   /wanderbot/bookings/<id>   → Booking object
actor FirebaseRTDB {
    let databaseURL: URL

    init?(databaseURLString: String) {
        guard !databaseURLString.isEmpty,
              let url = URL(string: databaseURLString)
        else { return nil }
        self.databaseURL = url
    }

    // MARK: - One-shot load

    /// Fetch the entire `wanderbot/trips` and `wanderbot/bookings`
    /// trees in parallel. Used for the initial population before the
    /// SSE stream takes over.
    func loadSnapshot() async -> (trips: [Trip], bookings: [Booking]) {
        async let trips = loadCollection(path: "wanderbot/trips", decode: Trip.self)
        async let bookings = loadCollection(path: "wanderbot/bookings", decode: Booking.self)
        return await (trips, bookings)
    }

    private func loadCollection<T: Decodable>(
        path: String,
        decode: T.Type
    ) async -> [T] {
        guard let url = endpoint(path: path) else { return [] }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                return []
            }
            return try Self.decodeCollection(data: data)
        } catch {
            print("[firebase] loadCollection \(path) failed:", error)
            return []
        }
    }

    /// RTDB returns `{ "<id>": {...}, ... }` or `null` for empty paths.
    /// Decode into an array, skipping records that fail individually so
    /// one bad row can't poison the whole load.
    static func decodeCollection<T: Decodable>(data: Data) throws -> [T] {
        let decoder = JSONDecoder()
        if let dict = try? decoder.decode([String: FailableDecodable<T>].self, from: data) {
            return dict.values.compactMap { $0.value }
        }
        return []
    }

    // MARK: - SSE subscription

    /// Open both `/trips` and `/bookings` SSE streams. Yields
    /// `(trips, bookings)` snapshots — the same full-tree view the
    /// web subscriber sees — whenever either tree changes.
    func subscribe() -> AsyncStream<(trips: [Trip], bookings: [Booking])> {
        AsyncStream { continuation in
            let session = SSESession(
                tripsURL: endpoint(path: "wanderbot/trips"),
                bookingsURL: endpoint(path: "wanderbot/bookings")
            )
            session.onSnapshot = { trips, bookings in
                continuation.yield((trips, bookings))
            }
            session.start()
            continuation.onTermination = { _ in
                session.stop()
            }
        }
    }

    private func endpoint(path: String) -> URL? {
        // RTDB REST: append `.json` to the path.
        databaseURL.appendingPathComponent(path + ".json")
    }

    // MARK: - Writes (PUT / DELETE)

    /// PUT a JSON-encodable record to `/wanderbot/<collection>/<id>`.
    /// Used for inline edits (reorder, future booking editing).
    @discardableResult
    func put<T: Encodable>(_ value: T, at path: String) async -> Bool {
        guard let url = endpoint(path: path) else { return false }
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        do {
            let encoder = JSONEncoder()
            request.httpBody = try encoder.encode(value)
            let (_, response) = try await URLSession.shared.data(for: request)
            return (response as? HTTPURLResponse).map { (200..<300).contains($0.statusCode) } ?? false
        } catch {
            print("[firebase] PUT \(path) failed:", error)
            return false
        }
    }

    /// PATCH /booking/<id> with a partial update — keeps fields the
    /// client didn't touch intact.
    @discardableResult
    func patch(_ fields: [String: Any], at path: String) async -> Bool {
        guard let url = endpoint(path: path) else { return false }
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: fields)
            let (_, response) = try await URLSession.shared.data(for: request)
            return (response as? HTTPURLResponse).map { (200..<300).contains($0.statusCode) } ?? false
        } catch {
            print("[firebase] PATCH \(path) failed:", error)
            return false
        }
    }

    // MARK: - Chat sessions

    private func chatPath(tripID: String) -> String {
        "wanderbot/chat_sessions/\(tripID)"
    }

    func loadChatSession(tripID: String) async -> [ChatMessage] {
        guard let url = endpoint(path: chatPath(tripID: tripID)) else { return [] }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return [] }
            let messages: [ChatMessage] = (try? Self.decodeCollection(data: data)) ?? []
            return messages.sorted { $0.timestamp < $1.timestamp }
        } catch {
            print("[firebase] loadChatSession \(tripID) failed:", error)
            return []
        }
    }

    func upsertChatMessage(tripID: String, message: ChatMessage) async {
        let path = "\(chatPath(tripID: tripID))/\(message.id)"
        _ = await put(message, at: path)
    }

    /// Subscribe to one trip's chat session. Yields the full message
    /// list whenever the tree changes.
    func subscribeToChatSession(tripID: String) -> AsyncStream<[ChatMessage]> {
        AsyncStream { continuation in
            guard let url = endpoint(path: chatPath(tripID: tripID)) else {
                continuation.finish()
                return
            }
            let session = ChatSSESession(url: url)
            session.onSnapshot = { snapshot in
                continuation.yield(snapshot.sorted { $0.timestamp < $1.timestamp })
            }
            session.start()
            continuation.onTermination = { _ in session.stop() }
        }
    }
}

/// Mini SSE session dedicated to one chat tree. Same protocol as
/// SSESession but specialised to `ChatMessage` payloads.
private final class ChatSSESession: NSObject, URLSessionDataDelegate {
    let url: URL
    var onSnapshot: (([ChatMessage]) -> Void)?

    private var session: URLSession!
    private var task: URLSessionDataTask?
    private var parser = ChatSSEParser()
    private var messages: [String: ChatMessage] = [:]
    private let queue = DispatchQueue(label: "wanderbot.chat-sse")

    init(url: URL) {
        self.url = url
        super.init()
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 0
        config.timeoutIntervalForResource = 0
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        self.session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }

    func start() {
        var req = URLRequest(url: url)
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        task = session.dataTask(with: req)
        task?.resume()
    }

    func stop() {
        task?.cancel()
        session.invalidateAndCancel()
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        let events = parser.feed(data)
        guard !events.isEmpty else { return }
        queue.async { [weak self] in
            guard let self else { return }
            for event in events { self.apply(event: event) }
            self.onSnapshot?(Array(self.messages.values))
        }
    }

    private func apply(event: ChatSSEParser.Event) {
        guard event.eventName == "put" || event.eventName == "patch" else { return }
        guard let data = event.dataJSON,
              let envelope = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let path = envelope["path"] as? String
        else { return }
        let payload = envelope["data"]

        if path == "/" {
            if let dict = payload as? [String: Any] {
                var newMap: [String: ChatMessage] = [:]
                for (id, raw) in dict {
                    if let msg: ChatMessage = decodeOne(raw) { newMap[id] = msg }
                }
                messages = newMap
            } else {
                messages.removeAll()
            }
            return
        }

        let id = String(path.dropFirst())
        if payload == nil || payload is NSNull {
            messages.removeValue(forKey: id)
            return
        }
        if let msg: ChatMessage = decodeOne(payload) { messages[id] = msg }
    }

    private func decodeOne<T: Decodable>(_ raw: Any?) -> T? {
        guard let raw,
              let bytes = try? JSONSerialization.data(withJSONObject: raw)
        else { return nil }
        return try? JSONDecoder().decode(T.self, from: bytes)
    }
}

/// Identical to the trips parser — kept separate so SSE parser state
/// can't leak across trees.
private struct ChatSSEParser {
    struct Event { var eventName: String; var dataJSON: Data? }
    private var buffer = Data()

    mutating func feed(_ chunk: Data) -> [Event] {
        buffer.append(chunk)
        var events: [Event] = []
        while let range = buffer.range(of: Data([0x0A, 0x0A])) {
            let frame = buffer.subdata(in: 0..<range.lowerBound)
            buffer.removeSubrange(0..<range.upperBound)
            if let event = parseFrame(frame) { events.append(event) }
        }
        return events
    }

    private func parseFrame(_ frame: Data) -> Event? {
        guard let text = String(data: frame, encoding: .utf8) else { return nil }
        var eventName: String?
        var dataLines: [String] = []
        for raw in text.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = String(raw)
            if line.hasPrefix(":") { continue }
            if line.hasPrefix("event:") {
                eventName = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("data:") {
                dataLines.append(String(line.dropFirst(5).trimmingCharacters(in: .whitespaces)))
            }
        }
        guard let eventName else { return nil }
        let joined = dataLines.joined(separator: "\n")
        return Event(eventName: eventName, dataJSON: joined.data(using: .utf8))
    }
}

/// Wraps a value decoder so a single broken row doesn't fail the whole
/// dictionary decode — matches the web app's "drop tombstones, keep
/// going" tolerance.
private struct FailableDecodable<T: Decodable>: Decodable {
    let value: T?
    init(from decoder: Decoder) throws {
        value = try? T(from: decoder)
    }
}

// MARK: - SSE plumbing

/// Drives two long-lived SSE connections (trips + bookings) and
/// republishes a unified snapshot every time either tree changes.
///
/// Run on a background URLSession with a delegate that buffers bytes
/// and parses `event:` / `data:` lines.
private final class SSESession: NSObject, URLSessionDataDelegate {
    let tripsURL: URL?
    let bookingsURL: URL?

    var onSnapshot: ((_ trips: [Trip], _ bookings: [Booking]) -> Void)?

    private var session: URLSession!
    private var tripsTask: URLSessionDataTask?
    private var bookingsTask: URLSessionDataTask?

    private var trips: [String: Trip] = [:]
    private var bookings: [String: Booking] = [:]

    private var tripsParser = SSEParser()
    private var bookingsParser = SSEParser()

    private let snapshotQueue = DispatchQueue(label: "wanderbot.sse.snapshot")

    init(tripsURL: URL?, bookingsURL: URL?) {
        self.tripsURL = tripsURL
        self.bookingsURL = bookingsURL
        super.init()
        let config = URLSessionConfiguration.default
        // Long timeouts: SSE connections sit idle between events.
        config.timeoutIntervalForRequest = 0
        config.timeoutIntervalForResource = 0
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        self.session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }

    func start() {
        if let tripsURL { tripsTask = makeTask(for: tripsURL); tripsTask?.resume() }
        if let bookingsURL { bookingsTask = makeTask(for: bookingsURL); bookingsTask?.resume() }
    }

    func stop() {
        tripsTask?.cancel()
        bookingsTask?.cancel()
        session.invalidateAndCancel()
    }

    private func makeTask(for url: URL) -> URLSessionDataTask {
        var req = URLRequest(url: url)
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        return session.dataTask(with: req)
    }

    // MARK: URLSessionDataDelegate

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        let isTrips = dataTask == tripsTask
        let events: [SSEParser.Event]
        if isTrips {
            events = tripsParser.feed(data)
        } else {
            events = bookingsParser.feed(data)
        }
        guard !events.isEmpty else { return }
        snapshotQueue.async { [weak self] in
            guard let self else { return }
            for event in events {
                self.apply(event: event, toTrips: isTrips)
            }
            let snap = (Array(self.trips.values), Array(self.bookings.values))
            self.onSnapshot?(snap.0, snap.1)
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        // SSE connections are expected to stay open. If they drop, the
        // user can pull-to-refresh later; auto-reconnect is out of
        // scope for the v1 port.
        if let error, (error as NSError).code != NSURLErrorCancelled {
            print("[firebase] SSE task ended:", error)
        }
    }

    // MARK: Event application

    /// Apply one SSE event to the local map. RTDB's SSE protocol uses
    /// "put" (replace) and "patch" (merge) at a JSON path:
    ///   { "path": "/",         "data": {<full tree>} }
    ///   { "path": "/<id>",     "data": {<one record>} }   ← put
    ///   { "path": "/<id>",     "data": {<partial fields>}} ← patch (PATCH)
    ///   { "path": "/<id>",     "data": null            }  ← delete
    ///
    /// Patch events carry only the changed fields. Trying to decode
    /// them as a full Booking/Trip fails (missing required fields),
    /// which left the local map stuck on the pre-patch value and
    /// caused the snapshot we emit afterwards to overwrite the iOS
    /// optimistic update — visible to the user as "tap Add time and
    /// the picker disappears". For patch we merge field-by-field on
    /// top of the existing record before re-decoding.
    private func apply(event: SSEParser.Event, toTrips isTrips: Bool) {
        guard event.eventName == "put" || event.eventName == "patch" else { return }
        guard let data = event.dataJSON,
              let envelope = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let path = envelope["path"] as? String
        else { return }
        let payload = envelope["data"]

        if path == "/" {
            // Full-tree snapshot.
            if isTrips {
                trips = decodeMap(payload) ?? [:]
            } else {
                bookings = decodeMap(payload) ?? [:]
            }
            return
        }

        // Path is "/<id>" (we don't subscribe to nested fields).
        let id = String(path.dropFirst())
        if payload == nil || payload is NSNull {
            if isTrips { trips.removeValue(forKey: id) }
            else { bookings.removeValue(forKey: id) }
            return
        }

        if event.eventName == "patch" {
            // Partial update — merge onto the existing record.
            if isTrips, let existing = trips[id],
               let merged: Trip = mergePatch(into: existing, with: payload) {
                trips[id] = merged
            } else if !isTrips, let existing = bookings[id],
                      let merged: Booking = mergePatch(into: existing, with: payload) {
                bookings[id] = merged
            } else {
                // No existing record to merge into — try a full decode
                // in case the payload happens to be complete enough.
                if isTrips, let trip: Trip = decodeOne(payload) { trips[id] = trip }
                else if !isTrips, let booking: Booking = decodeOne(payload) { bookings[id] = booking }
            }
            return
        }

        // put — payload is the full record.
        if isTrips {
            if let trip: Trip = decodeOne(payload) { trips[id] = trip }
        } else {
            if let booking: Booking = decodeOne(payload) { bookings[id] = booking }
        }
    }

    /// Re-encode the existing record as JSON, overlay the patch's
    /// fields (treating `null` as "remove this key" per RTDB's
    /// convention), then decode back to T. Returns nil on any
    /// encode/decode hiccup so the caller can keep the pre-patch
    /// value.
    ///
    /// Dates are encoded with `wallClockFormatter` so they round-trip
    /// through the same shape Booking's custom decoder expects
    /// (yyyy-MM-dd'T'HH:mm:ss in UTC). With the default `.deferredToDate`
    /// strategy, dates serialised as `Double` reference-date offsets —
    /// `decodeIfPresent(String.self)` then threw on every existing
    /// date field, the merge returned nil, and the SSE session kept
    /// yielding the pre-patch snapshot. That bug surfaced as the
    /// end-time picker disappearing the moment you added it.
    private func mergePatch<T: Codable>(into existing: T, with payload: Any?) -> T? {
        guard let patch = payload as? [String: Any] else { return nil }
        guard let existingData = try? Self.mergeEncoder.encode(existing),
              var existingDict = try? JSONSerialization.jsonObject(with: existingData) as? [String: Any]
        else { return nil }
        for (k, v) in patch {
            if v is NSNull {
                existingDict.removeValue(forKey: k)
            } else {
                existingDict[k] = v
            }
        }
        guard let mergedData = try? JSONSerialization.data(withJSONObject: existingDict)
        else { return nil }
        return try? JSONDecoder().decode(T.self, from: mergedData)
    }

    private static let wallClockFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        return f
    }()

    private static let mergeEncoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .formatted(wallClockFormatter)
        return e
    }()

    private func decodeMap<T: Decodable>(_ raw: Any?) -> [String: T]? {
        guard let dict = raw as? [String: Any] else { return nil }
        var out: [String: T] = [:]
        for (id, value) in dict {
            if let decoded: T = decodeOne(value) {
                out[id] = decoded
            }
        }
        return out
    }

    private func decodeOne<T: Decodable>(_ raw: Any?) -> T? {
        guard let raw,
              let bytes = try? JSONSerialization.data(withJSONObject: raw)
        else { return nil }
        return try? JSONDecoder().decode(T.self, from: bytes)
    }
}

/// Bytes-in → events-out. SSE frames are separated by blank lines and
/// each frame is a set of `field: value` lines. We only care about
/// `event:` and `data:`.
private struct SSEParser {
    struct Event {
        var eventName: String
        var dataJSON: Data?
    }

    private var buffer = Data()

    mutating func feed(_ chunk: Data) -> [Event] {
        buffer.append(chunk)
        var events: [Event] = []

        // Walk frames separated by "\n\n".
        while let range = buffer.range(of: Data([0x0A, 0x0A])) {
            let frame = buffer.subdata(in: 0..<range.lowerBound)
            buffer.removeSubrange(0..<range.upperBound)
            if let event = Self.parseFrame(frame) { events.append(event) }
        }
        return events
    }

    private static func parseFrame(_ frame: Data) -> Event? {
        guard let text = String(data: frame, encoding: .utf8) else { return nil }
        var eventName: String?
        var dataLines: [String] = []
        for rawLine in text.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = String(rawLine)
            if line.hasPrefix(":") { continue }                      // comment / keep-alive
            if line.hasPrefix("event:") {
                eventName = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("data:") {
                dataLines.append(String(line.dropFirst(5).trimmingCharacters(in: .whitespaces)))
            }
        }
        guard let eventName else { return nil }
        let joined = dataLines.joined(separator: "\n")
        return Event(eventName: eventName, dataJSON: joined.data(using: .utf8))
    }
}
