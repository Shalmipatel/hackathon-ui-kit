import SwiftUI

/// One trip's page: pinned map (or flight card) at the top via
/// `.safeAreaInset`, and a List below for native iOS long-press
/// reorder. Each day is a List section; `.onMove` handles reorder
/// natively, with `.moveDisabled` keeping locked email-confirmed
/// bookings put.
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

                ForEach(store.itineraryDays(for: trip), id: \.dayKey) { day in
                    DayListSection(
                        date: day.date,
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
            .listRowSpacing(8)
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

/// One day's bookings, native-iOS-reorderable. Locked bookings (from
/// inbox scans) skip `.onMove` via `.moveDisabled(true)` so users
/// can't drag a confirmed flight out of position by accident.
private struct DayListSection: View {
    let date: Date
    let bookings: [Booking]
    @Binding var selectedBookingId: Booking.ID?

    @EnvironmentObject private var store: TravelStore

    var body: some View {
        Section {
            if bookings.isEmpty {
                Text("Free day")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.inkMuted)
                    .padding(.vertical, 12)
                    .padding(.horizontal, 14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                            .stroke(Theme.hairline, style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
                    )
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 14, bottom: 4, trailing: 14))
            } else {
                ForEach(bookings) { b in
                    BookingCardView(booking: b, isDraggable: store.isUnlocked(b))
                        .background(BookingPositionReporter(id: b.id))
                        .contentShape(Rectangle())
                        .onTapGesture { selectedBookingId = b.id }
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets(top: 4, leading: 14, bottom: 4, trailing: 14))
                        .moveDisabled(!store.isUnlocked(b))
                }
                .onMove { source, destination in
                    handleMove(from: source, to: destination)
                }
            }
        } header: {
            HStack(alignment: .firstTextBaseline) {
                Text(WBFormat.dayHeader(date))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                Spacer()
                if !bookings.isEmpty {
                    Text("\(bookings.count) \(bookings.count == 1 ? "item" : "items")")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.inkMuted)
                }
            }
            .padding(.horizontal, 4)
            .padding(.top, 12)
            .padding(.bottom, 4)
            .listRowInsets(EdgeInsets(top: 0, leading: 14, bottom: 0, trailing: 14))
            .listRowBackground(Color.clear)
            .textCase(nil)
        }
    }

    /// Translate List's IndexSet/destination semantics into the
    /// `(booking, targetIndex)` form the store expects. Destination
    /// indices in List's `.onMove` are post-removal, so they already
    /// account for the source being pulled out.
    private func handleMove(from source: IndexSet, to destination: Int) {
        guard let sourceIdx = source.first else { return }
        let booking = bookings[sourceIdx]
        // Convert List's post-removal index to the store's
        // pre-removal index by adjusting only when moving down.
        let targetIdx = destination > sourceIdx ? destination - 1 : destination
        store.reorder(booking, toIndex: targetIdx)
    }
}
