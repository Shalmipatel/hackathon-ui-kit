import SwiftUI

/// Stand-in for the React TripChatPanel. Holds a local message list and
/// produces canned assistant replies — wiring up the OpenClaw transport
/// is out of scope for the SwiftUI port.
struct ChatSheet: View {
    let trip: Trip?

    @State private var messages: [ChatMessage] = []
    @State private var draft: String = ""
    @State private var thinking = false
    @FocusState private var inputFocused: Bool
    @Environment(\.dismiss) private var dismiss

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
                            if thinking {
                                TypingDots()
                                    .padding(.horizontal, 16)
                                    .id("typing")
                            }
                            Color.clear.frame(height: 12).id("bottom")
                        }
                        .padding(.vertical, 12)
                    }
                    .onChange(of: messages.count) { _, _ in
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo("bottom", anchor: .bottom)
                        }
                    }
                    .onChange(of: thinking) { _, isThinking in
                        if isThinking {
                            withAnimation(.easeOut(duration: 0.2)) {
                                proxy.scrollTo("typing", anchor: .bottom)
                            }
                        }
                    }
                }

                Divider().overlay(Theme.hairline)

                ChatComposer(
                    draft: $draft,
                    focused: $inputFocused,
                    onSend: send
                )
            }
            .background(Theme.surface)
            .navigationTitle(trip.map { "Chat · \($0.title)" } ?? "Chat")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .tint(Theme.ink)
                }
            }
        }
    }

    private func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        messages.append(ChatMessage(role: .user, text: text))
        draft = ""
        thinking = true
        Task {
            try? await Task.sleep(nanoseconds: 800_000_000)
            let reply = cannedReply(for: text, trip: trip)
            await MainActor.run {
                thinking = false
                messages.append(ChatMessage(role: .assistant, text: reply))
            }
        }
    }

    private func cannedReply(for prompt: String, trip: Trip?) -> String {
        if let trip {
            return "On \(trip.title): I'd start by mapping out \(trip.destination) — want me to suggest a day's plan?"
        }
        return "I can help once you pick a trip. Add one and I'll plan around it."
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
        HStack {
            if message.role == .user { Spacer(minLength: 40) }
            Text(message.text)
                .font(.system(size: 15))
                .foregroundStyle(message.role == .user ? .white : Theme.ink)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(message.role == .user ? Theme.inkDark : Theme.chipFill)
                )
                .frame(maxWidth: 320, alignment: message.role == .user ? .trailing : .leading)
            if message.role == .assistant { Spacer(minLength: 40) }
        }
    }
}

private struct ChatComposer: View {
    @Binding var draft: String
    var focused: FocusState<Bool>.Binding
    let onSend: () -> Void

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextField("Ask Wanderbot…", text: $draft, axis: .vertical)
                .focused(focused)
                .lineLimit(1...5)
                .font(.system(size: 15))
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(Theme.chipFill)
                )

            Button(action: onSend) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(canSend ? Theme.inkDark : Theme.ink.opacity(0.3)))
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
        }
        .padding(.horizontal, 12)
        .padding(.top, 10)
        .padding(.bottom, 12)
        .background(Theme.surface)
    }

    private var canSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

private struct TypingDots: View {
    @State private var phase: CGFloat = 0

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<3) { i in
                Circle()
                    .fill(Theme.inkMuted)
                    .frame(width: 7, height: 7)
                    .opacity(opacity(for: i))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Theme.chipFill)
        )
        .onAppear {
            withAnimation(.easeInOut(duration: 0.8).repeatForever()) {
                phase = 1
            }
        }
    }

    private func opacity(for index: Int) -> Double {
        let offset = Double(index) * 0.2
        let pulse = (Double(phase) + offset).truncatingRemainder(dividingBy: 1)
        return 0.35 + 0.65 * abs(sin(pulse * .pi))
    }
}

struct ChatMessage: Identifiable, Hashable {
    enum Role { case user, assistant }
    let id = UUID()
    let role: Role
    let text: String
}
