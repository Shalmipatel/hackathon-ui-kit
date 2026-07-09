import SwiftUI
#if DEBUG
import WebKit
#endif

@main
struct WanderbotApp: App {
    @StateObject private var store = TravelStore()
    @StateObject private var chat = ChatStore()
    @StateObject private var auth = AuthStore()
    @StateObject private var connections = ConnectionsStore()
    @StateObject private var sync = SyncService()

    var body: some Scene {
        WindowGroup {
            // Gate the entire app on auth state. Trips, chat, and
            // settings are only reachable once the user has signed in
            // through Firebase Auth — no data sync runs while signed
            // out, which keeps the cold-open noise to a minimum and
            // matches the "private until signed in" expectation.
            Group {
                #if DEBUG
                if ProcessInfo.processInfo.environment["WB_EXTENSION_PREVIEW"] != nil {
                    DebugExtensionPreviewView()
                } else if auth.isSignedIn {
                    RootView()
                        .task {
                            store.bootstrap()
                            connections.bootstrap()
                            chat.configure(travelStore: store)
                            sync.configure(travel: store)
                        }
                        .transition(.opacity)
                } else {
                    SignInGateView()
                        .transition(.opacity)
                }
                #else
                if auth.isSignedIn {
                    RootView()
                        .task {
                            store.bootstrap()
                            connections.bootstrap()
                            chat.configure(travelStore: store)
                            sync.configure(travel: store)
                        }
                        .transition(.opacity)
                } else {
                    SignInGateView()
                        .transition(.opacity)
                }
                #endif
            }
            .animation(.easeInOut(duration: 0.25), value: auth.isSignedIn)
            .environmentObject(store)
            .environmentObject(chat)
            .environmentObject(auth)
            .environmentObject(connections)
            .environmentObject(sync)
            .preferredColorScheme(.light)
            .tint(Theme.ink)
            #if DEBUG
            // Test harness: `WB_TEST_UID=<uid>` runs a headless deep scan on
            // launch against that user's stored cookies, logging every step —
            // lets us reproduce a device scan on the simulator. Never ships
            // (DEBUG only, and no-op unless the env var is set).
            .task {
                guard let uid = ProcessInfo.processInfo.environment["WB_TEST_UID"] else { return }
                NSLog("[scantest] seeding uid=%@", uid)
                UserDefaults.standard.set(
                    try? JSONSerialization.data(withJSONObject: ["uid": uid]),
                    forKey: "wanderbot.auth.user.v2")
                BrowserConnections.shared.debugSeed(slug: "wanderlog")
                BrowserConnections.shared.debugSeed(slug: "airbnb")
                store.bootstrap()
                connections.bootstrap()
                sync.configure(travel: store)
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                NSLog("[scantest] connectedSites=%@",
                      BrowserConnections.shared.connectedSites.map(\.slug).description)
                let mode = ProcessInfo.processInfo.environment["WB_TEST_MODE"]
                if mode == "webcap" {
                    let url = ProcessInfo.processInfo.environment["WB_CAP_URL"]
                        ?? "https://wanderlog.com/signin"
                    await Self.debugWebCapture(urlString: url)
                } else if mode == "concurrent_rescan" {
                    // Wait for trips to load, then kick off two rescans at once.
                    try? await Task.sleep(nanoseconds: 3_000_000_000)
                    let ids = Array(store.trips.prefix(2).map(\.id))
                    NSLog("[scantest] concurrent rescan of %@", ids.description)
                    for id in ids { sync.rescanTrip(id: id) }
                    NSLog("[scantest] runningTripIDs=%@", sync.runningTripIDs.description)
                } else if let dest = mode, dest.hasPrefix("rescan:") {
                    try? await Task.sleep(nanoseconds: 3_000_000_000)
                    let needle = String(dest.dropFirst("rescan:".count)).lowercased()
                    if let trip = store.trips.first(where: {
                        ($0.title + $0.destination).lowercased().contains(needle)
                    }) {
                        NSLog("[scantest] rescan trip %@ (%@)", trip.id, trip.title)
                        sync.rescanTrip(id: trip.id)
                    } else { NSLog("[scantest] no trip matching %@", needle) }
                } else {
                    NSLog("[scantest] starting deep scan")
                    sync.scanForTrips(deep: true)
                }
            }
            #endif
        }
    }

    #if DEBUG
    /// Loads a URL in an offscreen WKWebView and logs the cookies WKHTTPCookieStore
    /// captures — verifying httpOnly session cookies (e.g. Wanderlog connect.sid)
    /// are visible to the native capture path.
    @MainActor
    private static var probeWebView: WKWebView?
    @MainActor
    static func debugWebCapture(urlString: String) async {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        let wv = WKWebView(frame: .init(x: 0, y: 0, width: 390, height: 700), configuration: config)
        wv.customUserAgent = WebLoginModel.safariUA   // same UA the real login uses
        probeWebView = wv
        guard let url = URL(string: urlString) else { return }
        wv.load(URLRequest(url: url))
        NSLog("[webcap] loading %@", urlString)
        try? await Task.sleep(nanoseconds: 8_000_000_000)
        // Surface any "browser may not be secure" block from the page text.
        if let body = (try? await wv.evaluateJavaScript(
            "document.body ? document.body.innerText.slice(0,500) : ''")) as? String {
            let blocked = body.lowercased().contains("not be secure")
                || body.lowercased().contains("couldn't sign you in")
            NSLog("[webcap] page blocked=%d; text: %@", blocked ? 1 : 0,
                  body.replacingOccurrences(of: "\n", with: " ").prefix(200).description)
        }
        let cookies: [HTTPCookie] = await withCheckedContinuation { c in
            wv.configuration.websiteDataStore.httpCookieStore.getAllCookies { c.resume(returning: $0) }
        }
        NSLog("[webcap] captured %ld cookies:", cookies.count)
        for c in cookies {
            NSLog("[webcap]   %@ = %@… (domain %@, secure %d)",
                  c.name, String(c.value.prefix(10)), c.domain, c.isSecure ? 1 : 0)
        }
        let ls = (try? await wv.evaluateJavaScript("JSON.stringify(localStorage)")) as? String
        NSLog("[webcap] localStorage: %@", (ls ?? "nil").prefix(120).description)
    }
    #endif
}
