import SwiftUI

/// One trip's page: sticky map header, then an itinerary that scrolls
/// underneath it. The map header is either a regular trip map (when no
/// flight is focused) or a flight-tracker card (when the closest-to-top
/// booking is a flight). Past trips get a "Past trip" pill at the top.
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
    /// Distance below the sticky header at which a card is considered
    /// "in focus". 24pt of slack so the header changes a beat before
    /// the card hits the absolute top.
    private let focusLineOffset: CGFloat = 24

    var body: some View {
        GeometryReader { outer in
            ScrollView {
                LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders]) {
                    Section {
                        ItineraryView(
                            trip: trip,
                            selectedBookingId: $selectedBookingId,
                            focusedBookingId: $focusedBookingId
                        )
                        .padding(.horizontal, 14)
                        .padding(.top, 12)
                        .padding(.bottom, 96)
                    } header: {
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
                            Rectangle()
                                .fill(Theme.hairline)
                                .frame(height: 1)
                        }
                    }
                }
            }
            .scrollIndicators(.hidden)
            .onPreferenceChange(BookingPositionsKey.self) { positions in
                updateFocus(from: positions, in: outer)
            }
        }
        .background(Theme.background)
    }

    /// Pick the booking whose card center is closest to (but below) the
    /// focus line. Stops the focus from jittering when no card has
    /// reached the line yet.
    private func updateFocus(from positions: [Booking.ID: CGFloat], in outer: GeometryProxy) {
        let frame = outer.frame(in: .global)
        let focusLineY = frame.minY + mapHeight + focusLineOffset
        var bestID: Booking.ID?
        var bestDistance: CGFloat = .infinity
        for (id, y) in positions {
            // Only consider cards visible inside the page area to
            // avoid grabbing focus from off-screen items on
            // neighbouring pages (TabView keeps adjacent pages
            // measured).
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
