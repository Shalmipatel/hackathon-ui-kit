import Foundation
import AuthenticationServices
import CryptoKit
import UIKit

/// Firebase Auth-backed sign-in. Both providers go fully native —
/// no web bridge, no third-party cookie dependencies.
///
///   - **Apple** uses `ASAuthorizationAppleIDProvider` to get an
///     identity token + nonce on-device.
///   - **Google** drives Google's OAuth 2.0 endpoint in
///     `ASWebAuthenticationSession` with PKCE, then exchanges the
///     auth code for a Google id_token at oauth2.googleapis.com/token.
///
/// In both cases the provider's id_token is POSTed to Firebase's
/// Identity Toolkit `accounts:signInWithIdp` REST endpoint, which
/// returns a Firebase user + ID/refresh token.
///
/// Identity is stored in UserDefaults so signed-in state survives
/// launches.
@MainActor
final class AuthStore: NSObject, ObservableObject {
    struct User: Codable, Equatable {
        let uid: String
        var email: String?
        var fullName: String?
        var idToken: String?
        var refreshToken: String?

        var displayName: String {
            if let fullName, !fullName.isEmpty { return fullName }
            if let email, let local = email.split(separator: "@").first {
                return String(local)
            }
            return "Signed in"
        }
    }

    enum Provider: String, CaseIterable {
        case apple
        case google
    }

    enum SignInError: Error, LocalizedError {
        case missingConfig
        case cancelled
        case missingToken
        case other(String)

        var errorDescription: String? {
            switch self {
            case .missingConfig: return "Auth host not configured."
            case .cancelled: return "Sign-in cancelled."
            case .missingToken: return "Sign-in returned no token."
            case .other(let m): return m
            }
        }
    }

    @Published private(set) var user: User?
    @Published private(set) var isSigningIn = false
    @Published var lastError: String?

    var isSignedIn: Bool { user != nil }

    /// Held strongly because both ASWebAuthenticationSession and
    /// ASAuthorizationController deallocate the moment we stop
    /// referencing them.
    private var webSession: ASWebAuthenticationSession?
    private var appleController: ASAuthorizationController?
    private var appleContinuation: CheckedContinuation<ASAuthorizationAppleIDCredential, Error>?
    /// Raw nonce passed to Apple — we hash it for the Apple request
    /// and send the raw form to Firebase so it can verify.
    private var appleRawNonce: String?

    override init() {
        super.init()
        let stored = Self.loadStored()
        self.user = stored
        // Make the persisted token available to RTDB immediately on cold
        // launch; the provider refreshes it (it's likely expired) before
        // the first authenticated request.
        if let stored {
            Task { await FirebaseAuthToken.shared.seed(idToken: stored.idToken,
                                                        refreshToken: stored.refreshToken) }
        }
    }

    func signIn(with provider: Provider) async {
        isSigningIn = true
        lastError = nil
        defer { isSigningIn = false }
        do {
            let signedIn: User
            switch provider {
            case .apple:  signedIn = try await signInWithApple()
            case .google: signedIn = try await signInWithGoogle()
            }
            self.user = signedIn
            Self.persist(signedIn)
            await FirebaseAuthToken.shared.seed(idToken: signedIn.idToken,
                                                refreshToken: signedIn.refreshToken)
        } catch let err as SignInError {
            if case .cancelled = err { return } // user-initiated, silent
            lastError = err.errorDescription
        } catch {
            lastError = error.localizedDescription
        }
    }

    func signOut() {
        user = nil
        Self.clearStored()
        Task { await FirebaseAuthToken.shared.clear() }
    }

    // MARK: - Native Apple

