import SwiftUI
import CoreTransferable
import UniformTypeIdentifiers

/// A day's bookings, reorderable via `.draggable` + `.dropDestination`.
///
/// Why these APIs and not a custom long-press gesture: the iOS
/// drag-and-drop system natively coordinates with `UIScrollView`'s
/// pan recogniser. The scroll view always wins for finger-down +
/// immediate motion, and the drag only engages after the system's
/// long-press is satisfied. A custom `LongPressGesture` attached via
/// `.gesture` / `.simultaneousGesture` was holding the touch and
/// preventing the parent List from scrolling.
///
/// Drag semantics:
///   - Unlocked card → `.draggable` payload + custom lifted-card preview.
///     Locked cards have no `.draggable`, so they're inert (no lift).
///   - Between every two cards (and above the first / below the last)
///     a thin "rail" view is a `.dropDestination` that calls
///     `store.reorder(_:toIndex:dayKey:)`. The targeted rail expands
///     and highlights so the user can see exactly where the card will
///     land — including in the gap between two locked items.
struct DraggableBookingsList: View {
    let dayKey: String
    let bookings: [Booking]
    @Binding var selectedBookingId: Booking.ID?

    @EnvironmentObject private var store: TravelStore
    @State private var hoverIndex: Int?

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(bookings.enumerated()), id: \.element.id) { idx, booking in
                DropRail(index: idx, hoverIndex: $hoverIndex, onDrop: handleDrop)
                row(for: booking, index: idx)
            }
            DropRail(index: bookings.count, hoverIndex: $hoverIndex, onDrop: handleDrop)
        }
    }

    @ViewBuilder
    private func row(for booking: Booking, index: Int) -> some View {
        let unlocked = store.isUnlocked(booking)
        let card = BookingCardView(
            booking: booking,
            dayKey: dayKey,
            unlocked: unlocked
        )
        .background(BookingPositionReporter(id: booking.id))
        .contentShape(RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous))
        .onTapGesture { selectedBookingId = booking.id }

        if unlocked {
            card.draggable(BookingDragPayload(id: booking.id, dayKey: dayKey)) {
                // Custom lift preview — rounded card with deeper
                // shadow, mirrors the cell's visual but at slightly
                // higher elevation so it reads as "picked up".
                BookingCardView(booking: booking, dayKey: dayKey, unlocked: true)
                    .frame(maxWidth: 360)
                    .padding(2)
                    .shadow(color: .black.opacity(0.22), radius: 18, y: 10)
            }
        } else {
            card
        }
    }

    private func handleDrop(targetIndex: Int, payload: BookingDragPayload) {
        guard payload.dayKey == dayKey else { return }
        guard let booking = bookings.first(where: { $0.id == payload.id }) else { return }
        guard let currentIndex = bookings.firstIndex(where: { $0.id == payload.id }) else { return }
        let adjusted = targetIndex > currentIndex ? targetIndex - 1 : targetIndex
        guard adjusted != currentIndex else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        store.reorder(booking, toIndex: adjusted, dayKey: dayKey)
    }
}

/// Inter-card drop slot. Tiny by default (8pt vertical spacer) so it
/// doesn't change the visual rhythm, but expands + glows brand-yellow
/// when a drag is hovering over it.
private struct DropRail: View {
    let index: Int
    @Binding var hoverIndex: Int?
    let onDrop: (_ targetIndex: Int, _ payload: BookingDragPayload) -> Void

    private var isHovered: Bool { hoverIndex == index }

    var body: some View {
        ZStack {
            // Capsule indicator that fades in while targeted.
            Capsule()
                .fill(Theme.brandYellow)
                .frame(height: 4)
                .padding(.horizontal, 2)
                .shadow(color: Theme.brandYellow.opacity(0.5), radius: 4)
                .opacity(isHovered ? 1 : 0)
        }
        .frame(height: isHovered ? 14 : 8)
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .dropDestination(for: BookingDragPayload.self) { items, _ in
            guard let payload = items.first else { return false }
            onDrop(index, payload)
            return true
        } isTargeted: { targeted in
            if targeted {
                hoverIndex = index
                UISelectionFeedbackGenerator().selectionChanged()
            } else if hoverIndex == index {
                hoverIndex = nil
            }
        }
        .animation(.easeOut(duration: 0.15), value: isHovered)
    }
}

/// Transferable payload carrying just the booking id and its day.
/// Day is included so we can reject cross-day drops in `handleDrop`
/// without a store round-trip.
struct BookingDragPayload: Codable, Transferable {
    let id: String
    let dayKey: String

    static var transferRepresentation: some TransferRepresentation {
        CodableRepresentation(contentType: .data)
    }
}
