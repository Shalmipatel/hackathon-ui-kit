import Foundation
import CoreLocation

enum BookingType: String, Codable, CaseIterable, Hashable {
    case flight, hotel, attraction, experience, event, activity, restaurant, transport
}

enum BookingSource: String, Codable, Hashable {
    case email, agent, manual
}

struct Place: Codable, Hashable {
    var name: String
    var address: String?
    var lat: Double
    var lng: Double

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }
}

struct Cost: Codable, Hashable {
    var amount: Double
    var currency: String
}

struct Booking: Identifiable, Hashable, Codable {
    var id: String
    var tripId: String
    var type: BookingType
    var title: String
    /// Day this booking lives in (yyyy-MM-dd).
    var dayKey: String
    /// Within-day sort key.
    var position: Double
    var start: Date?
    var end: Date?
    var confirmation: String?
    var provider: String?
    var source: BookingSource
    var notes: String?
    var emailSubject: String?
    var link: String?
    var cost: Cost?

    // Type-specific
    var place: Place?       // hotel, restaurant, attraction, experience, event, activity
    var from: Place?        // flight, transport
    var to: Place?          // flight, transport
    var flightNumber: String?
    var cabin: String?
    var mode: String?       // transport
    var partySize: Int?     // restaurant
    var nights: Int?        // hotel

    /// Best-effort single location used by the map. Flight/transport
    /// fall back to `to` (where they're going).
    var mapPlace: Place? {
        place ?? to ?? from
    }

    init(
        id: String,
        tripId: String,
        type: BookingType,
        title: String,
        dayKey: String,
        position: Double,
        start: Date? = nil,
        end: Date? = nil,
        confirmation: String? = nil,
        provider: String? = nil,
        source: BookingSource,
        notes: String? = nil,
        emailSubject: String? = nil,
        link: String? = nil,
        cost: Cost? = nil,
        place: Place? = nil,
        from: Place? = nil,
        to: Place? = nil,
        flightNumber: String? = nil,
        cabin: String? = nil,
        mode: String? = nil,
        partySize: Int? = nil,
        nights: Int? = nil
    ) {
        self.id = id
        self.tripId = tripId
        self.type = type
        self.title = title
        self.dayKey = dayKey
        self.position = position
        self.start = start
        self.end = end
        self.confirmation = confirmation
        self.provider = provider
        self.source = source
        self.notes = notes
        self.emailSubject = emailSubject
        self.link = link
        self.cost = cost
        self.place = place
        self.from = from
        self.to = to
        self.flightNumber = flightNumber
        self.cabin = cabin
        self.mode = mode
        self.partySize = partySize
        self.nights = nights
    }

    /// Decode `start`/`end` as ISO8601 strings — RTDB stores them as
    /// strings, not numbers. Unknown extra fields (like the legacy
    /// `hasTime` flag) get ignored, matching the web app's read path.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        tripId = try c.decode(String.self, forKey: .tripId)
        type = try c.decode(BookingType.self, forKey: .type)
        title = try c.decode(String.self, forKey: .title)
        dayKey = try Booking.decodeDayKey(from: c)
        position = try Booking.decodePosition(from: c, dayKey: dayKey)
        start = try Booking.decodeDate(c, .start)
        end = try Booking.decodeDate(c, .end)
        confirmation = try c.decodeIfPresent(String.self, forKey: .confirmation)
        provider = try c.decodeIfPresent(String.self, forKey: .provider)
        source = try c.decodeIfPresent(BookingSource.self, forKey: .source) ?? .agent
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        emailSubject = try c.decodeIfPresent(String.self, forKey: .emailSubject)
        link = try c.decodeIfPresent(String.self, forKey: .link)
        cost = try c.decodeIfPresent(Cost.self, forKey: .cost)
        place = try c.decodeIfPresent(Place.self, forKey: .place)
        from = try c.decodeIfPresent(Place.self, forKey: .from)
        to = try c.decodeIfPresent(Place.self, forKey: .to)
        flightNumber = try c.decodeIfPresent(String.self, forKey: .flightNumber)
        cabin = try c.decodeIfPresent(String.self, forKey: .cabin)
        mode = try c.decodeIfPresent(String.self, forKey: .mode)
        partySize = try c.decodeIfPresent(Int.self, forKey: .partySize)
        nights = try c.decodeIfPresent(Int.self, forKey: .nights)
    }

    enum CodingKeys: String, CodingKey {
        case id, tripId, type, title, dayKey, position, start, end
        case confirmation, provider, source, notes, emailSubject, link, cost
        case place, from, to, flightNumber, cabin, mode, partySize, nights
    }

    private static func decodeDayKey(
        from c: KeyedDecodingContainer<CodingKeys>
    ) throws -> String {
        if let d = try c.decodeIfPresent(String.self, forKey: .dayKey) { return d }
        // Legacy fallback: derive from `start` string prefix.
        if let s = try c.decodeIfPresent(String.self, forKey: .start) {
            return String(s.prefix(10))
        }
        throw DecodingError.dataCorruptedError(
            forKey: .dayKey, in: c,
            debugDescription: "Booking missing dayKey and start"
        )
    }

    private static func decodePosition(
        from c: KeyedDecodingContainer<CodingKeys>,
        dayKey: String
    ) throws -> Double {
        if let p = try c.decodeIfPresent(Double.self, forKey: .position) { return p }
        return 86400 // sort to end of day if missing
    }

    private static func decodeDate(
        _ c: KeyedDecodingContainer<CodingKeys>,
        _ key: CodingKeys
    ) throws -> Date? {
        // Two shapes show up in the wild: full ISO ("2026-06-20T07:52:00")
        // and date-only ("2026-06-20"). Try both.
        guard let raw = try c.decodeIfPresent(String.self, forKey: key) else { return nil }
        if let d = WBDates.isoFlex.date(from: raw) { return d }
        if let d = WBDates.iso8601.date(from: raw) { return d }
        if let d = ISO8601.day(from: raw) { return d }
        return nil
    }
}

struct Trip: Identifiable, Hashable, Codable {
    var id: String
    var title: String
    var destination: String
    /// yyyy-MM-dd
    var startDate: String
    var endDate: String
    /// Hex string accent.
    var color: String
    var travelers: [String]?
    var summary: String?
    var cover: String?
    var archived: Bool?

    var startDateValue: Date? { ISO8601.day(from: startDate) }
    var endDateValue: Date? { ISO8601.day(from: endDate) }

    /// True if the trip's last day is before today.
    var isPast: Bool {
        guard let end = endDateValue else { return false }
        return end < Calendar.current.startOfDay(for: Date())
    }

    /// Inclusive day count.
    var dayCount: Int {
        guard
            let s = startDateValue,
            let e = endDateValue,
            let days = Calendar.current.dateComponents([.day], from: s, to: e).day
        else { return 1 }
        return max(1, days + 1)
    }

    /// Ordered day-keys (yyyy-MM-dd) from start to end inclusive.
    var dayKeys: [String] {
        guard let s = startDateValue else { return [] }
        return (0..<dayCount).compactMap { offset in
            guard let d = Calendar.current.date(byAdding: .day, value: offset, to: s) else { return nil }
            return ISO8601.dayKey(from: d)
        }
    }
}
