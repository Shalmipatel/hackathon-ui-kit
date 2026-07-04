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

                SyncSection()

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
                SignInRow(provider: .apple, icon: "apple.logo", tint: Theme.inkDark, title: "Sign in with Apple")
                SignInRow(provider: .google, icon: "g.circle.fill", tint: Color(red: 0.26, green: 0.52, blue: 0.96), title: "Sign in with Google")
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

private struct SignInRow: View {
    let provider: AuthStore.Provider
    let icon: String
    let tint: Color
    let title: String

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
                        .font(.system(size: 14, weight: .semibold))
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

/// Triggers the `wanderbot-sync` skill via the gateway:
///   - Quick scan = `shallow`, sweeps the last 7 days.
///   - Deep scan  = `deep`, sweeps the last 30 days and wipes the
///     locally-tracked tombstones so deleted trips/bookings can come
///     back if they're still in the source.
/// Buttons disable while a scan is in flight; the actual results
/// arrive via the live RTDB SSE stream the TravelStore is already
/// subscribed to.
private struct SyncSection: View {
    @EnvironmentObject private var sync: SyncService

    var body: some View {
        Section {
            Button {
                sync.scanForTrips(deep: false)
            } label: {
                SyncRow(
                    icon: "arrow.clockwise",
                    tint: BookingType.flight.accent,
                    title: "Scan for new trips",
                    subtitle: "Check the last 7 days",
                    busy: sync.isScanning
                )
            }
            .buttonStyle(.plain)
            .disabled(sync.isScanning)

            Button {
                sync.scanForTrips(deep: true)
            } label: {
                SyncRow(
                    icon: "magnifyingglass",
                    tint: BookingType.event.accent,
                    title: "Deep scan",
                    subtitle: "Sweep the last 30 days across every source",
                    busy: sync.isScanning
                )
            }
            .buttonStyle(.plain)
            .disabled(sync.isScanning)

            SyncStatusRow(state: sync.state)
        } header: {
            Text("Sync")
        } footer: {
            Text("Runs in the background across every connected source (Gmail, connected accounts). New bookings appear in your trips automatically — you don't have to wait here.")
                .font(.system(size: 12))
        }
    }
}

/// Live status of the background sync: running step, or the last
/// success/failure with a relative time. Persists across launches.
private struct SyncStatusRow: View {
    let state: SyncService.SyncState

    var body: some View {
        switch state {
        case .idle:
            EmptyView()
        case .running(let step):
            HStack(spacing: 10) {
                ProgressView().controlSize(.small).tint(Theme.inkMuted)
                Text(step).font(.system(size: 13)).foregroundStyle(Theme.ink)
                Spacer()
            }
            .padding(.vertical, 2)
        case .done(let summary, let at):
            statusLine(icon: "checkmark.circle.fill", color: .green,
                       title: summary, at: at)
        case .failed(let reason, let at):
            statusLine(icon: "exclamationmark.triangle.fill", color: Theme.destructive,
                       title: reason, at: at)
        }
    }

    private func statusLine(icon: String, color: Color, title: String, at: Double) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(color)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.system(size: 13)).foregroundStyle(Theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Last sync · \(Self.ago(at))")
                    .font(.system(size: 11)).foregroundStyle(Theme.inkMuted)
            }
            Spacer()
        }
        .padding(.vertical, 2)
    }

    private static func ago(_ ms: Double) -> String {
        let date = Date(timeIntervalSince1970: ms / 1000)
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .short
        return f.localizedString(for: date, relativeTo: Date())
    }
}

private struct SyncRow: View {
    let icon: String
    let tint: Color
    let title: String
    let subtitle: String
    let busy: Bool

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
                Text(title).font(.system(size: 16)).foregroundStyle(Theme.ink)
                Text(subtitle).font(.system(size: 12)).foregroundStyle(Theme.inkMuted)
            }

            Spacer()

            if busy {
                ProgressView().tint(Theme.inkMuted)
            }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
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
