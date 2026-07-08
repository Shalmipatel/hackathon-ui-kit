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
    /// Presentation state lives HERE (top level), not in the section —
    /// sheet/dialog modifiers attached to a `Section` are replicated
    /// per-row and their state resets on list re-render, which made the
    /// credential sheet flash open and instantly dismiss.
    @State private var credentialSite: BrowserConnections.Site?
    @State private var disconnectSlug: String?

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

            BrowserAgentSection(
                credentialSite: $credentialSite,
                disconnectSlug: $disconnectSlug
            )

            Section("Runtime") {
                StaticRow(
                    icon: "bolt.fill",
                    tint: Theme.inkDark,
                    title: "xAI Grok",
                    subtitle: "Voice, chat, search & trip tools",
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
        .fullScreenCover(item: $credentialSite) { site in
            WebLoginView(site: site)
        }
        .confirmationDialog(
            disconnectSlug.map { BrowserConnections.shared.isCustom($0) ? "Remove this app?" : "Disconnect this account?" }
                ?? "Remove this connection?",
            isPresented: Binding(
                get: { disconnectSlug != nil },
                set: { if !$0 { disconnectSlug = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button(disconnectSlug.map { BrowserConnections.shared.isCustom($0) ? "Remove" : "Disconnect" } ?? "Remove",
                   role: .destructive) {
                if let slug = disconnectSlug {
                    BrowserConnections.shared.disconnect(slug: slug)
                }
                disconnectSlug = nil
            }
            Button("Cancel", role: .cancel) { disconnectSlug = nil }
        } message: {
            Text("Any saved login is deleted from the cloud browser as well.")
        }
    }
}

// MARK: - Gmail (live state)

private struct GmailRow: View {
    @EnvironmentObject private var connections: ConnectionsStore
    @ObservedObject private var gmail = GmailConnector.shared
    @State private var showDisconnectConfirm = false

    /// Connected on this device (Keychain tokens) OR cross-device flag
    /// from RTDB. Device tokens are what actually powers scanning.
    private var isConnected: Bool { gmail.isConnected || connections.gmail != nil }

    var body: some View {
        HStack(spacing: 12) {
            IconTile(icon: "envelope.fill", tint: .red)

            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text("Gmail")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                    if isConnected {
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
                Task {
                    await GmailConnector.shared.disconnect()
                    await connections.disconnectGmail()
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Wanderbot will stop scanning your inbox for new trips until you reconnect.")
        }
    }

    private var subtitle: String {
        if let email = gmail.connectedEmail { return email }
        if !connections.didLoadInitial { return "Checking…" }
        if let error = gmail.lastError { return error }
        return connections.gmail?.email ?? "Not connected"
    }

    @ViewBuilder
    private var trailingAction: some View {
        if isConnected {
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
        } else {
            // On-device OAuth: gmail.readonly consent → Keychain tokens →
            // the agent's search_email tool lights up.
            Button {
                Task { await GmailConnector.shared.connect() }
            } label: {
                if gmail.isConnecting {
                    ProgressView().tint(Theme.inkMuted)
                } else {
                    Text("Connect")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12).padding(.vertical, 5)
                        .background(Capsule().fill(Theme.inkDark))
                }
            }
            .buttonStyle(.plain)
            .disabled(gmail.isConnecting)
        }
    }
}

// MARK: - Browser agent (Skyvern)

/// Shows the cloud-browser backend status and its recent runs. Each run
/// links to Skyvern's dashboard where you can watch the live browser /
/// recording of what the agent did.
private struct BrowserAgentSection: View {
    struct Run: Identifiable {
        let id: String
        let status: String
        let createdAt: String
        /// Site the agent was browsing (from the run's start URL).
        let host: String
    }

    @Binding var credentialSite: BrowserConnections.Site?
    @Binding var disconnectSlug: String?

    @State private var runs: [Run] = []
    @State private var isLoading = false
    @State private var showAddApp = false
    @State private var newAppName = ""
    @State private var activeSessionCount = 0
    @State private var closingAll = false
    @State private var ssoToRemove: String?
    @ObservedObject private var browser = BrowserConnections.shared
    @Environment(\.openURL) private var openURL

    private var configured: Bool { !WanderbotConfig.skyvernAPIKey.isEmpty }

    var body: some View {
        Section {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(Color.blue.opacity(0.12))
                        .frame(width: 32, height: 32)
                    Image(systemName: "globe")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.blue)
                }
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 6) {
                        Text("Cloud browser")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                        if configured { StatusDot() }
                    }
                    Text(!configured ? "Not configured"
                         : activeSessionCount == 0 ? "Nothing running"
                         : "\(activeSessionCount) browser\(activeSessionCount == 1 ? "" : "s") running")
                        .font(.system(size: 12))
                        .foregroundStyle(activeSessionCount > 0 ? .orange : Theme.inkMuted)
                }
                Spacer(minLength: 8)
                if activeSessionCount > 0 {
                    Button {
                        closingAll = true
                        Task {
                            _ = await browser.closeAllSessions()
                            activeSessionCount = 0
                            closingAll = false
                        }
                    } label: {
                        if closingAll {
                            ProgressView().tint(Theme.inkMuted)
                        } else {
                            Text("Stop all")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Theme.destructive)
                                .padding(.horizontal, 10).padding(.vertical, 5)
                                .background(Capsule().fill(Theme.destructive.opacity(0.1)))
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(closingAll)
                }
            }
            .padding(.vertical, 4)

            if configured {
                // Site accounts — log in once inside the in-app remote
                // browser; the agent reuses that login for syncs.
                // Swipe or long-press any custom/connected row to remove
                // it (deletes the saved login server-side too).
                ForEach(browser.allSites, id: \.slug) { site in
                    let removable = browser.isCustom(site.slug) || browser.isConnected(site.slug)
                    siteRow(site)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            if removable {
                                Button {
                                    disconnectSlug = site.slug
                                } label: {
                                    Label("Remove", systemImage: "trash")
                                }
                                .tint(Theme.destructive)
                            }
                        }
                        .contextMenu {
                            if removable {
                                Button(role: .destructive) {
                                    disconnectSlug = site.slug
                                } label: {
                                    Label(browser.isCustom(site.slug) ? "Remove app" : "Disconnect",
                                          systemImage: "trash")
                                }
                            }
                        }
                }

                // Captured SSO identities (appear automatically when a
                // login flows through Google/Apple). Delete-only — new
                // ones are added by connecting apps, never directly.
                ForEach(browser.ssoAccounts.values.sorted(by: { $0.capturedAt > $1.capturedAt }),
                        id: \.provider) { account in
                    ssoRow(account)
                }

                // Any other app by name — the remote browser starts on a
                // Google search for its login page; the real domain is
                // learned from where the traveler actually signs in.
                Button {
                    showAddApp = true
                } label: {
                    HStack(spacing: 12) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(Theme.chipFill)
                                .frame(width: 32, height: 32)
                            Image(systemName: "plus")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Theme.ink)
                        }
                        Text("Connect another app…")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(Theme.ink)
                        Spacer()
                    }
                    .padding(.vertical, 4)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                // Recent agent browsing — what the assistant actually did
                // in the cloud browser, humanized. Tap to watch the
                // recording. (Nothing here is needed for connecting.)
                if !runs.isEmpty {
                    ForEach(runs) { run in
                        Button {
                            if let url = URL(string: "https://app.skyvern.com/runs/\(run.id)") {
                                openURL(url)
                            }
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: statusIcon(run.status))
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(statusColor(run.status))
                                    .frame(width: 20)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(run.host.isEmpty ? "Agent browsing" : "Browsed \(run.host)")
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundStyle(Theme.ink)
                                        .lineLimit(1)
                                    Text("\(run.status)\(run.createdAt.isEmpty ? "" : " · \(run.createdAt)")")
                                        .font(.system(size: 11.5))
                                        .foregroundStyle(Theme.inkMuted)
                                }
                                Spacer(minLength: 8)
                                Text("Watch")
                                    .font(.system(size: 11.5, weight: .semibold))
                                    .foregroundStyle(Theme.inkMuted)
                                Image(systemName: "arrow.up.right")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(Theme.inkMuted)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        } header: {
            Text("Browser agent")
        } footer: {
            Text(configured
                 ? "Connect a site by logging in inside a live remote browser — any login method works, including Google. The assistant reuses that login when it syncs. Tap a run to watch it in Skyvern."
                 : "Add a Skyvern API key to enable browser-based syncing.")
                .font(.system(size: 12))
        }
        .task { await load() }
        .alert(
            "Remove \((ssoToRemove ?? "this").capitalized) sign-in?",
            isPresented: Binding(
                get: { ssoToRemove != nil },
                set: { if !$0 { ssoToRemove = nil } }
            )
        ) {
            Button("Remove", role: .destructive) {
                if let provider = ssoToRemove {
                    browser.removeSSOAccount(provider: provider)
                }
                ssoToRemove = nil
            }
            Button("Cancel", role: .cancel) { ssoToRemove = nil }
        } message: {
            Text("New app connections will start signed out. Apps you've already connected keep their own logins.")
        }
        .alert("Connect another app", isPresented: $showAddApp) {
            TextField("App name (e.g. Booking.com)", text: $newAppName)
                .textInputAutocapitalization(.never)
            Button("Continue") {
                let name = newAppName.trimmingCharacters(in: .whitespacesAndNewlines)
                newAppName = ""
                guard !name.isEmpty else { return }
                credentialSite = browser.addCustomSite(name: name)
            }
            Button("Cancel", role: .cancel) { newAppName = "" }
        } message: {
            Text("A secure browser will open on a search for the app's login page — find it, sign in, and tap \"I'm done\".")
        }
    }

    /// A captured SSO identity row — created by the connect flow, only
    /// removable here.
    @ViewBuilder
    private func ssoRow(_ account: BrowserConnections.SSOAccount) -> some View {
        let isGoogle = account.provider == "google"
        let sourceTitle = browser.allSites.first(where: { $0.slug == account.sourceSlug })?.title
            ?? account.sourceSlug
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill((isGoogle ? Color.blue : Theme.inkDark).opacity(0.12))
                    .frame(width: 32, height: 32)
                Image(systemName: isGoogle ? "g.circle.fill" : "apple.logo")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(isGoogle ? Color.blue : Theme.inkDark)
            }
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text("\(account.provider.capitalized) sign-in")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                    StatusDot()
                }
                Text("Saved via \(sourceTitle) — makes SSO one tap")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.inkMuted)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Button {
                ssoToRemove = account.provider
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.inkMuted)
                    .padding(7)
                    .background(Circle().fill(Theme.chipFill))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Remove \(account.provider) sign-in")
        }
        .padding(.vertical, 4)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button {
                ssoToRemove = account.provider
            } label: {
                Label("Remove", systemImage: "trash")
            }
            .tint(Theme.destructive)
        }
    }

    @ViewBuilder
    private func siteRow(_ site: BrowserConnections.Site) -> some View {
        let connected = browser.isConnected(site.slug)
        let saving = browser.savingSlugs.contains(site.slug)
        let tint: Color = site.slug == "airbnb" ? .pink
            : site.slug == "wanderlog" ? .teal : .indigo
        let icon = site.slug == "airbnb" ? "house.fill"
            : site.slug == "wanderlog" ? "map.fill" : "app.badge.checkmark"
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(tint.opacity(0.12))
                    .frame(width: 32, height: 32)
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(tint)
            }
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(site.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                    if connected { StatusDot() }
                }
                let saveError = browser.saveErrors[site.slug]
                let viaSSO = (browser.connection(site.slug)?.viaProviders?.first)
                    .map { $0.capitalized }
                Text(connected
                     ? (saving ? "Login saved · syncing in background"
                        : viaSSO.map { "Login saved · \($0) sign-in included" }
                            ?? "Login saved for agent syncs")
                     : saving ? "Saving login…"
                     : saveError ?? "Not connected")
                    .font(.system(size: 12))
                    .foregroundStyle(saveError != nil && !connected && !saving
                                     ? Theme.destructive : Theme.inkMuted)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if saving {
                ProgressView().tint(Theme.inkMuted)
            } else if connected {
                Button {
                    disconnectSlug = site.slug
                } label: {
                    Text("Disconnect")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.destructive)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Capsule().fill(Theme.destructive.opacity(0.1)))
                }
                .buttonStyle(.plain)
            } else {
                Button {
                    credentialSite = site
                } label: {
                    Text("Connect")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12).padding(.vertical, 5)
                        .background(Capsule().fill(Theme.inkDark))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 4)
    }

    private func statusIcon(_ s: String) -> String {
        switch s {
        case "completed": return "checkmark.circle.fill"
        case "running", "queued", "created": return "clock.fill"
        default: return "xmark.circle.fill"
        }
    }

    private func statusColor(_ s: String) -> Color {
        switch s {
        case "completed": return .green
        case "running", "queued", "created": return .orange
        default: return Theme.destructive
        }
    }

    private func load() async {
        guard configured else { return }
        // Pick up any login snapshot interrupted by an app suspension.
        browser.resumePendingSnapshots()
        // Live count of running cloud browsers — the "am I leaking
        // sessions?" answer, refreshed every time this screen appears.
        if let sessions = await Self.getJSONList(path: "/v1/browser_sessions") {
            activeSessionCount = sessions.filter { ($0["status"] as? String) == "running" }.count
        }
        guard runs.isEmpty else { return }
        isLoading = true
        defer { isLoading = false }
        guard let list = await Self.getJSONList(path: "/v1/runs?page_size=12") else { return }

        // Only browser TASKS the agent ran (tsk_…). wr_ workflow runs come
        // from Skyvern's own console, not this app — noise here.
        let tasks = list.filter { (($0["run_id"] as? String) ?? "").hasPrefix("tsk") }.prefix(4)

        var loaded: [Run] = []
        for item in tasks {
            guard let id = item["run_id"] as? String else { continue }
            // The list view omits the start URL — fetch the run for it.
            var host = ""
            if let detail = await Self.getJSON(path: "/v1/runs/\(id)"),
               let request = detail["run_request"] as? [String: Any],
               let urlString = request["url"] as? String,
               var h = URL(string: urlString)?.host?.lowercased() {
                if h.hasPrefix("www.") { h.removeFirst(4) }
                host = h
            }
            loaded.append(Run(
                id: id,
                status: (item["status"] as? String) ?? "unknown",
                createdAt: Self.friendlyDate(item["created_at"] as? String),
                host: host
            ))
        }
        runs = loaded
    }

    private static func friendlyDate(_ iso: String?) -> String {
        guard let iso else { return "" }
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSSSS"
        guard let date = parser.date(from: iso) else { return String(iso.prefix(10)) }
        let out = DateFormatter()
        out.dateFormat = "MMM d, h:mm a"
        return out.string(from: date)
    }

    private static func getJSON(path: String) async -> [String: Any]? {
        guard let url = URL(string: WanderbotConfig.skyvernAPIURL + path) else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        request.setValue(WanderbotConfig.skyvernAPIKey, forHTTPHeaderField: "x-api-key")
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }

    private static func getJSONList(path: String) async -> [[String: Any]]? {
        guard let url = URL(string: WanderbotConfig.skyvernAPIURL + path) else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        request.setValue(WanderbotConfig.skyvernAPIKey, forHTTPHeaderField: "x-api-key")
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
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
