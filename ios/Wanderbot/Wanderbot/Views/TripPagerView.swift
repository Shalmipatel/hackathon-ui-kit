import SwiftUI

/// Horizontal page-snapping carousel. Page 0 is the general assistant
/// (swipe right from the first trip to reach it); pages 1…N are trips.
struct TripPagerView: View {
    let trips: [Trip]
    @Binding var activeIndex: Int
    @Binding var selectedBookingId: Booking.ID?
    let onOpenChat: () -> Void
    let onOpenVoice: () -> Void

    var body: some View {
        TabView(selection: $activeIndex) {
            GeneralAssistantPage(onOpenChat: onOpenChat, onOpenVoice: onOpenVoice)
                .tag(0)
            ForEach(Array(trips.enumerated()), id: \.element.id) { idx, trip in
                TripPageView(
                    trip: trip,
                    selectedBookingId: $selectedBookingId
                )
                .tag(idx + 1)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .ignoresSafeArea(.container, edges: .bottom)
    }
}

/// The trip-less home page: talk or type with Wanderbot without a trip in
/// context — plan something new, compare destinations, create trips.
private struct GeneralAssistantPage: View {
    let onOpenChat: () -> Void
    let onOpenVoice: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 24)

            // Brand orb
            ZStack {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [Theme.brandYellow.opacity(0.55), Theme.brandYellow.opacity(0.08)],
                            center: .center, startRadius: 6, endRadius: 120
                        )
                    )
                    .frame(width: 200, height: 200)
                Circle()
                    .fill(Theme.inkDark)
                    .frame(width: 84, height: 84)
                    .overlay(
                        Image(systemName: "paperplane.fill")
                            .rotationEffect(.degrees(-12))
                            .font(.system(size: 30, weight: .bold))
                            .foregroundStyle(Theme.brandYellow)
                    )
            }

            Text("Wanderbot")
                .font(.system(size: 26, weight: .bold))
                .foregroundStyle(Theme.ink)
                .padding(.top, 18)

            Text("Plan something new. Ask anything, anywhere —\nI can create trips and build itineraries for you.")
                .font(.system(size: 14.5))
                .foregroundStyle(Theme.inkMuted)
                .multilineTextAlignment(.center)
                .lineSpacing(3)
                .padding(.top, 6)
                .padding(.horizontal, 32)

            VStack(spacing: 12) {
                Button(action: onOpenVoice) {
                    HStack(spacing: 10) {
                        Image(systemName: "waveform")
                            .font(.system(size: 17, weight: .semibold))
                        Text("Talk to Wanderbot")
                            .font(.system(size: 16, weight: .semibold))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                    .wbGlass(in: RoundedRectangle(cornerRadius: 27, style: .continuous),
                             tint: Theme.inkDark, interactive: true)
                }
                .buttonStyle(.plain)

                Button(action: onOpenChat) {
                    HStack(spacing: 10) {
                        Image(systemName: "bubble.left")
                            .font(.system(size: 16, weight: .semibold))
                        Text("Start chatting")
                            .font(.system(size: 16, weight: .semibold))
                    }
                    .foregroundStyle(Theme.ink)
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                    .wbGlass(in: RoundedRectangle(cornerRadius: 27, style: .continuous),
                             interactive: true)
                }
                .buttonStyle(.plain)
            }
            .padding(.top, 28)
            .padding(.horizontal, 40)

            Spacer(minLength: 24)

            HStack(spacing: 5) {
                Text("Swipe left for your trips")
                Image(systemName: "chevron.right")
            }
            .font(.system(size: 12.5, weight: .medium))
            .foregroundStyle(Theme.inkSubtle)
            .padding(.bottom, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.background)
    }
}
