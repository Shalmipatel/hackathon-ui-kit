import Foundation

enum ISO8601 {
    static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func day(from key: String) -> Date? { dayFormatter.date(from: key) }
    static func dayKey(from date: Date) -> String { dayFormatter.string(from: date) }
}

/// Date parsing + formatting for RTDB payloads.
///
/// Convention (matches what the React mobile shell ends up showing):
/// every timestamp the agent writes is a wall-clock value at the
/// trip's destination. We treat it as such — strip any timezone
/// offset on read, store the wall-clock components as a UTC Date,
/// and format back in UTC. Result: "T20:30:00-07:00" displays as
/// 8:30 PM regardless of which timezone the user's phone is in.
enum WBDates {
    private static let naiveParser: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        return f
    }()

    private static let naiveWriter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        return f
    }()

    /// Parse a timestamp the agent / web wrote, ignoring any timezone
    /// suffix. The minute / hour / day fields are taken verbatim from
    /// the string and treated as UTC, so they round-trip unchanged
    /// through a Date.
    static func parseWallClock(_ raw: String) -> Date? {
        if raw.isEmpty { return nil }
        // Drop everything from the first '+' or '-' that follows the
        // seconds field, plus any trailing 'Z'.
        let stripped = stripTimezone(raw)
        // Pad short forms like "2026-06-20T07:52" → "2026-06-20T07:52:00".
        let padded = padSeconds(stripped)
        if let date = naiveParser.date(from: padded) { return date }
        // Date-only input ("2026-06-20") — fall through to the day key
        // parser so we still anchor to that calendar day.
        return ISO8601.day(from: padded)
    }

    /// Write a Date back to RTDB as `yyyy-MM-dd'T'HH:mm:ss`. No
    /// timezone suffix — the value was a wall-clock when we read it
    /// in, so it goes back as a wall-clock. The web's loose ISO
    /// parser (`new Date('2026-06-20T15:00:00')`) reads this as the
    /// browser's local time, which is what mobile users see today.
    static func formatWallClock(_ date: Date) -> String {
        naiveWriter.string(from: date)
    }

    private static func stripTimezone(_ raw: String) -> String {
        // Find the 'T' separator first; anything before it is date,
        // we only strip from the time portion.
        guard let tIdx = raw.firstIndex(of: "T") else { return raw }
        let dateHead = raw[..<tIdx]
        var tail = raw[tIdx...]
        if let z = tail.lastIndex(of: "Z") {
            tail = tail[..<z]
        }
        // Walk forward from after the "T" and find the first '+' or '-'
        // (timezone offset). The leading 'T' itself doesn't count.
        let afterT = tail.index(after: tail.startIndex)
        if let off = tail[afterT...].firstIndex(where: { $0 == "+" || $0 == "-" }) {
            tail = tail[..<off]
        }
        return String(dateHead) + String(tail)
    }

    private static func padSeconds(_ raw: String) -> String {
        // Accept "2026-06-20T07:52" by appending ":00".
        guard raw.contains("T") else { return raw }
        let parts = raw.split(separator: "T", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { return raw }
        let timeParts = parts[1].split(separator: ":").map(String.init)
        if timeParts.count == 2 { return parts[0] + "T" + parts[1] + ":00" }
        return raw
    }
}

enum WBFormat {
    /// Day-key derived dates are calendar markers, not instants. We
    /// parse them as UTC midnight; format them in UTC too so a user in
    /// PDT sees the same day the booking is recorded against.
    private static let utc = TimeZone(identifier: "UTC")!

    /// Times come from `Booking.start` / `.end` which were stored as
    /// wall-clock values by the agent (see WBDates.parseWallClock).
    /// We display in UTC so the hour/minute the agent wrote round-trips
    /// unchanged to what the user sees, no matter which timezone the
    /// phone is in.
    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale.autoupdatingCurrent
        f.timeStyle = .short
        f.dateStyle = .none
        f.timeZone = utc
        return f
    }()

    private static let dayHeaderFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale.autoupdatingCurrent
        f.dateFormat = "EEE, MMM d"
        f.timeZone = utc
        return f
    }()

    private static let dateRangeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale.autoupdatingCurrent
        f.dateFormat = "MMM d"
        f.timeZone = utc
        return f
    }()

    private static let utcCalendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = utc
        return c
    }()

    static func time(_ date: Date) -> String { timeFormatter.string(from: date) }
    static func dayHeader(_ date: Date) -> String { dayHeaderFormatter.string(from: date) }
    static func short(_ date: Date) -> String { dateRangeFormatter.string(from: date) }

    static func tripDateRange(_ trip: Trip) -> String {
        guard let s = trip.startDateValue, let e = trip.endDateValue else { return "" }
        let cal = utcCalendar
        let sameYear = cal.component(.year, from: s) == cal.component(.year, from: e)
        let yearF = DateFormatter(); yearF.dateFormat = ", yyyy"; yearF.timeZone = utc
        let year = sameYear ? yearF.string(from: e) : ""
        let sameMonth = cal.isDate(s, equalTo: e, toGranularity: .month)
        if sameMonth {
            let mF = DateFormatter(); mF.dateFormat = "MMM d"; mF.timeZone = utc
            let m = mF.string(from: s)
            let dEnd = String(cal.component(.day, from: e))
            return "\(m)–\(dEnd)\(year)"
        }
        return "\(short(s)) – \(short(e))\(year)"
    }

    static func money(_ cost: Cost) -> String {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = cost.currency
        return f.string(from: NSNumber(value: cost.amount)) ?? "\(cost.amount) \(cost.currency)"
    }
}
