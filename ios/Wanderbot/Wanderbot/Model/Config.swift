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

    /// OpenClaw gateway — same `VITE_NEOCLAW_API_URL` the web app uses.
    /// Chat hits `<gatewayURL>/v1/responses` with SSE streaming.
    static let gatewayURL: String =
        "https://neoclaw-admin-us-west-1.securebrowser.com"

    /// Bearer token sent as `Authorization: Bearer <key>` on gateway
    /// requests. Matches the StubAuthProvider pattern (the starter kit
    /// uses the env API key as the access token).
    static let gatewayAPIKey: String =
        "n92uN9iNfz5fipgJfnpmsLfapjVGKjwsbGRh8Qa2ZQw"

    /// OpenClaw agent id header — `x-openclaw-agent-id`. The web app
    /// defaults to "main".
    static let gatewayAgentID: String = "main"

    /// Model name passed in the `model` field of the request body. Web
    /// app defaults to "openclaw"; the gateway routes by this name.
    static let gatewayModel: String = "openclaw"

    static var gatewayEnabled: Bool { !gatewayURL.isEmpty }

    /// URL of the web auth bridge — same `wanderbot-ai.vercel.app`
    /// host the rest of the web app is deployed to. The bridge page
    /// drives Firebase Auth's `signInWithRedirect` for both Google
    /// and Apple providers and bounces the resulting ID token back
    /// to the iOS app via a custom URL scheme.
    static let authBridgeURL: String =
        "https://wanderbot-ai.vercel.app/auth.html"

    /// Custom URL scheme the bridge redirects to on success. Must
    /// match a CFBundleURLSchemes entry in Info.plist so iOS routes
    /// the URL into our ASWebAuthenticationSession callback.
    static let authReturnScheme: String = "wanderbot"

    /// Firebase Web API key — public value, ships in any Firebase web
    /// app's compiled bundle. Used to call the Identity Toolkit REST
    /// API directly (no Firebase SDK), e.g. for the Apple sign-in
    /// exchange:
    ///   POST identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=<key>
    /// Security is enforced via Firebase rules + per-API quotas, not
    /// by keeping this value secret.
    static let firebaseAPIKey: String = "AIzaSyCqI66amzEJ211TTTR7ZTIAWtT54orpirE"

    // MARK: - Google sign-in (iOS OAuth client)

    /// Google OAuth client ID for the iOS app, created in Google
    /// Cloud Console (or via Firebase's "add iOS app" flow). Public
    /// by design — the client secret isn't used; PKCE protects the
    /// auth code exchange.
    static let googleOAuthClientID: String =
        "775904840598-j5ae8qakcp2g68heagpdopt8dh0rk2a6.apps.googleusercontent.com"

    /// `CLIENT_ID` with its components reversed — used as the custom
    /// URL scheme Google redirects to after the OAuth dance. Must
    /// match a `CFBundleURLSchemes` entry in Info.plist so iOS
    /// catches the redirect and hands it to ASWebAuthenticationSession.
    static let googleReversedClientID: String =
        "com.googleusercontent.apps.775904840598-j5ae8qakcp2g68heagpdopt8dh0rk2a6"

    /// Full redirect URI passed to Google's authorize endpoint. Path
    /// is arbitrary; Google only enforces the scheme match against
    /// the OAuth client's registered redirect URIs.
    static var googleRedirectURI: String {
        "\(googleReversedClientID):/oauth2redirect/google"
    }
}
