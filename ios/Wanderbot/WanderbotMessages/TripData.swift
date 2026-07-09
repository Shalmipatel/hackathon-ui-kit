import Foundation
import SwiftUI

/// Live trip data for the iMessage extension. The extension ships lean (no
/// Firebase auth), so instead of reading RTDB directly it pulls the whole
/// trip/booking snapshot from the app's public `/trips-data` endpoint — the
/// same records the app reads. The card payload names which trip to focus;
/// this store fills in the full itinerary, map, and budget behind it.
@MainActor
final class TripStore: ObservableObject {
    enum Phase: Equatable { case idle, loading, loaded, failed }

    @Published var phase: Phase = .idle
    @Published var trips: [Trip] = []
    @Published var bookings: [Booking] = []

    private static let endpoint = URL(string: "https://wanderbot-ai.vercel.app/trips-data")!

    private struct Snapshot: Decodable {
        let trips: [Trip]
        let bookings: [Booking]

        // Tolerant decode: one malformed record must not blank the whole trip
        // (mirrors the app's FailableDecodable read path).
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            trips = (try c.decodeIfPresent([Lossy<Trip>].self, forKey: .trips) ?? []).compactMap(\.value)
            bookings = (try c.decodeIfPresent([Lossy<Booking>].self, forKey: .bookings) ?? []).compactMap(\.value)
        }
        enum CodingKeys: String, CodingKey { case trips, bookings }
    }

    private struct Lossy<T: Decodable>: Decodable {
        let value: T?
        init(from decoder: Decoder) throws { value = try? T(from: decoder) }
    }

    /// Load once. Safe to call repeatedly (e.g. on each willBecomeActive) —
    /// it re-fetches so an expanded card reflects edits made in the app.
    func load() async {
        if phase == .loading { return }
        phase = .loading
        var request = URLRequest(url: Self.endpoint)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 15
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                phase = .failed
                return
            }
            let snap = try JSONDecoder().decode(Snapshot.self, from: data)
            trips = snap.trips.filter { $0.archived != true }
                .sorted { ($0.startDateValue ?? .distantFuture) < ($1.startDateValue ?? .distantFuture) }
            bookings = snap.bookings
            phase = .loaded
        } catch {
            print("[wbmessages] trips-data load failed:", error)
            phase = .failed
        }
    }

    func trip(id: String?) -> Trip? {
        guard let id else { return nil }
        return trips.first { $0.id == id }
    }

    /// Bookings that belong to a trip.
    func bookings(for tripID: String) -> [Booking] {
        bookings.filter { $0.tripId == tripID }
    }

    /// Trip cost total (sum of booking costs), and per-currency breakdown.
    func budget(for tripID: String) -> (total: Double, currency: String, byType: [(BookingType, Double)])? {
        let items = bookings(for: tripID).compactMap { b -> (BookingType, Double, String)? in
            guard let c = b.cost else { return nil }
            return (b.type, c.amount, c.currency)
        }
        guard !items.isEmpty else { return nil }
        let currency = items.first!.2
        let total = items.reduce(0) { $0 + $1.1 }
        var typeMap: [BookingType: Double] = [:]
        for (t, amt, _) in items { typeMap[t, default: 0] += amt }
        let byType = typeMap.sorted { $0.value > $1.value }.map { ($0.key, $0.value) }
        return (total, currency, byType)
    }
}

/// Booking rows for one calendar day of a trip, already sorted for display.
struct DaySection: Identifiable {
    let dayKey: String
    let date: Date?
    let items: [Booking]
    var id: String { dayKey }
}

extension TripStore {
    /// Group a trip's bookings into ordered day sections, mirroring the app's
    /// itinerary: a booking appears on every day it spans, sorted by its
    /// effective time within each day.
    func itinerary(for trip: Trip) -> [DaySection] {
        let tripBookings = bookings(for: trip.id)
        // Union of the trip's own day span and any booking day (so an item
        // dated just outside the trip window still shows).
        var dayKeys = Set(trip.dayKeys)
        for b in tripBookings { dayKeys.formUnion(b.dayKeys) }
        let ordered = dayKeys.sorted()
        return ordered.compactMap { key in
            let items = tripBookings
                .filter { $0.dayKeys.contains(key) }
                .sorted { $0.effectivePosition(on: key) < $1.effectivePosition(on: key) }
            guard !items.isEmpty else { return nil }
            return DaySection(dayKey: key, date: ISO8601.day(from: key), items: items)
        }
    }
}
