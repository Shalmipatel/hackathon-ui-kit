import SwiftUI

/// One trip's page: pinned map (or flight card) at the top via
/// `.safeAreaInset`, and a List below for native iOS long-press
/// reorder. Each day is a List section with a web-style date tile
/// header; multi-day bookings (hotels, overnight flights) appear on
/// every day they cover with check-in / check-out labels.
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
            List {
                TripIntro(trip: trip)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 8, leading: 14, bottom: 4, trailing: 14))

                ForEach(Array(store.itineraryDays(for: trip).enumerated()), id: \.element.dayKey) { idx, day in
                    DayListSection(
                        index: idx,
                        date: day.date,
                        dayKey: day.dayKey,
                        bookings: day.bookings,
                        selectedBookingId: $selectedBookingId
                    )
                }

                Color.clear
                    .frame(height: 80)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
            .listStyle(.plain)
            .listRowSpacing(0)
            .environment(\.defaultMinListRowHeight, 0)
            .scrollContentBackground(.hidden)
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

/// Trip identity card — destination, title, dates — rendered as the
/// first non-list-styled row before any day section.
private struct TripIntro: View {
    let trip: Trip

    var body: some View {
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
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// One day's bookings, native-iOS-reorderable. Locked rows (from
/// inbox scans or multi-day spans) use `.moveDisabled(true)` so a
/// confirmed flight can't be dragged out of its anchor.
private struct DayListSection: View {
    let index: Int
    let date: Date
    let dayKey: String
    let bookings: [Booking]
    @Binding var selectedBookingId: Booking.ID?

    @EnvironmentObject private var store: TravelStore

    var body: some View {
        Section {
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
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 0, leading: 14, bottom: 8, trailing: 14))
            } else {
                ForEach(bookings) { b in
                    BookingCardView(
                        booking: b,
                        dayKey: dayKey,
                        unlocked: store.isUnlocked(b)
                    )
                    .background(BookingPositionReporter(id: b.id))
                    .contentShape(Rectangle())
                    .onTapGesture { selectedBookingId = b.id }
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    // Zero horizontal insets so the drag lift hugs the
                    // card edges; vertical inset is the gap between
                    // adjacent rows.
                    .listRowInsets(EdgeInsets(top: 4, leading: 14, bottom: 4, trailing: 14))
                    .moveDisabled(!store.isUnlocked(b))
                }
                .onMove { source, destination in
                    handleMove(from: source, to: destination)
                }
            }
        } header: {
            DayHeader(index: index, date: date, itemCount: bookings.count)
                .listRowInsets(EdgeInsets(top: 14, leading: 14, bottom: 6, trailing: 14))
                .listRowBackground(Color.clear)
                .textCase(nil)
        }
    }

    private func handleMove(from source: IndexSet, to destination: Int) {
        guard let sourceIdx = source.first else { return }
        let booking = bookings[sourceIdx]
        let targetIdx = destination > sourceIdx ? destination - 1 : destination
        store.reorder(booking, toIndex: targetIdx)
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
