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

enum WBFormat {
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
        return f
    }()

    private static let dateRangeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale.autoupdatingCurrent
        f.dateFormat = "MMM d"
        return f
    }()

    static func time(_ date: Date) -> String { timeFormatter.string(from: date) }
    static func dayHeader(_ date: Date) -> String { dayHeaderFormatter.string(from: date) }
    static func short(_ date: Date) -> String { dateRangeFormatter.string(from: date) }

    static func tripDateRange(_ trip: Trip) -> String {
        guard let s = trip.startDateValue, let e = trip.endDateValue else { return "" }
        let cal = Calendar.current
        let sameYear = cal.component(.year, from: s) == cal.component(.year, from: e)
        let yearF = DateFormatter(); yearF.dateFormat = ", yyyy"
        let year = sameYear ? yearF.string(from: e) : ""
        let sameMonth = cal.isDate(s, equalTo: e, toGranularity: .month)
        if sameMonth {
            let mF = DateFormatter(); mF.dateFormat = "MMM d"
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
