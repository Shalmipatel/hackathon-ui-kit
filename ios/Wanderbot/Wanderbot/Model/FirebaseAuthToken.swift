import Foundation

/// Shared source of a valid Firebase ID token for authenticating RTDB
/// requests (`?auth=<idToken>`). Firebase ID tokens expire ~1 hour after
/// issue, so this actor transparently refreshes them via the Secure Token
/// endpoint using the stored refresh token, and reads the real expiry
/// straight from the JWT's `exp` claim (so a token restored from disk on
/// cold launch is refreshed before first use rather than trusted blindly).
///
/// Seeded by `AuthStore` on launch and after every sign-in; cleared on
/// sign-out. `FirebaseRTDB` (and its SSE streams) pull `validToken()`
/// before every connection.
actor FirebaseAuthToken {
    static let shared = FirebaseAuthToken()

    private var idToken: String?
    private var refreshToken: String?
    /// When the current `idToken` stops being valid (from its JWT `exp`).
    private var expiry: Date = .distantPast
    /// Coalesces concurrent refreshes so a burst of RTDB calls triggers
    /// exactly one network round-trip.
    private var inFlight: Task<String?, Never>?

    private init() {}

    /// Install tokens from `AuthStore`. `refreshToken` persists across
    /// launches; `idToken` may be stale (we derive its real expiry from
    /// the JWT and refresh on demand).
    func seed(idToken: String?, refreshToken: String?) {
        self.idToken = idToken
        self.refreshToken = refreshToken
        self.expiry = idToken.flatMap(Self.jwtExpiry) ?? .distantPast
    }

    func clear() {
        idToken = nil
        refreshToken = nil
        expiry = .distantPast
        inFlight?.cancel()
        inFlight = nil
    }

    /// A currently-valid ID token, refreshing if it's within 5 minutes of
    /// expiry. Returns nil when signed out or when a refresh fails (the
    /// caller then makes an unauthenticated request, which the rules
    /// reject — surfacing the auth problem rather than silently corrupting
    /// data).
    func validToken() async -> String? {
        if let idToken, Date() < expiry.addingTimeInterval(-300) {
            return idToken
        }
        if let inFlight { return await inFlight.value }
        let task = Task { await refresh() }
        inFlight = task
        let result = await task.value
        inFlight = nil
        return result
    }

    private func refresh() async -> String? {
        guard let refreshToken else { return idToken }
        let key = WanderbotConfig.firebaseAPIKey
        guard !key.isEmpty,
              let url = URL(string: "https://securetoken.googleapis.com/v1/token?key=\(key)")
        else { return idToken }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var comps = URLComponents()
        comps.queryItems = [
            URLQueryItem(name: "grant_type", value: "refresh_token"),
            URLQueryItem(name: "refresh_token", value: refreshToken),
        ]
        request.httpBody = comps.percentEncodedQuery?.data(using: .utf8)

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let newID = (json["id_token"] as? String) ?? (json["access_token"] as? String)
            else {
                NSLog("[fbauth] refresh failed HTTP %ld", (response as? HTTPURLResponse)?.statusCode ?? -1)
                return idToken
            }
            self.idToken = newID
            if let newRefresh = json["refresh_token"] as? String { self.refreshToken = newRefresh }
            let ttl = (json["expires_in"] as? String).flatMap(Double.init)
                ?? (json["expires_in"] as? Double) ?? 3600
            self.expiry = Self.jwtExpiry(newID) ?? Date().addingTimeInterval(ttl)
            return newID
        } catch {
            NSLog("[fbauth] refresh error %@", error.localizedDescription)
            return idToken
        }
    }

    /// Parse a Firebase ID token (JWT) and return its `exp` as a Date.
    nonisolated static func jwtExpiry(_ jwt: String) -> Date? {
        let parts = jwt.split(separator: ".")
        guard parts.count >= 2 else { return nil }
        var b64 = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let exp = json["exp"] as? Double
        else { return nil }
        return Date(timeIntervalSince1970: exp)
    }
}
