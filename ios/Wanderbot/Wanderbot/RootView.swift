import SwiftUI

struct RootView: View {
    @EnvironmentObject private var store: TravelStore
    @State private var activeIndex: Int = 0
    @State private var showChat = false
    @State private var showSettingsActions = false
    @State private var selectedBookingId: Booking.ID?
    @State private var openOverlay: SettingsOverlay?

    enum SettingsOverlay: Identifiable {
        case connections, settings
        var id: Int { hashValue }
    }

    private var orderedTrips: [Trip] { store.orderedTrips }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            Theme.background.ignoresSafeArea()

            VStack(spacing: 0) {
                TopBarView(
                    pageLabel: pageLabel,
                    onSettingsTap: { showSettingsActions = true }
                )

                if orderedTrips.isEmpty {
                    EmptyTripsView(state: store.syncState)
                } else {
                    TripPagerView(
                        trips: orderedTrips,
                        activeIndex: $activeIndex,
                        selectedBookingId: $selectedBookingId
                    )
                }
            }

            if !orderedTrips.isEmpty {
                ChatFab { showChat = true }
                    .padding(.trailing, 18)
                    .padding(.bottom, 20)
            }
        }
        .sheet(isPresented: $showChat) {
            ChatSheet(trip: orderedTrips.indices.contains(activeIndex) ? orderedTrips[activeIndex] : nil)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .confirmationDialog(
            "Wanderbot",
            isPresented: $showSettingsActions,
            titleVisibility: .hidden
        ) {
            Button("Connections") { openOverlay = .connections }
            Button("Settings") { openOverlay = .settings }
            Button("Sign out", role: .destructive) { /* hook up auth here */ }
            Button("Cancel", role: .cancel) {}
        }
        .fullScreenCover(item: $openOverlay) { overlay in
            NavigationStack {
                Group {
                    switch overlay {
                    case .connections: ConnectionsView()
                    case .settings: SettingsView()
                    }
                }
                .navigationTitle(overlay == .connections ? "Connections" : "Settings")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button {
                            openOverlay = nil
                        } label: {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 16, weight: .semibold))
                        }
                        .tint(Theme.ink)
                    }
                }
            }
        }
        .sheet(item: bookingBinding) { booking in
            BookingDetailSheet(booking: booking)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .onChange(of: activeIndex) { _, newValue in
            if orderedTrips.indices.contains(newValue) {
                store.activeTripId = orderedTrips[newValue].id
            }
        }
    }

    private var pageLabel: String {
        if orderedTrips.isEmpty { return "No trips" }
        return "\(min(activeIndex + 1, orderedTrips.count)) / \(orderedTrips.count)"
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
