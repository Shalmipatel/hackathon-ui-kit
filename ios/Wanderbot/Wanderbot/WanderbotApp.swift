import SwiftUI

@main
struct WanderbotApp: App {
    @StateObject private var store = TravelStore()
    @StateObject private var chat = ChatStore()
    @StateObject private var auth = AuthStore()
    @StateObject private var connections = ConnectionsStore()

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
            .preferredColorScheme(.light)
            .tint(Theme.ink)
        }
    }
}
