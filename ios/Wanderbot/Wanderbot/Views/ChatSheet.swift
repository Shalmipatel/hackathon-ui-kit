import SwiftUI

/// Trip-scoped chat (or the general assistant when `trip == nil`),
/// powered by xAI's Responses API with trip tools + web search.
struct ChatSheet: View {
    let trip: Trip?

    @EnvironmentObject private var chat: ChatStore
    @State private var draft: String = ""
    @State private var showVoiceCall = false
    @FocusState private var inputFocused: Bool
    @Environment(\.dismiss) private var dismiss

    /// nil trip → the shared "general" transcript.
    private var tripID: String { trip?.id ?? ChatStore.generalChatID }
    private var messages: [ChatMessage] { chat.messages(for: tripID) }
    private var isSending: Bool { chat.isSending.contains(tripID) }

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
                    enabled: true,
                    onSend: send
                )
            }
            .background(Theme.surface)
            .navigationTitle(trip.map { "Chat · \($0.title)" } ?? "Wanderbot")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        showVoiceCall = true
                    } label: {
                        Image(systemName: "waveform")
                    }
                    .tint(Theme.ink)
                    .accessibilityLabel("Talk to Wanderbot")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }.tint(Theme.ink)
                }
            }
            .task(id: tripID) {
                chat.ensureSubscription(for: tripID)
            }
            .fullScreenCover(isPresented: $showVoiceCall) {
                VoiceCallView(trip: trip)
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
        guard !text.isEmpty else { return }
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
            Text(trip == nil
                 ? "Ask anything — plan a brand-new trip, compare destinations, or get travel advice. I can create trips and build itineraries for you."
                 : "Ask anything about this trip — restaurants, routes, fixes to the itinerary, or what to do tomorrow.")
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
                Group {
                    if message.role == .user {
                        Text(displayText)
                    } else {
                        MarkdownContent(raw: displayText)
                    }
                }
                .font(.system(size: 15))
                .foregroundStyle(message.role == .user ? .white : Theme.ink)
                .tint(message.role == .user ? .white : .blue)
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

// MARK: - Markdown rendering

/// Renders an assistant reply's Markdown. SwiftUI's `AttributedString`
/// markdown handles inline syntax (bold/italic/code/links) but ignores
/// block-level tables — they'd show as raw pipes. So we split the text
/// into paragraph blocks (rendered inline) and GFM table blocks (laid out
/// with a `Grid`), and stitch them back together top-to-bottom.
private struct MarkdownContent: View {
    let raw: String

    var body: some View {
        let blocks = MarkdownBlock.parse(raw)
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                switch block {
                case .paragraph(let text):
                    Text(Self.inline(text))
                case .table(let table):
                    MarkdownTableView(table: table)
                case .image(let url, let alt):
                    MarkdownImageView(url: url, alt: alt)
                }
            }
        }
    }

    /// Inline-only markdown, preserving newlines. Partial-parse policy keeps
    /// streaming text legible while a `**` token is still mid-flight.
    static func inline(_ s: String) -> AttributedString {
        let options = AttributedString.MarkdownParsingOptions(
            interpretedSyntax: .inlineOnlyPreservingWhitespace,
            failurePolicy: .returnPartiallyParsedIfPossible
        )
        return (try? AttributedString(markdown: s, options: options)) ?? AttributedString(s)
    }
}

private struct MarkdownTableView: View {
    let table: MarkdownTable

    private var columnCount: Int { max(1, table.headers.count) }

    var body: some View {
        Grid(alignment: .topLeading, horizontalSpacing: 12, verticalSpacing: 6) {
            GridRow {
                ForEach(table.headers.indices, id: \.self) { c in
                    Text(MarkdownContent.inline(table.headers[c]))
                        .font(.system(size: 12.5, weight: .semibold))
                }
            }
            Divider().gridCellColumns(columnCount)
            ForEach(table.rows.indices, id: \.self) { r in
                GridRow {
                    ForEach(0..<columnCount, id: \.self) { c in
                        Text(MarkdownContent.inline(cell(row: r, col: c)))
                            .font(.system(size: 12.5))
                    }
                }
            }
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Theme.surface.opacity(0.7))
        )
    }

    private func cell(row: Int, col: Int) -> String {
        let cells = table.rows[row]
        return col < cells.count ? cells[col] : ""
    }
}

