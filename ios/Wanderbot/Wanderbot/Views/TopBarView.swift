import SwiftUI

struct TopBarView: View {
    let pageLabel: String
    let onSettingsTap: () -> Void

    var body: some View {
        ZStack {
            // Absolute-centered counter — independent of brand / button
            // widths so it stays in the middle regardless of how long
            // the brand label or counter text gets.
            Text(pageLabel)
                .font(.system(size: 11.5, weight: .medium))
                .monospacedDigit()
                .foregroundStyle(Theme.inkSubtle)

            HStack {
                HStack(spacing: 8) {
                    ZStack {
                        Circle()
                            .fill(Theme.brandYellow)
                            .frame(width: 28, height: 28)
                        Image(systemName: "paperplane.fill")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(Theme.inkDark)
                            .rotationEffect(.degrees(-12))
                    }
                    Text("Wanderbot")
                        .font(.wbBrand)
                        .foregroundStyle(Theme.ink)
                        .tracking(-0.3)
                }

                Spacer()

                Button(action: onSettingsTap) {
                    Image(systemName: "gearshape")
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(Theme.chipFill))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Settings")
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .background(Theme.background)
    }
}

#Preview {
    VStack(spacing: 0) {
        TopBarView(pageLabel: "1 / 4", onSettingsTap: {})
        Spacer()
    }
    .background(Theme.background)
}
