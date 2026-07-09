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
        if store.phase == .loaded && store.trips.isEmpty {
            NoTripsFallback()
        } else if compact {
            // TripCompactCard renders the night shell even with no trip yet
            // (payload title over the un-lerped scene) — never a gray box.
            let trip = store.trip(id: effectiveCard.resolvedTripID) ?? store.mostRelevantTrip
            TripCompactCard(
                card: effectiveCard,
                trip: trip,
                bookingCount: trip.map { store.bookings(for: $0.id).count } ?? 0
            )
        } else {
            // TripViewer owns its own loading / error / content states.
            TripViewer(store: store, card: effectiveCard, onOpen: onOpen)
        }
    }
}

private struct NoTripsFallback: View {
    var body: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle().fill(WBNight.nightDeep.color.opacity(0.08))
                    .frame(width: 72, height: 72)
                Image(systemName: "moon.stars")
                    .font(.system(size: 26))
                    .foregroundStyle(WBNight.nightMid.color)
            }
            VStack(spacing: 4) {
                Text("No trips yet")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(WB.ink)
                Text("Start planning in Wanderbot and it'll show up here.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(WB.ink.opacity(0.45))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 28)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(WB.surface))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
            .strokeBorder(WB.ink.opacity(0.08), lineWidth: 1))
        .shadow(color: WB.ink.opacity(0.07), radius: 10, y: 3)
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(WB.cream)
    }
}
