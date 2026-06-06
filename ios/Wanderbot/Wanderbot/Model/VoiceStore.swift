import AVFoundation
import Foundation

/// One line in the voice transcript.
struct VoiceLine: Identifiable, Equatable {
    enum Role { case user, assistant }
    let id: UUID
    let role: Role
    var text: String
}

/// Orchestrates a voice conversation with the xAI Voice Agent and bridges
/// agent actions to OpenClaw.
///
/// The voice agent (grok-voice) is its own brain: it converses and is given
/// the trip itinerary as its system prompt. When it needs to *act* on the
/// trip (edit the itinerary, look something up), it calls the
/// `wanderbot_agent` function. We execute that request through the same
/// OpenClaw gateway the text chat uses — keyed by the trip's session key, so
/// voice actions land in the shared transcript — and hand the result back
/// for the agent to speak.
@MainActor
final class VoiceStore: ObservableObject {

    enum ConnectionState: Equatable {
        case idle, connecting, connected, error(String)
    }

    @Published private(set) var state: ConnectionState = .idle
    @Published private(set) var transcript: [VoiceLine] = []
    @Published private(set) var isAssistantSpeaking = false
    /// Non-nil while an OpenClaw action is running (shown as a status pill).
    @Published private(set) var toolActivity: String?
    /// Images parsed from the most recent OpenClaw bridge result. Shown as
    /// a panel in the call UI since the spoken transcript never carries
    /// URLs. Persists until a newer lookup yields images or the user
    /// dismisses them.
    @Published private(set) var images: [URL] = []
    @Published var isMuted = false

    var levelMeter: AudioLevelMeter { audio.levelMeter }
    var isActive: Bool { state == .connected || state == .connecting }

    private let socket = VoiceWebSocket()
    private let audio = VoiceAudioEngine()
    private let gateway = GatewayClient()

    private var tripID: String?
    private var instructions: String = ""

    private var currentResponseId: String?
    private var currentAssistantLineId: UUID?

    /// Maps a server transcription `item_id` to its transcript line so
    /// repeated / streamed transcription events for the same utterance
    /// update one bubble in place instead of appending duplicates.
    private var userLinesByItemId: [String: UUID] = [:]

    /// Function-call bookkeeping keyed by `call_id`: the tool name and the
    /// accumulating arguments JSON (streamed via *.delta, finalized on *.done).
    private var pendingCalls: [String: (name: String, args: String)] = [:]

    // MARK: - Lifecycle

    func start(trip: Trip, bookings: [Booking]) {
        guard !isActive else { return }
        guard WanderbotConfig.xaiVoiceEnabled else {
            state = .error("xAI voice key not configured")
            return
        }
        tripID = trip.id
        instructions = Self.buildInstructions(trip: trip, bookings: bookings)
        state = .connecting
        transcript = []
        images = []

        requestMicPermission { [weak self] granted in
            guard let self else { return }
            guard granted else {
                self.state = .error("Microphone access denied. Enable it in Settings.")
                return
            }
            self.socket.delegate = self
            self.socket.connect(
                urlString: WanderbotConfig.xaiRealtimeURL,
                model: WanderbotConfig.xaiVoiceModel,
                apiKey: WanderbotConfig.xaiAPIKey
            )

            let started = self.audio.start(echoCancellation: true) { [weak self] base64 in
                guard let self, !self.isMuted else { return }
                self.socket.sendRaw(#"{"type":"input_audio_buffer.append","audio":"\#(base64)"}"#)
            }
            if !started {
                self.state = .error("Couldn't start the microphone.")
                self.socket.disconnect()
            }
        }
    }

    func stop() {
        audio.stop()
        socket.disconnect()
        state = .idle
        isAssistantSpeaking = false
        toolActivity = nil
        images = []
        currentResponseId = nil
        currentAssistantLineId = nil
        userLinesByItemId.removeAll()
        pendingCalls.removeAll()
    }

    private func requestMicPermission(_ completion: @escaping (Bool) -> Void) {
        switch AVAudioSession.sharedInstance().recordPermission {
        case .granted:
            completion(true)
        case .denied:
            completion(false)
        case .undetermined:
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                Task { @MainActor in completion(granted) }
            }
        @unknown default:
            completion(false)
        }
    }

