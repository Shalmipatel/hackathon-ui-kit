import SwiftUI

struct ConnectionsView: View {
    var body: some View {
        List {
            Section {
                ConnectionRow(name: "Gmail", subtitle: "Scan booking emails", iconColor: .red, icon: "envelope.fill", connected: false)
                ConnectionRow(name: "Google Calendar", subtitle: "Read upcoming events", iconColor: .blue, icon: "calendar", connected: false)
                ConnectionRow(name: "Apple Wallet", subtitle: "Import boarding passes", iconColor: .black, icon: "wallet.pass.fill", connected: false)
            } header: {
                Text("Inboxes")
            } footer: {
                Text("Connect a source and ask Wanderbot to scan it for trips.")
            }

            Section("OpenClaw") {
                ConnectionRow(name: "Assistant runtime", subtitle: "wanderbot-ai.vercel.app", iconColor: Theme.inkDark, icon: "bolt.fill", connected: true)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.background)
    }
}

private struct ConnectionRow: View {
    let name: String
    let subtitle: String
    let iconColor: Color
    let icon: String
    let connected: Bool

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(iconColor.opacity(0.12))
                    .frame(width: 32, height: 32)
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(iconColor)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(name).font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.ink)
                Text(subtitle).font(.system(size: 12)).foregroundStyle(Theme.inkMuted)
            }
            Spacer()
            if connected {
                Text("Connected")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.green)
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Capsule().fill(Color.green.opacity(0.12)))
            } else {
                Text("Connect")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Capsule().fill(Theme.chipFill))
            }
        }
        .padding(.vertical, 4)
    }
}
