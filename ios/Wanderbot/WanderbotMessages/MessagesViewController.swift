import Messages
import SwiftUI
import UIKit

/// The iMessage app extension. The compact form is a polished trip bubble in
/// the transcript; expanding it opens a full, live trip browser — Overview,
/// day-by-day Itinerary, Map, and Budget — reading current data from the app's
/// public endpoint. Tapping "Open in Wanderbot" deep-links into the app.
final class MessagesViewController: MSMessagesAppViewController {

    private var host: UIHostingController<AnyView>?
    private let store = TripStore()

    override func willBecomeActive(with conversation: MSConversation) {
        super.willBecomeActive(with: conversation)
        render(message: conversation.selectedMessage, style: presentationStyle)
        loadIfNeeded()
    }

    override func didSelect(_ message: MSMessage, conversation: MSConversation) {
        render(message: message, style: presentationStyle)
        loadIfNeeded()
    }

    override func willTransition(to presentationStyle: MSMessagesAppPresentationStyle) {
        super.willTransition(to: presentationStyle)
        render(message: activeConversation?.selectedMessage, style: presentationStyle)
    }

    /// Warm the store so the compact bubble can show live stats and expanding
    /// is instant. TripViewer also self-loads, so this is best-effort.
    private func loadIfNeeded() {
        Task { if store.phase == .idle { await store.load() } }
    }

    private func render(message: MSMessage?, style: MSMessagesAppPresentationStyle) {
        let compact = style == .compact
        let card = WanderbotCard.decode(from: message?.url)

        let rootView = AnyView(
            ExtensionRootView(store: store, card: card, compact: compact) { [weak self] href in
                self?.openInApp(href)
            }
        )

        if let host {
            host.rootView = rootView
        } else {
            let controller = UIHostingController(rootView: rootView)
            controller.view.backgroundColor = .clear
            addChild(controller)
            controller.view.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(controller.view)
            NSLayoutConstraint.activate([
                controller.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                controller.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                controller.view.topAnchor.constraint(equalTo: view.topAnchor),
                controller.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            ])
            controller.didMove(toParent: self)
            host = controller
        }
    }

    /// Bounce the user into the Wanderbot app at the card's path.
    private func openInApp(_ href: String?) {
        // Request the expanded presentation first so the tap feels responsive,
        // then hand off to the app.
        let base = "https://wanderbot-ai.vercel.app"
        let path = (href?.hasPrefix("/") == true) ? href! : "/"
        guard let url = URL(string: base + path) else { return }
        extensionContext?.open(url, completionHandler: nil)
    }
}

/// Root switch between the compact bubble and the expanded viewer. Observes the
/// store so the compact card enriches (countdown, plan count) once data loads.
///
/// Always resolves to a live trip view — never a static "nothing here" state.
/// If the tapped message's payload doesn't decode (a bad/legacy URL, or the
/// card's `p=` param not surviving delivery), we fall back to the traveler's
/// current/next trip pulled live from TripStore, so the extension is a real
/// trip browser on every open rather than depending on one message's payload.
private struct ExtensionRootView: View {
    @ObservedObject var store: TripStore
    let card: WanderbotCard?
    let compact: Bool
    let onOpen: (String?) -> Void

    /// The card to render — the decoded one if present, else a synthetic
    /// pointer at nothing in particular (TripViewer/TripCompactCard fall back
    /// to `store.trips.first` — see TripStore.mostRelevantTrip ordering).
    private var effectiveCard: WanderbotCard {
        card ?? WanderbotCard(type: "trip", title: "Your Trips", subtitle: nil,
                               lines: nil, accent: nil, href: "/", tripId: nil, bookingId: nil)
    }

    var body: some View {
        switch store.phase {
        case .idle, .loading:
            if store.trips.isEmpty {
                LoadingFallback()
            } else {
                content
            }
        case .failed where store.trips.isEmpty:
            RetryFallback(store: store)
        case .loaded where store.trips.isEmpty:
            NoTripsFallback()
        default:
            content
        }
    }

    @ViewBuilder private var content: some View {
        if compact {
            let trip = store.trip(id: effectiveCard.resolvedTripID) ?? store.mostRelevantTrip
            TripCompactCard(
                card: effectiveCard,
                trip: trip,
                bookingCount: trip.map { store.bookings(for: $0.id).count } ?? 0
            )
        } else {
            TripViewer(store: store, card: effectiveCard, onOpen: onOpen)
        }
    }
}

private struct LoadingFallback: View {
    var body: some View {
        VStack(spacing: 10) {
            ProgressView().controlSize(.large)
            Text("Loading your trips…").font(.system(size: 13)).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct RetryFallback: View {
    @ObservedObject var store: TripStore
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "wifi.exclamationmark").font(.system(size: 26)).foregroundStyle(.secondary)
            Text("Couldn't load your trips").font(.system(size: 14, weight: .semibold))
            Button("Retry") { Task { await store.load() } }.buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct NoTripsFallback: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "suitcase.fill").font(.system(size: 28)).foregroundStyle(.secondary)
            Text("No trips yet").font(.system(size: 15, weight: .semibold))
            Text("Start planning in Wanderbot and it'll show up here.")
                .font(.system(size: 12)).foregroundStyle(.tertiary).multilineTextAlignment(.center)
                .padding(.horizontal, 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
