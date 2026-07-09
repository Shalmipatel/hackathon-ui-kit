#if DEBUG
import SwiftUI

/// DEBUG-only harness that renders the iMessage extension's actual views
/// (TripViewer / TripCompactCard from WanderbotMessages, shared into this
/// target) inside the main app so we can see and screenshot them in the
/// simulator without going through Messages.app + Photon delivery. Activated
/// by `WB_EXTENSION_PREVIEW=1` — bypasses sign-in entirely since TripStore
/// only hits the public /trips-data endpoint.
struct DebugExtensionPreviewView: View {
    @StateObject private var store = TripStore()
    @State private var mode: Mode = .expanded
    /// When true, passes a card with no tripId — exercises the SAME fallback
    /// TripViewer/TripCompactCard use in production when a message's payload
    /// doesn't decode (falls through to store.mostRelevantTrip).
    @State private var noCard = false

    enum Mode: String, CaseIterable { case compact = "Compact", expanded = "Expanded" }

    var body: some View {
        VStack(spacing: 0) {
            Picker("Mode", selection: $mode) {
                ForEach(Mode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal).padding(.top)
            Toggle("Simulate no-card fallback", isOn: $noCard)
                .padding(.horizontal).padding(.vertical, 8)

            if store.phase == .loaded || !store.trips.isEmpty {
                let trip = noCard ? nil : store.mostRelevantTrip
                let card = WanderbotCard(
                    type: "trip",
                    title: trip?.title ?? "Your Trips",
                    subtitle: trip.map { WBFormat.tripDateRange($0) + " · " + $0.destination },
                    lines: trip?.summary.map { [$0] },
                    accent: trip?.color,
                    href: trip.map { "/trip/\($0.id)" } ?? "/",
                    tripId: trip?.id,
                    bookingId: nil
                )
                Group {
                    switch mode {
                    case .compact:
                        TripCompactCard(
                            card: card,
                            trip: trip ?? store.mostRelevantTrip,
                            bookingCount: (trip ?? store.mostRelevantTrip).map { store.bookings(for: $0.id).count } ?? 0
                        )
                        .frame(maxHeight: .infinity, alignment: .top)
                    case .expanded:
                        TripViewer(store: store, card: card, onOpen: { href in
                            NSLog("[debugpreview] would open %@", href ?? "nil")
                        })
                    }
                }
            } else if store.phase == .failed {
                Text("Failed to load /trips-data").foregroundStyle(.red)
            } else {
                ProgressView("Loading trips…")
                    .frame(maxHeight: .infinity)
            }
        }
        .task { await store.load() }
    }
}
#endif
