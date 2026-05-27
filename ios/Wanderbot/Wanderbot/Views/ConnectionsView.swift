import SwiftUI

/// Connections list — shows only what's actually connected for this
/// user (cross-device state, read from RTDB).
///
/// Today that's:
///   - **Gmail** — `/wanderbot/connections/gmail` carries the
///     connected account; status + email update live via
///     `ConnectionsStore`.
///   - **OpenClaw runtime** — informational pill so the page has
///     a non-empty resting state.
///
/// The mobile-web app surfaces a richer "browse and connect" panel
/// (Google Calendar, browser apps for Airbnb/Booking, social
/// accounts) but those flows live entirely in the OpenClaw gateway
/// and aren't replicated to RTDB. On iOS we deliberately don't
/// pretend to manage them — adding new connections happens on the
/// web app; iOS just reflects what's already on.
struct ConnectionsView: View {
    var body: some View {
        List {
            Section {
                GmailRow()
            } header: {
                Text("Trip discovery")
            } footer: {
                Text("Wanderbot scans your inbox for booking confirmations and adds them to your trips.")
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
            Text("Wanderbot will stop scanning your inbox for new trips on every device until you reconnect from the web app.")
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
        }
        // Not connected = no trailing action. Connection itself happens
        // on the web app; iOS only reflects state.
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
