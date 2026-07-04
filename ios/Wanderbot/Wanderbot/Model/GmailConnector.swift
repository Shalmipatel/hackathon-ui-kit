import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

/// On-device Gmail connection — OAuth (gmail.readonly) + token storage in
/// the Keychain + a thin Gmail REST client. This replaces the retired
/// OpenClaw `gog` flow: tokens live on THIS device and email content is
/// read by the app itself, then handed to the xAI agent as tool output.
///
/// Connection state is mirrored to RTDB at `wanderbot/connections/gmail`
/// (`{email, connectedAt}`) so the existing ConnectionsStore/web UI show
/// the same status.
@MainActor
final class GmailConnector: NSObject, ObservableObject {

    static let shared = GmailConnector()

    struct Tokens: Codable {
        var accessToken: String
        var refreshToken: String
        /// Unix seconds when the access token expires.
        var expiresAt: Double
        var email: String
    }

    struct EmailSummary {
        let from: String
        let subject: String
        let date: String
        let body: String
    }

    enum GmailError: Error, LocalizedError {
        case notConnected
        case cancelled
        case http(Int, String)
        case other(String)

        var errorDescription: String? {
            switch self {
            case .notConnected: return "Gmail is not connected."
            case .cancelled: return "Connection cancelled."
            case .http(let code, let body): return "Gmail HTTP \(code): \(body.prefix(160))"
            case .other(let m): return m
            }
        }
    }

    @Published private(set) var connectedEmail: String?
    @Published private(set) var isConnecting = false
    @Published var lastError: String?

    var isConnected: Bool { tokens != nil }

    private var tokens: Tokens? {
        didSet {
            connectedEmail = tokens?.email
            if let tokens, let data = try? JSONEncoder().encode(tokens) {
                Keychain.set(data, key: Self.keychainKey)
            } else if tokens == nil {
                Keychain.delete(key: Self.keychainKey)
            }
        }
    }

    private var webSession: ASWebAuthenticationSession?
    private let rtdb = FirebaseRTDB(databaseURLString: WanderbotConfig.firebaseDatabaseURL)

    private static let keychainKey = "wanderbot.gmail.tokens"
    private static let scopes = "openid email https://www.googleapis.com/auth/gmail.readonly"

    override private init() {
        super.init()
        if let data = Keychain.get(key: Self.keychainKey),
           let stored = try? JSONDecoder().decode(Tokens.self, from: data) {
            tokens = stored
            connectedEmail = stored.email
        }
    }

    // MARK: - Connect / disconnect

    /// Run the OAuth consent for gmail.readonly and persist tokens.
    func connect() async {
        guard !isConnecting else { return }
        isConnecting = true
        lastError = nil
        defer { isConnecting = false }

        do {
            let verifier = Self.randomToken(64)
            let state = Self.randomToken(32)
            var components = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
            components.queryItems = [
                URLQueryItem(name: "client_id", value: WanderbotConfig.googleOAuthClientID),
                URLQueryItem(name: "redirect_uri", value: WanderbotConfig.googleRedirectURI),
                URLQueryItem(name: "response_type", value: "code"),
                URLQueryItem(name: "scope", value: Self.scopes),
                URLQueryItem(name: "code_challenge", value: Self.codeChallenge(verifier)),
                URLQueryItem(name: "code_challenge_method", value: "S256"),
                URLQueryItem(name: "state", value: state),
                // Always re-consent so Google issues a refresh token.
                URLQueryItem(name: "prompt", value: "consent"),
                URLQueryItem(name: "access_type", value: "offline"),
            ]
            guard let url = components.url else { throw GmailError.other("Bad auth URL") }

            let callback = try await openWebAuth(url: url, scheme: WanderbotConfig.googleReversedClientID)
            let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
            func item(_ n: String) -> String? { items.first(where: { $0.name == n })?.value }
            if let err = item("error") { throw GmailError.other("Google: \(err)") }
            guard item("state") == state, let code = item("code") else {
                throw GmailError.other("OAuth state mismatch or missing code.")
            }

            let fresh = try await Self.exchangeCode(code, verifier: verifier)
            tokens = fresh

            // Mirror to RTDB so ConnectionsStore (and the web) light up.
            _ = await rtdb?.put(
                GmailConnection(email: fresh.email, connectedAt: Date().timeIntervalSince1970 * 1000),
                at: "wanderbot/connections/gmail"
            )
        } catch let e as GmailError {
            if case .cancelled = e { return }
            lastError = e.errorDescription
        } catch {
            lastError = error.localizedDescription
        }
    }

