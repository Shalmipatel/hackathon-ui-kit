import SwiftUI

/// Unused: the React mobile UI uses a bottom action sheet for Settings,
/// which on iOS is best expressed as `.confirmationDialog`. The wiring
/// lives in `RootView`. This file is kept as a placeholder so anyone
/// looking for a SettingsSheet finds the seam.
struct SettingsSheet: View {
    var body: some View { EmptyView() }
}
