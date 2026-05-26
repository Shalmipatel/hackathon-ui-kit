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
    /// agent items are free to rearrange. Multi-day bookings are also
    /// locked — dragging one off its anchor would shred the
    /// check-in/check-out timeline.
    func isUnlocked(_ booking: Booking) -> Bool {
        booking.source != .email && booking.dayKeys.count == 1
    }

    /// Move a booking to a new slot on the day the user is viewing.
    /// `dayKey` is that visible day — important because a multi-day
    /// item (hotel check-out, overnight-flight arrival) appears on
    /// days other than its primary `dayKey`, and we need those rows
    /// counted as neighbours so the midpoint math can slot a card
    /// between them.
    ///
    /// Mirrors the web `@dnd-kit/sortable` reorder path:
    /// drop-between-two-items gets the average; drop-at-end gets
    /// `last + 1000`; drop-at-start gets `first - 1000`. Effective
    /// positions on the visible day are used (an end-day uses the
    /// end time, not the original start time) so the slot lands
    /// where the user dropped it visually.
    func reorder(_ booking: Booking, toIndex targetIndex: Int, dayKey: String) {
        guard isUnlocked(booking) else { return }

        let dayBookings = bookings
            .filter { $0.tripId == booking.tripId && $0.dayKeys.contains(dayKey) }
            .sorted { $0.effectivePosition(on: dayKey) < $1.effectivePosition(on: dayKey) }

        var remaining = dayBookings.filter { $0.id != booking.id }
        let safeIndex = max(0, min(targetIndex, remaining.count))

        let newPosition: Double
        if remaining.isEmpty {
            newPosition = booking.position
        } else if safeIndex == 0 {
            newPosition = remaining[0].effectivePosition(on: dayKey) - 1000
        } else if safeIndex >= remaining.count {
            newPosition = remaining[remaining.count - 1].effectivePosition(on: dayKey) + 1000
        } else {
            let left = remaining[safeIndex - 1].effectivePosition(on: dayKey)
            let right = remaining[safeIndex].effectivePosition(on: dayKey)
            newPosition = (left + right) / 2
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

    // MARK: - Inline edits (time, notes)

    /// Type-by-type rule for whether the start time can be edited. Same
    /// shape as the web app: confirmation-backed bookings (flight,
    /// hotel) stay locked because the source-of-truth is the inbox
    /// scan; user-chosen items can be slid around.
    func isTimeEditable(_ booking: Booking) -> Bool {
        switch booking.type {
        case .flight, .hotel: return false
        case .attraction, .experience, .event, .activity, .restaurant, .transport: return true
        }
    }

    /// Update the start time. Keeps the booking on the same dayKey
    /// (the picker only edits hour/minute), and rewrites `position`
    /// from the new wall-clock seconds so the itinerary stays sorted
    /// chronologically. Persists via `start` + `position` PATCH so a
    /// concurrent edit to another field isn't clobbered.
    func updateStartTime(_ booking: Booking, newStart: Date) {
        guard isTimeEditable(booking) else { return }
        var updated = booking
        updated.start = newStart
        updated.position = positionFor(date: newStart)
        applyBookingUpdate(updated)
        Task { await persistTime(updated) }
    }

    private func persistTime(_ booking: Booking) async {
        guard let rtdb, let start = booking.start else { return }
        await rtdb.patch(
            [
                "start": WBDates.formatWallClock(start),
                "position": booking.position,
            ],
            at: "wanderbot/bookings/\(booking.id)"
        )
    }

    /// Strip the start time, flipping the booking back to "untimed".
    /// Also clears the end time (no end without start). Position
    /// resets to the sort-to-end default so untimed items land at the
    /// bottom of their day.
    func clearStartTime(_ booking: Booking) {
        guard isTimeEditable(booking) else { return }
        guard booking.start != nil || booking.end != nil else { return }
        var updated = booking
        updated.start = nil
        updated.end = nil
        updated.position = 86400
        applyBookingUpdate(updated)
        Task {
            guard let rtdb else { return }
            await rtdb.patch(
                ["start": NSNull(), "end": NSNull(), "position": 86400],
                at: "wanderbot/bookings/\(booking.id)"
            )
        }
    }

    /// Update the end time. Only meaningful when the booking already
    /// has a start. PATCHes end + nothing else.
    func updateEndTime(_ booking: Booking, newEnd: Date) {
        guard isTimeEditable(booking) else { return }
        guard booking.start != nil else { return }
        var updated = booking
        updated.end = newEnd
        applyBookingUpdate(updated)
        Task {
            guard let rtdb else { return }
            await rtdb.patch(
                ["end": WBDates.formatWallClock(newEnd)],
                at: "wanderbot/bookings/\(booking.id)"
            )
        }
    }

    /// Strip the end time. Keeps start intact.
    func clearEndTime(_ booking: Booking) {
        guard isTimeEditable(booking) else { return }
        guard booking.end != nil else { return }
        var updated = booking
        updated.end = nil
        applyBookingUpdate(updated)
        Task {
            guard let rtdb else { return }
            await rtdb.patch(
                ["end": NSNull()],
                at: "wanderbot/bookings/\(booking.id)"
            )
        }
    }

    /// Wall-clock seconds since midnight in UTC, matching the web
    /// agent's initial position formula. Sorting within a day stays
    /// chronological as long as we use the same units.
    private func positionFor(date: Date) -> Double {
        let cal = Calendar(identifier: .gregorian)
        var c = cal
        c.timeZone = TimeZone(identifier: "UTC")!
        let comps = c.dateComponents([.hour, .minute, .second], from: date)
        let h = Double(comps.hour ?? 0)
        let m = Double(comps.minute ?? 0)
        let s = Double(comps.second ?? 0)
        return h * 3600 + m * 60 + s
    }

    /// Update notes. Empty string clears the field on RTDB; nil-out
    /// rather than send `""` so the JSON stays clean.
    func updateNotes(_ booking: Booking, notes: String) {
        var updated = booking
        let trimmed = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        updated.notes = trimmed.isEmpty ? nil : trimmed
        guard updated.notes != booking.notes else { return }
        applyBookingUpdate(updated)
        Task { await persistNotes(updated) }
    }

    private func persistNotes(_ booking: Booking) async {
        guard let rtdb else { return }
        let value: Any = booking.notes ?? NSNull()
        await rtdb.patch(["notes": value],
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

    /// Bookings grouped by every day they cover (multi-day items
    /// appear in 2+ buckets), in chronological order, each day sorted
    /// by the effective position (end-time on end-day for spans,
    /// stored position otherwise). Matches the web's `bookingsByDay`.
    func itineraryDays(for trip: Trip) -> [(dayKey: String, date: Date, bookings: [Booking])] {
        let tripBookings = bookings(for: trip.id)
        var byDay: [String: [Booking]] = [:]
        for b in tripBookings {
            for key in b.dayKeys {
                byDay[key, default: []].append(b)
            }
        }
        return trip.dayKeys.map { key in
            let date = ISO8601.day(from: key) ?? Date()
            let items = (byDay[key] ?? []).sorted {
                $0.effectivePosition(on: key) < $1.effectivePosition(on: key)
            }
            return (key, date, items)
        }
    }
}
