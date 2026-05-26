import SwiftUI

/// Horizontal page-snapping carousel — one page per trip. Mirrors the
/// React shell's scroll-snap behaviour using TabView's `.page` style.
struct TripPagerView: View {
    let trips: [Trip]
    @Binding var activeIndex: Int
    @Binding var selectedBookingId: Booking.ID?

    var body: some View {
        TabView(selection: $activeIndex) {
            ForEach(Array(trips.enumerated()), id: \.element.id) { idx, trip in
                TripPageView(
                    trip: trip,
                    selectedBookingId: $selectedBookingId
                )
                .tag(idx)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .ignoresSafeArea(.container, edges: .bottom)
    }
}
