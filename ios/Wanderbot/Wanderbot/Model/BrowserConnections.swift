import Foundation

/// Logged-in site connections (Airbnb, Wanderlog, custom apps) via a
/// **cookie jar** — no Skyvern profiles, no archive uploads.
///
/// Connect flow: the traveler logs into one or more apps in the in-app
/// remote browser → "I'm done" exports the browser's cookies over CDP
/// (kilobytes, sub-second) into the device **Keychain**. Every later
/// session — the next connect, or an agent sync — starts as a plain
/// browser with the jar injected at boot (`Storage.setCookies`), arriving
/// signed into everything, SSO included. Instant saves, no waiting.
@MainActor
final class BrowserConnections: ObservableObject {

    static let shared = BrowserConnections()

    // MARK: - Sites

    struct Site: Identifiable {
        let slug: String
        let title: String
        let host: String
        let loginURL: String
        let syncURL: String
        var id: String { slug }
    }

    static let builtinSites: [Site] = [
        Site(slug: "airbnb", title: "Airbnb", host: "airbnb.com",
             loginURL: "https://www.airbnb.com/login",
             syncURL: "https://www.airbnb.com/trips/v1"),
        Site(slug: "wanderlog", title: "Wanderlog", host: "wanderlog.com",
             loginURL: "https://wanderlog.com/signin",
             syncURL: "https://wanderlog.com/home"),
    ]

    struct CustomSite: Codable, Equatable {
        var slug: String
        var title: String
        var host: String        // learned at "I'm done"; empty until then
        var loginURL: String
        var syncURL: String
    }

    @Published private(set) var customSites: [CustomSite] = []

    var allSites: [Site] {
        Self.builtinSites + customSites.map {
            Site(slug: $0.slug, title: $0.title, host: $0.host,
                 loginURL: $0.loginURL, syncURL: $0.syncURL)
        }
    }

    func isCustom(_ slug: String) -> Bool { customSites.contains { $0.slug == slug } }

    /// Register a new app by NAME — the interactive browser starts on a
    /// Norton Safe Search for its login page (Google bot-walls us).
    func addCustomSite(name: String) -> Site {
        let title = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let base = title.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }.joined(separator: "-")
        let slug = "app-\(base.isEmpty ? "site" : base)"
        let query = title.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? title
        let searchURL = "https://safesearch.norton.com/search?q=\(query)+login"