    /// Drop tokens locally and clear the shared connection node.
    func disconnect() async {
        tokens = nil
        _ = await rtdb?.delete(at: "wanderbot/connections/gmail")
    }

    // MARK: - Token exchange / refresh

    private static func exchangeCode(_ code: String, verifier: String) async throws -> Tokens {
        let json = try await postToken([
            "client_id": WanderbotConfig.googleOAuthClientID,
            "code": code,
            "code_verifier": verifier,
            "grant_type": "authorization_code",
            "redirect_uri": WanderbotConfig.googleRedirectURI,
        ])
        guard let access = json["access_token"] as? String,
              let refresh = json["refresh_token"] as? String
        else { throw GmailError.other("Token exchange returned no refresh token — try again.") }
        let expiresIn = (json["expires_in"] as? Double) ?? 3500
        let email = (json["id_token"] as? String).flatMap(Self.emailFromIDToken) ?? "connected"
        return Tokens(accessToken: access, refreshToken: refresh,
                      expiresAt: Date().timeIntervalSince1970 + expiresIn - 60,
                      email: email)
    }

    /// Return a live access token, refreshing through the stored
    /// refresh token when the current one is stale.
    private func validAccessToken() async throws -> String {
        guard var current = tokens else { throw GmailError.notConnected }
        if Date().timeIntervalSince1970 < current.expiresAt {
            return current.accessToken
        }
        let json = try await Self.postToken([
            "client_id": WanderbotConfig.googleOAuthClientID,
            "refresh_token": current.refreshToken,
            "grant_type": "refresh_token",
        ])
        guard let access = json["access_token"] as? String else {
            throw GmailError.other("Token refresh failed — reconnect Gmail in Settings.")
        }
        current.accessToken = access
        current.expiresAt = Date().timeIntervalSince1970 + ((json["expires_in"] as? Double) ?? 3500) - 60
        tokens = current
        return access
    }

    private static func postToken(_ fields: [String: String]) async throws -> [String: Any] {
        var components = URLComponents()
        components.queryItems = fields.map { URLQueryItem(name: $0.key, value: $0.value) }
        var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = (components.percentEncodedQuery ?? "").data(using: .utf8)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw GmailError.http((response as? HTTPURLResponse)?.statusCode ?? -1,
                                  String(data: data, encoding: .utf8) ?? "")
        }
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    /// Pull the `email` claim out of an OIDC id_token (JWT) payload.
    private static func emailFromIDToken(_ jwt: String) -> String? {
        let segments = jwt.split(separator: ".")
        guard segments.count >= 2 else { return nil }
        var b64 = String(segments[1]).replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        return json["email"] as? String
    }

    // MARK: - Gmail REST

