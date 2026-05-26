import SwiftUI

/// Root settings menu — shown when the user taps the cog. iOS-style
/// grouped list with nav links into Connections, Preferences, and the
/// new All Trips browser. Replaces the old confirmation-dialog action
/// sheet, which looked utilitarian and gave no room for additional
/// sections.
struct SettingsSheet: View {
    /// Called with a trip id when the user picks one in All Trips —
    /// lets the root view jump the trip carousel to that page.
    let onSelectTrip: (Trip.ID) -> Void
    let onSignOut: () -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: TravelStore

    var body: some View {
        NavigationStack {
            List {
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

                Section {
                    Button(role: .destructive) {
                        onSignOut()
                        dismiss()
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
