import SwiftUI
import UIKit

/// In-app live view of a Skyvern cloud browser (noVNC-style), driven over
/// raw Chrome DevTools Protocol:
///   frames  ← Page.startScreencast (base64 JPEG stream)
///   taps    → Input.dispatchMouseEvent
///   typing  → Input.insertText / key events
///
/// Used for connecting accounts that need a real login (Google SSO,
/// 2FA…): the traveler signs in *themselves* inside the remote browser,
/// taps "I'm done", and the logged-in cookies persist in the site's
/// Skyvern browser profile for future agent syncs.
struct RemoteBrowserView: View {
    let site: BrowserConnections.Site
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var browser = BrowserConnections.shared
    @StateObject private var cdp = CDPScreencastClient()

    @State private var session: BrowserConnections.LiveSession?
    @State private var startupError: String?
    @State private var typed = ""
    /// Extra apps logged into during THIS session (multi-app login) —
    /// all get connected by the single snapshot at "I'm done".
    @State private var extraSites: [BrowserConnections.Site] = []
    @State private var showAddApp = false
    @State private var newAppName = ""
    /// Secure-entry mode: SecureField + password contentType, so iOS
    /// offers the Passwords AutoFill button above the keyboard.
    @State private var secureEntry = false
    /// Set by done/cancel — anything else that dismisses the view (swipe,
    /// deep link, crash-adjacent teardown) closes the session too.
    @State private var sessionHandled = false
    @State private var donePulse = false
    @FocusState private var keyboardFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            header

            // Slim indeterminate bar while the remote page loads.
            ZStack(alignment: .leading) {
                Color.white.opacity(0.08)
                if cdp.isLoading {
                    LoadingBar()
                }
            }
            .frame(height: 2.5)

