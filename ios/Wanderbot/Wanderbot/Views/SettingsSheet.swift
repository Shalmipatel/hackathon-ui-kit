import SwiftUI

/// Root settings menu — shown when the user taps the cog.
///
/// Top of the list is an account block: the signed-in user's name +
/// email when signed in, two big "Sign in with…" buttons when out.
/// All sign-in goes through `AuthStore`, which drives Firebase Auth
/// via the web bridge (`auth.html` + `ASWebAuthenticationSession`).
struct SettingsSheet: View {
    /// Called with a trip id when the user picks one in All Trips —
    /// lets the root view jump the trip carousel to that page.
    let onSelectTrip: (Trip.ID) -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: TravelStore
    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        NavigationStack {
            List {
                AccountSection()

                Section {
                    NavigationLink {
                        AllTripsView(onSelectTrip: { id in
                            onSelectTrip(id)
                            dismiss()
                        })
                    } label: {
                        SettingsRow(
                            icon: "suitcase.fill",
                            tint: BookingType.hotel.accent,
                            title: "All Trips",
                            subtitle: "\(store.trips.count) trip\(store.trips.count == 1 ? "" : "s")"
                        )
                    }
                }

                Section {
                    NavigationLink {
                        ConnectionsView()
                            .navigationTitle("Connections")
                            .navigationBarTitleDisplayMode(.inline)
                    } label: {
                        SettingsRow(
                            icon: "link",
                            tint: BookingType.flight.accent,
                            title: "Connections",
                            subtitle: "Gmail, Calendar, Wallet"
                        )
                    }
                    NavigationLink {
                        SettingsView()
                            .navigationTitle("Preferences")
                            .navigationBarTitleDisplayMode(.inline)
                    } label: {
                        SettingsRow(
                            icon: "slider.horizontal.3",
                            tint: BookingType.attraction.accent,
                            title: "Preferences",
                            subtitle: "Appearance, behaviour"
                        )
                    }
                }

                if auth.isSignedIn {
                    Section {
                        Button(role: .destructive) {
                            auth.signOut()
                        } label: {
                            HStack {
                                Spacer()
                                Text("Sign Out")
                                    .font(.system(size: 15, weight: .semibold))
                                Spacer()
                            }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .tint(Theme.ink)
                }
            }
        }
    }
}

/// Either the signed-in user (avatar + name + email) or two
/// provider sign-in buttons.
private struct AccountSection: View {
    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        Section {
            if let user = auth.user {
                HStack(spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(Theme.brandYellow)
                            .frame(width: 40, height: 40)
                        Text(initial(for: user))
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(Theme.inkDark)
                    }
                    VStack(alignment: .leading, spacing: 1) {
                        Text(user.displayName)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                        if let email = user.email, !email.isEmpty {
                            Text(email)
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.inkMuted)
                                .lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 4)
            } else {
                SignInButton(provider: .google,
                             title: "Sign in with Google",
                             icon: "g.circle.fill",
                             tint: Color(red: 0.26, green: 0.52, blue: 0.96))
                SignInButton(provider: .apple,
                             title: "Sign in with Apple",
                             icon: "apple.logo",
                             tint: Theme.inkDark)
            }
        } header: {
            Text("Account")
        } footer: {
            if auth.user == nil {
                Text("Sign in to keep your trips and chat in sync across devices.")
                    .font(.system(size: 12))
            }
        }
    }

    private func initial(for user: AuthStore.User) -> String {
        let name = user.displayName
        guard let first = name.first else { return "?" }
        return String(first).uppercased()
    }
}

private struct SignInButton: View {
    let provider: AuthStore.Provider
    let title: String
    let icon: String
    let tint: Color

    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        Button {
            Task { await auth.signIn(with: provider) }
        } label: {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(tint)
                    Image(systemName: icon)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                }
                .frame(width: 30, height: 30)

                Text(title)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.ink)

                Spacer()

                if auth.isSigningIn {
                    ProgressView().tint(Theme.inkMuted)
                }
            }
            .padding(.vertical, 2)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(auth.isSigningIn)
    }
}

/// One settings menu row — square coloured icon tile, title, subtitle,
/// chevron. Matches iOS Settings.app row aesthetic.
private struct SettingsRow: View {
    let icon: String
    let tint: Color
    let title: String
    let subtitle: String?

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .fill(tint)
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .frame(width: 30, height: 30)

            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.inkMuted)
                }
            }
        }
        .padding(.vertical, 2)
    }
}
