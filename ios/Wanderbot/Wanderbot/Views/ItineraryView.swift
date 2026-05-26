import SwiftUI
import CoreTransferable
import UniformTypeIdentifiers

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

    @EnvironmentObject private var store: TravelStore
    @State private var draggingId: Booking.ID?
    /// Index where the dragged card would land if dropped now. Drives
    /// the highlighted drop-indicator strip between rows.
    @State private var dropTarget: Int?

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
                VStack(spacing: 0) {
                    ForEach(Array(bookings.enumerated()), id: \.element.id) { idx, b in
                        DropZone(index: idx, target: $dropTarget, dragging: draggingId, perform: drop)
                        BookingRow(
                            booking: b,
                            draggable: store.isUnlocked(b),
                            isDragging: draggingId == b.id,
                            onTap: { selectedBookingId = b.id },
                            onDragStart: { draggingId = b.id },
                            onDragEnd: {
                                draggingId = nil
                                dropTarget = nil
                            }
                        )
                        .background(BookingPositionReporter(id: b.id))
                        .padding(.bottom, 10)
                    }
                    DropZone(index: bookings.count, target: $dropTarget, dragging: draggingId, perform: drop)
                }
            }
        }
    }

    private func drop(at index: Int) {
        guard let id = draggingId,
              let booking = bookings.first(where: { $0.id == id })
        else { return }
        // Index is the dragged-cards-included slot — translate to the
        // "neighbours only" index TravelStore.reorder expects.
        let currentIdx = bookings.firstIndex(where: { $0.id == id }) ?? 0
        let adjusted = index > currentIdx ? index - 1 : index
        store.reorder(booking, toIndex: adjusted)
        draggingId = nil
        dropTarget = nil
    }
}

/// One row in the day section. Adds the drag affordance only when the
/// booking is unlocked. The card itself is the drag preview.
private struct BookingRow: View {
    let booking: Booking
    let draggable: Bool
    let isDragging: Bool
    let onTap: () -> Void
    let onDragStart: () -> Void
    let onDragEnd: () -> Void

    var body: some View {
        let card = BookingCardView(booking: booking, isDraggable: draggable)
            .opacity(isDragging ? 0.4 : 1)
            .onTapGesture(perform: onTap)

        if draggable {
            card
                .draggable(BookingDragPayload(id: booking.id, dayKey: booking.dayKey)) {
                    BookingCardView(booking: booking, isDraggable: true)
                        .frame(maxWidth: 360)
                        .padding(8)
                        .background(
                            RoundedRectangle(cornerRadius: Theme.cardRadius + 2, style: .continuous)
                                .fill(Theme.surface)
                                .shadow(color: .black.opacity(0.18), radius: 12, y: 8)
                        )
                        .onAppear(perform: onDragStart)
                        .onDisappear(perform: onDragEnd)
                }
        } else {
            card
        }
    }
}

/// A thin invisible strip between rows that accepts drops. Highlights
/// while a card is hovering over it.
private struct DropZone: View {
    let index: Int
    @Binding var target: Int?
    let dragging: Booking.ID?
    let perform: (Int) -> Void

    var body: some View {
        Rectangle()
            .fill(.clear)
            .frame(height: target == index ? 10 : 6)
            .overlay(alignment: .center) {
                if target == index {
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(BookingType.flight.accent)
                        .frame(height: 3)
                        .padding(.horizontal, 4)
                        .transition(.opacity)
                }
            }
            .dropDestination(for: BookingDragPayload.self) { items, _ in
                guard items.first != nil else { return false }
                perform(index)
                return true
            } isTargeted: { isTargeted in
                if isTargeted {
                    target = index
                } else if target == index {
                    target = nil
                }
            }
    }
}

/// Transferable payload used for booking drags. Carrying the dayKey
/// alongside the id lets us reject cross-day drops (out of scope for
/// v1) without a round-trip through the store.
struct BookingDragPayload: Codable, Transferable {
    let id: String
    let dayKey: String

    static var transferRepresentation: some TransferRepresentation {
        CodableRepresentation(contentType: .data)
    }
}

/// Reports each card's center Y in global coordinates via a
/// preference. The trip page reads all of these and picks the card
/// closest to the focus line just below the sticky map header — that
/// becomes the map's focus target. Mirrors the web shell's
/// `onScrollFocus` behaviour without needing IntersectionObserver.
struct BookingPositionsKey: PreferenceKey {
    static var defaultValue: [Booking.ID: CGFloat] = [:]
    static func reduce(value: inout [Booking.ID: CGFloat], nextValue: () -> [Booking.ID: CGFloat]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}

private struct BookingPositionReporter: View {
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