            ZStack {
                Color.black
                if let frame = cdp.frame {
                    RemoteScreen(frame: frame, cdp: cdp, onTap: {
                        // New focus target — the local buffer no longer
                        // mirrors the remote field, so start fresh.
                        typed = ""
                    })
                } else if let startupError {
                    VStack(spacing: 10) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 28))
                            .foregroundStyle(.white.opacity(0.7))
                        Text(startupError)
                            .font(.system(size: 14))
                            .foregroundStyle(.white.opacity(0.85))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 32)
                    }
                } else {
                    VStack(spacing: 14) {
                        ProgressView().tint(.white)
                        Text(cdp.status)
                            .font(.system(size: 14))
                            .foregroundStyle(.white.opacity(0.85))
                        Text("Starting a secure browser can take a minute…")
                            .font(.system(size: 12))
                            .foregroundStyle(.white.opacity(0.5))
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            controls
        }
        .background(Color.black.ignoresSafeArea())
        .task { await start() }
        .onDisappear {
            cdp.disconnect()
            // Leak-proofing: no exit path leaves the cloud browser running.
            if !sessionHandled, let session {
                Task { await browser.cancelLogin(session: session) }
            }
        }
    }

    private var header: some View {
        HStack {
            Button("Cancel") {
                sessionHandled = true
                Task {
                    if let session { await browser.cancelLogin(session: session) }
                    dismiss()
                }
            }
            .font(.system(size: 15))
            .foregroundStyle(.white.opacity(0.85))

            Spacer()
            VStack(spacing: 1) {
                Text("Log in to \(site.title)")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                Text(currentHost ?? "Secure remote browser")
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.5))
                    .lineLimit(1)
            }
            Spacer()

            Button {
                Task { await finish() }
            } label: {
                Text("I'm done")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 14).padding(.vertical, 6)
                    .background(Capsule().fill(Theme.brandYellow))
                    .scaleEffect(donePulse ? 1.08 : 1.0)
                    .animation(
                        cdp.likelySignedIn
                            ? .easeInOut(duration: 0.55).repeatForever(autoreverses: true)
                            : .default,
                        value: donePulse
                    )
            }
            .disabled(session == nil)
            .onChange(of: cdp.likelySignedIn) { _, signedIn in
                donePulse = signedIn
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    /// Live keyboard bar. Fully automatic: tapping an input in the remote
    /// browser focuses this field in the matching mode (password fields
    /// switch to secure entry, which is what makes iOS offer the Passwords
    /// AutoFill button above the keyboard). Keystrokes forward live.
    private var controls: some View {
        VStack(spacing: 6) {
            if cdp.likelySignedIn {
                HStack(spacing: 8) {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 12, weight: .semibold))
                        Text("Signed in — tap \"I'm done\" to save")
                            .font(.system(size: 12, weight: .semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .foregroundStyle(.black)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(Capsule().fill(Theme.brandYellow))

                    // Chain logins: jump to the next app in the SAME
                    // browser — SSO cookies are live, so it's one tap.
                    Button {
                        showAddApp = true
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "plus")
                                .font(.system(size: 11, weight: .bold))
                            Text("Add app")
                                .font(.system(size: 12, weight: .semibold))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 11).padding(.vertical, 7)
                        .background(Capsule().fill(.white.opacity(0.14)))
                    }
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            if secureEntry {
                HStack(spacing: 5) {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 10, weight: .semibold))
                    Text("Password field — AutoFill available above the keyboard")
                        .font(.system(size: 11.5, weight: .medium))
                }
                .foregroundStyle(Theme.brandYellow)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 4)
            }

            HStack(spacing: 8) {
                Button {
                    cdp.reload()
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.9))
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(.white.opacity(0.10)))
                }
                .accessibilityLabel("Reload page")

                Group {
                    if secureEntry {
                        SecureField("Password", text: $typed)
                            .textContentType(.password)
                    } else {
                        TextField("Tap a field above to type", text: $typed)
                            .textContentType(.username)
                    }
                }
                .focused($keyboardFocused)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(size: 15))
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 21, style: .continuous)
                        .fill(.white.opacity(keyboardFocused ? 0.16 : 0.10))
                )
                .foregroundStyle(.white)
                .onChange(of: typed) { old, new in
                    forwardDiff(from: old, to: new)
                }
                .onSubmit {
                    cdp.pressKey(.enter)
                    typed = ""
                }

                // Manual mode override — the auto-detection is a
                // heuristic; when it misses, one tap forces password
                // mode (which is what makes AutoFill insert the
                // password, not the email).
                Button {
                    typed = ""
                    secureEntry.toggle()
                    keyboardFocused = true
                } label: {
                    Image(systemName: secureEntry ? "lock.fill" : "lock.open")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(secureEntry ? Theme.brandYellow : .white.opacity(0.9))
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(.white.opacity(0.10)))
                }
                .accessibilityLabel(secureEntry ? "Password entry on" : "Switch to password entry")

                Button {
                    cdp.pressKey(.backspace)
                } label: {
                    Image(systemName: "delete.left")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.9))
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(.white.opacity(0.10)))
                }

                Button {
                    cdp.pressKey(.enter)
                    typed = ""
                } label: {
                    Image(systemName: "arrow.turn.down.left")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(.black)
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(Theme.brandYellow))
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color.black)
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: cdp.likelySignedIn)
        // The remote page tells us what got focused — mirror it here so
        // the right keyboard appears without the user doing anything.
        .onChange(of: cdp.focusedInputType) { _, type in
            typed = ""
            if type == "password" {
                secureEntry = true
                keyboardFocused = true
            } else if !type.isEmpty {
                secureEntry = false
                keyboardFocused = true
            } else {
                keyboardFocused = false
                secureEntry = false
            }
        }
    }

    private var currentHost: String? {
        guard let url = cdp.currentURL, var host = URL(string: url)?.host else { return nil }
        if host.hasPrefix("www.") { host.removeFirst(4) }
        return host
    }

    /// Forward the local text change to the remote browser: appended
    /// characters → insertText; deletions → backspaces. (Mid-string
    /// cursor edits degrade to delete-and-retype, which is fine for
    /// login fields.)
    private func forwardDiff(from old: String, to new: String) {
        if new.hasPrefix(old) {
            let appended = String(new.dropFirst(old.count))
            if !appended.isEmpty { cdp.type(text: appended) }
        } else if old.hasPrefix(new) {
            for _ in 0..<(old.count - new.count) { cdp.pressKey(.backspace) }
        } else {
            // Rewrite: clear what we typed, then send the new string.
            for _ in 0..<old.count { cdp.pressKey(.backspace) }
            if !new.isEmpty { cdp.type(text: new) }
        }
    }

    private func start() async {
        do {
            let live = try await browser.beginLogin(site: site)
            session = live
            // Seed with saved credentials so the browser starts signed in
            // (SSO becomes one tap; token sites stay logged in).
            cdp.connect(to: live.cdpURL, initialURL: site.loginURL,
                        cookies: browser.cookieJar(), storage: browser.storageSeed())
        } catch {
            startupError = (error as? BrowserConnections.Err)?.message ?? error.localizedDescription
        }
    }

    private func finish() async {
        guard let session else { return }
        sessionHandled = true
        let finalURL = cdp.currentURL
        let providers = Array(cdp.providersSeen)
        // Export the session credentials (the "save") — instant.
        let captured = await cdp.captureSession()
        cdp.disconnect()
        browser.finishLogin(site: site, session: session, finalURL: finalURL,
                            providers: providers, cookies: captured.cookies,
                            origin: captured.origin, storageItems: captured.items)
        dismiss()
    }
}

