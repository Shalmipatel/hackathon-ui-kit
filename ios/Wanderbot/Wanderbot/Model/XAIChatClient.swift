import Foundation

/// Streaming client for xAI's **Responses API** (`/v1/responses`) — the
/// text chat's brain now that OpenClaw is retired. Server-side hosted
/// tools (`web_search`, `x_search`) run on xAI's side; our trip function
/// tools come back as `function_call` items which the caller executes and
/// returns via `function_call_output` + `previous_response_id`.
///
/// (Chat completions' Live Search was deprecated with HTTP 410 — the
/// Agent Tools API on `/v1/responses` is the supported path.)
struct XAIChatClient {

    struct ToolCall {
        let id: String        // call_id used for function_call_output
        let name: String
        let arguments: String
    }

    struct TurnResult {
        let text: String
        let toolCalls: [ToolCall]
        /// Response id — pass back as `previous_response_id` when
        /// submitting this turn's tool outputs.
        let responseID: String?
    }

    enum ClientError: Error, LocalizedError {
        case http(Int, String)
        case badResponse

        var errorDescription: String? {
            switch self {
            case .http(let code, let body): return "xAI HTTP \(code): \(body.prefix(180))"
            case .badResponse: return "Unexpected response from xAI"
            }
        }
    }

    /// One model turn. `input` is either the message list (first round)
    /// or `function_call_output` items (tool rounds, with
    /// `previousResponseID` set). Streams text deltas via `onDelta`.
    func streamTurn(
        input: [[String: Any]],
        previousResponseID: String?,
        tools: [[String: Any]],
        onDelta: @escaping @MainActor (String) -> Void
    ) async throws -> TurnResult {
        guard let url = URL(string: WanderbotConfig.xaiResponsesURL) else {
            throw ClientError.badResponse
        }
        var body: [String: Any] = [
            "model": WanderbotConfig.xaiChatModel,
            "input": input,
            "stream": true,
        ]
        if !tools.isEmpty { body["tools"] = tools }
        if let previousResponseID { body["previous_response_id"] = previousResponseID }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 300
        request.setValue("Bearer \(WanderbotConfig.xaiAPIKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        NSLog("[chat] → %@ tools=%ld prevID=%@ inputItems=%ld",
              WanderbotConfig.xaiChatModel, tools.count, previousResponseID ?? "nil", input.count)
        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        guard let http = response as? HTTPURLResponse else { throw ClientError.badResponse }
        guard (200..<300).contains(http.statusCode) else {
            var payload = ""
            for try await line in bytes.lines { payload += line; if payload.count > 800 { break } }
            NSLog("[chat] HTTP %ld body=%@", http.statusCode, payload)
            throw ClientError.http(http.statusCode, payload)
        }

        var text = ""
        var responseID: String?
        // One entry per function_call output item. `itemID` (the item's
        // own `id`, e.g. "fc_…_0") is what the argument-delta/done events
        // key on; `callID` (e.g. "call-…-0") is what we echo back in the
        // function_call_output. These are DIFFERENT strings — matching the
        // deltas by call_id silently drops every argument, so tools would
        // run with empty `{}` (no trip_id, no query → "not found"/"nothing").
        var calls: [(itemID: String, callID: String, name: String, args: String)] = []

        for try await line in bytes.lines {
            guard line.hasPrefix("data:") else { continue }
            let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
            if payload == "[DONE]" { break }
            guard let data = payload.data(using: .utf8),
                  let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let type = event["type"] as? String
            else { continue }

            switch type {
            case "response.created", "response.completed":
                if let id = (event["response"] as? [String: Any])?["id"] as? String {
                    responseID = id
                }

            case "response.output_text.delta":
                if let piece = event["delta"] as? String, !piece.isEmpty {
                    text += piece
                    await onDelta(piece)
                }

            case "response.output_item.added":
                if let item = event["item"] as? [String: Any],
                   item["type"] as? String == "function_call",
                   let itemID = item["id"] as? String,
                   let callID = item["call_id"] as? String {
                    calls.append((itemID: itemID, callID: callID,
                                  name: item["name"] as? String ?? "",
                                  args: item["arguments"] as? String ?? ""))
                }

            case "response.function_call_arguments.delta":
                // Keyed by item_id (falls back to call_id for safety).
                if let key = (event["item_id"] as? String) ?? (event["call_id"] as? String),
                   let piece = event["delta"] as? String,
                   let idx = calls.firstIndex(where: { $0.itemID == key || $0.callID == key }) {
                    calls[idx].args += piece
                }

            case "response.function_call_arguments.done":
                if let key = (event["item_id"] as? String) ?? (event["call_id"] as? String),
                   let final = event["arguments"] as? String, !final.isEmpty,
                   let idx = calls.firstIndex(where: { $0.itemID == key || $0.callID == key }) {
                    calls[idx].args = final
                }

            case "response.failed", "error":
                let message = ((event["response"] as? [String: Any])?["error"] as? [String: Any])?["message"] as? String
                    ?? (event["error"] as? [String: Any])?["message"] as? String
                    ?? event["message"] as? String
                    ?? "response.failed"
                throw ClientError.http(http.statusCode, message)

            default:
                break
            }
        }

        let toolCalls = calls
            .filter { !$0.name.isEmpty }
            .map { ToolCall(id: $0.callID, name: $0.name, arguments: $0.args) }
        NSLog("[chat] ← textLen=%ld toolCalls=[%@]",
              text.count, toolCalls.map(\.name).joined(separator: ","))
        return TurnResult(text: text, toolCalls: toolCalls, responseID: responseID)
    }
}
