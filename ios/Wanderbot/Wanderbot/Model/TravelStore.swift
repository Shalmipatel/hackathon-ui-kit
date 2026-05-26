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

    /// True when the booking is editable (drag, rename, etc.). Mirrors
    /// the web rule: items pulled out of the inbox (`source == .email`)
    /// are locked because they reflect a real confirmation; manual /
    /// agent items are free to rearrange.
    func isUnlocked(_ booking: Booking) -> Bool {
        booking.source != .email
    }

    /// Move a booking to a new position within its day. `targetIndex`
    /// is the desired index in the day's *unlocked-and-locked* combined
    /// ordering; this method picks a midpoint `position` that slots
    /// between neighbours without renumbering siblings.
    ///
    /// Mirrors the web `@dnd-kit/sortable` reorder path:
    /// drop-between-two-items gets the average; drop-at-end gets
    /// `last + 1000`; drop-at-start gets `first - 1000`.
    func reorder(_ booking: Booking, toIndex targetIndex: Int) {
        guard isUnlocked(booking) else { return }
        let dayBookings = bookings
            .filter { $0.tripId == booking.tripId && $0.dayKey == booking.dayKey }
            .sorted { $0.position < $1.position }
        // Strip the moved card out of its current spot, then insert
        // at the target index.
        var remaining = dayBookings.filter { $0.id != booking.id }
        let safeIndex = max(0, min(targetIndex, remaining.count))
        let newPosition: Double
        if remaining.isEmpty {
            newPosition = booking.position
        } else if safeIndex == 0 {
            newPosition = remaining[0].position - 1000
        } else if safeIndex >= remaining.count {
            newPosition = remaining[remaining.count - 1].position + 1000
        } else {
            newPosition = (remaining[safeIndex - 1].position + remaining[safeIndex].position) / 2
        }
        guard newPosition != booking.position else { return }

        var updated = booking
        updated.position = newPosition
        applyBookingUpdate(updated)
        Task { await persistBooking(updated) }
    }

    private func applyBookingUpdate(_ booking: Booking) {
        if let idx = bookings.firstIndex(where: { $0.id == booking.id }) {
            bookings[idx] = booking
        }
    }

    private func persistBooking(_ booking: Booking) async {
        // Patch only the field we touched so we don't stomp other
        // clients' edits to unrelated fields.
        guard let rtdb else { return }
        await rtdb.patch(["position": booking.position],
                         at: "wanderbot/bookings/\(booking.id)")
    }

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