/// Indeterminate loading shimmer — a yellow segment sweeping the width.
private struct LoadingBar: View {
    @State private var sweep = false

    var body: some View {
        GeometryReader { geo in
            Capsule()
                .fill(Theme.brandYellow)
                .frame(width: geo.size.width * 0.35)
                .offset(x: sweep ? geo.size.width : -geo.size.width * 0.35)
                .animation(.linear(duration: 0.9).repeatForever(autoreverses: false), value: sweep)
                .onAppear { sweep = true }
        }
        .clipped()
    }
}

/// The streamed remote screen: renders frames, maps taps and scrolls back
/// into page coordinates.
private struct RemoteScreen: View {
    let frame: UIImage
    @ObservedObject var cdp: CDPScreencastClient
    var onTap: () -> Void = {}
    @State private var lastDrag: CGSize = .zero

    var body: some View {
        GeometryReader { geo in
            let fit = fittedRect(in: geo.size)
            Image(uiImage: frame)
                .resizable()
                .frame(width: fit.width, height: fit.height)
                .position(x: geo.size.width / 2, y: geo.size.height / 2)
                .contentShape(Rectangle())
                .gesture(
                    SpatialTapGesture().onEnded { value in
                        guard let page = pagePoint(value.location, fit: fit, in: geo.size) else { return }
                        cdp.click(at: page)
                        onTap()
                    }
                )
                .simultaneousGesture(
                    DragGesture(minimumDistance: 8)
                        .onChanged { value in
                            let deltaY = value.translation.height - lastDrag.height
                            lastDrag = value.translation
                            if let page = pagePoint(value.location, fit: fit, in: geo.size) {
                                // Natural scrolling: finger down = scroll up.
                                cdp.scroll(at: page, deltaY: -deltaY * (cdp.pageSize.height / fit.height))
                            }
                        }
                        .onEnded { _ in lastDrag = .zero }
                )
                .simultaneousGesture(
                    // Pinch → zooms the REMOTE page; tap mapping adapts
                    // automatically via the page scale in frame metadata.
                    MagnifyGesture()
                        .onEnded { value in
                            let center = pagePoint(value.startLocation, fit: fit, in: geo.size)
                                ?? CGPoint(x: cdp.pageSize.width / 2, y: cdp.pageSize.height / 2)
                            cdp.pinch(at: center, scale: value.magnification)
                        }
                )
        }
    }

    /// Aspect-fit rect of the frame inside the container.
    private func fittedRect(in container: CGSize) -> CGSize {
        let imageAspect = frame.size.width / max(frame.size.height, 1)
        let boxAspect = container.width / max(container.height, 1)
        if imageAspect > boxAspect {
            return CGSize(width: container.width, height: container.width / imageAspect)
        } else {
            return CGSize(width: container.height * imageAspect, height: container.height)
        }
    }

