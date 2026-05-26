import SwiftUI

struct SettingsView: View {
    @AppStorage("wb.theme.matchSystem") private var matchSystem = true
    @AppStorage("wb.feature.haptics") private var haptics = true
    @AppStorage("wb.feature.devTools") private var devTools = false

    var body: some View {
        List {
            Section("Appearance") {
                Toggle("Match system theme", isOn: $matchSystem)
            }
            Section("Behavior") {
                Toggle("Haptic feedback", isOn: $haptics)
                Toggle("Show dev tools", isOn: $devTools)
            }
            Section("About") {
                LabeledContent("Version", value: "1.0 (1)")
                LabeledContent("Build", value: "SwiftUI port")
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.background)
    }
}
