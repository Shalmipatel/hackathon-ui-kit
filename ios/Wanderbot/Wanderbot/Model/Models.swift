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

    /// Every yyyy-MM-dd this booking covers — single value for timed /
    /// untimed point events, and the full inclusive span for multi-day
    /// items (hotels, overnight flights). Mirrors web `bookingDayKeys`,
    /// which uses the browser's local timezone — an overnight flight
    /// departing 8:30 PM PDT and arriving 6:45 AM PDT the next morning
    /// shows up on both days, not collapsed into one UTC bucket.
    var dayKeys: [String] {
        guard let s = start, let e = end else { return [dayKey] }
        let cal = Calendar.current
        let sDay = cal.startOfDay(for: s)
        let eDay = cal.startOfDay(for: e)
        if eDay <= sDay { return [dayKey] }
        var out: [String] = []
        var cur = sDay
        while cur <= eDay {
            out.append(Booking.localDayKey(from: cur))
            guard let next = cal.date(byAdding: .day, value: 1, to: cur) else { break }
            cur = next
        }
        return out
    }

    fileprivate static let utcCalendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    /// Local-timezone yyyy-MM-dd formatter. Used wherever we slice
    /// instants into calendar days the way the user perceives them.
    private static let localDayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar.current
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func localDayKey(from date: Date) -> String {
        localDayFormatter.string(from: date)
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
        return 86400
    }

    private static func decodeDate(
        _ c: KeyedDecodingContainer<CodingKeys>,
        _ key: CodingKeys
    ) throws -> Date? {
        guard let raw = try c.decodeIfPresent(String.self, forKey: key) else { return nil }
        if let d = WBDates.isoFlex.date(from: raw) { return d }
        if let d = WBDates.iso8601.date(from: raw) { return d }
        if let d = ISO8601.day(from: raw) { return d }
        return nil
    }
}

/// Per-day sublabel under the time — matches the web's `multiDayLabels`
/// for spans, and gives single-day items something sensible too.
enum BookingDayRole {
    case singleStart   // single-day timed
    case spanStart     // first day of multi-day span
    case spanEnd       // last day of multi-day span
    case spanMiddle    // a day between start and end (no time, "All day")
    case untimed       // no `start` at all

    var label: String? {
        switch self {
        case .singleStart: return nil
        case .spanStart: return "Starts"
        case .spanEnd: return "Ends"
        case .spanMiddle, .untimed: return nil
        }
    }
}

extension Booking {
    /// What role this booking plays on the given day. Used by the
    /// itinerary row to pick which time to render and which sublabel
    /// (Check-in / Arrives / Departs) to show.
    func role(on dayKey: String) -> BookingDayRole {
        guard let s = start, let e = end else {
            return start == nil ? .untimed : .singleStart
        }
        let cal = Calendar.current
        let sDay = Booking.localDayKey(from: cal.startOfDay(for: s))
        let eDay = Booking.localDayKey(from: cal.startOfDay(for: e))
        if sDay == eDay { return .singleStart }
        if dayKey == sDay { return .spanStart }
        if dayKey == eDay { return .spanEnd }
        return .spanMiddle
    }

    /// Per-type sub-label ("Check-in" / "Check-out", "Departs" /
    /// "Arrives", "Starts" / "Ends") for the given day. Mirrors the
    /// web `multiDayLabels` helper.
    func subLabel(on dayKey: String) -> String? {
        switch role(on: dayKey) {
        case .spanStart:
            switch type {
            case .flight, .transport: return "Departs"
            case .hotel: return "Check-in"
            default: return "Starts"
            }
        case .spanEnd:
            switch type {
            case .flight, .transport: return "Arrives"
            case .hotel: return "Check-out"
            default: return "Ends"
            }
        case .spanMiddle: return "All day"
        case .singleStart, .untimed: return nil
        }
    }

    /// Time to display on the given day. Start time for start/single,
    /// end time for end-day, nil for middle days or untimed.
    func displayTime(on dayKey: String) -> Date? {
        switch role(on: dayKey) {
        case .singleStart, .spanStart: return start
        case .spanEnd: return end
        case .spanMiddle, .untimed: return nil
        }
    }

    /// Position used to sort within a day. End-day of a multi-day
    /// booking sorts by end-time so a hotel checking out at 11 AM
    /// today doesn't sit at its 3 PM check-in slot from yesterday.
    func effectivePosition(on dayKey: String) -> Double {
        switch role(on: dayKey) {
        case .spanEnd:
            if let end {
                let comps = Booking.utcCalendar.dateComponents([.hour, .minute], from: end)
                return Double((comps.hour ?? 0) * 3600 + (comps.minute ?? 0) * 60)
            }
            return position
        case .spanMiddle: return 0
        default: return position
        }
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