    /// View point → CSS-pixel page point (screencast frames map 1:1 to
    /// the page viewport reported in `cdp.pageSize`).
    private func pagePoint(_ location: CGPoint, fit: CGSize, in container: CGSize) -> CGPoint? {
        let originX = (container.width - fit.width) / 2
        let originY = (container.height - fit.height) / 2
        let x = location.x - originX
        let y = location.y - originY
        guard x >= 0, y >= 0, x <= fit.width, y <= fit.height else { return nil }
        return CGPoint(
            x: x / fit.width * cdp.pageSize.width,
            y: y / fit.height * cdp.pageSize.height
        )
    }
}

// MARK: - CDP screencast client

/// Minimal Chrome-DevTools-Protocol client over URLSessionWebSocketTask:
/// attaches to the first page target, streams screencast frames, and
/// forwards input. All published state is MainActor.
@MainActor
final class CDPScreencastClient: NSObject, ObservableObject {

    @Published private(set) var frame: UIImage?
    @Published private(set) var status = "Connecting to browser…"
    /// DIP size of the remote viewport (from frame metadata).
    @Published private(set) var pageSize = CGSize(width: 430, height: 900)
    /// URL of the page currently on screen (from main-frame navigations)
    /// — used to learn a custom site's real domain at "I'm done".
    @Published private(set) var currentURL: String?
    /// Type of the input focused in the remote page after the last tap
    /// ("password", "text", "email", …; empty = nothing focused). Drives
    /// the local keyboard automatically.
    @Published private(set) var focusedInputType = ""
    /// True while the remote page is loading (navigation commit → load
    /// event) — drives the loading bar.
    @Published private(set) var isLoading = false
    /// SSO providers the user's login flowed through ("google"/"apple") —
    /// recorded so the saved profile can seed future SSO logins.
    @Published private(set) var providersSeen: Set<String> = []
    /// Heuristic: the user WAS on a login/SSO page and has now landed on
    /// a regular page — the classic "just signed in" arc. Drives the
    /// "tap I'm done" nudge.
    @Published private(set) var likelySignedIn = false

    private var sawLoginPage = false

    private var loadingTimeout: Task<Void, Never>?

    enum Key { case enter, backspace }

    private var task: URLSessionWebSocketTask?
    private var nextID = 1
    private var purposes: [Int: String] = [:]   // command id → purpose
    private var cdpSessionID: String?
    private var currentTargetID: String?
    private var pendingAttachTargetID: String?
    private var didNavigateInitial = false
    /// Pinch/auto-fit zoom of the remote page. Input coordinates are CSS
    /// px = DIP ÷ scale — ignoring this made taps drift on zoomed pages.
    private var pageScale: CGFloat = 1
    private var initialURL: String?
    /// Session credentials captured / seeded.
    struct Captured { let cookies: [[String: Any]]; let origin: String; let items: [String: String] }

    /// Saved credentials to inject on attach so the browser starts signed
    /// in (Google SSO cookies + token-based sites' localStorage).
    private var seedCookies: [[String: Any]] = []
    private var seedStorage: [String: [String: String]] = [:]
    /// Pending capture request id.
    private var captureID: Int?

    func connect(to url: URL, initialURL: String,
                 cookies: [[String: Any]] = [], storage: [String: [String: String]] = [:]) {
        self.initialURL = initialURL
        self.seedCookies = cookies
        self.seedStorage = storage
        status = "Connecting to browser…"
        // The CDP endpoint 401s without the API key on the WS handshake.
        var request = URLRequest(url: url)
        request.setValue(WanderbotConfig.skyvernAPIKey, forHTTPHeaderField: "x-api-key")
        let task = URLSession.shared.webSocketTask(with: request)
        self.task = task
        task.resume()
        receiveLoop()
        send(method: "Target.getTargets", purpose: "targets")
    }

