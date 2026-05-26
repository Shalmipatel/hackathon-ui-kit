import SwiftUI

@main
struct WanderbotApp: App {
    @StateObject private var store = TravelStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .preferredColorScheme(.light)
                .tint(Theme.ink)
                .task { store.bootstrap() }
        }
    }
}
