import SwiftUI

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
                store.bootstrap()
                connections.bootstrap()
                sync.configure(travel: store)
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                NSLog("[scantest] connectedSites=%@",
                      BrowserConnections.shared.connectedSites.map(\.slug).description)
                NSLog("[scantest] starting deep scan")
                sync.scanForTrips(deep: true)
            }
            #endif
        }
    }
}
