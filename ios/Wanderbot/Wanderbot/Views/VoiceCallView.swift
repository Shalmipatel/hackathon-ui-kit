import SwiftUI

/// Full-screen voice conversation with the trip assistant. Owns a
/// `VoiceStore`, starts the session on appear, and tears it down on exit.
///
/// The UX is "immersive voice" (ChatGPT-voice style) rather than a phone
/// call: a single fluid orb is the focal point, the backdrop is calm, and
/// the transcript is tucked away behind a toggle so the default state is
/// just you and the orb. Controls are minimal and neutral.
struct VoiceCallView: View {
    let trip: Trip

    @EnvironmentObject private var store: TravelStore
    @Environment(\.dismiss) private var dismiss
    @StateObject private var voice = VoiceStore()
    @State private var showTranscript = false
    @State private var showImageViewer = false
    @State private var viewerStartIndex = 0

    private var hasImages: Bool { !voice.images.isEmpty }

    var body: some View {
        ZStack {
            backdrop

            VStack(spacing: 0) {
                header

                Spacer(minLength: 0)

                // Orb is the hero while listening; it shrinks to make room
                // for image results so the visuals can take centre stage.
                VoiceOrb(meter: voice.levelMeter, speaking: voice.isAssistantSpeaking)
                    .scaleEffect(hasImages ? 0.5 : 1.0)
                    .frame(width: hasImages ? 150 : 300, height: hasImages ? 150 : 300)

                if hasImages {
                    VoiceImagePanel(
                        images: voice.images,
                        onDismiss: { voice.clearImages() },
                        onSelect: { i in viewerStartIndex = i; showImageViewer = true }
                    )
                    .padding(.top, 16)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                statusLabel
                    .padding(.top, hasImages ? 14 : 28)
                    .frame(minHeight: 28)

                if !showTranscript, !hasImages, let caption = latestAssistantText {
                    Text(caption)
                        .font(.system(size: 16, weight: .regular))
                        .foregroundStyle(Theme.ink.opacity(0.7))
                        .multilineTextAlignment(.center)
                        .lineLimit(3)
                        .padding(.horizontal, 8)
                        .padding(.top, 14)
                        .frame(maxWidth: 360)
                        .transition(.opacity)
                }

                Spacer(minLength: 0)

                if showTranscript {
                    transcriptPanel
                        .frame(maxHeight: 280)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                controls
                    .padding(.top, 20)
                    .padding(.bottom, 28)
            }
            .padding(.horizontal, 24)
            .animation(.easeInOut(duration: 0.25), value: latestAssistantText != nil)
            .animation(.spring(response: 0.42, dampingFraction: 0.86), value: voice.images)
        }
        .task {
            voice.start(trip: trip, bookings: store.bookings(for: trip.id))
        }
        .onDisappear { voice.stop() }
        .fullScreenCover(isPresented: $showImageViewer) {
            VoiceImageViewer(images: voice.images, startIndex: viewerStartIndex)
        }
    }

    /// Calm radial wash behind the orb — gives the cream background depth
    /// and makes the orb feel like it's glowing out of the screen.
    private var backdrop: some View {
        ZStack {
            Theme.background
            RadialGradient(
                colors: [Theme.brandYellow.opacity(0.16), Theme.background.opacity(0)],
                center: .center,
                startRadius: 2,
                endRadius: 360
            )
        }
        .ignoresSafeArea()
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Wanderbot")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.inkMuted)
                Text(trip.title)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.ink)
            }
            Spacer()
        }
        .padding(.top, 12)
    }

    /// Most recent non-empty assistant line — shown softly under the orb
    /// as a live caption when the full transcript is collapsed.
    private var latestAssistantText: String? {
        voice.transcript.last { $0.role == .assistant && !$0.text.isEmpty }?.text
    }

    @ViewBuilder
    private var statusLabel: some View {
        switch voice.state {
        case .connecting:
            Text("Connecting…")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.inkMuted)
        case .connected:
            if let activity = voice.toolActivity {
                Label(activity, systemImage: "gearshape.2")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.inkMuted)
            } else if voice.isAssistantSpeaking {
                Text("Speaking")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.inkMuted)
            } else {
                Text(voice.isMuted ? "Muted" : "Listening")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.inkMuted)
            }
        case .error(let message):
            Text(message)
                .font(.system(size: 13))
                .foregroundStyle(Theme.destructive)
                .multilineTextAlignment(.center)
        case .idle:
            EmptyView()
        }
    }

    private var transcriptPanel: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    ForEach(voice.transcript) { line in
                        HStack {
                            if line.role == .user { Spacer(minLength: 40) }
                            Text(line.text)
                                .font(.system(size: 14))
                                .foregroundStyle(line.role == .user ? .white : Theme.ink)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .fill(line.role == .user ? Theme.inkDark : Theme.chipFill)
                                )
                            if line.role == .assistant { Spacer(minLength: 40) }
                        }
                        .id(line.id)
                    }
                    Color.clear.frame(height: 1).id("voiceBottom")
                }
                .padding(.vertical, 4)
            }
            .onChange(of: voice.transcript) { _, _ in
                withAnimation(.easeOut(duration: 0.15)) {
                    proxy.scrollTo("voiceBottom", anchor: .bottom)
                }
            }
        }
    }

    private var controls: some View {
        HStack(spacing: 22) {
            // Mute
            Button {
                voice.isMuted.toggle()
            } label: {
                controlIcon(
                    systemName: voice.isMuted ? "mic.slash.fill" : "mic.fill",
                    background: Theme.chipFill,
                    foreground: Theme.ink
                )
            }
            .buttonStyle(.plain)
            .accessibilityLabel(voice.isMuted ? "Unmute" : "Mute")

            // Transcript toggle
            Button {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                    showTranscript.toggle()
                }
            } label: {
                controlIcon(
                    systemName: showTranscript ? "text.bubble.fill" : "text.bubble",
                    background: Theme.chipFill,
                    foreground: Theme.ink
                )
            }
            .buttonStyle(.plain)
            .accessibilityLabel(showTranscript ? "Hide transcript" : "Show transcript")

            // End — neutral close, not a red hang-up.
            Button {
                voice.stop()
                dismiss()
            } label: {
                controlIcon(
                    systemName: "xmark",
                    background: Theme.inkDark,
                    foreground: .white
                )
            }
            .buttonStyle(.plain)
            .accessibilityLabel("End voice chat")
        }
    }

    private func controlIcon(systemName: String, background: Color, foreground: Color) -> some View {
        Image(systemName: systemName)
            .font(.system(size: 21, weight: .semibold))
            .foregroundStyle(foreground)
            .frame(width: 60, height: 60)
            .background(Circle().fill(background))
    }
}

