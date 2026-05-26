import SwiftUI

struct ItineraryView: View {
    let trip: Trip
    @Binding var selectedBookingId: Booking.ID?
    @Binding var focusedBookingId: Booking.ID?

    @EnvironmentObject private var store: TravelStore

    private var days: [(dayKey: String, date: Date, bookings: [Booking])] {
        store.itineraryDays(for: trip)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            TripHeaderView(trip: trip)
            if trip.isPast { PastTripBadge() }

            if days.allSatisfy({ $0.bookings.isEmpty }) {
                EmptyItineraryHint()
            } else {
                ForEach(days, id: \.dayKey) { day in
                    DaySection(
                        date: day.date,
                        bookings: day.bookings,
                        selectedBookingId: $selectedBookingId,
                        focusedBookingId: $focusedBookingId
                    )
                }
            }
        }
    }
}

private struct TripHeaderView: View {
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
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 4)
    }
}

private struct PastTripBadge: View {
    var body: some View {
        Text("PAST TRIP")
            .font(.system(size: 10.5, weight: .bold))
            .tracking(0.08 * 10.5)
            .foregroundStyle(Theme.ink.opacity(0.65))
            .padding(.horizontal, 9)
            .padding(.vertical, 3)
            .background(Capsule().fill(Theme.chipFill))
    }
}

private struct EmptyItineraryHint: View {
    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: "calendar")
                .font(.system(size: 28))
                .foregroundStyle(Theme.inkMuted)
            Text("Nothing scheduled yet.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.inkMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }
}

private struct DaySection: View {
    let date: Date
    let bookings: [Booking]
    @Binding var selectedBookingId: Booking.ID?
    @Binding var focusedBookingId: Booking.ID?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
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

            if bookings.isEmpty {
                EmptyDayPlaceholder()
            } else {
                VStack(spacing: 10) {
                    ForEach(bookings) { b in
                        BookingCardView(booking: b)
                            .onTapGesture { selectedBookingId = b.id }
                            .onAppear { focusedBookingId = b.id }
                    }
                }
            }
        }
    }
}

private struct EmptyDayPlaceholder: View {
    var body: some View {
        Text("Free day")
            .font(.system(size: 13))
            .foregroundStyle(Theme.inkMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 16)
            .padding(.horizontal, 14)
            .background(
                RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                    .stroke(Theme.hairline, style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
            )
    }
}
