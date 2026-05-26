import SwiftUI

/// Settings → All Trips. A grouped browse of every trip in the store,
/// upcoming vs. past. Tap a row to jump the trip carousel to that page
/// and dismiss the settings sheet.
struct AllTripsView: View {
    let onSelectTrip: (Trip.ID) -> Void

    @EnvironmentObject private var store: TravelStore

    private var grouped: (upcoming: [Trip], past: [Trip]) {
        let today = ISO8601.dayKey(from: Calendar.current.startOfDay(for: Date()))
        var u: [Trip] = []
        var p: [Trip] = []
        for t in store.trips {
            if t.endDate >= today { u.append(t) } else { p.append(t) }
        }
        u.sort { $0.startDate < $1.startDate }
        p.sort { $0.startDate > $1.startDate }
        return (u, p)
    }

    var body: some View {
        List {
            if store.trips.isEmpty {
                Text("No trips yet — add one through chat to see it here.")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.inkMuted)
                    .listRowBackground(Color.clear)
            } else {
                let g = grouped
                if !g.upcoming.isEmpty {
                    Section("Upcoming") {
                        ForEach(g.upcoming) { trip in
                            TripRow(trip: trip,
                                    itemCount: store.bookings(for: trip.id).count,
                                    onTap: { onSelectTrip(trip.id) })
                        }
                    }
                }
                if !g.past.isEmpty {
                    Section("Past") {
                        ForEach(g.past) { trip in
                            TripRow(trip: trip,
                                    itemCount: store.bookings(for: trip.id).count,
                                    onTap: { onSelectTrip(trip.id) })
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.background)
        .navigationTitle("All Trips")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct TripRow: View {
    let trip: Trip
    let itemCount: Int
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(tripAccent(trip.color))
                    Image(systemName: "mappin.and.ellipse")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white)
                }
                .frame(width: 32, height: 32)

                VStack(alignment: .leading, spacing: 1) {
                    Text(trip.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                    Text("\(trip.destination) · \(WBFormat.tripDateRange(trip))")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.inkMuted)
                        .lineLimit(1)
                }

                Spacer(minLength: 0)

                Text("\(itemCount)")
                    .font(.system(size: 11.5, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Theme.inkMuted)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(Theme.chipFill))

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.inkMuted.opacity(0.7))
            }
            .padding(.vertical, 2)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// Best-effort parse of trip.color (`#RRGGBB`). Falls back to brand
    /// yellow when the hex doesn't look valid.
    private func tripAccent(_ hex: String) -> Color {
        var value = hex
        if value.hasPrefix("#") { value.removeFirst() }
        guard value.count == 6,
              let rgb = UInt32(value, radix: 16) else { return Theme.brandYellow }
        let r = Double((rgb >> 16) & 0xFF) / 255
        let g = Double((rgb >> 8) & 0xFF) / 255
        let b = Double(rgb & 0xFF) / 255
        return Color(red: r, green: g, blue: b)
    }
}
