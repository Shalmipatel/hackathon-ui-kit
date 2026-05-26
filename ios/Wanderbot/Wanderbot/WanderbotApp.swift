import SwiftUI

@main
struct WanderbotApp: App {
    @StateObject private var store = TravelStore()
    @StateObject private var chat = ChatStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .environmentObject(chat)
                .preferredColorScheme(.light)
                .tint(Theme.ink)
                .task { store.bootstrap() }
        }
    }
}
