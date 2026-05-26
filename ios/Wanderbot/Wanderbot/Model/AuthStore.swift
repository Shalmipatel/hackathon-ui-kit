import Foundation
import AuthenticationServices

/// Firebase Auth-backed sign-in via a web bridge page.
///
/// Why a web bridge: the iOS app deliberately avoids the Firebase
/// iOS SDK (no Swift Package surgery in the hand-rolled pbxproj).
/// `<webHost>/auth.html` already lives in the same project, uses the
/// existing Firebase JS SDK, and drives Firebase Auth's
/// `signInWithRedirect` for both providers. We open it inside
/// `ASWebAuthenticationSession`, which is the iOS-native browser
/// view that intercepts our custom URL scheme on return.
///
/// User data (uid, email, name, Firebase ID + refresh tokens) is
/// stored in UserDefaults so the signed-in state survives launches.
/// Token refresh is out of scope for v1 — the id token is good for
/// ~1 hour, which is enough for the cross-device display we care
/// about today.
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

    var isSignedIn: Bool { user != nil }

    /// In-flight authentication session. Held strongly because
    /// ASWebAuthenticationSession deallocates the moment we stop
    /// referencing it.
    private var session: ASWebAuthenticationSession?

    override init() {
        super.init()
        self.user = Self.loadStored()
    }

    /// Open the web bridge. The bridge page shows the provider
    /// chooser (Google + Apple) itself — iOS doesn't pre-pick one,
    /// so the user only sees the buttons once, on the web side.
    func signIn() async {
        isSigningIn = true
        defer { isSigningIn = false }
        do {
            let user = try await runWebAuth()
            self.user = user
            Self.persist(user)
        } catch let err as SignInError where err.localizedDescription == SignInError.cancelled.localizedDescription {
            // user-initiated, no UI alert needed
        } catch {
            print("[auth] sign-in failed:", error)
        }
    }

    func signOut() {
        user = nil
        Self.clearStored()
    }

    // MARK: - Web auth round-trip

    private func runWebAuth() async throws -> User {
        guard let authURL = Self.buildBridgeURL() else {
            throw SignInError.missingConfig
        }
        // The presentation anchor isn't ready the instant the gate
        // view appears — wait a beat so the key window is mounted.
        // Without this, session.start() returns false and the
        // continuation resume races with the completion handler's
        // resume (Swift treats that as a fatal SWIFT TASK
        // CONTINUATION MISUSE).
        try? await Task.sleep(nanoseconds: 200_000_000)

        let callback = try await withCheckedThrowingContinuation { (cont: CheckedContinuation<URL, Error>) in
            let scheme = WanderbotConfig.authReturnScheme
            // Single-shot resume guard. ASWebAuthenticationSession's
            // completion handler can still fire when start() fails,
            // so both paths must funnel through one resume call.
            let resumer = ContinuationResumer<URL>(cont)
            let session = ASWebAuthenticationSession(
                url: authURL,
                callbackURLScheme: scheme
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
            // Don't use prefersEphemeralWebBrowserSession here.
            // Firebase's signInWithRedirect bounces wanderbot-ai.vercel.app
            // → firebaseapp.com/__/auth/handler → OAuth provider → back,
            // and the return trip relies on the auth handler's
            // storage to retrieve the credential. An ephemeral session
            // isolates per-origin storage, which is enough to make
            // getRedirectResult return null on the second load — the
            // user signs in but lands back on the chooser. With the
            // default (shared with Safari) session, the user sees a
            // one-time "Wanderbot wants to use 'firebaseapp.com' to
            // sign you in" prompt, but the round-trip actually works.
            self.session = session
            let started = session.start()
            if !started {
                resumer.resume(.failure(SignInError.other("Could not open the sign-in browser.")))
            }
        }
        return try Self.parseCallback(callback)
    }

    /// Build the bridge URL the web page expects. Only carries the
    /// iOS return scheme; the bridge page picks the provider itself.
    private static func buildBridgeURL() -> URL? {
        guard !WanderbotConfig.authBridgeURL.isEmpty,
              var components = URLComponents(string: WanderbotConfig.authBridgeURL)
        else { return nil }
        let ret = "\(WanderbotConfig.authReturnScheme)://auth"
        var items = components.queryItems ?? []
        items.append(URLQueryItem(name: "return", value: ret))
        components.queryItems = items
        return components.url
    }

    private static func parseCallback(_ url: URL) throws -> User {
        let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let items = comps?.queryItems ?? []
        func value(_ name: String) -> String? {
            items.first(where: { $0.name == name })?.value
        }
        guard let uid = value("uid"), let idToken = value("idToken"), !idToken.isEmpty else {
            throw SignInError.missingToken
        }
        return User(
            uid: uid,
            email: value("email").flatMap { $0.isEmpty ? nil : $0 },
            fullName: value("name").flatMap { $0.isEmpty ? nil : $0 },
            idToken: idToken,
            refreshToken: value("refreshToken")
        )
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

extension AuthStore: ASWebAuthenticationPresentationContextProviding {
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        // Pick the topmost active key window. SwiftUI apps don't surface
        // this directly, so we walk the connected scenes. Falling back
        // to a brand-new ASPresentationAnchor() makes start() fail
        // silently, so we instead try any window from any scene before
        // giving up.
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

/// Wraps a `CheckedContinuation` so it can only be resumed once,
/// no matter how many code paths race to call it. ASWebAuthenticationSession's
/// completion handler can fire even after a synchronous `start()`
/// failure, so both paths funnel through this guard.
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
