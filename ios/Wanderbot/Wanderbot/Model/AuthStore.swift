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

    enum Provider: String {
        case google
        case apple
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

    func signIn(with provider: Provider) async {
        isSigningIn = true
        defer { isSigningIn = false }
        do {
            let user = try await runWebAuth(provider: provider)
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

    private func runWebAuth(provider: Provider) async throws -> User {
        guard let authURL = Self.buildBridgeURL(provider: provider) else {
            throw SignInError.missingConfig
        }
        let callback = try await withCheckedThrowingContinuation { (cont: CheckedContinuation<URL, Error>) in
            let scheme = WanderbotConfig.authReturnScheme
            let session = ASWebAuthenticationSession(
                url: authURL,
                callbackURLScheme: scheme
            ) { url, error in
                if let url { cont.resume(returning: url) }
                else if let error {
                    let ns = error as NSError
                    if ns.domain == ASWebAuthenticationSessionError.errorDomain,
                       ns.code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                        cont.resume(throwing: SignInError.cancelled)
                    } else {
                        cont.resume(throwing: SignInError.other(error.localizedDescription))
                    }
                } else {
                    cont.resume(throwing: SignInError.other("Unknown sign-in result"))
                }
            }
            session.presentationContextProvider = self
            // Privacy-respecting session: don't share cookies with
            // Safari, so signing out clears state cleanly.
            session.prefersEphemeralWebBrowserSession = true
            self.session = session
            let started = session.start()
            if !started {
                cont.resume(throwing: SignInError.other("Could not open the sign-in browser."))
            }
        }
        return try Self.parseCallback(callback)
    }

    /// Build the bridge URL the web page expects. Adds the iOS return
    /// scheme so the bridge knows where to bounce us back.
    private static func buildBridgeURL(provider: Provider) -> URL? {
        guard !WanderbotConfig.authBridgeURL.isEmpty,
              var components = URLComponents(string: WanderbotConfig.authBridgeURL)
        else { return nil }
        let ret = "\(WanderbotConfig.authReturnScheme)://auth"
        var items = components.queryItems ?? []
        items.append(URLQueryItem(name: "provider", value: provider.rawValue))
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
        // this directly, so we walk the connected scenes.
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let anchor = scenes
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ?? scenes.first?.windows.first
        return anchor ?? ASPresentationAnchor()
    }
}