        if let existing = customSites.first(where: { $0.slug == slug }) {
            return Site(slug: existing.slug, title: existing.title, host: existing.host,
                        loginURL: existing.loginURL, syncURL: existing.syncURL)
        }
        let record = CustomSite(slug: slug, title: title, host: "",
                                loginURL: searchURL, syncURL: searchURL)
        customSites.append(record)
        persistCustomSites()
        return Site(slug: slug, title: title, host: "", loginURL: searchURL, syncURL: searchURL)
    }

    func siteForName(_ name: String) -> Site {
        let needle = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let builtin = Self.builtinSites.first(where: { $0.title.lowercased() == needle }) {
            return builtin
        }
        return addCustomSite(name: name)
    }

    // MARK: - Connection bookkeeping (cookies live in the jar)

    struct Connection: Codable, Equatable {
        var connectedAt: Double
        /// SSO providers the login flowed through ("google"/"apple").
        var viaProviders: [String]?
    }

    struct SSOAccount: Codable, Equatable {
        var provider: String
        var capturedAt: Double
        var sourceSlug: String
    }

    /// A live interactive-login browser session (CDP endpoint streamed
    /// into the app).
    struct LiveSession {
        let sessionID: String
        let cdpURL: URL
    }

    struct Err: Error { let message: String; init(_ m: String) { message = m } }

    @Published private(set) var connections: [String: Connection] = [:]
    @Published private(set) var ssoAccounts: [String: SSOAccount] = [:]
    /// Transient — true only for the instant it takes to merge cookies.
    @Published private(set) var savingSlugs: Set<String> = []
    @Published private(set) var saveErrors: [String: String] = [:]

    private static let connectionsKey = "wanderbot.browser.connections.v3"
    private static let customSitesKey = "wanderbot.browser.customsites"
    private static let ssoKey = "wanderbot.browser.sso"
    private static let pendingSessionKey = "wanderbot.browser.pendingSession"

    // Session credentials — the ONLY things needed to keep logins alive:
    // cookies (all domains) + per-origin localStorage tokens. Stored in
    // RTDB keyed by user; cached in memory for synchronous reads.
    private let rtdb = FirebaseRTDB(databaseURLString: WanderbotConfig.firebaseDatabaseURL)
    private var cachedCookies: [[String: Any]] = []
    private var cachedStorage: [String: [String: String]] = [:]   // origin → items

    /// RTDB record — credential blobs as JSON strings (avoids RTDB key
    /// restrictions on cookie domains / origin URLs).
    private struct BrowserState: Codable {
        var cookiesJSON: String
        var storageJSON: String
        var updatedAt: Double
    }

    /// Per-user path; falls back to a shared key when signed out.
    private var statePath: String {
        "wanderbot/browser_state/\(Self.currentUID())"
    }

    private static func currentUID() -> String {
        if let data = UserDefaults.standard.data(forKey: "wanderbot.auth.user.v2"),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let uid = json["uid"] as? String, !uid.isEmpty {
            return uid
        }
        return "default"
    }

    private init() {
        if let data = UserDefaults.standard.data(forKey: Self.connectionsKey),
           let stored = try? JSONDecoder().decode([String: Connection].self, from: data) {
            connections = stored
        }
        if let data = UserDefaults.standard.data(forKey: Self.customSitesKey),
           let stored = try? JSONDecoder().decode([CustomSite].self, from: data) {
            customSites = stored
        }
        if let data = UserDefaults.standard.data(forKey: Self.ssoKey),
           let stored = try? JSONDecoder().decode([String: SSOAccount].self, from: data) {
            ssoAccounts = stored
        }
        // Crash safety: close a session the app died mid-login on.
        if let orphan = UserDefaults.standard.string(forKey: Self.pendingSessionKey) {
            UserDefaults.standard.removeObject(forKey: Self.pendingSessionKey)
            Task { _ = try? await Self.post(path: "/v1/browser_sessions/\(orphan)/close", body: [:], requestTimeout: 30) }
        }
        // Hydrate the credential caches from RTDB.
        Task { await loadState() }
    }

    /// Pull the stored credentials from RTDB into the in-memory caches.
    func loadState() async {
        guard let rtdb, let state: BrowserState = await rtdb.loadValue(at: statePath) else { return }
        if let data = state.cookiesJSON.data(using: .utf8),
           let cookies = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            cachedCookies = cookies
        }
        if let data = state.storageJSON.data(using: .utf8),
           let storage = try? JSONSerialization.jsonObject(with: data) as? [String: [String: String]] {
            cachedStorage = storage
        }
    }

    private func persistState() {
        let cookiesJSON = (try? JSONSerialization.data(withJSONObject: cachedCookies))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
        let storageJSON = (try? JSONSerialization.data(withJSONObject: cachedStorage))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        let state = BrowserState(cookiesJSON: cookiesJSON, storageJSON: storageJSON,
                                 updatedAt: Date().timeIntervalSince1970 * 1000)
        let path = statePath
        Task { [rtdb] in await rtdb?.put(state, at: path) }
    }

    func isConnected(_ slug: String) -> Bool { connections[slug] != nil }
    func connection(_ slug: String) -> Connection? { connections[slug] }

    #if DEBUG
    /// Test-only: seed a connection so `connectedSites` includes it, without
    /// going through the interactive login (cookies come from RTDB by uid).
    func debugSeed(slug: String) {
        connections[slug] = Connection(connectedAt: 1, viaProviders: nil)
        persist()
    }
    #endif

    /// Travel sites with a saved login — used to extend inbox scans.
    var connectedSites: [Site] {
        allSites.filter { connections[$0.slug] != nil && !$0.host.isEmpty }
    }

    /// True when we have cookies to reach `urlString`'s login.
    func hasCookies(forURL urlString: String) -> Bool {
        guard let host = URL(string: urlString)?.host?.lowercased() else { return false }
        return allSites.contains { !$0.host.isEmpty && host.contains($0.host) && connections[$0.slug] != nil }
    }

    // MARK: - Persistence

    private func persist() {
        if let data = try? JSONEncoder().encode(connections) {
            UserDefaults.standard.set(data, forKey: Self.connectionsKey)
        }
    }
    private func persistCustomSites() {
        if let data = try? JSONEncoder().encode(customSites) {
            UserDefaults.standard.set(data, forKey: Self.customSitesKey)
        }
    }
    private func persistSSO() {
        if let data = try? JSONEncoder().encode(ssoAccounts) {
            UserDefaults.standard.set(data, forKey: Self.ssoKey)
        }
    }

    // MARK: - Credential jar (cookies + per-origin localStorage)

    /// Cookies to inject into a fresh browser so it arrives signed in.
    func cookieJar() -> [[String: Any]] { cachedCookies }

    /// Per-origin localStorage items to seed (token-based sites).
    func storageSeed() -> [String: [String: String]] { cachedStorage }

    /// Merge freshly-captured session credentials. New value for a
    /// cookie's name+domain+path replaces the old; everything else
    /// accumulates — so Google SSO cookies persist across app logins.
    private func mergeCredentials(cookies: [[String: Any]], origin: String, items: [String: String]) {
        var byKey: [String: [String: Any]] = [:]
        func key(_ c: [String: Any]) -> String {
            "\(c["name"] ?? "")|\(c["domain"] ?? "")|\(c["path"] ?? "/")"
        }
        for c in cachedCookies { byKey[key(c)] = c }
        for c in cookies { byKey[key(c)] = c }
        cachedCookies = Array(byKey.values)
        if !origin.isEmpty, !items.isEmpty { cachedStorage[origin] = items }
        persistState()
    }

    // MARK: - Login lifecycle

    /// Start an interactive login: a plain fast browser session. Saved
    /// cookies are injected by the view once its CDP link is up.
    func beginLogin(site: Site) async throws -> LiveSession {
        let session = try await Self.post(
            path: "/v1/browser_sessions", body: ["timeout": 15], requestTimeout: 120
        )
        guard let sessionID = session["browser_session_id"] as? String,
              let address = session["browser_address"] as? String,
              let cdpURL = URL(string: address)
        else { throw Err("The browser session started but returned no address.") }
        UserDefaults.standard.set(sessionID, forKey: Self.pendingSessionKey)
        return LiveSession(sessionID: sessionID, cdpURL: cdpURL)
    }

    /// "I'm done" — cookies were captured by the view over CDP (instant),
    /// so this just merges the jar, marks the site connected, and closes
    /// the session. No archive, no waiting.
    func finishLogin(site: Site, session: LiveSession, finalURL: String?,
                     providers: [String], cookies: [[String: Any]],
                     origin: String = "", storageItems: [String: String] = [:]) {
        UserDefaults.standard.removeObject(forKey: Self.pendingSessionKey)
        savingSlugs.insert(site.slug)
        saveErrors[site.slug] = nil

        if cookies.isEmpty && storageItems.isEmpty {
            // Nothing captured — don't claim a connection that won't work.
            savingSlugs.remove(site.slug)
            saveErrors[site.slug] = "Couldn't read the login — connect again."
            Task { await self.close(session.sessionID) }
            return
        }

        mergeCredentials(cookies: cookies, origin: origin, items: storageItems)
        learnHost(slug: site.slug, fromFinalURL: finalURL)
        let now = Date().timeIntervalSince1970 * 1000
        connections[site.slug] = Connection(
            connectedAt: now, viaProviders: providers.isEmpty ? nil : providers
        )
        persist()
        for provider in providers {
            ssoAccounts[provider] = SSOAccount(provider: provider, capturedAt: now, sourceSlug: site.slug)
        }
        if !providers.isEmpty { persistSSO() }
        savingSlugs.remove(site.slug)
        Task { await self.close(session.sessionID) }
    }

    /// Native-webview login: the user signed in inside an on-device WKWebView
    /// and we captured its cookies (incl. httpOnly) + localStorage directly —
    /// no Skyvern session involved. Merge the jar, mark connected, persist.
    /// The scan side injects these into Skyvern exactly as before.
    func completeWebLogin(site: Site, finalURL: String?,
                          cookies: [[String: Any]], origin: String,
                          storageItems: [String: String]) {
        savingSlugs.insert(site.slug); saveErrors[site.slug] = nil
        guard !(cookies.isEmpty && storageItems.isEmpty) else {
            savingSlugs.remove(site.slug)
            saveErrors[site.slug] = "Couldn't read the login — sign in and tap Done again."
            return
        }
        mergeCredentials(cookies: cookies, origin: origin, items: storageItems)
        learnHost(slug: site.slug, fromFinalURL: finalURL)
        connections[site.slug] = Connection(
            connectedAt: Date().timeIntervalSince1970 * 1000, viaProviders: nil
        )
        persist()
        savingSlugs.remove(site.slug)
    }

    func cancelLogin(session: LiveSession) async {
        UserDefaults.standard.removeObject(forKey: Self.pendingSessionKey)
        await close(session.sessionID)
    }

    /// No-op now (saves are instant) — kept so ConnectionsView's call
    /// site doesn't need to change.
    func resumePendingSnapshots() {}

    // MARK: - Disconnect

    func disconnect(slug: String) {
        connections[slug] = nil
        saveErrors[slug] = nil
        persist()
        if customSites.contains(where: { $0.slug == slug }) {
            customSites.removeAll { $0.slug == slug }
            persistCustomSites()
        }
        // Nothing left → wipe all stored credentials.
        if connections.isEmpty {
            cachedCookies = []
            cachedStorage = [:]
            let path = statePath
            Task { [rtdb] in await rtdb?.delete(at: path) }
            if !ssoAccounts.isEmpty { ssoAccounts = [:]; persistSSO() }
        }
    }

    func removeSSOAccount(provider: String) {
        ssoAccounts[provider] = nil
        persistSSO()
    }

    // MARK: - Agent sync

    /// Create a browser session for a `browse_and_extract` run and inject
    /// the cookie jar so it's already signed in. Returns the session id,
    /// or nil when the URL's site has no saved login.
    func sessionForSync(urlString: String) async -> String? {
        guard hasCookies(forURL: urlString) else { return nil }
        guard let session = try? await Self.post(
            path: "/v1/browser_sessions", body: ["timeout": 15], requestTimeout: 180
        ), let sessionID = session["browser_session_id"] as? String,
           let address = session["browser_address"] as? String,
           let cdpURL = URL(string: address)
        else { return nil }
        // Headlessly inject cookies + localStorage so the agent's browser
        // is logged in.
        await CredentialInjector.inject(cookies: cookieJar(), storage: storageSeed(), into: cdpURL)
        return sessionID
    }

    /// One logged-in page: its visible text plus the trip-ish links on it.
    struct LoggedInPage { let text: String; let links: [(text: String, href: String)] }

    /// FAST path: open a logged-in cloud browser, navigate to `urlString`, and
    /// return the rendered page (~15s) — no Skyvern agent. The agentic engine
    /// takes 10+ min and often dies at its 50-planning-step cap; we just read
    /// the page and let the model pull data out of the text.
    func fetchLoggedInPage(urlString: String) async -> LoggedInPage? {
        guard hasCookies(forURL: urlString) else { return nil }
        guard let session = try? await Self.post(
            path: "/v1/browser_sessions", body: ["timeout": 15], requestTimeout: 180
        ), let sessionID = session["browser_session_id"] as? String,
           let address = session["browser_address"] as? String,
           let cdpURL = URL(string: address)
        else { return nil }
        defer { Task { await close(sessionID) } }
        return await PageText.fetch(
            cdpURL: cdpURL, url: urlString, cookies: cookieJar(), storage: storageSeed()
        )
    }

    /// Discovery convenience — just the text of the account page.
    func fetchLoggedInText(urlString: String) async -> String? {
        (await fetchLoggedInPage(urlString: urlString))?.text
    }

    /// DETAIL path: read the account page, find the link that best matches the
    /// trip's `destination`, open THAT page, and return its text — the trip's
    /// actual itinerary. Falls back to the account page's own text when no
    /// trip link matches (e.g. Airbnb, where the reservation is on the main
    /// page). No agentic browsing, so it doesn't hit the 50-step failure.
    func fetchTripDetail(homeURL: String, destination: String) async -> String? {
        guard let home = await fetchLoggedInPage(urlString: homeURL) else { return nil }
        let keywords = destination.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { $0.count > 3 }
        let scored = home.links
            .map { link -> (score: Int, href: String) in
                let t = link.text.lowercased()
                return (keywords.filter { t.contains($0) }.count, link.href)
            }
            .filter { $0.score > 0 }
            .sorted { $0.score > $1.score }
        if let best = scored.first,
           let trip = await fetchLoggedInPage(urlString: best.href) {
            return "Matched trip page (\(best.href)):\n\(trip.text)"
        }
        return home.text
    }

    func closeSession(_ sessionID: String) async { await close(sessionID) }

    /// Emergency stop: close every running cloud browser.
    func closeAllSessions() async -> Int {
        guard let list = try? await Self.getList(path: "/v1/browser_sessions") else { return 0 }
        var closed = 0
        for session in list where (session["status"] as? String) == "running" {
            if let id = session["browser_session_id"] as? String {
                await close(id); closed += 1
            }
        }
        return closed
    }

    private func close(_ sessionID: String) async {
        _ = try? await Self.post(path: "/v1/browser_sessions/\(sessionID)/close", body: [:], requestTimeout: 30)
    }

    // MARK: - Custom-site host learning

    private func learnHost(slug: String, fromFinalURL urlString: String?) {
        guard let idx = customSites.firstIndex(where: { $0.slug == slug }),
              let raw = urlString, var host = URL(string: raw)?.host?.lowercased()
        else { return }
        let intermediaries = ["google.com", "accounts.google.", "appleid.apple.com",
                              "facebook.com", "norton.com"]
        guard !intermediaries.contains(where: { host.contains($0) }) else { return }
        if host.hasPrefix("www.") { host.removeFirst(4) }
        customSites[idx].host = host
        customSites[idx].syncURL = "https://\(host)"
        persistCustomSites()
    }

    // MARK: - Skyvern REST

    private static func post(path: String, body: [String: Any], requestTimeout: TimeInterval) async throws -> [String: Any] {
        guard let url = URL(string: WanderbotConfig.skyvernAPIURL + path) else { throw Err("Bad URL") }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = requestTimeout
        request.assumesHTTP3Capable = false   // QUIC to api.skyvern.com is reset on some networks
        request.setValue(WanderbotConfig.skyvernAPIKey, forHTTPHeaderField: "x-api-key")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await TripAgentTools.skyvernSession.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let text = String(data: data, encoding: .utf8) ?? ""
            throw Err("Skyvern HTTP \((response as? HTTPURLResponse)?.statusCode ?? -1): \(text.prefix(160))")
        }
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    private static func getList(path: String) async throws -> [[String: Any]] {
        guard let url = URL(string: WanderbotConfig.skyvernAPIURL + path) else { throw Err("Bad URL") }
        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        request.assumesHTTP3Capable = false
        request.setValue(WanderbotConfig.skyvernAPIKey, forHTTPHeaderField: "x-api-key")
        let (data, response) = try await TripAgentTools.skyvernSession.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw Err("HTTP error") }
        return (try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]) ?? []
    }
}