    private func signInWithApple() async throws -> User {
        let appleCredential = try await runAppleAuthorization()
        guard let identityTokenData = appleCredential.identityToken,
              let idToken = String(data: identityTokenData, encoding: .utf8),
              let rawNonce = appleRawNonce
        else { throw SignInError.missingToken }
        appleRawNonce = nil

        let firebaseUser = try await exchangeWithFirebase(
            providerID: "apple.com",
            idToken: idToken,
            rawNonce: rawNonce
        )
        // Apple only returns full name on the FIRST sign-in for the
        // Apple ID + app pair, so prefer whatever Apple gave us and
        // fall back to what Firebase returned.
        let appleName = formatName(appleCredential.fullName)
        return User(
            uid: firebaseUser.uid,
            email: appleCredential.email ?? firebaseUser.email,
            fullName: appleName ?? firebaseUser.fullName,
            idToken: firebaseUser.idToken,
            refreshToken: firebaseUser.refreshToken
        )
    }

    private func runAppleAuthorization() async throws -> ASAuthorizationAppleIDCredential {
        let rawNonce = Self.randomNonce()
        appleRawNonce = rawNonce
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.email, .fullName]
        request.nonce = Self.sha256(rawNonce)

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        appleController = controller

        return try await withCheckedThrowingContinuation { cont in
            appleContinuation = cont
            controller.performRequests()
        }
    }

    // MARK: - Firebase REST exchange

    /// POST identitytoolkit.googleapis.com/v1/accounts:signInWithIdp
    /// — gives us a Firebase ID token + refresh token in exchange for
    /// a provider's OIDC id_token.
    private func exchangeWithFirebase(
        providerID: String,
        idToken: String,
        rawNonce: String?
    ) async throws -> User {
        let key = WanderbotConfig.firebaseAPIKey
        guard !key.isEmpty else { throw SignInError.missingConfig }
        let url = URL(string: "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=\(key)")!

        // postBody is form-encoded inside a JSON string per the IdP REST contract.
        var postBodyItems = [
            URLQueryItem(name: "id_token", value: idToken),
            URLQueryItem(name: "providerId", value: providerID),
        ]
        if let rawNonce { postBodyItems.append(URLQueryItem(name: "nonce", value: rawNonce)) }
        var components = URLComponents()
        components.queryItems = postBodyItems
        let postBody = components.percentEncodedQuery ?? ""

        let payload: [String: Any] = [
            "postBody": postBody,
            "requestUri": "https://\(Bundle.main.bundleIdentifier ?? "wanderbot")",
            "returnSecureToken": true,
            "returnIdpCredential": true,
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw SignInError.other("Firebase exchange failed (HTTP \(((response as? HTTPURLResponse)?.statusCode ?? 0))): \(body.prefix(200))")
        }
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw SignInError.other("Unexpected Firebase response")
        }
        guard let uid = json["localId"] as? String, let idToken = json["idToken"] as? String else {
            throw SignInError.missingToken
        }
        return User(
            uid: uid,
            email: json["email"] as? String,
            fullName: json["displayName"] as? String,
            idToken: idToken,
            refreshToken: json["refreshToken"] as? String
        )
    }

    // MARK: - Native Google (OAuth 2.0 + PKCE)

    private func signInWithGoogle() async throws -> User {
        let verifier = Self.randomCodeVerifier()
        let challenge = Self.codeChallenge(from: verifier)
        let state = Self.randomNonce(length: 32)
        let nonce = Self.randomNonce(length: 32)

        guard let authURL = Self.buildGoogleAuthURL(
            codeChallenge: challenge,
            state: state,
            nonce: nonce
        ) else { throw SignInError.missingConfig }

        try? await Task.sleep(nanoseconds: 200_000_000)

        let callbackURL = try await openWebAuth(
            url: authURL,
            callbackScheme: WanderbotConfig.googleReversedClientID
        )
        let (code, returnedState) = try Self.parseGoogleCallback(callbackURL)
        guard returnedState == state else {
            throw SignInError.other("OAuth state mismatch — possible CSRF attempt.")
        }

        let googleIDToken = try await exchangeGoogleCodeForIDToken(
            code: code,
            verifier: verifier
        )
        return try await exchangeWithFirebase(
            providerID: "google.com",
            idToken: googleIDToken,
            rawNonce: nil
        )
    }

    private static func buildGoogleAuthURL(
        codeChallenge: String,
        state: String,
        nonce: String
    ) -> URL? {
        guard !WanderbotConfig.googleOAuthClientID.isEmpty,
              var components = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")
        else { return nil }
        components.queryItems = [
            URLQueryItem(name: "client_id", value: WanderbotConfig.googleOAuthClientID),
            URLQueryItem(name: "redirect_uri", value: WanderbotConfig.googleRedirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid email profile"),
            URLQueryItem(name: "code_challenge", value: codeChallenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "nonce", value: nonce),
            // Force the account picker so signing in as a different
            // user is one tap, not a "remove account" detour.
            URLQueryItem(name: "prompt", value: "select_account"),
        ]
        return components.url
    }

    private static func parseGoogleCallback(_ url: URL) throws -> (code: String, state: String) {
        let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let items = comps?.queryItems ?? []
        func value(_ name: String) -> String? {
            items.first(where: { $0.name == name })?.value
        }
        if let err = value("error") {
            throw SignInError.other("Google sign-in error: \(err)")
        }
        guard let code = value("code"), let state = value("state") else {
            throw SignInError.missingToken
        }
        return (code, state)
    }

    /// POST oauth2.googleapis.com/token to swap the auth code for an
    /// id_token. iOS OAuth clients use PKCE (no client_secret).
    private func exchangeGoogleCodeForIDToken(code: String, verifier: String) async throws -> String {
        var components = URLComponents()
        components.queryItems = [
            URLQueryItem(name: "client_id", value: WanderbotConfig.googleOAuthClientID),
            URLQueryItem(name: "code", value: code),
            URLQueryItem(name: "code_verifier", value: verifier),
            URLQueryItem(name: "grant_type", value: "authorization_code"),
            URLQueryItem(name: "redirect_uri", value: WanderbotConfig.googleRedirectURI),
        ]
        let body = components.percentEncodedQuery ?? ""

        var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = body.data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let payload = String(data: data, encoding: .utf8) ?? ""
            throw SignInError.other("Google token exchange failed (HTTP \(((response as? HTTPURLResponse)?.statusCode ?? 0))): \(payload.prefix(200))")
        }
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let idToken = json["id_token"] as? String else {
            throw SignInError.missingToken
        }
        return idToken
    }

    // MARK: - Web auth runner (shared)

    /// Opens an ASWebAuthenticationSession and resumes with the
    /// final callback URL, mapping system errors to our SignInError
    /// shape. Single-shot resume guard prevents the double-resume
    /// crash that happens when session.start() fails AND the
    /// completion handler fires.
    private func openWebAuth(url: URL, callbackScheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<URL, Error>) in
            let resumer = ContinuationResumer<URL>(cont)
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: callbackScheme
            ) { url, error in
                if let url {
                    resumer.resume(.success(url))
                } else if let error {
                    let ns = error as NSError
                    if ns.domain == ASWebAuthenticationSessionError.errorDomain,
                       ns.code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                        resumer.resume(.failure(SignInError.cancelled))
                    } else {
                        resumer.resume(.failure(SignInError.other(error.localizedDescription)))
                    }
                } else {
                    resumer.resume(.failure(SignInError.other("Unknown sign-in result")))
                }
            }
            session.presentationContextProvider = self
            self.webSession = session
            if !session.start() {
                resumer.resume(.failure(SignInError.other("Could not open the sign-in browser.")))
            }
        }
    }

    // MARK: - Helpers

    private func formatName(_ components: PersonNameComponents?) -> String? {
        guard let components else { return nil }
        let formatter = PersonNameComponentsFormatter()
        formatter.style = .long
        let formatted = formatter.string(from: components).trimmingCharacters(in: .whitespacesAndNewlines)
        return formatted.isEmpty ? nil : formatted
    }

    private static func randomNonce(length: Int = 32) -> String {
        precondition(length > 0)
        let charset: [Character] = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remaining = length
        while remaining > 0 {
            var randoms = [UInt8](repeating: 0, count: 16)
            let status = SecRandomCopyBytes(kSecRandomDefault, randoms.count, &randoms)
            precondition(status == errSecSuccess, "SecRandomCopyBytes failed")
            for r in randoms where remaining > 0 {
                if r < charset.count {
                    result.append(charset[Int(r)])
                    remaining -= 1
                }
            }
        }
        return result
    }

    private static func sha256(_ input: String) -> String {
        let hashed = SHA256.hash(data: Data(input.utf8))
        return hashed.compactMap { String(format: "%02x", $0) }.joined()
    }

    /// PKCE code verifier — RFC 7636 demands 43-128 chars from
    /// `[A-Za-z0-9-._~]`. Our nonce charset includes all of those.
    private static func randomCodeVerifier() -> String {
        randomNonce(length: 64)
    }

    /// SHA-256(verifier), base64url-encoded without padding —
    /// the `S256` PKCE code challenge format.
    private static func codeChallenge(from verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return Data(digest).base64URLEncodedString()
    }

    // MARK: - Persistence

    private static let storageKey = "wanderbot.auth.user.v2"

    private static func loadStored() -> User? {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else { return nil }
        return try? JSONDecoder().decode(User.self, from: data)
    }

    private static func persist(_ user: User) {
        guard let data = try? JSONEncoder().encode(user) else { return }
        UserDefaults.standard.set(data, forKey: storageKey)
    }

    private static func clearStored() {
        UserDefaults.standard.removeObject(forKey: storageKey)
    }
}

