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