    /// Export the session credentials (all cookies + the current page's
    /// origin localStorage) — the login "save". Instant, a few KB.
    func captureSession() async -> Captured {
        guard let session = cdpSessionID else { return Captured(cookies: [], origin: "", items: [:]) }
        // Grab this page's origin + localStorage first (token-based sites).
        let originJS = "(function(){try{var o={};for(var i=0;i<localStorage.length;i++)"
            + "{var k=localStorage.key(i);o[k]=localStorage.getItem(k)}"
            + "return JSON.stringify({origin:location.origin,items:o})}catch(e){return ''}})()"
        capturedOriginItems = ("", [:])
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            originContinuation = c
            send(method: "Runtime.evaluate",
                 params: ["expression": originJS, "returnByValue": true],
                 sessionID: session, purpose: "storage")
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                self?.resolveStorage()
            }
        }
        let (origin, items) = capturedOriginItems
        // Then all cookies.
        let cookies: [[String: Any]] = await withCheckedContinuation { cont in
            cookieCont = cont
            captureID = send(method: "Storage.getCookies", sessionID: session, purpose: "cookies")
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                self?.resolveCookies(with: [])
            }
        }
        return Captured(cookies: cookies, origin: origin, items: items)
    }

    private var capturedOriginItems: (String, [String: String]) = ("", [:])
    private var originContinuation: CheckedContinuation<Void, Never>?
    private var cookieCont: CheckedContinuation<[[String: Any]], Never>?

    private func resolveStorage() {
        guard let c = originContinuation else { return }
        originContinuation = nil
        c.resume()
    }

    private func resolveCookies(with cookies: [[String: Any]]) {
        guard let cont = cookieCont else { return }
        cookieCont = nil
        captureID = nil
        cont.resume(returning: cookies)
    }

    func disconnect() {
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
    }

    // MARK: Input

    func click(at point: CGPoint) {
        let x = point.x / pageScale
        let y = point.y / pageScale
        for type in ["mousePressed", "mouseReleased"] {
            send(method: "Input.dispatchMouseEvent", params: [
                "type": type, "x": x, "y": y,
                "button": "left", "clickCount": 1,
            ], sessionID: cdpSessionID)
        }
        probeFocusSoon()
    }

    func scroll(at point: CGPoint, deltaY: CGFloat) {
        send(method: "Input.dispatchMouseEvent", params: [
            "type": "mouseWheel",
            "x": point.x / pageScale, "y": point.y / pageScale,
            "deltaX": 0, "deltaY": deltaY / pageScale,
        ], sessionID: cdpSessionID)
    }

    func reload() {
        beginLoading()
        send(method: "Page.reload", params: ["ignoreCache": false], sessionID: cdpSessionID)
    }

    /// Jump the live session to another URL (multi-app login: next app's
    /// login page in the SAME browser, cookies and SSO intact).
    func navigate(to urlString: String) {
        beginLoading()
        likelySignedIn = false
        sawLoginPage = false
        send(method: "Page.navigate", params: ["url": urlString], sessionID: cdpSessionID)
    }

    /// Pinch → zoom the REMOTE page (CDP gesture synthesis). The page's
    /// scale factor changes, and because taps already divide by that
    /// scale, coordinate mapping stays correct with no local transform.
    func pinch(at point: CGPoint, scale: CGFloat) {
        let clamped = max(0.3, min(scale, 4))
        send(method: "Input.synthesizePinchGesture", params: [
            "x": point.x / pageScale, "y": point.y / pageScale,
            "scaleFactor": clamped,
            "gestureSourceType": "touch",
        ], sessionID: cdpSessionID)
    }

    /// Login-arc detection: seeing a login/SSO/search page arms the
    /// heuristic; the next landing on a regular page fires "you're in".
    private func classifyForSignIn(_ urlString: String) {
        let url = urlString.lowercased()
        let loginish = ["login", "signin", "sign-in", "sign_in", "signup", "auth",
                        "sso", "oauth", "idp", "accounts.google", "appleid.apple",
                        "account.apple", "challenge", "verify",
                        "safesearch.norton", "google.com/search"]
        if loginish.contains(where: { url.contains($0) }) {
            sawLoginPage = true
            likelySignedIn = false
        } else if sawLoginPage {
            likelySignedIn = true
        }
    }

    /// Mark loading; auto-clear after 12s for SPA-style navigations that
    /// never fire a load event.
    private func beginLoading() {
        isLoading = true
        loadingTimeout?.cancel()
        loadingTimeout = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 12_000_000_000)
            if !Task.isCancelled { self?.isLoading = false }
        }
    }

    private func endLoading() {
        loadingTimeout?.cancel()
        isLoading = false
    }

    /// Ask the page what's focused — drives the local keyboard mode
    /// automatically. Probed TWICE (fast + late) so the bar flips to
    /// password mode before the user reaches the password manager, even
    /// on sites that move focus after animations.
    private func probeFocusSoon() {
        for delay in [UInt64(150_000_000), UInt64(700_000_000)] {
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: delay)
                guard let self, let session = self.cdpSessionID else { return }
                let js = "(function(){const e=document.activeElement;if(!e)return '';"
                    + "const t=(e.tagName||'').toLowerCase();"
                    + "if(t==='input')return e.type||'text';"
                    + "if(t==='textarea'||e.isContentEditable)return 'text';"
                    + "return '';})()"
                self.send(method: "Runtime.evaluate",
                          params: ["expression": js, "returnByValue": true],
                          sessionID: session, purpose: "focus")
            }
        }
    }

    func type(text: String) {
        send(method: "Input.insertText", params: ["text": text], sessionID: cdpSessionID)
    }

    func pressKey(_ key: Key) {
        let (code, keyName, text): (Int, String, String)
        switch key {
        case .enter: (code, keyName, text) = (13, "Enter", "\r")
        case .backspace: (code, keyName, text) = (8, "Backspace", "")
        }
        for type in ["rawKeyDown", "char", "keyUp"] {
            if type == "char" && text.isEmpty { continue }
            var params: [String: Any] = [
                "type": type, "key": keyName,
                "windowsVirtualKeyCode": code, "nativeVirtualKeyCode": code,
            ]
            if type == "char" { params["text"] = text }
            send(method: "Input.dispatchKeyEvent", params: params, sessionID: cdpSessionID)
        }
    }

    // MARK: Wire

    @discardableResult
    private func send(method: String, params: [String: Any] = [:],
                      sessionID: String? = nil, purpose: String? = nil) -> Int {
        let id = nextID
        nextID += 1
        if let purpose { purposes[id] = purpose }
        var message: [String: Any] = ["id": id, "method": method, "params": params]
        if let sessionID { message["sessionId"] = sessionID }
        if let data = try? JSONSerialization.data(withJSONObject: message),
           let text = String(data: data, encoding: .utf8) {
            task?.send(.string(text)) { _ in }
        }
        return id
    }

    private func receiveLoop() {
        task?.receive { [weak self] result in
            Task { @MainActor [weak self] in
                guard let self else { return }
                switch result {
                case .failure(let error):
                    if self.frame == nil {
                        self.status = "Connection lost: \(error.localizedDescription)"
                    }
                    return
                case .success(let message):
                    if case .string(let text) = message,
                       let data = text.data(using: .utf8),
                       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                        self.handle(json)
                    }
                    self.receiveLoop()
                }
            }
        }
    }

    private func handle(_ json: [String: Any]) {
        if let id = json["id"] as? Int, let purpose = purposes.removeValue(forKey: id) {
            handleResponse(purpose: purpose, result: json["result"] as? [String: Any] ?? [:])
            return
        }
        guard let method = json["method"] as? String,
              let params = json["params"] as? [String: Any] else { return }

        switch method {
        case "Page.frameNavigated":
            guard (json["sessionId"] as? String) == cdpSessionID else { return }
            // Main frame only (no parent) — track where the user is.
            if let frameInfo = params["frame"] as? [String: Any],
               frameInfo["parentId"] == nil,
               let url = frameInfo["url"] as? String, url.hasPrefix("http") {
                currentURL = url
                beginLoading()
                if let host = URL(string: url)?.host?.lowercased() {
                    if host.contains("accounts.google") { providersSeen.insert("google") }
                    if host.contains("appleid.apple") || host.contains("account.apple") {
                        providersSeen.insert("apple")
                    }
                }
                classifyForSignIn(url)
            }

        case "Page.loadEventFired":
            guard (json["sessionId"] as? String) == cdpSessionID else { return }
            endLoading()

        case "Page.screencastFrame":
            // Frames can arrive from a target we've switched away from —
            // only render (and ack) the active session's stream.
            guard let frameSession = json["sessionId"] as? String,
                  frameSession == cdpSessionID else { return }
            if let b64 = params["data"] as? String,
               let data = Data(base64Encoded: b64),
               let image = UIImage(data: data) {
                frame = image
            }
            if let metadata = params["metadata"] as? [String: Any] {
                if let w = metadata["deviceWidth"] as? Double,
                   let h = metadata["deviceHeight"] as? Double, w > 0, h > 0 {
                    pageSize = CGSize(width: w, height: h)
                }
                if let scale = metadata["pageScaleFactor"] as? Double, scale > 0 {
                    pageScale = scale
                }
            }
            if let ackID = params["sessionId"] as? Int {
                send(method: "Page.screencastFrameAck",
                     params: ["sessionId": ackID], sessionID: frameSession)
            }

        case "Target.targetCreated":
            // SSO popups (Google/Apple sign-in) open as NEW page targets.
            // Follow them, or the user is left tapping a frozen page.
            // `openerId` = opened by the page (window.open) — this filters
            // out the replay of pre-existing targets that discovery-enable
            // emits, which must not steal the screen.
            if let info = params["targetInfo"] as? [String: Any],
               (info["type"] as? String) == "page",
               info["openerId"] != nil,
               let targetID = info["targetId"] as? String,
               targetID != currentTargetID {
                switchTo(targetID: targetID)
            }

        case "Target.targetDestroyed":
            // Popup closed (SSO finished) — reattach to whatever page
            // remains (the original site, now logged in).
            if let targetID = params["targetId"] as? String,
               targetID == currentTargetID {
                cdpSessionID = nil
                currentTargetID = nil
                send(method: "Target.getTargets", purpose: "targets")
            }

        default:
            break
        }
    }

    private func switchTo(targetID: String) {
        if let old = cdpSessionID {
            send(method: "Page.stopScreencast", sessionID: old)
        }
        pendingAttachTargetID = targetID
        send(method: "Target.attachToTarget",
             params: ["targetId": targetID, "flatten": true], purpose: "attach")
    }

    private func handleResponse(purpose: String, result: [String: Any]) {
        switch purpose {
        case "targets":
            let infos = (result["targetInfos"] as? [[String: Any]]) ?? []
            let pages = infos.filter { ($0["type"] as? String) == "page" }
            // Prefer the most recently created page (last in list).
            if let targetID = pages.last?["targetId"] as? String {
                status = "Attaching…"
                switchTo(targetID: targetID)
            } else {
                status = "Opening a page…"
                send(method: "Target.createTarget",
                     params: ["url": "about:blank"], purpose: "created")
            }

        case "created":
            if let targetID = result["targetId"] as? String {
                switchTo(targetID: targetID)
            }

        case "attach":
            guard let sessionID = result["sessionId"] as? String else {
                status = "Could not attach to the browser."
                return
            }
            cdpSessionID = sessionID
            currentTargetID = pendingAttachTargetID
            pendingAttachTargetID = nil
            send(method: "Page.enable", sessionID: sessionID)
            send(method: "Runtime.enable", sessionID: sessionID)
            // Kill WebAuthn in the remote browser: passkeys live on the
            // traveler's own devices, so Google's passkey-first screen
            // would hang forever out here. With PublicKeyCredential
            // absent, Google feature-detects "no passkeys" and falls
            // back to password sign-in directly. Applied to future
            // documents AND evaluated now (the page may already be mid-
            // login when we attach to an SSO popup).
            let killWebAuthn = "try{delete window.PublicKeyCredential}catch(e){};"
                + "try{Object.defineProperty(navigator,'credentials',{value:undefined})}catch(e){}"
            send(method: "Page.addScriptToEvaluateOnNewDocument",
                 params: ["source": killWebAuthn], sessionID: sessionID)
            send(method: "Runtime.evaluate",
                 params: ["expression": killWebAuthn], sessionID: sessionID)
            // Force the page to consider itself focused + visible. A
            // headless remote browser reports document.hidden === true, so
            // pages throttle background polls — which stalls Google's
            // "tap the number" 2-Step Verification (the phone approval is
            // recorded but the page never polls to advance). This makes
            // those polls run.
            send(method: "Emulation.setFocusEmulationEnabled",
                 params: ["enabled": true], sessionID: sessionID)
            let forceVisible = "try{Object.defineProperty(document,'visibilityState',"
                + "{configurable:true,get:function(){return 'visible'}});"
                + "Object.defineProperty(document,'hidden',{configurable:true,get:function(){return false}});"
                + "document.dispatchEvent(new Event('visibilitychange'))}catch(e){}"
            send(method: "Page.addScriptToEvaluateOnNewDocument",
                 params: ["source": forceVisible], sessionID: sessionID)
            send(method: "Runtime.evaluate",
                 params: ["expression": forceVisible], sessionID: sessionID)
            // Inject saved credentials BEFORE the first navigation, so the
            // login page loads already signed in. Cookies cover SSO;
            // per-origin localStorage covers token-based sites.
            if !seedCookies.isEmpty {
                send(method: "Network.enable", sessionID: sessionID)
                send(method: "Storage.setCookies",
                     params: ["cookies": seedCookies], sessionID: sessionID)
            }
            if !seedStorage.isEmpty,
               let data = try? JSONSerialization.data(withJSONObject: seedStorage),
               let json = String(data: data, encoding: .utf8) {
                let seedJS = "(function(){try{var S=\(json);var o=location.origin;"
                    + "if(S[o]){var m=S[o];for(var k in m){try{localStorage.setItem(k,m[k])}catch(e){}}}}catch(e){}})()"
                send(method: "Page.addScriptToEvaluateOnNewDocument",
                     params: ["source": seedJS], sessionID: sessionID)
            }
            // Phone-sized viewport: legible text, mobile login layouts, and
            // ~4× smaller frames than the default 1920×1080 desktop. This
            // is emulation-only — the cookies saved to the profile are the
            // same either way.
            send(method: "Emulation.setDeviceMetricsOverride", params: [
                "width": 430, "height": 900, "deviceScaleFactor": 2, "mobile": true,
            ], sessionID: sessionID)
            // Watch for popups (SSO windows) from now on.
            send(method: "Target.setDiscoverTargets", params: ["discover": true])
            if let initialURL, !didNavigateInitial {
                didNavigateInitial = true
                status = "Loading \(URL(string: initialURL)?.host ?? "page")…"
                send(method: "Page.navigate", params: ["url": initialURL], sessionID: sessionID)
            }
            send(method: "Page.startScreencast", params: [
                "format": "jpeg", "quality": 60,
                "maxWidth": 860, "maxHeight": 1800, "everyNthFrame": 1,
            ], sessionID: sessionID)

        case "focus":
            let value = ((result["result"] as? [String: Any])?["value"] as? String) ?? ""
            focusedInputType = value

        case "cookies":
            resolveCookies(with: (result["cookies"] as? [[String: Any]]) ?? [])

        case "storage":
            if let json = (result["result"] as? [String: Any])?["value"] as? String,
               let data = json.data(using: .utf8),
               let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let origin = obj["origin"] as? String {
                capturedOriginItems = (origin, (obj["items"] as? [String: String]) ?? [:])
            }
            resolveStorage()

        default:
            break
        }
    }
}
