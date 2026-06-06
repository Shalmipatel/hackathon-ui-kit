import Foundation

/// WebSocket client for the xAI Voice Agent API (wss://api.x.ai/v1/realtime).
/// Auth rides on `Sec-WebSocket-Protocol` (`xai-client-secret.<key>`) because
/// `URLSessionWebSocketTask` strips the `Authorization` header on the
/// HTTP→WS upgrade.
///
/// Ported from the xAI cookbook reference (iOS VoiceTesterApp), trimmed to
/// what Wanderbot needs.
protocol VoiceWebSocketDelegate: AnyObject {
    @MainActor func voiceSocketDidOpen()
    @MainActor func voiceSocketDidClose(code: Int, reason: String?)
    @MainActor func voiceSocketDidFail(error: String, httpStatus: Int?)
    @MainActor func voiceSocketDidReceive(json: [String: Any], type: String)
}

@MainActor
final class VoiceWebSocket {

    weak var delegate: VoiceWebSocketDelegate?
    private(set) var isConnected = false

    private var task: URLSessionWebSocketTask?
    private var session: URLSession?
    private var sessionDelegate: Delegate?
    private var timeoutTask: Task<Void, Never>?

    /// Open a WebSocket to the xAI realtime endpoint. `model` is passed as
    /// a query param; `apiKey` is the realtime credential.
    func connect(urlString: String, model: String, apiKey: String) {
        var components = URLComponents(string: urlString)!
        components.queryItems = [URLQueryItem(name: "model", value: model)]
        let url = components.url!
        NSLog("[voice-ws] connecting to %@", url.absoluteString)

        let delegate = Delegate(
            onOpen: { [weak self] proto in
                Task { @MainActor in
                    guard let self else { return }
                    self.isConnected = true
                    self.timeoutTask?.cancel()
                    NSLog("[voice-ws] opened (protocol: %@)", proto ?? "none")
                    self.delegate?.voiceSocketDidOpen()
                }
            },
            onClose: { [weak self] code, reason in
                let reasonStr = reason.flatMap { String(data: $0, encoding: .utf8) }
                Task { @MainActor in
                    self?.isConnected = false
                    NSLog("[voice-ws] closed (code: %ld, reason: %@)", code.rawValue, reasonStr ?? "none")
                    self?.delegate?.voiceSocketDidClose(code: code.rawValue, reason: reasonStr)
                }
            },
            onComplete: { [weak self] task, error in
                Task { @MainActor in
                    let status = (task.response as? HTTPURLResponse)?.statusCode
                    if let error {
                        let ns = error as NSError
                        NSLog("[voice-ws] failed: %@ (domain: %@, code: %ld, http: %@)",
                              error.localizedDescription, ns.domain, ns.code,
                              status.map(String.init) ?? "?")
                        self?.isConnected = false
                        self?.delegate?.voiceSocketDidFail(error: error.localizedDescription, httpStatus: status)
                    }
                }
            }
        )
        self.sessionDelegate = delegate

        let urlSession = URLSession(configuration: .default, delegate: delegate, delegateQueue: nil)
        self.session = urlSession

        let wsTask = urlSession.webSocketTask(with: url, protocols: ["xai-client-secret.\(apiKey)"])
        self.task = wsTask
        wsTask.resume()

        timeoutTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(10))
            guard let self, !self.isConnected else { return }
            NSLog("[voice-ws] timeout — no response after 10s")
            self.delegate?.voiceSocketDidFail(error: "WebSocket timeout", httpStatus: nil)
        }

        receiveLoop()
    }

    func disconnect() {
        timeoutTask?.cancel()
        timeoutTask = nil
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
        session?.invalidateAndCancel()
        session = nil
        sessionDelegate = nil
        isConnected = false
    }

    func sendJSON(_ dict: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let string = String(data: data, encoding: .utf8) else { return }
        sendRaw(string)
    }

    /// Send a pre-serialized JSON string (avoids re-serialization for the
    /// hot-path audio frames).
    func sendRaw(_ string: String) {
        task?.send(.string(string)) { error in
            if let error { NSLog("[voice-ws] send error: %@", error.localizedDescription) }
        }
    }

    private func receiveLoop() {
        task?.receive { [weak self] result in
            Task { @MainActor in
                guard let self else { return }
                self.timeoutTask?.cancel()
                self.timeoutTask = nil

                switch result {
                case .success(let message):
                    var data: Data?
                    switch message {
                    case .string(let text): data = text.data(using: .utf8)
                    case .data(let d): data = d
                    @unknown default: break
                    }
                    if let data,
                       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let type = json["type"] as? String {
                        self.delegate?.voiceSocketDidReceive(json: json, type: type)
                    }
                    self.receiveLoop()

                case .failure(let error):
                    NSLog("[voice-ws] receive error: %@", String(describing: error))
                    self.isConnected = false
                    self.delegate?.voiceSocketDidFail(error: error.localizedDescription, httpStatus: nil)
                }
            }
        }
    }
}

private final class Delegate: NSObject, URLSessionWebSocketDelegate, URLSessionTaskDelegate {
    let onOpen: (String?) -> Void
    let onClose: (URLSessionWebSocketTask.CloseCode, Data?) -> Void
    let onComplete: (URLSessionTask, Error?) -> Void

    init(
        onOpen: @escaping (String?) -> Void,
        onClose: @escaping (URLSessionWebSocketTask.CloseCode, Data?) -> Void,
        onComplete: @escaping (URLSessionTask, Error?) -> Void
    ) {
        self.onOpen = onOpen
        self.onClose = onClose
        self.onComplete = onComplete
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol proto: String?) {
        onOpen(proto)
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith code: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        onClose(code, reason)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: (any Error)?) {
        onComplete(task, error)
    }
}
