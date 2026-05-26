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

    init?(config: WanderbotConfig.Type = WanderbotConfig.self) {
        guard config.gatewayEnabled,
              let url = URL(string: config.gatewayURL) else { return nil }
        self.baseURL = url
        self.apiKey = config.gatewayAPIKey
        self.agentID = config.gatewayAgentID
        self.model = config.gatewayModel
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
    func send(
        text: String,
        previousResponseID: String?
    ) -> AsyncThrowingStream<StreamEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    try await stream(
                        text: text,
                        previousResponseID: previousResponseID,
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
        previousResponseID: String?,
        continuation: AsyncThrowingStream<StreamEvent, Error>.Continuation
    ) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("v1/responses"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue(agentID, forHTTPHeaderField: "x-openclaw-agent-id")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")

        var body: [String: Any] = [
            "model": model,
            "stream": true,
            "user": "neoclaw",
            "input": [
                ["type": "message", "role": "user", "content": text]
            ]
        ]
        if let previousResponseID, !previousResponseID.isEmpty {
            body["previous_response_id"] = previousResponseID
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        guard (200..<300).contains(http.statusCode) else {
            let payload = try await Self.collect(bytes: bytes)
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