/// Fluid, continuously-breathing orb. Unlike a meter-only ring, it has
/// life even in silence (a slow sine "breath"), reacts to mic level while
/// listening, and animates more energetically while the assistant speaks.
/// Layered radial gradients give it soft depth and a glow.
private struct VoiceOrb: View {
    let meter: AudioLevelMeter
    let speaking: Bool

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60.0)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            let level = currentLevel()

            // Continuous breath — faster and deeper while speaking.
            let breatheSpeed = speaking ? 2.4 : 1.05
            let breatheDepth = speaking ? 0.075 : 0.04
            let breathe = sin(t * breatheSpeed) * breatheDepth

            // Audio-reactive bloom. Listening reacts to your mic; while the
            // assistant speaks we lean on the breath instead of the (now
            // echo-cancelled, low) mic level.
            let reactive = CGFloat(level) * (speaking ? 0.25 : 0.55)
            let scale = 1.0 + CGFloat(breathe) + reactive

            ZStack {
                // Outer glow halo
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [Theme.brandYellow.opacity(0.40), Theme.brandYellow.opacity(0.0)],
                            center: .center, startRadius: 8, endRadius: 150
                        )
                    )
                    .frame(width: 300, height: 300)
                    .scaleEffect(scale)
                    .blur(radius: 6)

                // Soft body
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [
                                Theme.brandYellow.opacity(0.95),
                                Theme.brandYellow.opacity(0.55),
                                Theme.brandYellow.opacity(0.20),
                            ],
                            center: .init(x: 0.42, y: 0.40),
                            startRadius: 2, endRadius: 130
                        )
                    )
                    .frame(width: 210, height: 210)
                    .scaleEffect(scale)

                // Dark core with state glyph
                Circle()
                    .fill(Theme.inkDark)
                    .frame(width: 92, height: 92)
                    .scaleEffect(1 + CGFloat(breathe) * 0.6)
                    .overlay(
                        Image(systemName: speaking ? "waveform" : "mic.fill")
                            .font(.system(size: 28, weight: .semibold))
                            .foregroundStyle(.white)
                    )
            }
        }
    }

    private func currentLevel() -> Float {
        let samples = meter.samples
        guard !samples.isEmpty else { return 0 }
        let recent = samples.suffix(5).max() ?? 0
        return min(1, recent * 6)
    }
}