/// Headless CDP client that injects cookies + localStorage into a browser
/// session (agent-sync sessions the traveler never sees). Attaches to the
/// page target, sets cookies, registers a localStorage-seeding script that
/// fires per origin on navigation, then disconnects.
private enum CredentialInjector {
    static func inject(cookies: [[String: Any]], storage: [String: [String: String]], into cdpURL: URL) async {
        guard !cookies.isEmpty || !storage.isEmpty else { return }
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            let worker = Worker(cookies: cookies, storage: storage) { cont.resume() }
            worker.start(cdpURL: cdpURL)
        }
    }

    private final class Worker: NSObject, @unchecked Sendable {
        private let cookies: [[String: Any]]
        private let storage: [String: [String: String]]
        private let done: () -> Void
        private var task: URLSessionWebSocketTask?
        private var nextID = 1
        private var attachPurpose = -1
        private var cdpSession: String?
        private var finished = false
        /// Strong self-reference held for the worker's lifetime. Without it
        /// nothing retains the worker once `inject` returns (all handlers are
        /// [weak self]), so ARC can free it mid-flight — its safety timeout
        /// then no-ops and the continuation never resumes (hangs the sync).
        /// Concurrent injections during a fan-out made this reliably happen.
        private var keepAlive: Worker?

        init(cookies: [[String: Any]], storage: [String: [String: String]], done: @escaping () -> Void) {
            self.cookies = cookies; self.storage = storage; self.done = done
        }

        /// Script that seeds localStorage for the matching origin on every
        /// new document — before the site's own scripts run.
        private var storageSeedScript: String? {
            guard !storage.isEmpty,
                  let data = try? JSONSerialization.data(withJSONObject: storage),
                  let json = String(data: data, encoding: .utf8) else { return nil }
            return "(function(){try{var S=\(json);var o=location.origin;"
                + "if(S[o]){var m=S[o];for(var k in m){try{localStorage.setItem(k,m[k])}catch(e){}}}}catch(e){}})()"
        }

        func start(cdpURL: URL) {
            keepAlive = self
            var request = URLRequest(url: cdpURL)
            request.setValue(WanderbotConfig.skyvernAPIKey, forHTTPHeaderField: "x-api-key")
            let session = URLSession(configuration: .default)
            task = session.webSocketTask(with: request)
            task?.resume()
            // Safety: never hang the sync on a stuck inject.
            DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in self?.finish() }
            receive()
            attachPurpose = send("Target.getTargets")
        }

        private func finish() {
            if finished { return }
            finished = true
            task?.cancel(with: .normalClosure, reason: nil)
            done()
            keepAlive = nil   // release now that the continuation has resumed
        }

        @discardableResult
        private func send(_ method: String, _ params: [String: Any] = [:], session: String? = nil) -> Int {
            let id = nextID; nextID += 1
            var msg: [String: Any] = ["id": id, "method": method, "params": params]
            if let session { msg["sessionId"] = session }
            if let data = try? JSONSerialization.data(withJSONObject: msg),
               let text = String(data: data, encoding: .utf8) {
                task?.send(.string(text)) { _ in }
            }
            return id
        }

        private func receive() {
            task?.receive { [weak self] result in
                guard let self, !self.finished else { return }
                if case .success(let message) = result {
                    if case .string(let text) = message,
                       let data = text.data(using: .utf8),
                       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                        self.handle(json)
                    }
                    self.receive()
                } else {
                    self.finish()
                }
            }
        }

        private func handle(_ json: [String: Any]) {
            if json["id"] as? Int == attachPurpose,
               let infos = (json["result"] as? [String: Any])?["targetInfos"] as? [[String: Any]] {
                if let page = infos.last(where: { ($0["type"] as? String) == "page" }),
                   let targetID = page["targetId"] as? String {
                    attachPurpose = send("Target.attachToTarget", ["targetId": targetID, "flatten": true])
                } else { finish() }
                return
            }
            if let result = json["result"] as? [String: Any],
               let sessionID = result["sessionId"] as? String, cdpSession == nil {
                cdpSession = sessionID
                send("Page.enable", session: sessionID)
                if !cookies.isEmpty {
                    send("Network.enable", session: sessionID)
                    send("Storage.setCookies", ["cookies": cookies], session: sessionID)
                }
                if let script = storageSeedScript {
                    send("Page.addScriptToEvaluateOnNewDocument", ["source": script], session: sessionID)
                }
                // Give the round-trips a beat, then done.
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in self?.finish() }
            }
        }
    }
}

