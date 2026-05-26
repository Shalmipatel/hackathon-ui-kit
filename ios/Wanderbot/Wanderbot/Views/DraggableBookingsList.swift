import SwiftUI
import UIKit

/// A day's bookings, reorderable via long-press drag. Replaces the
/// List `.onMove` approach because SwiftUI rejects moves that would
/// shift any `.moveDisabled` row — i.e. an unlocked item couldn't
/// pass a locked one, which violated the user's "drag around locked
/// events" requirement.
///
/// Drag feel is modelled on iOS Reminders / Files:
///   - Long-press 0.5s on an unlocked card lifts it with a noticeable
///     scale + drop shadow + medium haptic.
///   - Other cards in the day dim to make the lifted card pop.
///   - A thick brand-yellow bar shows exactly where the card will
///     land; the bar moves between rows in response to drag location.
///   - A light haptic ticks every time the target slot changes, so
///     the user feels each "slot" as they pass over it.
///   - Drop calls `store.reorder(_:toIndex:dayKey:)` which uses the
///     visible-day midpoint math, so cards land cleanly between
///     locked check-out / check-in pairs.
///
/// Locked cards have no gesture attached at all — they're inert.
struct DraggableBookingsList: View {
    let dayKey: String
    let bookings: [Booking]
    @Binding var selectedBookingId: Booking.ID?

    @EnvironmentObject private var store: TravelStore
    @State private var draggingId: Booking.ID?
    @State private var dragOffsetY: CGFloat = 0
    @State private var rowFrames: [Booking.ID: CGRect] = [:]
    @State private var dropTargetIndex: Int?

    var body: some View {
        VStack(spacing: 8) {
            ForEach(Array(bookings.enumerated()), id: \.element.id) { idx, booking in
                cardRow(for: booking, at: idx)
            }
        }
        .coordinateSpace(name: dayCoordSpace)
        .onPreferenceChange(BookingFrameKey.self) { rowFrames = $0 }
    }

    private var dayCoordSpace: String { "day-\(dayKey)" }

    @ViewBuilder
    private func cardRow(for booking: Booking, at index: Int) -> some View {
        let isDragging = draggingId == booking.id
        let unlocked = store.isUnlocked(booking)
        let someoneIsDragging = draggingId != nil
        let isOtherDimmed = someoneIsDragging && !isDragging

        ZStack(alignment: .top) {
            BookingCardView(
                booking: booking,
                dayKey: dayKey,
                unlocked: unlocked
            )
            .background(BookingPositionReporter(id: booking.id))
            .background(GeometryReader { proxy in
                Color.clear.preference(
                    key: BookingFrameKey.self,
                    value: [booking.id: proxy.frame(in: .named(dayCoordSpace))]
                )
            })
            .contentShape(RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous))
            .onTapGesture { selectedBookingId = booking.id }
            .scaleEffect(isDragging ? 1.04 : 1)
            .shadow(
                color: .black.opacity(isDragging ? 0.22 : 0),
                radius: isDragging ? 18 : 0,
                y: isDragging ? 10 : 0
            )
            .offset(y: isDragging ? dragOffsetY : 0)
            .opacity(isOtherDimmed ? 0.45 : 1)
            .zIndex(isDragging ? 10 : 0)
            .animation(
                isDragging
                    ? .interactiveSpring(response: 0.18, dampingFraction: 0.78)
                    : .spring(response: 0.32, dampingFraction: 0.82),
                value: isDragging
            )
            .animation(.easeOut(duration: 0.18), value: isOtherDimmed)
            // simultaneousGesture so the outer List's pan recogniser
            // still wins for normal swipes — finger-down + immediate
            // motion is scroll, finger-down held still for 0.5s is drag.
            .simultaneousGesture(unlocked ? dragGesture(for: booking, at: index) : nil)

            // Drop indicator ABOVE this row (insertion slot at this index).
            if dropTargetIndex == index && draggingId != nil && draggingId != booking.id {
                DropIndicator()
                    .offset(y: -7)
                    .transition(.opacity)
            }
        }
        .overlay(alignment: .bottom) {
            // Drop indicator BELOW the last row (insertion slot at count).
            if index == bookings.count - 1,
               dropTargetIndex == bookings.count,
               draggingId != nil {
                DropIndicator()
                    .offset(y: 7)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.12), value: dropTargetIndex)
    }

    private func dragGesture(for booking: Booking, at index: Int) -> some Gesture {
        // Long press first so a tap (open detail) and a quick swipe
        // (scroll) don't get treated as drags. 0.5s matches the
        // native iOS reorder threshold.
        LongPressGesture(minimumDuration: 0.5)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .named(dayCoordSpace)))
            .onChanged { value in
                switch value {
                case .second(true, let drag?):
                    if draggingId != booking.id {
                        draggingId = booking.id
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    }
                    dragOffsetY = drag.translation.height
                    let nextTarget = computeTargetIndex(
                        for: booking,
                        currentIndex: index,
                        dragLocationY: drag.location.y
                    )
                    if nextTarget != dropTargetIndex {
                        dropTargetIndex = nextTarget
                        UISelectionFeedbackGenerator().selectionChanged()
                    }
                default:
                    break
                }
            }
            .onEnded { _ in
                defer {
                    draggingId = nil
                    dragOffsetY = 0
                    dropTargetIndex = nil
                }
                guard let target = dropTargetIndex else { return }
                let adjusted = target > index ? target - 1 : target
                guard adjusted != index else { return }
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                store.reorder(booking, toIndex: adjusted, dayKey: dayKey)
            }
    }

    /// Decide where the dragged card would land, given the current
    /// drag location. Uses the cached frames of all rows in the day,
    /// excluding the dragged one. Returns an index in
    /// `[0, bookings.count]` (count == drop at end).
    private func computeTargetIndex(
        for booking: Booking,
        currentIndex: Int,
        dragLocationY: CGFloat
    ) -> Int {
        var others: [(idx: Int, midY: CGFloat)] = []
        for (i, b) in bookings.enumerated() where b.id != booking.id {
            guard let frame = rowFrames[b.id] else { continue }
            others.append((i, frame.midY))
        }
        others.sort { $0.midY < $1.midY }

        for (i, midY) in others {
            if dragLocationY < midY { return i }
        }
        return bookings.count
    }
}

private struct DropIndicator: View {
    var body: some View {
        Capsule()
            .fill(Theme.brandYellow)
            .frame(height: 4)
            .overlay(
                Capsule().strokeBorder(Theme.inkDark.opacity(0.15), lineWidth: 0.5)
            )
            .padding(.horizontal, 2)
            .shadow(color: Theme.brandYellow.opacity(0.5), radius: 4)
    }
}

/// Per-day collection of card frames, in the day's local coordinate
/// space. Used by the custom drag logic to compute drop targets.
struct BookingFrameKey: PreferenceKey {
    static var defaultValue: [Booking.ID: CGRect] = [:]
    static func reduce(value: inout [Booking.ID: CGRect], nextValue: () -> [Booking.ID: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}
