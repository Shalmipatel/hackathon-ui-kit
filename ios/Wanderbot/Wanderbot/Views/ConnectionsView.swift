import SwiftUI

/// Connections list — mirrors the web app's surface.
///
/// Only Gmail is fully reactive on iOS today: the web app stores the
/// connected account in RTDB at `/wanderbot/connections/gmail`, and
/// `ConnectionsStore` subscribes to it so connect/disconnect from any
/// device shows up here within a second.
///
/// Other integrations (Google Calendar, browser apps, social) live
/// inside the OpenClaw gateway's per-user state, which iOS doesn't
/// speak to yet. They're listed with a "Manage on web" affordance
/// that opens the same Connections page in Safari.
struct ConnectionsView: View {
    @EnvironmentObject private var connections: ConnectionsStore

    var body: some View {
        List {
            Section {
                GmailRow()
            } header: {
                Text("Trip discovery")
            } footer: {
                Text("Wanderbot scans your Gmail for booking confirmations and adds them to your trips.")
                    .font(.system(size: 12))
            }

            Section {
                ManageOnWebRow(
                    icon: "calendar",
                    tint: Color(red: 0.20, green: 0.46, blue: 0.86),
                    title: "Google Calendar",
                    subtitle: "Read upcoming events"
                )
                ManageOnWebRow(
                    icon: "safari.fill",
                    tint: Color(red: 0.42, green: 0.46, blue: 0.55),
                    title: "Browser apps",
                    subtitle: "Airbnb, Booking, Expedia…"
                )
                ManageOnWebRow(
                    icon: "person.2.crop.square.stack",
                    tint: Color(red: 0.86, green: 0.22, blue: 0.49),
                    title: "Social accounts",
                    subtitle: "Instagram, TikTok, X…"
                )
            } header: {
                Text("Manage on the web")
            } footer: {
                Text("These integrations live in your OpenClaw account. Tap any row to open the web Connections page.")
                    .font(.system(size: 12))
            }

            Section("Runtime") {
                StaticRow(
                    icon: "bolt.fill",
                    tint: Theme.inkDark,
                    title: "OpenClaw",
                    subtitle: "wanderbot-ai.vercel.app",
                    trailing: AnyView(
                        Text("Live")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.green)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(Capsule().fill(Color.green.opacity(0.12)))
                    )
                )
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.background)
    }
}

// MARK: - Gmail (live state)

private struct GmailRow: View {
    @EnvironmentObject private var connections: ConnectionsStore
    @State private var showDisconnectConfirm = false

    var body: some View {
        HStack(spacing: 12) {
            IconTile(icon: "envelope.fill", tint: .red)

            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text("Gmail")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                    if connections.gmail != nil {
                        StatusDot()
                    }
                }
                Text(subtitle)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.inkMuted)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            trailingAction
        }
        .padding(.vertical, 4)
        .confirmationDialog(
            "Disconnect Gmail?",
            isPresented: $showDisconnectConfirm,
            titleVisibility: .visible
        ) {
            Button("Disconnect", role: .destructive) {
                Task { await connections.disconnectGmail() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Wanderbot will stop scanning your inbox for new trips on every device until you reconnect.")
        }
    }

    private var subtitle: String {
        if !connections.didLoadInitial { return "Checking…" }
        return connections.gmail?.email ?? "Not connected"
    }

    @ViewBuilder
    private var trailingAction: some View {
        if connections.gmail != nil {
            Button(role: .destructive) {
                showDisconnectConfirm = true
            } label: {
                if connections.isMutating {
                    ProgressView().tint(Theme.inkMuted)
                } else {
                    Text("Disconnect")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.destructive)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Capsule().fill(Theme.destructive.opacity(0.1)))
                }
            }
            .buttonStyle(.plain)
            .disabled(connections.isMutating)
        } else if connections.didLoadInitial {
            ConnectOnWebButton(label: "Connect")
        }
    }
}

private struct StatusDot: View {
    var body: some View {
        ZStack {
            Circle().fill(Color.green.opacity(0.25)).frame(width: 12, height: 12)
            Circle().fill(Color.green).frame(width: 7, height: 7)
        }
    }
}

// MARK: - "Manage on web" rows

private struct ManageOnWebRow: View {
    let icon: String
    let tint: Color
    let title: String
    let subtitle: String

    var body: some View {
        Button {
            openWebConnections()
        } label: {
            HStack(spacing: 12) {
                IconTile(icon: icon, tint: tint)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.ink)
                    Text(subtitle).font(.system(size: 12)).foregroundStyle(Theme.inkMuted)
                }
                Spacer(minLength: 8)
                Image(systemName: "arrow.up.right.square")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.inkMuted)
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct ConnectOnWebButton: View {
    let label: String

    var body: some View {
        Button {
            openWebConnections()
        } label: {
            HStack(spacing: 4) {
                Text(label).font(.system(size: 12, weight: .semibold))
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 10, weight: .bold))
            }
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(Capsule().fill(Theme.chipFill))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Shared building blocks

private struct StaticRow: View {
    let icon: String
    let tint: Color
    let title: String
    let subtitle: String
    let trailing: AnyView?

    var body: some View {
        HStack(spacing: 12) {
            IconTile(icon: icon, tint: tint)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.ink)
                Text(subtitle).font(.system(size: 12)).foregroundStyle(Theme.inkMuted).lineLimit(1)
            }
            Spacer(minLength: 8)
            if let trailing { trailing }
        }
        .padding(.vertical, 4)
    }
}

private struct IconTile: View {
    let icon: String
    let tint: Color

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(tint.opacity(0.12))
                .frame(width: 32, height: 32)
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(tint)
        }
    }
}

private func openWebConnections() {
    guard let url = URL(string: "https://wanderbot-ai.vercel.app/?view=connections") else { return }
    UIApplication.shared.open(url)
}