/// Headless CDP client that loads one logged-in page and returns its visible
/// text. Attaches to the page target, seeds cookies + localStorage, navigates,
/// waits for the SPA to render, then reads `document.body.innerText`.
private enum PageText {
    static func fetch(
        cdpURL: URL, url: String,
        cookies: [[String: Any]], storage: [String: [String: String]]
    ) async -> BrowserConnections.LoggedInPage? {
        await withCheckedContinuation { (cont: CheckedContinuation<BrowserConnections.LoggedInPage?, Never>) in
            let worker = Worker(url: url, cookies: cookies, storage: storage) { cont.resume(returning: $0) }
            worker.start(cdpURL: cdpURL)
        }
    }

    private final class Worker: NSObject, @unchecked Sendable {
        private let targetURL: String
        private let cookies: [[String: Any]]
        private let storage: [String: [String: String]]
        private let done: (BrowserConnections.LoggedInPage?) -> Void
        private var task: URLSessionWebSocketTask?
        private var nextID = 1
        private var getTargetsID = -1
        private var attachID = -1
        private var navID = -1
        private var evalID = -1
        private var sessionID: String?
        private var finished = false
        private var keepAlive: Worker?   // see CredentialInjector.Worker

        init(url: String, cookies: [[String: Any]], storage: [String: [String: String]],
             done: @escaping (BrowserConnections.LoggedInPage?) -> Void) {
            self.targetURL = url; self.cookies = cookies; self.storage = storage; self.done = done
        }