    // MARK: - Session config

    private func sendSessionUpdate() {
        // `wanderbot_agent` is a CLIENT function tool — it's the only way to
        // *mutate* the shared trip (it routes through OpenClaw so changes
        // land on the same itinerary the web app and text chat use).
        let agentTool: [String: Any] = [
            "type": "function",
            "name": "wanderbot_agent",
            "description": "Make a CHANGE to the traveler's trip: add, move, or remove a booking, "
                + "re-plan a day, or save a place/restaurant to the itinerary. Use this only for "
                + "actions that modify the trip. For looking up current info, use your own "
                + "web_search instead. Returns a short confirmation for you to relay out loud.",
            "parameters": [
                "type": "object",
                "properties": [
                    "request": [
                        "type": "string",
                        "description": "The change to make, as a clear, self-contained instruction.",
                    ] as [String: Any],
                ] as [String: Any],
                "required": ["request"],
            ] as [String: Any],
        ]

        // `web_search` / `x_search` are SERVER-side hosted tools — xAI runs
        // them itself and feeds the results straight back to grok, with no
        // client round-trip. This is what gives voice live internet access
        // (the old function-call bridge for lookups was slow/unreliable).
        let tools: [[String: Any]] = [
            ["type": "web_search"],
            ["type": "x_search"],
            agentTool,
        ]

        socket.sendJSON([
            "type": "session.update",
            "session": [
                "voice": WanderbotConfig.xaiVoice,
                "instructions": instructions,
                "turn_detection": ["type": "server_vad"] as [String: Any],
                "input_audio_transcription": ["model": "whisper-1"] as [String: Any],
                "tools": tools,
            ] as [String: Any],
        ])
    }

    // MARK: - OpenClaw bridge

    private func executeAgentCall(callId: String, requestText: String) {
        guard let tripID, let gateway else {
            submitFunctionOutput(callId: callId, output: "The trip assistant is not available right now.")
            return
        }
        toolActivity = "Working on it…"
        let sessionKey = WanderbotConfig.sessionKeyHeader(forTripID: tripID)
        NSLog("[voice] bridge → OpenClaw call_id=%@ request=%@ key=%@", callId, requestText, sessionKey)
        let startedAt = Date()

        Task { [weak self] in
            var collected = ""
            var failure: String?
            var completed = false
            do {
                for try await event in gateway.send(text: requestText, sessionKeyHeader: sessionKey) {
                    switch event {
                    case .delta(let chunk): collected += chunk
                    case .completed: completed = true
                    case .failed(let msg): failure = msg
                    }
                }
            } catch {
                failure = (error as? URLError).map { "URLError \($0.code.rawValue): \($0.localizedDescription)" }
                    ?? error.localizedDescription
            }
            let secs = Int(Date().timeIntervalSince(startedAt))
            NSLog("[voice] bridge ← OpenClaw call_id=%@ completed=%d chars=%ld secs=%d failure=%@",
                  callId, completed ? 1 : 0, collected.count, secs, failure ?? "nil")

            guard let self else { return }
            let output: String
            if let failure, collected.isEmpty {
                output = "The action could not be completed: \(failure)"
            } else if collected.isEmpty {
                output = "Done, but the assistant returned no details."
            } else {
                output = collected
            }
            self.toolActivity = nil
            // The spoken relay won't include URLs, so surface any images
            // from the raw result in the call UI. Keep the prior set if
            // this lookup had none (avoids flicker on follow-ups).
            let found = Self.extractImageURLs(from: collected)
            if !found.isEmpty { self.images = found }
            self.submitFunctionOutput(callId: callId, output: output)
        }
    }

    func clearImages() { images = [] }

    /// Pull image links out of an OpenClaw result — markdown `![](url)`
    /// images and bare URLs ending in an image extension. Capped so a
    /// chatty result can't flood the panel.
    nonisolated private static func extractImageURLs(from text: String) -> [URL] {
        var collected: [String] = []
        let patterns = [
            #"!\[[^\]]*\]\((https?://[^\s)]+)\)"#,
            #"(https?://[^\s)]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s)]*)?)"#,
        ]
        let ns = text as NSString
        for pattern in patterns {
            guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { continue }
            for m in re.matches(in: text, range: NSRange(location: 0, length: ns.length)) where m.numberOfRanges > 1 {
                let s = ns.substring(with: m.range(at: 1))
                if !collected.contains(s) { collected.append(s) }
            }
        }
        return collected.prefix(6).compactMap { URL(string: $0) }
    }