// MARK: - ASAuthorizationControllerDelegate

extension AuthStore: ASAuthorizationControllerDelegate {
    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        Task { @MainActor in
            guard let cont = appleContinuation else { return }
            appleContinuation = nil
            if let cred = authorization.credential as? ASAuthorizationAppleIDCredential {
                cont.resume(returning: cred)
            } else {
                cont.resume(throwing: SignInError.missingToken)
            }
        }
    }

    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        Task { @MainActor in
            guard let cont = appleContinuation else { return }
            appleContinuation = nil
            let nsError = error as NSError
            if nsError.domain == ASAuthorizationError.errorDomain,
               nsError.code == ASAuthorizationError.canceled.rawValue {
                cont.resume(throwing: SignInError.cancelled)
            } else {
                cont.resume(throwing: SignInError.other(error.localizedDescription))
            }
        }
    }
}

// MARK: - Presentation context

extension AuthStore: ASWebAuthenticationPresentationContextProviding,
                    ASAuthorizationControllerPresentationContextProviding {
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        Self.currentPresentationAnchor()
    }

    nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        Self.currentPresentationAnchor()
    }

    nonisolated private static func currentPresentationAnchor() -> ASPresentationAnchor {
        // UIApplication isn't main-actor isolated but in practice you
        // need to read its scenes from the main thread. We're invoked
        // on the main thread by both AS callbacks, so MainActor.assumeIsolated
        // gives us safe access without async hops the API can't await.
        MainActor.assumeIsolated {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            if let keyWindow = scenes.flatMap({ $0.windows }).first(where: { $0.isKeyWindow }) {
                return keyWindow
            }
            if let anyWindow = scenes.flatMap({ $0.windows }).first {
                return anyWindow
            }
            return ASPresentationAnchor()
        }
    }
}

private extension Data {
    /// RFC 4648 §5 base64url (no padding) — what PKCE's S256 challenge
    /// format requires.
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

/// Wraps a `CheckedContinuation` so it can only be resumed once,
/// no matter how many code paths race to call it.
private final class ContinuationResumer<T>: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<T, Error>?

    init(_ continuation: CheckedContinuation<T, Error>) {
        self.continuation = continuation
    }

    func resume(_ result: Result<T, Error>) {
        lock.lock()
        let cont = continuation
        continuation = nil
        lock.unlock()
        guard let cont else { return }
        switch result {
        case .success(let v): cont.resume(returning: v)
        case .failure(let e): cont.resume(throwing: e)
        }
    }
}
