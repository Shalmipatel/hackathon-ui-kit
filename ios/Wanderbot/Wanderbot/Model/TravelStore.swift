import Foundation
import Combine

@MainActor
final class TravelStore: ObservableObject {
    @Published var trips: [Trip] = []
    @Published var bookings: [Booking] = []
    @Published var activeTripId: String?

    /// Upcoming (asc) then past (desc) — matches the React mobile shell.
    var orderedTrips: [Trip] {
        let today = ISO8601.dayKey(from: Calendar.current.startOfDay(for: Date()))
        var upcoming: [Trip] = []
        var past: [Trip] = []
        for trip in trips {
            if trip.endDate >= today { upcoming.append(trip) }
            else { past.append(trip) }
        }
        upcoming.sort { $0.startDate < $1.startDate }
        past.sort { $0.startDate > $1.startDate }
        return upcoming + past
    }

    func bookings(for tripId: String) -> [Booking] {
        bookings.filter { $0.tripId == tripId }
    }

    /// Bookings grouped by dayKey, in chronological day order, each
    /// day's items sorted by `position`.
    func itineraryDays(for trip: Trip) -> [(dayKey: String, date: Date, bookings: [Booking])] {
        let tripBookings = bookings(for: trip.id)
        var byDay: [String: [Booking]] = [:]
        for b in tripBookings {
            byDay[b.dayKey, default: []].append(b)
        }
        return trip.dayKeys.map { key in
            let date = ISO8601.day(from: key) ?? Date()
            let items = (byDay[key] ?? []).sorted { $0.position < $1.position }
            return (key, date, items)
        }
    }
}
