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
                BrowserConnections.shared.debugSeed(slug: "airbnb")
                store.bootstrap()
                connections.bootstrap()
                sync.configure(travel: store)
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                NSLog("[scantest] connectedSites=%@",
                      BrowserConnections.shared.connectedSites.map(\.slug).description)
                let mode = ProcessInfo.processInfo.environment["WB_TEST_MODE"]
                if mode == "concurrent_rescan" {
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
}
