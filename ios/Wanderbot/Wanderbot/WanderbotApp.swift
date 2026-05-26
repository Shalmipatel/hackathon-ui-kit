import SwiftUI

@main
struct WanderbotApp: App {
    @StateObject private var store = TravelStore()
    @StateObject private var chat = ChatStore()
    @StateObject private var auth = AuthStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .environmentObject(chat)
                .environmentObject(auth)
                .preferredColorScheme(.light)
                .tint(Theme.ink)
                .task { store.bootstrap() }
        }
    }
}
