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

    /// OpenClaw gateway base URL — the web app hits `/v1/responses`
    /// at its own origin, which Vercel rewrites to `…/api/gw/v1/…`
    /// upstream (see vercel.json). iOS doesn't have the Vercel proxy
    /// in the loop, so the `/api/gw` prefix has to be baked into the
    /// base URL or every request gets bounced (302 → login, then 401
    /// from the chat endpoint).
    static let gatewayURL: String =
        "https://neoclaw-admin-us-west-1.securebrowser.com/api/gw"

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

    /// Prefix for the `x-openclaw-session-key` header. The web's
    /// `toSessionKeyHeader(clientId)` returns
    ///   `agent:main:neoclaw-<clientId>`
    /// — see src/providers/sync/session-key.util.ts. Sending the same
    /// value from iOS makes both clients land on the same OpenClaw
    /// server-side session, so the conversation transcript is shared
    /// across devices (the gateway chains turns by session key).
    static let gatewaySessionKeyPrefix: String = "agent:main:neoclaw-"

    /// Session id we use for a trip's chat — matches the web's
    /// `trip-<tripId>` convention (see useBookingIngestion.ts).
    static func chatSessionID(forTripID tripID: String) -> String {
        "trip-\(tripID)"
    }

    /// Build the `x-openclaw-session-key` header value for one trip.
    static func sessionKeyHeader(forTripID tripID: String) -> String {
        "\(gatewaySessionKeyPrefix)\(chatSessionID(forTripID: tripID))"
    }

    static var gatewayEnabled: Bool { !gatewayURL.isEmpty }

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
