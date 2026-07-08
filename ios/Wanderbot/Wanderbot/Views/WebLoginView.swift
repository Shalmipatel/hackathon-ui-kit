import SwiftUI
import WebKit

/// Native login: the user signs in to a connected account inside a real
/// on-device WKWebView (smooth, native passkey/2FA/autofill — none of the
/// remote-screencast pain). On "Done" we read the webview's cookies
/// (including httpOnly session cookies, which `WKHTTPCookieStore` exposes)
/// plus localStorage, store them in RTDB, and the scans inject them into
/// Skyvern exactly as before.
///
/// Uses a non-persistent data store so each connect is a clean sign-in and
/// we only capture what happened in this session.
struct WebLoginView: View {
    let site: BrowserConnections.Site
    @Environment(\.dismiss) private var dismiss

    @StateObject private var model = WebLoginModel()
    @State private var saving = false

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                WebViewContainer(url: URL(string: site.loginURL), model: model)
                    .ignoresSafeArea(edges: .bottom)
                if model.isLoading {
                    ProgressView().padding(.top, 6)
                }
            }
            .navigationTitle("Sign in to \(site.title)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Done") { save() }
                        .disabled(saving)
                }
            }
            .safeAreaInset(edge: .bottom) {
                Text("Sign in, then tap Done. We store the session so scans stay logged in.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.inkMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(.ultraThinMaterial)
            }
        }
    }

    private func save() {
        saving = true
        Task {
            let cap = await model.capture()
            BrowserConnections.shared.completeWebLogin(
                site: site, finalURL: cap.finalURL,
                cookies: cap.cookies, origin: cap.origin, storageItems: cap.storage
            )
            saving = false
            dismiss()
        }
    }
}

/// Holds the live WKWebView and pulls credentials out of it on demand.
@MainActor
final class WebLoginModel: ObservableObject {
    @Published var isLoading = true
    weak var webView: WKWebView?

    struct Capture {
        var cookies: [[String: Any]]
        var storage: [String: String]
        var finalURL: String?
        var origin: String
    }

    func capture() async -> Capture {
        guard let webView else { return Capture(cookies: [], storage: [:], finalURL: nil, origin: "") }

        // Cookies — WKHTTPCookieStore returns httpOnly cookies too (unlike
        // document.cookie), which is exactly what the session cookie is.
        let httpCookies: [HTTPCookie] = await withCheckedContinuation { cont in
            webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { cont.resume(returning: $0) }
        }
        let cookies = httpCookies.map(Self.cdpCookie)

        // localStorage for the current origin.
        var storage: [String: String] = [:]
        if let json = try? await webView.evaluateJavaScript("JSON.stringify(localStorage)") as? String,
           let data = json.data(using: .utf8),
           let dict = try? JSONSerialization.jsonObject(with: data) as? [String: String] {
            storage = dict
        }

        let url = webView.url
        let origin = url.flatMap { u -> String? in
            guard let scheme = u.scheme, let host = u.host else { return nil }
            return "\(scheme)://\(host)"
        } ?? ""
        return Capture(cookies: cookies, storage: storage, finalURL: url?.absoluteString, origin: origin)
    }

    /// HTTPCookie → the CDP `Storage.setCookies` shape the injector reads.
    static func cdpCookie(_ c: HTTPCookie) -> [String: Any] {
        var d: [String: Any] = [
            "name": c.name, "value": c.value,
            "domain": c.domain, "path": c.path, "secure": c.isSecure,
        ]
        if let exp = c.expiresDate { d["expires"] = exp.timeIntervalSince1970 }
        switch c.sameSitePolicy {
        case .some(.sameSiteStrict): d["sameSite"] = "Strict"
        case .some(.sameSiteLax): d["sameSite"] = "Lax"
        default: break
        }
        return d
    }
}

private struct WebViewContainer: UIViewRepresentable {
    let url: URL?
    let model: WebLoginModel

    func makeCoordinator() -> Coordinator { Coordinator(model: model) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        // Clean, isolated sign-in — capture only this session's cookies.
        config.websiteDataStore = .nonPersistent()
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        model.webView = webView
        if let url { webView.load(URLRequest(url: url)) }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate {
        let model: WebLoginModel
        init(model: WebLoginModel) { self.model = model }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            Task { @MainActor in model.isLoading = true }
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            Task { @MainActor in model.isLoading = false }
        }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            Task { @MainActor in model.isLoading = false }
        }
    }
}
