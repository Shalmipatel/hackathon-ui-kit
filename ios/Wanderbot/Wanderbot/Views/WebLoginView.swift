import SwiftUI
import WebKit

/// Native login: the user signs in to a connected account inside a real
/// on-device WKWebView (smooth, native passkey/2FA/autofill — none of the
/// remote-screencast pain). On "Done" we read the webview's cookies
/// (including httpOnly session cookies, which `WKHTTPCookieStore` exposes)
/// plus localStorage, store them in RTDB, and the scans inject them into
/// Skyvern exactly as before.
///
/// SSO ("Sign in with Google/Apple") needs two things a bare WKWebView
/// lacks, both handled here:
///  • a real mobile-Safari user-agent — WKWebView's default UA omits the
///    `Version/… Safari/…` tokens, which is how Google flags "embedded
///    browser, may not be secure" and blocks the flow.
///  • popup handling — the SSO button calls `window.open(...)`; we open that
///    in a child webview sharing the same cookie store so the OAuth redirect
///    and postMessage-back-to-opener complete.
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

                // OAuth popup (Sign in with Google/Apple) — overlays the sheet
                // and auto-dismisses when the provider closes the window.
                if let popup = model.popup {
                    PopupOverlay(popup: popup) { model.closePopup() }
                        .transition(.opacity)
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
    /// Non-nil while an SSO popup (Google/Apple) is open.
    @Published var popup: WKWebView?
    weak var webView: WKWebView?

    /// Real mobile-Safari UA so Google/Apple don't flag the embedded browser.
    static let safariUA =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
        + "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"

    struct Capture {
        var cookies: [[String: Any]]
        var storage: [String: String]
        var finalURL: String?
        var origin: String
    }

    func closePopup() { popup = nil }

    func capture() async -> Capture {
        guard let webView else { return Capture(cookies: [], storage: [:], finalURL: nil, origin: "") }

        // Cookies — WKHTTPCookieStore returns httpOnly cookies too (unlike
        // document.cookie), which is exactly what the session cookie is.
        // The popup shares this store, so SSO cookies are included.
        let httpCookies: [HTTPCookie] = await withCheckedContinuation { cont in
            webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { cont.resume(returning: $0) }
        }
        let cookies = httpCookies.map(Self.cdpCookie)

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
        let webView = WKWebView(frame: .zero, configuration: Self.freshConfig())
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.customUserAgent = WebLoginModel.safariUA
        webView.allowsBackForwardNavigationGestures = true
        model.webView = webView
        if let url { webView.load(URLRequest(url: url)) }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    /// Non-persistent store so each connect is a clean sign-in and we capture
    /// only this session. Popups reuse the passed configuration → same store.
    static func freshConfig() -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        return config
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
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

        // SSO popup: open window.open(...) in a child webview that SHARES the
        // opener's configuration (same cookie store + opener relationship), so
        // Google/Apple OAuth redirects and postMessage back to the opener work.
        func webView(_ webView: WKWebView,
                     createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction,
                     windowFeatures: WKWindowFeatures) -> WKWebView? {
            let popup = WKWebView(frame: webView.bounds, configuration: configuration)
            popup.navigationDelegate = self
            popup.uiDelegate = self
            popup.customUserAgent = WebLoginModel.safariUA
            Task { @MainActor in model.popup = popup }
            return popup
        }

        // Provider closed the OAuth window → tear down the popup.
        func webViewDidClose(_ webView: WKWebView) {
            Task { @MainActor in if model.popup === webView { model.popup = nil } }
        }
    }
}

/// Full-bleed host for an SSO popup webview, with a Close affordance.
private struct PopupOverlay: View {
    let popup: WKWebView
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(Theme.inkMuted)
                        .padding(10)
                }
            }
            .background(.ultraThinMaterial)
            PopupWebView(webView: popup)
        }
        .background(Theme.background)
    }
}

private struct PopupWebView: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
