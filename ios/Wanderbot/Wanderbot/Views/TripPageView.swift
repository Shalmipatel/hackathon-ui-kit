import SwiftUI

/// One trip's page: pinned map (or flight card) at the top via
/// `.safeAreaInset`, ScrollView + LazyVStack below.
///
/// We deliberately avoid `List` here. List wraps any child view in a
/// `UICollectionViewListCell`, which means a `.draggable` attached
/// inside the row ends up lifting the *entire row* rather than the
/// individual booking card. Force-touching a card therefore "selected
/// the whole day". ScrollView + LazyVStack lets each `BookingCardView`
/// own its drag source directly.
struct TripPageView: View {
    let trip: Trip
    @Binding var selectedBookingId: Booking.ID?

    @EnvironmentObject private var store: TravelStore
    @State private var focusedBookingId: Booking.ID?

    private var bookings: [Booking] { store.bookings(for: trip.id) }
    private var mapFocusBookingId: Booking.ID? { selectedBookingId ?? focusedBookingId }
    private var focusedBooking: Booking? {
        bookings.first(where: { $0.id == mapFocusBookingId })
    }

    private let mapHeight: CGFloat = 200
    private let focusLineOffset: CGFloat = 24

    var body: some View {
        GeometryReader { outer in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    TripIntro(trip: trip)
                        .padding(.horizontal, 14)
                        .padding(.top, 12)
                        .padding(.bottom, 8)

                    ForEach(Array(store.itineraryDays(for: trip).enumerated()), id: \.element.dayKey) { idx, day in
                        DaySection(
                            index: idx,
                            date: day.date,
                            dayKey: day.dayKey,
                            bookings: day.bookings,
                            selectedBookingId: $selectedBookingId
                        )
                        .padding(.horizontal, 14)
                        .padding(.bottom, 4)
                    }

                    Color.clear.frame(height: 96) // bottom breathing room
                }
            }
            .scrollIndicators(.hidden)
            .background(Theme.background)
            .safeAreaInset(edge: .top, spacing: 0) {
                Group {
                    if let flight = focusedBooking, flight.type == .flight {
                        FlightHeaderView(booking: flight)
                    } else {
                        TripMapView(
                            trip: trip,
                            bookings: bookings,
                            focusedBookingId: mapFocusBookingId,
                            onMarkerTap: { id in selectedBookingId = id }
                        )
                    }
                }
                .frame(height: mapHeight)
                .background(Theme.background)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(Theme.hairline).frame(height: 1)
                }
            }
            .onPreferenceChange(BookingPositionsKey.self) { positions in
                updateFocus(from: positions, in: outer)
            }
        }
        .background(Theme.background)
    }

    private func updateFocus(from positions: [Booking.ID: CGFloat], in outer: GeometryProxy) {
        let frame = outer.frame(in: .global)
        let focusLineY = frame.minY + mapHeight + focusLineOffset
        var bestID: Booking.ID?
        var bestDistance: CGFloat = .infinity
        for (id, y) in positions {
            guard y > frame.minY, y < frame.maxY else { continue }
            let distance = abs(y - focusLineY)
            if distance < bestDistance {
                bestDistance = distance
                bestID = id
            }
        }
        if let bestID, bestID != focusedBookingId {
            focusedBookingId = bestID
        }
    }
}

/// Trip identity card — destination, title, dates, and a per-trip
/// Rescan button that fires `wanderbot-sync rescan <tripId>` via
/// SyncService. The skill writes any newly-found bookings to RTDB
/// and the existing TravelStore SSE picks them up.
private struct TripIntro: View {
    let trip: Trip
    @EnvironmentObject private var sync: SyncService

    private var rescanning: Bool { sync.rescanningTripID == trip.id }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(trip.destination.uppercased())
                    .font(.system(size: 10.5, weight: .bold))
                    .tracking(0.12 * 10.5)
                    .foregroundStyle(Theme.inkMuted)
                Text(trip.title)
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(Theme.ink)
                    .tracking(-0.5)
                Text(WBFormat.tripDateRange(trip))
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.inkMuted)
                if trip.isPast {
                    Text("PAST TRIP")
                        .font(.system(size: 10.5, weight: .bold))
                        .tracking(0.08 * 10.5)
                        .foregroundStyle(Theme.ink.opacity(0.65))
                        .padding(.horizontal, 9)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(Theme.chipFill))
                        .padding(.top, 4)
                }
            }

            Spacer(minLength: 0)

            // Rescan pill — sits in the corner of the intro card.
            // Disabled while a rescan for THIS trip is in flight; a
            // rescan on another trip doesn't block this one (each
            // trip gets its own in-flight flag, but the SyncService
            // serialises through one Task at a time).
            Button {
                sync.rescanTrip(id: trip.id)
            } label: {
                HStack(spacing: 5) {
                    if rescanning {
                        ProgressView()
                            .controlSize(.mini)
                            .tint(Theme.ink)
                    } else {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 11, weight: .bold))
                    }
                    Text(rescanning ? "Rescanning…" : "Rescan")
                        .font(.system(size: 11.5, weight: .semibold))
                }
                .foregroundStyle(Theme.ink)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Capsule().fill(Theme.chipFill))
            }
            .buttonStyle(.plain)
            .disabled(rescanning)
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// One day in the trip: header tile + DraggableBookingsList.
private struct DaySection: View {
    let index: Int
    let date: Date
    let dayKey: String
    let bookings: [Booking]
    @Binding var selectedBookingId: Booking.ID?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            DayHeader(index: index, date: date, itemCount: bookings.count)
                .padding(.top, 14)
                .padding(.bottom, 4)

            if bookings.isEmpty {
                Text("Open day")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.inkMuted)
                    .padding(.vertical, 14)
                    .padding(.horizontal, 16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                            .stroke(Theme.hairline, style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
                    )
            } else {
                DraggableBookingsList(
                    dayKey: dayKey,
                    bookings: bookings,
                    selectedBookingId: $selectedBookingId
                )
            }
        }
    }
}

/// Big dark date tile + Day N · weekday title + item count subtitle.
/// Matches the web mobile header almost 1:1.
private struct DayHeader: View {
    let index: Int
    let date: Date
    let itemCount: Int

    private static let utcCal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    private static let monthFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM"
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()

    private static let weekdayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "EEE, MMM d"
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()

    private var dayNum: String {
        String(Self.utcCal.component(.day, from: date))
    }

    var body: some View {
        HStack(spacing: 12) {
            VStack(spacing: 2) {
                Text(dayNum)
                    .font(.system(size: 18, weight: .bold))
                    .tracking(-0.5)
                    .foregroundStyle(itemCount == 0 ? Theme.inkMuted : .white)
                Text(Self.monthFormatter.string(from: date).uppercased())
                    .font(.system(size: 9.5, weight: .semibold))
                    .tracking(0.05 * 9.5)
                    .foregroundStyle((itemCount == 0 ? Theme.inkMuted : Color.white).opacity(0.7))
            }
            .frame(width: 48, height: 48)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(itemCount == 0 ? Theme.chipFill : Theme.inkDark)
            )

            VStack(alignment: .leading, spacing: 1) {
                Text("Day \(index + 1) · \(Self.weekdayFormatter.string(from: date))")
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                Text(itemCount == 0 ? "Open day" : "\(itemCount) \(itemCount == 1 ? "item" : "items")")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.inkMuted)
            }
            Spacer(minLength: 0)
        }
    }
}
