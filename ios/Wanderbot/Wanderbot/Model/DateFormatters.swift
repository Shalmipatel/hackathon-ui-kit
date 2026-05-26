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

/// Date parsing helpers for RTDB payloads. The web app stores
/// `start`/`end` as ISO 8601 strings; sometimes with timezone offsets,
/// sometimes naive. We try both.
enum WBDates {
    /// Naive ISO ("2026-06-20T07:52:00"), treated as UTC.
    static let isoFlex: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        return f
    }()

    /// ISO 8601 with timezone ("2026-06-20T07:52:00Z" or "+09:00").
    static let iso8601: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
}

enum WBFormat {
    /// Day-key derived dates are calendar markers, not instants. We
    /// parse them as UTC midnight; format them in UTC too so a user in
    /// PDT sees the same day the booking is recorded against.
    private static let utc = TimeZone(identifier: "UTC")!

    /// Times come from `Booking.start` / `.end` which are real instants
    /// (parsed from ISO strings with offsets). Show them in the user's
    /// local timezone, matching the React app's `Date#toLocaleTimeString`
    /// behaviour.
    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale.autoupdatingCurrent
        f.timeStyle = .short
        f.dateStyle = .none
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