        private var storageSeedScript: String? {
            guard !storage.isEmpty,
                  let data = try? JSONSerialization.data(withJSONObject: storage),
                  let json = String(data: data, encoding: .utf8) else { return nil }
            return "(function(){try{var S=\(json);var o=location.origin;"
                + "if(S[o]){var m=S[o];for(var k in m){try{localStorage.setItem(k,m[k])}catch(e){}}}}catch(e){}})()"
        }

        func start(cdpURL: URL) {
            keepAlive = self
            var request = URLRequest(url: cdpURL)
            request.setValue(WanderbotConfig.skyvernAPIKey, forHTTPHeaderField: "x-api-key")
            task = URLSession(configuration: .default).webSocketTask(with: request)
            task?.resume()
            // Hard cap so a stuck page never hangs the sync (nav 8s + render).
            DispatchQueue.main.asyncAfter(deadline: .now() + 45) { [weak self] in self?.finish(nil) }
            receive()
            getTargetsID = send("Target.getTargets")
        }

        private func finish(_ page: BrowserConnections.LoggedInPage?) {
            if finished { return }
            finished = true
            task?.cancel(with: .normalClosure, reason: nil)
            done(page)
            keepAlive = nil
        }

        @discardableResult
        private func send(_ method: String, _ params: [String: Any] = [:], session: String? = nil) -> Int {
            let id = nextID; nextID += 1
            var msg: [String: Any] = ["id": id, "method": method, "params": params]
            if let session { msg["sessionId"] = session }
            if let data = try? JSONSerialization.data(withJSONObject: msg),
               let text = String(data: data, encoding: .utf8) {
                task?.send(.string(text)) { _ in }
            }
            return id
        }

