import Foundation

/// OpenClaw gateway client. Talks to the OpenAI-compatible Responses
/// API at `<gatewayURL>/v1/responses` — the same endpoint the web
/// `streamLlmText` helper hits — and streams text deltas back as an
/// AsyncStream.
///
/// Conversation chaining uses the Responses API's `previous_response_id`
/// field: each call returns a new response id, which the next turn
/// passes back as `previous_response_id`. The server keeps the
/// transcript, so the wire payload stays small.
struct GatewayClient {
    let baseURL: URL
    let apiKey: String
    let agentID: String
    let model: String
    let session: URLSession

    init?(config: WanderbotConfig.Type = WanderbotConfig.self) {
        guard config.gatewayEnabled,
              let url = URL(string: config.gatewayURL) else { return nil }
        self.baseURL = url
        self.apiKey = config.gatewayAPIKey
        self.agentID = config.gatewayAgentID
        self.model = config.gatewayModel
        self.session = Self.makeSession()
    }

    /// URLSession sized for LLM streaming. URLSession.shared defaults
    /// to a 60s request timeout — that's the maximum idle gap allowed
    /// between bytes — which routinely kills slow first-token latencies
    /// (cold gateway, big context, agent that's reasoning before
    /// producing tokens, etc.) and surfaces as "the request timed
    /// out" in the chat. Bump both the per-byte gap (5m, generous —
    /// agent responses can stall while tools run) and the overall
    /// resource ceiling (15m, matches long agent task budgets).
    private static func makeSession() -> URLSession {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 300     // idle gap between bytes
        config.timeoutIntervalForResource = 900    // hard ceiling per stream
        config.waitsForConnectivity = true         // ride out brief network blips
        return URLSession(configuration: config)
    }

    /// One streaming reply event.
    enum StreamEvent {
        /// Incremental text chunk to append to the assistant message.
        case delta(String)
        /// Final response id — pass to the next call as
        /// `previousResponseID` to chain the conversation.
        case completed(responseID: String?)
        /// Stream-level failure. The accumulated text is still usable.
        case failed(String)
    }

    /// POST a user message to `/v1/responses` and yield streamed events.
    /// The async stream terminates after a `.completed` or `.failed`
    /// event, or when the connection closes.
    ///
    /// `sessionKeyHeader` is the value for `x-openclaw-session-key`.
    /// Pass the web-compatible session key (see
    /// `WanderbotConfig.sessionKeyHeader(forTripID:)`) so the OpenClaw
    /// server-side session is shared across web and iOS — the gateway
    /// chains conversation turns by this key, so we no longer need to
    /// track `previous_response_id` ourselves.
    func send(
        text: String,
        sessionKeyHeader: String?
    ) -> AsyncThrowingStream<StreamEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    try await stream(
                        text: text,
                        sessionKeyHeader: sessionKeyHeader,
                        continuation: continuation
                    )
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private func stream(
        text: String,
        sessionKeyHeader: String?,
        continuation: AsyncThrowingStream<StreamEvent, Error>.Continuation
    ) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("v1/responses"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue(agentID, forHTTPHeaderField: "x-openclaw-agent-id")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        if let sessionKeyHeader, !sessionKeyHeader.isEmpty {
            /* Server-side conversation chaining lives behind this
               header. Same value web sends → same OpenClaw session →
               cross-device transcript. */
            request.setValue(sessionKeyHeader, forHTTPHeaderField: "x-openclaw-session-key")
        }

        let body: [String: Any] = [
            "model": model,
            "stream": true,
            "user": "neoclaw",
            "input": [
                ["type": "message", "role": "user", "content": text]
            ]
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let urlForLogs = request.url?.absoluteString ?? "<nil>"
        let (bytes, response): (URLSession.AsyncBytes, URLResponse)
        do {
            (bytes, response) = try await session.bytes(for: request)
        } catch {
            /* Surface the underlying URL error code in the console.
               URLError.Code values give a much clearer picture than
               localizedDescription alone — e.g. .timedOut (-1001) vs.
               .notConnectedToInternet (-1009) vs. .cannotFindHost
               (-1003) — when the chat sheet shows "couldn't reach
               the gateway" we want to know which of those it was. */
            if let urlErr = error as? URLError {
                NSLog("[gateway] %@ failed: URLError code=%ld (%@)",
                      urlForLogs, urlErr.code.rawValue, urlErr.localizedDescription)
            } else {
                NSLog("[gateway] %@ failed: %@", urlForLogs, String(describing: error))
            }
            throw error
        }
        guard let http = response as? HTTPURLResponse else {
            NSLog("[gateway] %@ returned non-HTTP response", urlForLogs)
            throw URLError(.badServerResponse)
        }
        guard (200..<300).contains(http.statusCode) else {
            let payload = try await Self.collect(bytes: bytes)
            NSLog("[gateway] %@ HTTP %ld body=%@",
                  urlForLogs, http.statusCode, payload.prefix(400) as NSString)
            throw GatewayError.http(status: http.statusCode, body: payload)
        }

        var parser = GatewaySSEParser()
        for try await line in bytes.lines {
            parser.feed(line: line)
            while let event = parser.popEvent() {
                handle(event: event, into: continuation)
            }
        }
        // Stream closed without an explicit completed event — flush.
        if !parser.didComplete {
            continuation.yield(.completed(responseID: parser.lastResponseID))
        }
        continuation.finish()
    }

    private func handle(
        event: GatewaySSEParser.Event,
        into continuation: AsyncThrowingStream<StreamEvent, Error>.Continuation
    ) {
        switch event.kind {
        case .delta(let text):
            continuation.yield(.delta(text))
        case .completed(let id):
            continuation.yield(.completed(responseID: id))
            continuation.finish()
        case .failed(let message):
            continuation.yield(.failed(message))
            continuation.finish()
        case .ignore:
            break
        }
    }

    private static func collect(bytes: URLSession.AsyncBytes) async throws -> String {
        var data = Data()
        for try await byte in bytes { data.append(byte) }
        return String(data: data, encoding: .utf8) ?? ""
    }
}

enum GatewayError: Error, LocalizedError {
    case http(status: Int, body: String)

