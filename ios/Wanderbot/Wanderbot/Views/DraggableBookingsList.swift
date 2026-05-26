import SwiftUI
import CoreTransferable
import UniformTypeIdentifiers
import UIKit

/// A day's bookings, reorderable via `.draggable` + `.dropDestination`.
///
/// Drop targets are the booking cards themselves (not thin rails
/// between them) plus one wider "tail" zone after the last card. A
/// yellow insertion bar appears above the currently-targeted card so
/// the user sees exactly where the dragged card will land.
///
/// Semantics:
///   - Drop on card X → insert before X (target index = X).
///   - Drop on tail zone → insert at end (target index = bookings.count).
///   - Drop on the dragged card itself → no-op.
///
/// Why .draggable and not a custom long-press gesture: iOS's drag-and-
/// drop system is touch-coordinated with `UIScrollView`'s pan
/// recogniser at the framework level. Scroll wins for any
/// finger-down + immediate motion; the drag engages only after the
/// system's long-press confirms intent. A custom
/// `LongPressGesture.sequenced(before: DragGesture)` was holding the
/// touch through its 0.5s detection window, blocking the parent
/// List's scroll.
struct DraggableBookingsList: View {
    let dayKey: String
    let bookings: [Booking]
    @Binding var selectedBookingId: Booking.ID?

    @EnvironmentObject private var store: TravelStore
    @State private var hoverIndex: Int?

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(bookings.enumerated()), id: \.element.id) { idx, booking in
                cardSlot(for: booking, at: idx)
            }
            tailDropZone
        }
        .animation(.easeOut(duration: 0.14), value: hoverIndex)
    }

    // MARK: - Per-card slot

    @ViewBuilder
    private func cardSlot(for booking: Booking, at index: Int) -> some View {
        VStack(spacing: 0) {
            // Insertion bar above the targeted card.
            InsertionBar()
                .frame(maxHeight: hoverIndex == index ? 6 : 0)
                .opacity(hoverIndex == index ? 1 : 0)
                .padding(.bottom, hoverIndex == index ? 8 : 0)

            cardView(for: booking, at: index)
                .padding(.bottom, 8)
        }
    }

    @ViewBuilder
    private func cardView(for booking: Booking, at index: Int) -> some View {
        let unlocked = store.isUnlocked(booking)
        let card = BookingCardView(
            booking: booking,
            dayKey: dayKey,
            unlocked: unlocked
        )
        .background(BookingPositionReporter(id: booking.id))
        .contentShape(RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous))
        .onTapGesture { selectedBookingId = booking.id }
        // Every card accepts drops — the whole card is the target,
        // which is a much bigger hitbox than a thin rail.
        .dropDestination(for: BookingDragPayload.self) { items, _ in
            guard let payload = items.first else { return false }
            handleDrop(targetIndex: index, payload: payload)
            return true
        } isTargeted: { targeted in
            setHover(targeted ? index : nil, atIndex: index)
        }

        if unlocked {
            card.draggable(BookingDragPayload(id: booking.id, dayKey: dayKey)) {
                // Custom lift preview — fixed width so the system
                // overlay doesn't stretch to the full screen.
                BookingCardView(booking: booking, dayKey: dayKey, unlocked: true)
                    .frame(width: 360)
                    .padding(2)
                    .shadow(color: .black.opacity(0.22), radius: 18, y: 10)
            }
        } else {
            card
        }
    }

    // MARK: - Tail drop zone

    private var tailDropZone: some View {
        let targetIndex = bookings.count
        return VStack(spacing: 0) {
            InsertionBar()
                .frame(maxHeight: hoverIndex == targetIndex ? 6 : 0)
                .opacity(hoverIndex == targetIndex ? 1 : 0)
                .padding(.bottom, hoverIndex == targetIndex ? 8 : 0)

            // 28pt clear area so dropping after the last card has
            // somewhere to land. Stays clickable / droppable but
            // invisible.
            Color.clear
                .frame(height: 28)
                .frame(maxWidth: .infinity)
                .contentShape(Rectangle())
                .dropDestination(for: BookingDragPayload.self) { items, _ in
                    guard let payload = items.first else { return false }
                    handleDrop(targetIndex: targetIndex, payload: payload)
                    return true
                } isTargeted: { targeted in
                    setHover(targeted ? targetIndex : nil, atIndex: targetIndex)
                }
        }
    }

    // MARK: - Hover + drop handling

    private func setHover(_ newValue: Int?, atIndex index: Int) {
        if let newValue {
            if hoverIndex != newValue {
                hoverIndex = newValue
                UISelectionFeedbackGenerator().selectionChanged()
            }
        } else if hoverIndex == index {
            hoverIndex = nil
        }
    }

    private func handleDrop(targetIndex: Int, payload: BookingDragPayload) {
        hoverIndex = nil
        guard payload.dayKey == dayKey else { return }
        guard let booking = bookings.first(where: { $0.id == payload.id }) else { return }
        guard let currentIndex = bookings.firstIndex(where: { $0.id == payload.id }) else { return }
        let adjusted = targetIndex > currentIndex ? targetIndex - 1 : targetIndex
        guard adjusted != currentIndex else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        store.reorder(booking, toIndex: adjusted, dayKey: dayKey)
    }
}

private struct InsertionBar: View {
    var body: some View {
        Capsule()
            .fill(Theme.brandYellow)
            .frame(height: 4)
            .padding(.horizontal, 2)
            .shadow(color: Theme.brandYellow.opacity(0.5), radius: 4)
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
