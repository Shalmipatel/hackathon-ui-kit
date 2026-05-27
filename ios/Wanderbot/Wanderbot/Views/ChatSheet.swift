import SwiftUI

/// Trip-scoped chat. Sends messages to the OpenClaw `/v1/responses`
/// gateway (same one the web app uses), streams the response back, and
/// persists every message under `/wanderbot/chat_sessions/<tripId>` so
/// the transcript is the same on every device.
struct ChatSheet: View {
    let trip: Trip?

    @EnvironmentObject private var chat: ChatStore
    @State private var draft: String = ""
    @FocusState private var inputFocused: Bool
    @Environment(\.dismiss) private var dismiss

    private var tripID: String? { trip?.id }
    private var messages: [ChatMessage] { chat.messages(for: tripID) }
    private var isSending: Bool {
        guard let id = tripID else { return false }
        return chat.isSending.contains(id)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            if messages.isEmpty {
                                EmptyChatHero(trip: trip)
                                    .padding(.top, 32)
                                    .padding(.horizontal, 16)
                            }
                            ForEach(messages) { msg in
                                ChatBubble(message: msg)
                                    .id(msg.id)
                                    .padding(.horizontal, 16)
                            }
                            Color.clear.frame(height: 12).id("bottom")
                        }
                        .padding(.vertical, 12)
                    }
                    .onChange(of: messages.count) { _, _ in scroll(proxy) }
                    .onChange(of: messages.last?.content) { _, _ in scroll(proxy) }
                    // Jump to the latest message when the sheet
                    // opens. .task fires after the first layout pass,
                    // so the bottom anchor exists by the time we
                    // scroll. The instant scroll (no animation) keeps
                    // the open feeling like "you're already at the
                    // bottom" rather than "you watched it scroll".
                    .task(id: tripID) {
                        // Wait one frame for LazyVStack to materialise
                        // any backlog of messages, then jump.
                        try? await Task.sleep(nanoseconds: 50_000_000)
                        proxy.scrollTo("bottom", anchor: .bottom)
                    }
                }

                Divider().overlay(Theme.hairline)

                ChatComposer(
                    draft: $draft,
                    focused: $inputFocused,
                    isSending: isSending,
                    enabled: tripID != nil,
                    onSend: send
                )
            }
            .background(Theme.surface)
            .navigationTitle(trip.map { "Chat · \($0.title)" } ?? "Chat")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }.tint(Theme.ink)
                }
            }
            .task(id: tripID) {
                if let id = tripID { chat.ensureSubscription(for: id) }
            }
        }
    }

    private func scroll(_ proxy: ScrollViewProxy) {
        withAnimation(.easeOut(duration: 0.18)) {
            proxy.scrollTo("bottom", anchor: .bottom)
        }
    }

    private func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let tripID else { return }
        draft = ""
        chat.send(tripID: tripID, text: text)
    }
}

private struct EmptyChatHero: View {
    let trip: Trip?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Circle().fill(Theme.brandYellow).frame(width: 32, height: 32)
                    .overlay(Image(systemName: "paperplane.fill").rotationEffect(.degrees(-12)).foregroundStyle(Theme.inkDark).font(.system(size: 14, weight: .bold)))
                Text(trip?.title ?? "Wanderbot")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.ink)
            }
            Text("Ask anything about this trip — restaurants, routes, fixes to the itinerary, or what to do tomorrow.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.inkMuted)
        }
    }
}

private struct ChatBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack(alignment: .bottom) {
            if message.role == .user { Spacer(minLength: 40) }
            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 4) {
                Text(displayText)
                    .font(.system(size: 15))
                    .foregroundStyle(message.role == .user ? .white : Theme.ink)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(message.role == .user ? Theme.inkDark : Theme.chipFill)
                    )
                    .frame(maxWidth: 320, alignment: message.role == .user ? .trailing : .leading)

                if message.role == .assistant, message.pending == true, !message.content.isEmpty {
                    Label("typing…", systemImage: "ellipsis")
                        .labelStyle(.titleOnly)
                        .font(.system(size: 10.5, weight: .medium))
                        .foregroundStyle(Theme.inkMuted)
                }
            }
            if message.role == .assistant { Spacer(minLength: 40) }
        }
    }

    private var displayText: String {
        if message.role == .assistant, message.pending == true, message.content.isEmpty {
            return "…"
        }
        // The web app prefixes the very first user message with a trip
        // context blob ("Context — my current trip:\n...\n\nMessage: ..."
        // — see TripChatPanel.tsx). Show only the user's actual text;
        // the LLM still sees the full prompt server-side.
        return Self.stripContextPrefix(message.content)
    }

    private static let contextPrefix = "Context — my current trip:"
    private static let messageMarker = "\n\nMessage: "

    private static func stripContextPrefix(_ raw: String) -> String {
        guard raw.hasPrefix(contextPrefix),
              let range = raw.range(of: messageMarker)
        else { return raw }
        return String(raw[range.upperBound...])
    }
}

private struct ChatComposer: View {
    @Binding var draft: String
    var focused: FocusState<Bool>.Binding
    let isSending: Bool
    let enabled: Bool
    let onSend: () -> Void

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextField(enabled ? "Ask Wanderbot…" : "Pick a trip first", text: $draft, axis: .vertical)
                .focused(focused)
                .lineLimit(1...5)
                .font(.system(size: 15))
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(Theme.chipFill)
                )
                .disabled(!enabled)

            Button(action: onSend) {
                Group {
                    if isSending {
                        ProgressView()
                            .tint(.white)
                            .frame(width: 40, height: 40)
                            .background(Circle().fill(Theme.inkDark))
                    } else {
                        Image(systemName: "arrow.up")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 40, height: 40)
                            .background(Circle().fill(canSend ? Theme.inkDark : Theme.ink.opacity(0.3)))
                    }
                }
            }
            .buttonStyle(.plain)
            .disabled(!canSend || isSending)
        }
        .padding(.horizontal, 12)
        .padding(.top, 10)
        .padding(.bottom, 12)
        .background(Theme.surface)
    }

    private var canSend: Bool {
        enabled && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