    private func submitFunctionOutput(callId: String, output: String) {
        socket.sendJSON([
            "type": "conversation.item.create",
            "item": [
                "type": "function_call_output",
                "call_id": callId,
                "output": output,
            ] as [String: Any],
        ])
        socket.sendJSON(["type": "response.create"])
    }

    // MARK: - Transcript helpers

    /// Create or update the user transcript bubble for a given server
    /// `item_id`. `replace` swaps the whole text (final transcript);
    /// otherwise it appends (streamed partial). Keying by item_id keeps
    /// one utterance in one bubble even when the server emits multiple
    /// partial/final events for it.
    private func upsertUserLine(itemId: String?, text: String, replace: Bool) {
        let key = itemId ?? "default"
        if let lineId = userLinesByItemId[key],
           let idx = transcript.lastIndex(where: { $0.id == lineId }) {
            if replace { transcript[idx].text = text }
            else { transcript[idx].text += text }
        } else {
            let lineId = UUID()
            userLinesByItemId[key] = lineId
            transcript.append(VoiceLine(id: lineId, role: .user, text: text))
        }
    }

    private func appendAssistant(_ text: String) {
        guard let id = currentAssistantLineId,
              let idx = transcript.lastIndex(where: { $0.id == id }) else { return }
        transcript[idx].text += text
    }

    private func interruptAssistant() {
        guard isAssistantSpeaking || currentResponseId != nil else { return }
        isAssistantSpeaking = false
        audio.interruptPlayback()
        currentResponseId = nil
        currentAssistantLineId = nil
    }

    // MARK: - Trip context → system prompt

    private static func buildInstructions(trip: Trip, bookings: [Booking]) -> String {
        var lines: [String] = []
        lines.append(
            "You are Wanderbot, a warm, concise voice travel companion. Speak naturally and "
            + "keep replies short — this is a spoken conversation, not an essay. You are helping "
            + "the traveler with the specific trip described below."
        )
        lines.append("")
        lines.append("TRIP: \(trip.title) — \(trip.destination)")
        lines.append("DATES: \(trip.startDate) to \(trip.endDate)")
        if let travelers = trip.travelers, !travelers.isEmpty {
            lines.append("TRAVELERS: \(travelers.joined(separator: ", "))")
        }
        if let summary = trip.summary, !summary.isEmpty {
            lines.append("SUMMARY: \(summary)")
        }

        let byDay = Dictionary(grouping: bookings) { $0.dayKey }
        if byDay.isEmpty {
            lines.append("ITINERARY: (no bookings yet)")
        } else {
            lines.append("ITINERARY:")
            for day in byDay.keys.sorted() {
                lines.append("  \(day):")
                let items = (byDay[day] ?? []).sorted { $0.position < $1.position }
                for b in items {
                    var part = "    - \(b.type.rawValue): \(b.title)"
                    if let start = b.start {
                        part += " at \(timeFormatter.string(from: start))"
                    }
                    if let place = b.place?.name ?? b.to?.name {
                        part += " (\(place))"
                    }
                    lines.append(part)
                }
            }
        }

        lines.append("")
        lines.append(
            "You can search the live internet yourself with web_search (and x_search for "
            + "real-time posts). For ANY current or real-world question — weather, opening "
            + "hours, prices, availability, events, directions, restaurant or activity "
            + "recommendations, news — search and answer directly. Don't guess or make up "
            + "facts; if it's not in the itinerary above and isn't common knowledge, search. "
            + "Keep spoken answers short.\n\n"
            + "Use the wanderbot_agent function ONLY when the traveler wants to CHANGE the trip "
            + "(add/move/remove a booking, re-plan a day, or save a place to the itinerary) — "
            + "that's the only thing that can edit their actual plan. Say a brief filler like "
            + "\"let me take care of that\" while it runs, then confirm the result."
        )
        return lines.joined(separator: "\n")
    }