/// Async image with a loading placeholder. Failures collapse to nothing
/// (or the alt text) so a dead link doesn't leave a broken-image box.
private struct MarkdownImageView: View {
    let url: URL
    let alt: String

    var body: some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case .empty:
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 80)
            case .success(let image):
                image
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: 280, maxHeight: 280)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            case .failure:
                if !alt.isEmpty {
                    Text(alt)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.inkMuted)
                } else {
                    EmptyView()
                }
            @unknown default:
                EmptyView()
            }
        }
    }
}

private struct MarkdownTable {
    let headers: [String]
    let rows: [[String]]
}

private enum MarkdownBlock {
    case paragraph(String)
    case table(MarkdownTable)
    case image(url: URL, alt: String)

    static func parse(_ raw: String) -> [MarkdownBlock] {
        let lines = raw.components(separatedBy: "\n")
        var blocks: [MarkdownBlock] = []
        var buffer: [String] = []
        var i = 0

        func flushParagraph() {
            let text = buffer.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty { blocks.append(.paragraph(text)) }
            buffer.removeAll()
        }

        while i < lines.count {
            // A table is a row line immediately followed by a `|---|---|`
            // separator. That two-line signature avoids misreading a stray
            // pipe in prose as a table.
            if isRow(lines[i]), i + 1 < lines.count, isSeparator(lines[i + 1]) {
                flushParagraph()
                let headers = cells(lines[i])
                i += 2
                var rows: [[String]] = []
                while i < lines.count, isRow(lines[i]) {
                    rows.append(cells(lines[i]))
                    i += 1
                }
                blocks.append(.table(MarkdownTable(headers: headers, rows: rows)))
            } else if let image = imageBlock(lines[i]) {
                // An image on its own line (markdown `![alt](url)` or a bare
                // image URL) renders inline; everything else is prose.
                flushParagraph()
                blocks.append(image)
                i += 1
            } else {
                buffer.append(lines[i])
                i += 1
            }
        }
        flushParagraph()
        return blocks
    }

    /// Recognise an image-only line: markdown `![alt](url)` or a bare URL
    /// ending in a known image extension.
    private static func imageBlock(_ line: String) -> MarkdownBlock? {
        let t = line.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return nil }

        if t.hasPrefix("!["), let close = t.range(of: "]("), t.hasSuffix(")") {
            let alt = String(t[t.index(t.startIndex, offsetBy: 2)..<close.lowerBound])
            let urlStr = String(t[close.upperBound..<t.index(before: t.endIndex)])
                .trimmingCharacters(in: .whitespaces)
            if let url = URL(string: urlStr), url.scheme?.hasPrefix("http") == true {
                return .image(url: url, alt: alt)
            }
            return nil
        }

        if isImageURL(t), let url = URL(string: t) {
            return .image(url: url, alt: "")
        }
        return nil
    }

    private static func isImageURL(_ s: String) -> Bool {
        guard s.lowercased().hasPrefix("http"), !s.contains(" ") else { return false }
        let path = (URL(string: s)?.path ?? s).lowercased()
        return [".png", ".jpg", ".jpeg", ".gif", ".webp"].contains { path.hasSuffix($0) }
    }

    private static func isRow(_ line: String) -> Bool {
        line.contains("|")
    }

    private static func isSeparator(_ line: String) -> Bool {
        let t = line.trimmingCharacters(in: .whitespaces)
        guard t.contains("-"), t.contains("|") else { return false }
        return t.allSatisfy { "|-: ".contains($0) }
    }

    private static func cells(_ line: String) -> [String] {
        var t = line.trimmingCharacters(in: .whitespaces)
        if t.hasPrefix("|") { t.removeFirst() }
        if t.hasSuffix("|") { t.removeLast() }
        return t.components(separatedBy: "|").map { $0.trimmingCharacters(in: .whitespaces) }
    }
}
