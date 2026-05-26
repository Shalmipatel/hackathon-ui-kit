import SwiftUI

/// A day's bookings, reorderable via long-press drag. Replaces the
/// List `.onMove` approach because SwiftUI rejects moves that would
/// shift any `.moveDisabled` row — i.e. an unlocked item couldn't
/// pass a locked one, which violated the user's "drag around locked
/// events" requirement.
///
/// How drag works here:
///   - Long-press 0.3s on an unlocked card → starts drag.
///   - The dragged card lifts (scale + shadow) and follows the finger.
///   - Other cards stay put — including locked ones, which is the point.
///   - Drop position is computed from the drag's vertical center
///     against the other cards' frames, giving a target index that
///     can be anywhere (including positions adjacent to locked items).
///   - Release calls store.reorder, which picks a midpoint position
///     between the two neighbours in time order.
///
/// Locked cards are inert — no long-press response, no lift.
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
            .scaleEffect(isDragging ? 1.03 : 1)
            .shadow(color: .black.opacity(isDragging ? 0.18 : 0), radius: isDragging ? 14 : 0, y: isDragging ? 8 : 0)
            .offset(y: isDragging ? dragOffsetY : 0)
            .zIndex(isDragging ? 1 : 0)
            .opacity(isDragging ? 0.96 : 1)
            .animation(.interactiveSpring(response: 0.25, dampingFraction: 0.85), value: isDragging)
            .gesture(unlocked ? dragGesture(for: booking, at: index) : nil)

            if dropTargetIndex == index && draggingId != nil && draggingId != booking.id {
                DropIndicator()
                    .offset(y: -5)
            }
        }
        .overlay(alignment: .bottom) {
            if dropTargetIndex == index + 1 && draggingId != nil && draggingId != booking.id {
                DropIndicator()
                    .offset(y: 5)
            }
        }
    }

    private func dragGesture(for booking: Booking, at index: Int) -> some Gesture {
        // Long press first so a tap (open detail) doesn't get treated as
        // a zero-distance drag. 0.3s feels close to the native iOS
        // reorder threshold.
        LongPressGesture(minimumDuration: 0.3)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .named(dayCoordSpace)))
            .updating($dragHaptic) { value, state, _ in
                if case .second(true, .some(_)) = value, state == false {
                    state = true
                    triggerHaptic()
                }
            }
            .onChanged { value in
                switch value {
                case .second(true, let drag?):
                    draggingId = booking.id
                    dragOffsetY = drag.translation.height
                    dropTargetIndex = computeTargetIndex(
                        for: booking,
                        currentIndex: index,
                        dragLocationY: drag.location.y
                    )
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
                // The reorder API expects a "without the dragged card"
                // index. Adjust when moving down so the slot lands
                // where the user dropped it.
                let adjusted = target > index ? target - 1 : target
                guard adjusted != index else { return }
                store.reorder(booking, toIndex: adjusted)
            }
    }

    /// Decide where the dragged card would land, given the current
    /// drag location. Uses the cached frames of all rows in the day.
    /// Returns an index in `[0, bookings.count]` (count == drop at end).
    private func computeTargetIndex(
        for booking: Booking,
        currentIndex: Int,
        dragLocationY: CGFloat
    ) -> Int {
        // Build (index, midY) for every booking in the same day,
        // skipping the one being dragged.
        var others: [(idx: Int, midY: CGFloat)] = []
        for (i, b) in bookings.enumerated() where b.id != booking.id {
            guard let frame = rowFrames[b.id] else { continue }
            others.append((i, frame.midY))
        }
        others.sort { $0.midY < $1.midY }

        // First "other" row whose centre is below the drag → that
        // index is where we insert.
        for (i, midY) in others {
            if dragLocationY < midY { return i }
        }
        return bookings.count
    }

    // SwiftUI-compatible haptic shim. Triggered on drag start.
    @GestureState private var dragHaptic: Bool = false
    private func triggerHaptic() {
        let gen = UIImpactFeedbackGenerator(style: .medium)
        gen.impactOccurred()
    }
}

private struct DropIndicator: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 2, style: .continuous)
            .fill(BookingType.flight.accent)
            .frame(height: 3)
            .padding(.horizontal, 2)
            .transition(.opacity)
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