    var errorDescription: String? {
        switch self {
        case .http(let s, let b): return "Gateway HTTP \(s): \(b.prefix(180))"
        }
    }
}

/// SSE parser specialised for the Responses API event grammar:
///
///   event: response.output_text.delta
///   data: {"delta":"...","response":{"id":"resp_..."}}
///
///   event: response.completed
///   data: {"response":{"id":"resp_..."}}
///
/// Frames are line-oriented; a blank line flushes. We pop events one
/// at a time so the caller can yield onto the AsyncStream after each.
private struct GatewaySSEParser {
    struct Event {
        enum Kind {
            case delta(String)
            case completed(String?)
            case failed(String)
            case ignore
        }
        var kind: Kind
    }

    private(set) var lastResponseID: String?
    private(set) var didComplete = false

    private var currentEvent: String?
    private var dataLines: [String] = []
    private var pending: [Event] = []

    mutating func feed(line: String) {
        if line.isEmpty {
            flush()
            return
        }
        if line.hasPrefix(":") { return }            // comment / keep-alive
        if line.hasPrefix("event:") {
            currentEvent = String(line.dropFirst(6).trimmingCharacters(in: .whitespaces))
            return
        }
        if line.hasPrefix("data:") {
            let data = String(line.dropFirst(5).trimmingCharacters(in: .whitespaces))
            dataLines.append(data)
        }
    }

    mutating func popEvent() -> Event? {
        pending.isEmpty ? nil : pending.removeFirst()
    }

    private mutating func flush() {
        defer {
            currentEvent = nil
            dataLines.removeAll()
        }
        guard let eventName = currentEvent, !dataLines.isEmpty else { return }
        let dataJoined = dataLines.joined(separator: "\n")
        if dataJoined == "[DONE]" {
            didComplete = true
            pending.append(Event(kind: .completed(lastResponseID)))
            return
        }
        guard let payload = dataJoined.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: payload) as? [String: Any]
        else { return }

        // Track the response id wherever we can spot it.
        if let id = (parsed["response"] as? [String: Any])?["id"] as? String {
            lastResponseID = id
        } else if let id = parsed["id"] as? String {
            lastResponseID = id
        }

        let kind = (parsed["type"] as? String) ?? eventName

        switch kind {
        case "response.output_text.delta":
            if let delta = parsed["delta"] as? String, !delta.isEmpty {
                pending.append(Event(kind: .delta(delta)))
            }
        case "response.completed":
            didComplete = true
            pending.append(Event(kind: .completed(lastResponseID)))
        case "response.failed":
            let msg = ((parsed["error"] as? [String: Any])?["message"] as? String)
                ?? ((parsed["response"] as? [String: Any])?["error"] as? [String: Any])?["message"] as? String
                ?? "Gateway response.failed"
            pending.append(Event(kind: .failed(msg)))
        default:
            break
        }
    }
}