/// Image results from the assistant, shown beneath the (shrunken) orb.
/// One image fills a card; several become a swipeable carousel with dots.
/// Tapping opens the fullscreen viewer; the corner button dismisses the set.
private struct VoiceImagePanel: View {
    let images: [URL]
    let onDismiss: () -> Void
    let onSelect: (Int) -> Void

    @State private var index = 0
    private let cardHeight: CGFloat = 240

    var body: some View {
        VStack(spacing: 8) {
            ZStack(alignment: .topTrailing) {
                Group {
                    if images.count == 1 {
                        card(images[0], at: 0)
                    } else {
                        TabView(selection: $index) {
                            ForEach(images.indices, id: \.self) { i in
                                card(images[i], at: i).tag(i)
                            }
                        }
                        .tabViewStyle(.page(indexDisplayMode: .never))
                    }
                }
                .frame(height: cardHeight)

                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(8)
                        .background(Circle().fill(.black.opacity(0.45)))
                }
                .buttonStyle(.plain)
                .padding(10)
                .accessibilityLabel("Dismiss images")
            }

            if images.count > 1 {
                HStack(spacing: 6) {
                    ForEach(images.indices, id: \.self) { i in
                        Circle()
                            .fill(i == index ? Theme.ink : Theme.ink.opacity(0.22))
                            .frame(width: 6, height: 6)
                    }
                }
            }
        }
        .frame(maxWidth: 360)
    }

    private func card(_ url: URL, at i: Int) -> some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case .empty:
                ZStack {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(Theme.chipFill)
                    ProgressView()
                }
            case .success(let image):
                image.resizable().scaledToFill()
            case .failure:
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Theme.chipFill)
                    .overlay(Image(systemName: "photo").foregroundStyle(Theme.inkMuted))
            @unknown default:
                Color.clear
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: cardHeight)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .contentShape(Rectangle())
        .onTapGesture { onSelect(i) }
    }
}

/// Fullscreen, swipeable image viewer over a dark backdrop.
private struct VoiceImageViewer: View {
    let images: [URL]
    @State var startIndex: Int
    @Environment(\.dismiss) private var dismiss

    init(images: [URL], startIndex: Int) {
        self.images = images
        self._startIndex = State(initialValue: startIndex)
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()

            TabView(selection: $startIndex) {
                ForEach(images.indices, id: \.self) { i in
                    AsyncImage(url: images[i]) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().scaledToFit()
                        case .failure:
                            Image(systemName: "photo").font(.largeTitle).foregroundStyle(.white.opacity(0.6))
                        default:
                            ProgressView().tint(.white)
                        }
                    }
                    .tag(i)
                }
            }
            .tabViewStyle(.page)
            .ignoresSafeArea()

            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(12)
                    .background(Circle().fill(.white.opacity(0.18)))
            }
            .buttonStyle(.plain)
            .padding(20)
            .accessibilityLabel("Close")
        }
    }
}
