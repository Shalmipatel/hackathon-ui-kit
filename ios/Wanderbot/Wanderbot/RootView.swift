import SwiftUI

struct RootView: View {
    @EnvironmentObject private var store: TravelStore
    /// Pager index: 0 = general assistant, 1…N = trips.
    @State private var activeIndex: Int = 1
    @State private var showChat = false
    @State private var showVoice = false
    @State private var showSettings = false
    @State private var selectedBookingId: Booking.ID?

    private var orderedTrips: [Trip] { store.orderedTrips }

    /// Trip behind the current page — nil on the general page.
    private var currentTrip: Trip? {
        let tripIdx = activeIndex - 1
        return orderedTrips.indices.contains(tripIdx) ? orderedTrips[tripIdx] : nil
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            Theme.background.ignoresSafeArea()

            VStack(spacing: 0) {
                TopBarView(
                    pageLabel: pageLabel,
                    onSettingsTap: { showSettings = true }
                )

                if orderedTrips.isEmpty && store.syncState == .loading {
                    EmptyTripsView(state: store.syncState)
                } else {
                    TripPagerView(
                        trips: orderedTrips,
                        activeIndex: $activeIndex,
                        selectedBookingId: $selectedBookingId,
                        onOpenChat: { showChat = true },
                        onOpenVoice: { showVoice = true }
                    )
                }
            }

            if activeIndex > 0 {
                ChatFab { showChat = true }
                    .padding(.trailing, 18)
                    .padding(.bottom, 20)
            }
        }
        .sheet(isPresented: $showChat) {
            ChatSheet(trip: currentTrip)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .fullScreenCover(isPresented: $showVoice) {
            VoiceCallView(trip: currentTrip)
        }
        .sheet(isPresented: $showSettings) {
            SettingsSheet(onSelectTrip: jumpToTrip)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .sheet(item: bookingBinding) { booking in
            BookingDetailSheet(initialBooking: booking)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .onChange(of: activeIndex) { _, _ in
            if let trip = currentTrip {
                store.activeTripId = trip.id
            }
        }
        .onAppear {
            if orderedTrips.isEmpty { activeIndex = 0 }
        }
        // Trips load async — when the first snapshot lands, hop from the
        // general page to the first trip so trips stay the default view.
        .onChange(of: orderedTrips.count) { old, new in
            if old == 0, new > 0, activeIndex == 0 {
                activeIndex = 1
            }
        }
    }

    private func jumpToTrip(_ id: Trip.ID) {
        if let idx = orderedTrips.firstIndex(where: { $0.id == id }) {
            activeIndex = idx + 1
        }
    }

    private var pageLabel: String {
        if activeIndex == 0 || orderedTrips.isEmpty { return "Assistant" }
        return "\(min(activeIndex, orderedTrips.count)) / \(orderedTrips.count)"
    }

    private var bookingBinding: Binding<Booking?> {
        Binding(
            get: { store.bookings.first(where: { $0.id == selectedBookingId }) },
            set: { newValue in selectedBookingId = newValue?.id }
        )
    }
}

private struct EmptyTripsView: View {
    let state: TravelStore.SyncState

    var body: some View {
        VStack(spacing: 10) {
            if state == .loading {
                ProgressView()
                    .tint(Theme.inkMuted)
                Text("Loading trips…")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.inkMuted)
            } else {
                Text("No trips yet")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                Text("Connect Gmail and ask the assistant to scan your inbox — your trips will appear here.")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.inkMuted)
                    .multilineTextAlignment(.center)
                    .lineSpacing(3)
                    .frame(maxWidth: 280)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(32)
    }
}

private struct ChatFab: View {
    let action: () -> Void
    @State private var pressed = false

    var body: some View {
        Button(action: action) {
            Image(systemName: "bubble.left.fill")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(
                    Circle().fill(Theme.inkDark)
                )
                .shadow(color: .black.opacity(0.18), radius: 12, y: 8)
                .scaleEffect(pressed ? 0.94 : 1)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open chat")
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in pressed = true }
                .onEnded { _ in pressed = false }
        )
    }
}

#Preview {
    RootView().environmentObject(TravelStore.sampleStore())
}
