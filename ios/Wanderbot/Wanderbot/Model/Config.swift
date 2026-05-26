import Foundation

/// Connection settings for the Wanderbot iOS app.
///
/// The web app reads these from `.env.local` (Vite); on iOS we keep
/// them in source. The RTDB has open rules per the hackathon flow, so
/// the URL alone is enough — no API key is needed for read traffic.
/// Swap to auth + a real config story before going to prod.
enum WanderbotConfig {
    /// Firebase Realtime Database URL — same instance the web app
    /// reads/writes. Empty string disables sync and the app falls back
    /// to bundled sample data.
    static let firebaseDatabaseURL: String =
        "https://gen-lang-client-0500673478-default-rtdb.firebaseio.com"

    static var firebaseEnabled: Bool { !firebaseDatabaseURL.isEmpty }
}
