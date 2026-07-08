import Messages
import SwiftUI
import UIKit

/// The iMessage app extension. Renders a received Wanderbot card natively from
/// the selected message's declarative payload, and — when tapped/expanded —
/// offers to open the item in the Wanderbot app.
final class MessagesViewController: MSMessagesAppViewController {

    private var host: UIHostingController<AnyView>?

    override func willBecomeActive(with conversation: MSConversation) {
        super.willBecomeActive(with: conversation)
        render(message: conversation.selectedMessage, style: presentationStyle)
    }

    override func didSelect(_ message: MSMessage, conversation: MSConversation) {
        render(message: message, style: presentationStyle)
    }

    override func willTransition(to presentationStyle: MSMessagesAppPresentationStyle) {
        super.willTransition(to: presentationStyle)
        render(message: activeConversation?.selectedMessage, style: presentationStyle)
    }

    private func render(message: MSMessage?, style: MSMessagesAppPresentationStyle) {
        let compact = style == .compact
        let card = WanderbotCard.decode(from: message?.url)

        let rootView: AnyView
        if let card {
            rootView = AnyView(
                CardScreen(card: card, compact: compact) { [weak self] href in
                    self?.openInApp(href)
                }
            )
        } else {
            rootView = AnyView(EmptyCardView())
        }

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
        let base = "https://wanderbot-ai.vercel.app"
        let path = (href?.hasPrefix("/") == true) ? href! : "/"
        guard let url = URL(string: base + path) else { return }
        extensionContext?.open(url, completionHandler: nil)
    }
}

/// Wraps the card with an expand hint (compact) or an Open button (expanded).
private struct CardScreen: View {
    let card: WanderbotCard
    let compact: Bool
    let onOpen: (String?) -> Void

    var body: some View {
        if compact {
            WanderbotCardView(card: card, compact: true)
        } else {
            VStack(spacing: 0) {
                WanderbotCardView(card: card, compact: false)
                Button {
                    onOpen(card.href)
                } label: {
                    Text("Open in Wanderbot")
                        .font(.system(size: 16, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(CardStyle.color(card))
                        .foregroundStyle(.black)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
                Spacer(minLength: 0)
            }
        }
    }
}

private struct EmptyCardView: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "suitcase.fill").font(.system(size: 28)).foregroundStyle(.secondary)
            Text("Wanderbot").font(.system(size: 15, weight: .semibold))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