    nonisolated private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "h:mm a"
        f.timeZone = TimeZone(identifier: "UTC")  // stored times are wall-clock
        return f
    }()
}

// MARK: - WebSocket event routing

extension VoiceStore: VoiceWebSocketDelegate {

    func voiceSocketDidOpen() {
        state = .connected
        sendSessionUpdate()
    }

    func voiceSocketDidClose(code: Int, reason: String?) {
        if isActive { state = .error("Connection closed (\(code))") }
    }

    func voiceSocketDidFail(error: String, httpStatus: Int?) {
        if isActive { state = .error(error) }
    }

    func voiceSocketDidReceive(json: [String: Any], type: String) {
        switch type {
        case "session.created":
            if state != .connected { state = .connected; sendSessionUpdate() }
        case "session.updated":
            if state != .connected { state = .connected }

        case "input_audio_buffer.speech_started":
            interruptAssistant()

        case "conversation.item.input_audio_transcription.delta":
            // Streamed partial transcript — grow the bubble for this item.
            if let d = json["delta"] as? String, !d.isEmpty {
                upsertUserLine(itemId: json["item_id"] as? String, text: d, replace: false)
            }

        case "conversation.item.input_audio_transcription.completed":
            // Final transcript for this item — replace any partial text.
            if let t = json["transcript"] as? String, !t.isEmpty {
                upsertUserLine(itemId: json["item_id"] as? String, text: t, replace: true)
            }

        case "response.created":
            if let r = json["response"] as? [String: Any], let id = r["id"] as? String {
                currentResponseId = id
                isAssistantSpeaking = true
                let lineId = UUID()
                currentAssistantLineId = lineId
                transcript.append(VoiceLine(id: lineId, role: .assistant, text: ""))
            }

        case "response.output_item.added":
            // A function_call item carries its name + call_id up front.
            if let item = json["item"] as? [String: Any],
               item["type"] as? String == "function_call",
               let callId = item["call_id"] as? String {
                let name = item["name"] as? String ?? "wanderbot_agent"
                pendingCalls[callId] = (name: name, args: "")
            }

        case "response.function_call_arguments.delta":
            if let callId = json["call_id"] as? String,
               let delta = json["delta"] as? String,
               var pending = pendingCalls[callId] {
                pending.args += delta
                pendingCalls[callId] = pending
            }

        case "response.function_call_arguments.done":
            handleFunctionCallDone(json)

        case "response.output_audio_transcript.delta", "response.audio_transcript.delta":
            if let d = json["delta"] as? String,
               json["response_id"] as? String == currentResponseId {
                appendAssistant(d)
            }

        case "response.output_audio.delta", "response.audio.delta":
            if let d = json["delta"] as? String,
               json["response_id"] as? String == currentResponseId {
                audio.playAudioDelta(base64: d)
            }

        case "response.done":
            isAssistantSpeaking = false
            currentAssistantLineId = nil

        case "ping":
            if let ts = json["ping_timestamp"] as? Int64 {
                socket.sendJSON(["type": "pong", "ping_timestamp": ts])
            }

        case "error":
            let msg = json["message"] as? String ?? "Unknown error"
            let code = json["code"] as? String ?? ""
            NSLog("[voice] error [%@]: %@", code, msg)
            if code == "timeout" || code == "max_duration" { stop() }

        default:
            break
        }
    }

    private func handleFunctionCallDone(_ json: [String: Any]) {
        guard let callId = json["call_id"] as? String else { return }
        // Prefer the fully-accumulated args; fall back to the payload's own.
        let argsString = (pendingCalls[callId]?.args.isEmpty == false
            ? pendingCalls[callId]!.args
            : (json["arguments"] as? String ?? ""))
        pendingCalls[callId] = nil

        let request: String
        if let data = argsString.data(using: .utf8),
           let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let r = obj["request"] as? String, !r.isEmpty {
            request = r
        } else {
            request = argsString
        }

        guard !request.isEmpty else {
            submitFunctionOutput(callId: callId, output: "No request was provided.")
            return
        }
        executeAgentCall(callId: callId, requestText: request)
    }
}
