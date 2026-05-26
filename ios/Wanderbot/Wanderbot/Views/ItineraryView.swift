import SwiftUI

/// Each booking card publishes its global midY through this preference
/// so the trip page can pick whichever card is closest to the focus
/// line just below the sticky map header. Same effect as the web
/// shell's IntersectionObserver-driven scroll focus.
struct BookingPositionsKey: PreferenceKey {
    static var defaultValue: [Booking.ID: CGFloat] = [:]
    static func reduce(value: inout [Booking.ID: CGFloat], nextValue: () -> [Booking.ID: CGFloat]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}

struct BookingPositionReporter: View {
    let id: Booking.ID

    var body: some View {
        GeometryReader { proxy in
            Color.clear
                .preference(
                    key: BookingPositionsKey.self,
                    value: [id: proxy.frame(in: .global).midY]
                )
        }
    }
}
