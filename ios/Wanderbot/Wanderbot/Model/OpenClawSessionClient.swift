import Foundation

/// Reads chat history straight from OpenClaw via the gateway's
/// `/tools/invoke` endpoint (`sessions_history` tool). This is the
/// same source the web uses to bootstrap session text after a
/// fresh login; using it directly removes the need for the RTDB
/// chat mirror — OpenClaw is the source of truth for the
/// transcript on both clients.
///
/// Response shape (after extracting `result.details`):
///   {
///     "sessionKey": "agent:main:neoclaw-trip-…",
///     "messages": [
///       { "role": "user|assistant|system",
///         "content": [{ "type":"text", "text":"…" }],
///         "timestamp": <ms>,
///         "responseId": "…" }     // assistant turns only
///     ],
///     "truncated": …, "contentTruncated": …
///   }
struct OpenClawSessionClient {
    let baseURL: URL
    let apiKey: String
    let agentID: String
    let session: URLSession

    init?(config: WanderbotConfig.Type = WanderbotConfig.self) {
        guard config.gatewayEnabled,
              let url = URL(string: config.gatewayURL) else { return nil }
        self.baseURL = url
        self.apiKey = config.gatewayAPIKey
        self.agentID = config.gatewayAgentID
        /* Reuse-ish: short-running non-streaming POSTs, so the
           shared 60s request timeout is fine. We give it its own
           session to keep cookie/handler state away from the
           streaming GatewayClient. */
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 30
        cfg.waitsForConnectivity = true
        self.session = URLSession(configuration: cfg)
    }

    /// Pull the full transcript for one trip. `tripID` is the same
    /// trip id used everywhere else; the session key is derived via
    /// `WanderbotConfig.sessionKeyHeader(forTripID:)` so iOS hits
    /// the same OpenClaw session the web writes to.
    func loadHistory(forTripID tripID: String, limit: Int = 200) async throws -> [ChatMessage] {
        let sessionKey = WanderbotConfig.sessionKeyHeader(forTripID: tripID)

        var request = URLRequest(url: baseURL.appendingPathComponent("tools/invoke"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue(agentID, forHTTPHeaderField: "x-openclaw-agent-id")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = [
            "tool": "sessions_history",
            "args": [
                "sessionKey": sessionKey,
                "limit": limit,
                "kind": "main",
                "model": "openclaw",
            ],
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        guard (200..<300).contains(http.statusCode) else {
            let snippet = String(data: data, encoding: .utf8)?.prefix(300) ?? ""
            NSLog("[openclaw] sessions_history HTTP %ld: %@", http.statusCode, snippet as NSString)
            throw URLError(.badServerResponse)
        }

        guard
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            json["ok"] as? Bool == true,
            let result = json["result"] as? [String: Any],
            let details = result["details"] as? [String: Any],
            let raw = details["messages"] as? [[String: Any]]
        else {
            /* Empty / unknown shape — treat as "session not on the
               server yet" rather than a hard error so the chat sheet
               doesn't surface a scary banner the first time someone
               opens a brand-new trip. */
            return []
        }

        return raw.compactMap(Self.makeMessage(from:))
    }

    /// Map one OpenClaw remote message into our ChatMessage. Tool
    /// calls / tool results are filtered out (we only render the
    /// conversational role text).
    private static func makeMessage(from raw: [String: Any]) -> ChatMessage? {
        guard
            let roleRaw = raw["role"] as? String,
            let role = ChatMessage.Role(rawValue: roleRaw)
        else { return nil }
        let text = extractText(raw["content"])
        if text.isEmpty && role != .system { return nil }

        /* OpenClaw doesn't emit a stable per-message id we can rely
           on for `Identifiable`. Synthesize one from role + timestamp
           + a content hash so re-fetches keep the same id (no
           list-diff flicker) and don't collide with concurrent turns
           at the exact same millisecond. */
        let timestamp = (raw["timestamp"] as? Double) ?? 0
        let id = "openclaw:\(roleRaw):\(Int64(timestamp)):\(text.hashValue)"

        return ChatMessage(
            id: id,
            role: role,
            content: text,
            timestamp: timestamp,
            isHidden: nil,
            responseID: raw["responseId"] as? String,
            previousResponseID: nil,
            pending: nil
        )
    }

    /// Flatten the `content: [{type,text}]` array down to a single
    /// string. Mirrors the web's `extractText` in message-mapper.util.
    private static func extractText(_ raw: Any?) -> String {
        guard let parts = raw as? [[String: Any]] else { return "" }
        return parts
            .compactMap { part -> String? in
                guard part["type"] as? String == "text",
                      let text = part["text"] as? String,
                      !text.isEmpty else { return nil }
                return text
            }
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