        private func receive() {
            task?.receive { [weak self] result in
                guard let self, !self.finished else { return }
                if case .success(let message) = result {
                    if case .string(let text) = message,
                       let data = text.data(using: .utf8),
                       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                        self.handle(json)
                    }
                    self.receive()
                } else {
                    self.finish(nil)
                }
            }
        }

        private func handle(_ json: [String: Any]) {
            let id = json["id"] as? Int
            // 1. targets → attach to the page
            if id == getTargetsID,
               let infos = (json["result"] as? [String: Any])?["targetInfos"] as? [[String: Any]] {
                if let page = infos.last(where: { ($0["type"] as? String) == "page" }),
                   let targetID = page["targetId"] as? String {
                    attachID = send("Target.attachToTarget", ["targetId": targetID, "flatten": true])
                } else { finish(nil) }
                return
            }
            // 2. attached → seed cookies/storage, then navigate
            if id == attachID,
               let s = (json["result"] as? [String: Any])?["sessionId"] as? String {
                sessionID = s
                if !cookies.isEmpty { send("Storage.setCookies", ["cookies": cookies], session: s) }
                if let script = storageSeedScript {
                    send("Page.addScriptToEvaluateOnNewDocument", ["source": script], session: s)
                }
                send("Page.enable", session: s)
                navID = send("Page.navigate", ["url": targetURL], session: s)
                return
            }
            // 3. navigated → let the SPA render, then read text + trip links
            if id == navID {
                DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
                    guard let self, let s = self.sessionID, !self.finished else { return }
                    let js = """
                    JSON.stringify({
                      text:(document.body&&document.body.innerText||'').slice(0,20000),
                      links:Array.from(document.querySelectorAll('a[href]'))
                        .map(function(a){return {t:(a.innerText||'').trim().replace(/\\s+/g,' ').slice(0,80),h:a.href};})
                        .filter(function(x){return x.t && /\\/(plan|trip|trips|view|rooms|reservation)/i.test(x.h);})
                        .slice(0,60)
                    })
                    """
                    self.evalID = self.send("Runtime.evaluate", [
                        "expression": js, "returnByValue": true,
                    ], session: s)
                }
                return
            }
            // 4. result back → parse text + links → done
            if id == evalID {
                let raw = ((json["result"] as? [String: Any])?["result"] as? [String: Any])?["value"] as? String
                guard let raw, let data = raw.data(using: .utf8),
                      let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    finish(raw.map { BrowserConnections.LoggedInPage(text: $0, links: []) })
                    return
                }
                let text = obj["text"] as? String ?? ""
                let links = (obj["links"] as? [[String: Any]] ?? []).compactMap { l -> (text: String, href: String)? in
                    guard let t = l["t"] as? String, let h = l["h"] as? String else { return nil }
                    return (t, h)
                }
                finish(BrowserConnections.LoggedInPage(text: text, links: links))
                return
            }
        }
    }
}