    /// Search the inbox and return decoded message summaries.
    func searchEmails(query: String, maxResults: Int) async throws -> [EmailSummary] {
        let token = try await validAccessToken()
        var list = URLComponents(string: "https://gmail.googleapis.com/gmail/v1/users/me/messages")!
        list.queryItems = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "maxResults", value: String(max(1, min(maxResults, 20)))),
        ]
        let ids = try await Self.getJSON(list.url!, token: token)
        let messages = (ids["messages"] as? [[String: Any]]) ?? []

        var out: [EmailSummary] = []
        for m in messages {
            guard let id = m["id"] as? String else { continue }
            let url = URL(string: "https://gmail.googleapis.com/gmail/v1/users/me/messages/\(id)?format=full")!
            guard let full = try? await Self.getJSON(url, token: token),
                  let payload = full["payload"] as? [String: Any] else { continue }
            let headers = (payload["headers"] as? [[String: Any]]) ?? []
            func header(_ n: String) -> String {
                (headers.first { ($0["name"] as? String)?.caseInsensitiveCompare(n) == .orderedSame }?["value"] as? String) ?? ""
            }
            let body = Self.extractBody(payload) ?? (full["snippet"] as? String) ?? ""
            out.append(EmailSummary(
                from: header("From"), subject: header("Subject"),
                date: header("Date"), body: body
            ))
        }
        return out
    }

    private static func getJSON(_ url: URL, token: String) async throws -> [String: Any] {
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw GmailError.http((response as? HTTPURLResponse)?.statusCode ?? -1,
                                  String(data: data, encoding: .utf8) ?? "")
        }
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    /// Walk the MIME tree: prefer text/plain, fall back to de-tagged
    /// text/html. Gmail bodies are base64url.
    private static func extractBody(_ payload: [String: Any]) -> String? {
        var plain: String?
        var html: String?

        func walk(_ part: [String: Any]) {
            let mime = (part["mimeType"] as? String) ?? ""
            if let body = part["body"] as? [String: Any],
               let data = body["data"] as? String,
               let decoded = decodeB64URL(data) {
                if mime == "text/plain", plain == nil { plain = decoded }
                if mime == "text/html", html == nil { html = decoded }
            }
            for sub in (part["parts"] as? [[String: Any]]) ?? [] { walk(sub) }
        }
        walk(payload)

        if let plain, !plain.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return plain }
        if let html { return stripHTML(html) }
        return nil
    }

    private static func decodeB64URL(_ s: String) -> String? {
        var b64 = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func stripHTML(_ html: String) -> String {
        var text = html
        for pattern in ["<script[\\s\\S]*?</script>", "<style[\\s\\S]*?</style>", "<[^>]+>"] {
            text = text.replacingOccurrences(of: pattern, with: " ", options: [.regularExpression, .caseInsensitive])
        }
        text = text
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&quot;", with: "\"")
        return text.replacingOccurrences(of: "\\s{2,}", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - Web auth + PKCE helpers

    private func openWebAuth(url: URL, scheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<URL, Error>) in
            var resumed = false
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { url, error in
                guard !resumed else { return }
                resumed = true
                if let url { cont.resume(returning: url) }
                else if let error, (error as NSError).code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                    cont.resume(throwing: GmailError.cancelled)
                } else {
                    cont.resume(throwing: GmailError.other(error?.localizedDescription ?? "Auth failed"))
                }
            }
            session.presentationContextProvider = self
            self.webSession = session
            if !session.start(), !resumed {
                resumed = true
                cont.resume(throwing: GmailError.other("Could not open the sign-in browser."))
            }
        }
    }

    private static func randomToken(_ length: Int) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var out = ""
        while out.count < length {
            var bytes = [UInt8](repeating: 0, count: 16)
            _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
            for b in bytes where out.count < length && b < charset.count {
                out.append(charset[Int(b)])
            }
        }
        return out
    }

    private static func codeChallenge(_ verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return Data(digest).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

extension GmailConnector: ASWebAuthenticationPresentationContextProviding {
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            return scenes.flatMap(\.windows).first(where: \.isKeyWindow)
                ?? scenes.flatMap(\.windows).first
                ?? ASPresentationAnchor()
        }
    }
}

/// Minimal Keychain wrapper for token blobs.
private enum Keychain {
    static func set(_ data: Data, key: String) {
        delete(key: key)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    static func get(key: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }

    static func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
