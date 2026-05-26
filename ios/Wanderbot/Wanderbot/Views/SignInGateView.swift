import SwiftUI

/// Sign-in gate. Shown by `WanderbotApp` when `AuthStore.isSignedIn`
/// is false. Auto-opens the web sign-in bridge on appear — the user
/// sees the brand mark briefly while ASWebAuthenticationSession is
/// presenting, then the web bridge's provider chooser takes over. If
/// they dismiss without signing in, we surface a single "Sign in"
/// retry button so they can re-trigger the flow without restarting
/// the app.
struct SignInGateView: View {
    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer(minLength: 0)
                Hero()
                Spacer(minLength: 0)

                VStack(spacing: 12) {
                    ProviderButton(
                        provider: .apple,
                        icon: "apple.logo",
                        tint: Theme.inkDark,
                        title: "Continue with Apple"
                    )
                    ProviderButton(
                        provider: .google,
                        icon: "g.circle.fill",
                        tint: Color(red: 0.26, green: 0.52, blue: 0.96),
                        title: "Continue with Google"
                    )
                    if let err = auth.lastError {
                        Text(err)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.destructive)
                            .multilineTextAlignment(.center)
                            .padding(.top, 4)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 24)

                Text("By continuing you agree to share your name and email\nso Wanderbot can sync trips across devices.")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.inkMuted)
                    .multilineTextAlignment(.center)
                    .padding(.bottom, 32)
            }
        }
    }
}

private struct ProviderButton: View {
    let provider: AuthStore.Provider
    let icon: String
    let tint: Color
    let title: String

    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        Button {
            Task { await auth.signIn(with: provider) }
        } label: {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(tint)
                    Image(systemName: icon)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                }
                .frame(width: 28, height: 28)

                Text(title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.ink)

                Spacer()

                if auth.isSigningIn {
                    ProgressView().tint(Theme.inkMuted)
                }
            }
            .padding(.vertical, 14)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Theme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(Theme.hairline, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(auth.isSigningIn)
    }
}

private struct Hero: View {
    var body: some View {
        VStack(spacing: 18) {
            ZStack {
                Circle()
                    .fill(Theme.brandYellow)
                    .frame(width: 96, height: 96)
                    .shadow(color: Theme.brandYellow.opacity(0.45), radius: 24, y: 12)
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 40, weight: .bold))
                    .foregroundStyle(Theme.inkDark)
                    .rotationEffect(.degrees(-12))
            }

            VStack(spacing: 8) {
                Text("Wanderbot")
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(Theme.ink)
                    .tracking(-0.6)
                Text("Sign in to see your trips,\nchat history, and itineraries.")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.inkMuted)
                    .multilineTextAlignment(.center)
                    .lineSpacing(3)
            }
        }
    }
}
