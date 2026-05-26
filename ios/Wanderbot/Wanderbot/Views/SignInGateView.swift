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
    @State private var didAutoStart = false

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()

            VStack(spacing: 24) {
                Hero()

                if auth.isSigningIn {
                    HStack(spacing: 10) {
                        ProgressView().tint(Theme.inkMuted)
                        Text("Opening sign-in…")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.inkMuted)
                    }
                } else if didAutoStart {
                    // User dismissed the web sheet without finishing.
                    // Give them an obvious way back in.
                    Button {
                        Task { await auth.signIn() }
                    } label: {
                        Text("Sign in")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 28)
                            .padding(.vertical, 12)
                            .background(Capsule().fill(Theme.inkDark))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 24)
        }
        .task {
            if !didAutoStart {
                didAutoStart = true
                await auth.signIn()
            }
        }
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
