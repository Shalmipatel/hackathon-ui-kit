import Foundation
import Combine

@MainActor
final class TravelStore: ObservableObject {
    enum SyncState { case idle, loading, live, offline }

    @Published var trips: [Trip] = []
    @Published var bookings: [Booking] = []
    @Published var activeTripId: String?
    @Published var syncState: SyncState = .idle

    private var rtdb: FirebaseRTDB?
    private var subscriptionTask: Task<Void, Never>?

    /// Boot the live sync. When Firebase is configured (`WanderbotConfig`),
    /// load an initial snapshot then open the SSE stream. When not
    /// configured, populate from `SampleData` so the UI has something
    /// to render in development.
    func bootstrap() {
        guard syncState == .idle else { return }
        if WanderbotConfig.firebaseEnabled,
           let rtdb = FirebaseRTDB(databaseURLString: WanderbotConfig.firebaseDatabaseURL) {
            self.rtdb = rtdb
            syncState = .loading
            startRemoteSync()
        } else {
            loadSampleData()
        }
    }

    private func loadSampleData() {
        trips = SampleData.trips
        bookings = SampleData.bookings
        activeTripId = trips.first?.id
        syncState = .offline
    }

    private func startRemoteSync() {
        guard let rtdb else { return }
        subscriptionTask = Task { [weak self] in
            // Initial REST load — populates the UI fast, before the SSE
            // stream lands its first event.
            let snapshot = await rtdb.loadSnapshot()
            await self?.apply(trips: snapshot.trips, bookings: snapshot.bookings)

            // Long-lived SSE stream. Each emission is a full snapshot.
            for await snap in await rtdb.subscribe() {
                await self?.apply(trips: snap.trips, bookings: snap.bookings)
            }
        }
    }

    private func apply(trips newTrips: [Trip], bookings newBookings: [Booking]) {
        // Stable sort so order doesn't jitter when SSE re-keys a map.
        trips = newTrips.sorted { $0.id < $1.id }
        bookings = newBookings.sorted { $0.id < $1.id }
        if activeTripId == nil || !trips.contains(where: { $0.id == activeTripId }) {
            activeTripId = orderedTrips.first?.id
        }
        syncState = .live
    }

    deinit { subscriptionTask?.cancel() }

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
