import SwiftUI

/// One trip's page: sticky 200pt map header, then an itinerary that
/// scrolls underneath it. Past trips get a "Past trip" pill at the top.
struct TripPageView: View {
    let trip: Trip
    @Binding var selectedBookingId: Booking.ID?

    @EnvironmentObject private var store: TravelStore
    @State private var focusedBookingId: Booking.ID?

    private var bookings: [Booking] { store.bookings(for: trip.id) }
    private var mapFocusBookingId: Booking.ID? { selectedBookingId ?? focusedBookingId }

    var body: some View {
        ScrollViewReader { _ in
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
                        TripMapView(
                            trip: trip,
                            bookings: bookings,
                            focusedBookingId: mapFocusBookingId,
                            onMarkerTap: { id in selectedBookingId = id }
                        )
                        .frame(height: 200)
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
        }
        .background(Theme.background)
    }
}
