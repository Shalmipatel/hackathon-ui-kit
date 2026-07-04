import AVFoundation
import Foundation
import UIKit

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
    /// Images on screen — either a photo the traveler shared or images the
    /// agent chose to show via its `show_images` tool. Persist until
    /// replaced or dismissed.
    @Published private(set) var images: [URL] = []
    /// A web link the agent chose to surface via `show_link`.
    @Published private(set) var sharedLink: SharedLink?
    @Published var isMuted = false

    struct SharedLink: Equatable {
        let url: URL
        let title: String
    }

    var levelMeter: AudioLevelMeter { audio.levelMeter }
    var isActive: Bool { state == .connected || state == .connecting }

    private let socket = VoiceWebSocket()
    private let audio = VoiceAudioEngine()
    /// Executes the agent's trip tools directly against RTDB (OpenClaw
    /// is retired — the voice agent is the primary brain now).
    private var tools: TripAgentTools?

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

    /// `trip == nil` starts the general (trip-less) assistant — same
    /// tools, but the context lists all trips instead of one itinerary.
    func start(trip: Trip?, travelStore: TravelStore) {
        guard !isActive else { return }
        guard WanderbotConfig.xaiVoiceEnabled else {
            state = .error("xAI voice key not configured")
            return
        }
        tripID = trip?.id
        tools = TripAgentTools(travelStore: travelStore)
        instructions = Self.buildInstructions(trip: trip, travelStore: travelStore)
        state = .connecting
        transcript = []
        images = []
        sharedLink = nil

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
        sharedLink = nil
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
        // `web_search` / `x_search` are SERVER-side hosted tools — xAI runs
        // them itself and feeds results straight back to grok. The trip
        // tools are CLIENT function tools: we execute them locally against
        // RTDB (TripAgentTools) and return the result. The voice agent is
        // the primary brain — no OpenClaw in the loop.
        var sessionTools: [[String: Any]] = [
            ["type": "web_search"],
            ["type": "x_search"],
        ]
        sessionTools.append(contentsOf: TripAgentTools.realtimeTools)
        sessionTools.append(contentsOf: Self.displayTools)

        socket.sendJSON([
            "type": "session.update",
            "session": [
                "voice": WanderbotConfig.xaiVoice,
                "instructions": instructions,
                "turn_detection": ["type": "server_vad"] as [String: Any],
                "input_audio_transcription": ["model": "whisper-1"] as [String: Any],
                "tools": sessionTools,
            ] as [String: Any],
        ])
    }

    // MARK: - Display tools (voice-UI only)

    /// Client tools that put things ON SCREEN during the call — the voice
    /// channel can't "show" anything by speaking, so the agent calls these
    /// after finding content with web_search.
    private static let displayTools: [[String: Any]] = [
        [
            "type": "function",
            "name": "show_images",
            "description": "Display 1–6 photos on the traveler's screen. Use when they ask to "
                + "SEE something (a place, dish, hotel, landmark): first find DIRECT image file "
                + "URLs with web_search (.jpg/.png/.webp — Wikimedia Commons or official sites "
                + "are reliable; never page URLs), then call this.",
            "parameters": [
                "type": "object",
                "properties": [
                    "urls": [
                        "type": "array",
                        "description": "Direct image file URLs.",
                        "items": ["type": "string"] as [String: Any],
                    ] as [String: Any],
                ] as [String: Any],
                "required": ["urls"],
            ] as [String: Any],
        ],
        [
            "type": "function",
            "name": "show_link",
            "description": "Display a tappable web link on the traveler's screen — use when "
                + "they should open a page (booking site, menu, tickets, article).",
            "parameters": [
                "type": "object",
                "properties": [
                    "url": ["type": "string", "description": "The web page URL."] as [String: Any],
                    "title": ["type": "string", "description": "Short human-readable label."] as [String: Any],
                ] as [String: Any],
                "required": ["url", "title"],
            ] as [String: Any],
        ],
    ]

    private static let displayToolNames: Set<String> = ["show_images", "show_link"]

    private func executeDisplayTool(callId: String, name: String, args: [String: Any]) {
        switch name {
        case "show_images":
            let urls = (args["urls"] as? [String] ?? []).prefix(6).compactMap { URL(string: $0) }
            guard !urls.isEmpty else {
                submitFunctionOutput(callId: callId, output: "No valid image URLs were provided.")
                return
            }
            images = Array(urls)
            submitFunctionOutput(callId: callId,
                                 output: "\(urls.count) image(s) are now on the traveler's screen.")
        case "show_link":
            guard let raw = args["url"] as? String, let url = URL(string: raw),
                  url.scheme?.hasPrefix("http") == true else {
                submitFunctionOutput(callId: callId, output: "Invalid URL.")
                return
            }
            sharedLink = SharedLink(url: url, title: (args["title"] as? String) ?? url.host ?? raw)
            submitFunctionOutput(callId: callId, output: "The link is now on the traveler's screen.")
        default:
            submitFunctionOutput(callId: callId, output: "Unknown display tool.")
        }
    }

    // MARK: - Trip tool execution

    private func executeTripTool(callId: String, name: String, argumentsJSON: String) {
        guard let tools else {
            submitFunctionOutput(callId: callId, output: "Trip tools are not available right now.")
            return
        }
        toolActivity = "Working on it…"
        Task { [weak self] in
            let output = await tools.execute(name: name, argumentsJSON: argumentsJSON)
            guard let self else { return }
            self.toolActivity = nil
            self.submitFunctionOutput(callId: callId, output: output)
        }
    }

    func clearImages() { images = [] }
    func clearSharedLink() { sharedLink = nil }

    // MARK: - Photo sharing

    /// Share a photo with the voice agent. The realtime API can't take
    /// image input, so we describe the photo with xAI's vision model
    /// (grok-4-fast over HTTP) and inject the description into the live
    /// session as a user text turn — grok then reacts to it by voice.
    func sendPhoto(_ image: UIImage) {
        guard state == .connected else { return }

        transcript.append(VoiceLine(id: UUID(), role: .user, text: "📷 Shared a photo"))
        if let localURL = Self.persistPhotoToTemp(image) {
            images = [localURL]
        }
        toolActivity = "Looking at your photo…"

        // Tell the agent about the photo IMMEDIATELY (no response.create).
        // The vision description takes a few seconds; if the traveler talks
        // about the photo in that window, server VAD fires a turn — without
        // this context the agent would truthfully say "I can't see an
        // image". With it, it knows a photo is incoming and holds off.
        socket.sendJSON([
            "type": "conversation.item.create",
            "item": [
                "type": "message", "role": "user",
                "content": [[
                    "type": "input_text",
                    "text": "[The traveler just attached a photo. A detailed description of it "
                        + "is being prepared and will arrive in a few seconds. If the traveler "
                        + "mentions the photo before it arrives, briefly say you're taking a "
                        + "look — NEVER say you can't see it.]",
                ] as [String: Any]],
            ] as [String: Any],
        ])

        Task { [weak self] in
            let description = await Self.describePhoto(image)
            guard let self else { return }
            self.toolActivity = nil

            let text: String
            if let description {
                text = "[Here is the photo the traveler just attached. The photo shows: "
                    + "\(description)] React to it naturally in the context of the conversation — "
                    + "identify what it is if you can, and offer relevant trip help."
            } else {
                text = "[The photo the traveler attached couldn't be processed. "
                    + "Briefly apologise and ask them to try again.]"
            }
            self.socket.sendJSON([
                "type": "conversation.item.create",
                "item": [
                    "type": "message", "role": "user",
                    "content": [["type": "input_text", "text": text] as [String: Any]],
                ] as [String: Any],
            ])
            self.socket.sendJSON(["type": "response.create"])
        }
    }

    /// Caption a photo with the vision model. Runs off-actor; returns nil
    /// on any failure (the caller degrades gracefully).
    nonisolated private static func describePhoto(_ image: UIImage) async -> String? {
        guard let url = URL(string: WanderbotConfig.xaiChatCompletionsURL),
              let jpeg = downscale(image, maxDimension: 1024).jpegData(compressionQuality: 0.7)
        else { return nil }

        let body: [String: Any] = [
            "model": WanderbotConfig.xaiVisionModel,
            "max_tokens": 300,
            "messages": [[
                "role": "user",
                "content": [
                    ["type": "text",
                     "text": "Describe this photo in 2–4 sentences for a voice travel assistant. "
                         + "Name any identifiable landmark, place, dish, sign, or document, and "
                         + "include any legible text."] as [String: Any],
                    ["type": "image_url",
                     "image_url": ["url": "data:image/jpeg;base64,\(jpeg.base64EncodedString())"] as [String: Any]] as [String: Any],
                ],
            ] as [String: Any]],
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 120
        request.setValue("Bearer \(WanderbotConfig.xaiAPIKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        guard let (data, response) = try? await URLSession.shared.data(for: request) else {
            NSLog("[voice] photo describe: network failure")
            return nil
        }
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            let bodyText = String(data: data, encoding: .utf8) ?? ""
            NSLog("[voice] photo describe: HTTP %ld %@",
                  (response as? HTTPURLResponse)?.statusCode ?? -1,
                  String(bodyText.prefix(200)))
            return nil
        }
        guard let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = j["choices"] as? [[String: Any]],
              let message = choices.first?["message"] as? [String: Any],
              let text = message["content"] as? String, !text.isEmpty
        else { return nil }
        return text
    }

    nonisolated private static func downscale(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        let longest = max(image.size.width, image.size.height)
        guard longest > maxDimension, longest > 0 else { return image }
        let scale = maxDimension / longest
        let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        return UIGraphicsImageRenderer(size: newSize).image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }

    /// Write the shared photo to a temp file so the image panel (which
    /// renders `[URL]` via AsyncImage) can show it immediately.
    nonisolated private static func persistPhotoToTemp(_ image: UIImage) -> URL? {
        guard let jpeg = image.jpegData(compressionQuality: 0.85) else { return nil }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("voice-photo-\(UUID().uuidString).jpg")
        do { try jpeg.write(to: url); return url } catch { return nil }
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

    private static func buildInstructions(trip: Trip?, travelStore: TravelStore) -> String {
        var lines: [String] = []
        if trip != nil {
            lines.append(
                "You are Wanderbot, a warm, concise voice travel companion. Speak naturally and "
                + "keep replies short — this is a spoken conversation, not an essay. You are helping "
                + "the traveler with the specific trip described below."
            )
        } else {
            lines.append(
                "You are Wanderbot, a warm, concise voice travel companion. Speak naturally and "
                + "keep replies short — this is a spoken conversation, not an essay. No specific "
                + "trip is selected — this is the general assistant. Help with anything travel: "
                + "plan and CREATE new trips (create_trip, then add_booking for each item), "
                + "answer questions about existing trips (get_itinerary), or general advice."
            )
        }
        lines.append("")
        lines.append("TODAY: \(ISO8601.dayKey(from: Date()))")

        if let trip {
            lines.append("TRIP: \(trip.title) — \(trip.destination) (trip_id: \(trip.id))")
            lines.append("DATES: \(trip.startDate) to \(trip.endDate)")
            if let travelers = trip.travelers, !travelers.isEmpty {
                lines.append("TRAVELERS: \(travelers.joined(separator: ", "))")
            }
            if let summary = trip.summary, !summary.isEmpty {
                lines.append("SUMMARY: \(summary)")
            }

            let byDay = Dictionary(grouping: travelStore.bookings(for: trip.id)) { $0.dayKey }
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
        } else if travelStore.trips.isEmpty {
            lines.append("TRIPS: none yet — offer to plan one and create it with create_trip.")
        } else {
            lines.append("TRIPS:")
            for t in travelStore.orderedTrips {
                lines.append("  - \(t.id): \"\(t.title)\" — \(t.destination) (\(t.startDate) → \(t.endDate))")
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
            + "You are the traveler's ONLY agent — you directly manage their trips with the "
            + "trip tools: get_trips / get_itinerary to read current state, create_trip / "
            + "update_trip / delete_trip, and add_booking / update_booking / delete_booking to "
            + "edit itineraries. When the traveler asks for a change, DO IT with tools, then "
            + "confirm briefly. The itinerary above is a snapshot from when the call started — "
            + "call get_itinerary for fresh state (you need booking ids to edit or remove "
            + "items). When adding places, include lat/lng coordinates (search the web for "
            + "them) so they appear on the map. You cannot make real reservations or "
            + "purchases — add the item to the itinerary and mention where to book instead. "
            + "Say a brief filler like \"on it\" while a tool runs.\n\n"
            + "SOURCES: search_email searches their connected Gmail for booking confirmations "
            + "(targeted queries like from:airbnb.com newer_than:60d) — add findings with the "
            + "trip tools. import_from_url fetches public share links (Wanderlog, Airbnb "
            + "itineraries) for importing.\n\n"
            + "LOCATION: when a request depends on where the traveler is right now (\"near me\", "
            + "\"from here\", distances, what's around), call get_current_location for their "
            + "exact coordinates before answering.\n\n"
            + "SHOWING THINGS: You can put content on the traveler's screen. When they ask to "
            + "SEE something (photos of a place, dish, hotel), use web_search to find direct "
            + "image file URLs and call show_images. When they should open a webpage (booking "
            + "site, menu, tickets), call show_link. Mention out loud that it's on their "
            + "screen.\n\n"
            + "PHOTOS: The traveler can share photos. You'll receive them as bracketed text "
            + "descriptions (\"[The traveler just shared a photo...]\") a few seconds after they "
            + "attach one. Treat the description as if you're seeing the photo — react to it "
            + "directly and never mention the description mechanism. If the traveler refers to a "
            + "photo whose description hasn't arrived yet, say you're taking a look — never say "
            + "you can't see it."
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
        let pending = pendingCalls[callId]
        pendingCalls[callId] = nil

        let name = pending?.name ?? ""
        // Prefer the fully-accumulated args; fall back to the payload's own.
        let argsString = (pending?.args.isEmpty == false
            ? pending!.args
            : (json["arguments"] as? String ?? "{}"))

        if TripAgentTools.toolNames.contains(name) {
            executeTripTool(callId: callId, name: name, argumentsJSON: argsString)
        } else if Self.displayToolNames.contains(name) {
            let args = (argsString.data(using: .utf8)
                .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }) ?? [:]
            executeDisplayTool(callId: callId, name: name, args: args)
        }
        // Anything else (web_search / x_search) is hosted — xAI runs it.
    }
}
