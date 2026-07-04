import Foundation

/// One chat message. Kept Codable with the same field names as before so
/// previously-persisted transcripts still decode.
struct ChatMessage: Identifiable, Hashable, Codable {
    enum Role: String, Codable { case user, assistant, system }

    var id: String
    var role: Role
    var content: String
    /// Milliseconds since epoch.
    var timestamp: Double
    /// Excluded from the visible UI.
    var isHidden: Bool?
    /// Legacy field from the OpenClaw era — kept for decode compatibility.
    var responseID: String?
    /// Legacy field from the OpenClaw era — kept for decode compatibility.
    var previousResponseID: String?
    /// `true` while the assistant message is streaming.
    var pending: Bool?

    enum CodingKeys: String, CodingKey {
        case id, role, content, timestamp, isHidden, responseID, previousResponseID
    }
}

/// Trip-scoped text chat, powered directly by xAI chat completions
/// (grok + Live Search + trip tools). OpenClaw is fully retired: the
/// model calls `TripAgentTools` functions and we execute them locally
/// against Firebase RTDB — same data the itinerary UI renders.
///
/// History lives on-device (UserDefaults, one transcript per trip).
@MainActor
final class ChatStore: ObservableObject {
    /// Pseudo trip id for the general (trip-less) assistant transcript.
    static let generalChatID = "general"

    /// `tripId → messages (sorted by timestamp asc)`
    @Published var messagesByTrip: [String: [ChatMessage]] = [:]
    @Published var isSending: Set<String> = []

    private let client = XAIChatClient()
    private let tools = TripAgentTools(travelStore: nil)
    private weak var travelStore: TravelStore?
    private var loadedTrips: Set<String> = []

    /// Cap on how many tool-call rounds one user turn may trigger.
    private let maxToolRounds = 8
    /// How much history is replayed to the model each turn.
    private let historyWindow = 30

    /// Wire up the live trip store (called once at app start).
    func configure(travelStore: TravelStore) {
        self.travelStore = travelStore
        tools.attach(travelStore: travelStore)
    }

    /// Load the persisted transcript the first time a trip's chat opens.
    /// (Name kept from the OpenClaw polling era so call sites don't churn.)
    func ensureSubscription(for tripID: String) {
        guard !loadedTrips.contains(tripID) else { return }
        loadedTrips.insert(tripID)
        if messagesByTrip[tripID] == nil {
            messagesByTrip[tripID] = Self.loadTranscript(tripID: tripID)
        }
    }

    func stopSubscriptions() {}

    func messages(for tripID: String?) -> [ChatMessage] {
        guard let tripID else { return [] }
        return messagesByTrip[tripID] ?? []
    }

    // MARK: - Send

    @discardableResult
    func send(tripID: String, text: String) -> Task<Void, Never> {
        Task { [weak self] in
            await self?._send(tripID: tripID, text: text)
        }
    }

    private func _send(tripID: String, text: String) async {
        ensureSubscription(for: tripID)
        let now = Date().timeIntervalSince1970 * 1000

        append(ChatMessage(id: "user:\(UUID().uuidString)", role: .user,
                           content: text, timestamp: now, isHidden: nil,
                           responseID: nil, previousResponseID: nil, pending: nil),
               to: tripID)

        var assistant = ChatMessage(id: "assistant:\(UUID().uuidString)", role: .assistant,
                                    content: "", timestamp: now + 1, isHidden: nil,
                                    responseID: nil, previousResponseID: nil, pending: true)
        append(assistant, to: tripID)

        isSending.insert(tripID)
        defer {
            isSending.remove(tripID)
            persist(tripID: tripID)
        }

        // First round carries the transcript; tool rounds chain by
        // previous_response_id and carry only the tool outputs.
        var convo: [[String: Any]] = [["role": "system", "content": systemPrompt(tripID: tripID)]]
        let history = (messagesByTrip[tripID] ?? [])
            .filter { $0.isHidden != true && $0.pending != true && !$0.content.isEmpty }
            .suffix(historyWindow)
        for m in history {
            convo.append(["role": m.role.rawValue, "content": m.content])
        }

        // Hosted web_search/x_search run server-side at xAI; the trip
        // tools come back as function calls we execute locally.
        var sessionTools: [[String: Any]] = [["type": "web_search"], ["type": "x_search"]]
        sessionTools.append(contentsOf: TripAgentTools.realtimeTools)

        do {
            var input = convo
            var previousResponseID: String?
            for round in 0..<maxToolRounds {
                let assistantID = assistant.id
                let result = try await client.streamTurn(
                    input: input,
                    previousResponseID: previousResponseID,
                    tools: sessionTools,
                    onDelta: { [weak self] piece in
                        self?.appendDelta(piece, messageID: assistantID, tripID: tripID)
                    }
                )

                if result.toolCalls.isEmpty { break }

                // Run each trip tool and feed the outputs back.
                var outputs: [[String: Any]] = []
                for call in result.toolCalls {
                    let output = await tools.execute(name: call.name, argumentsJSON: call.arguments)
                    outputs.append(["type": "function_call_output",
                                    "call_id": call.id, "output": output])
                }
                input = outputs
                previousResponseID = result.responseID
                // Visual separator if the model narrated before the call.
                if round < maxToolRounds - 1, !result.text.isEmpty {
                    appendDelta("\n\n", messageID: assistantID, tripID: tripID)
                }
            }
        } catch {
            let message = (error as? XAIChatClient.ClientError)?.errorDescription
                ?? error.localizedDescription
            appendDelta(assistantContent(tripID: tripID, id: assistant.id).isEmpty
                            ? "Couldn't reach the assistant: \(message)"
                            : "\n\n⚠️ \(message)",
                        messageID: assistant.id, tripID: tripID)
        }

        // Finalize: clear pending; drop the bubble entirely if nothing came back.
        if var list = messagesByTrip[tripID],
           let idx = list.firstIndex(where: { $0.id == assistant.id }) {
            list[idx].pending = false
            if list[idx].content.isEmpty {
                list[idx].content = "Done."
            }
            messagesByTrip[tripID] = list
        }
        assistant.pending = false
    }

    // MARK: - System prompt

    private func systemPrompt(tripID: String) -> String {
        var lines: [String] = [
            "You are Wanderbot, a sharp, concise travel assistant inside the traveler's trip app. "
            + "Answer in Markdown (tables welcome). You have live web search — use it for "
            + "current info (weather, hours, prices, events). You also have tools that read and "
            + "edit the traveler's actual trips and itineraries — use them for any question "
            + "about their plan and for EVERY change they ask for. Never invent trip state: "
            + "read it with get_itinerary first. After editing, confirm briefly what changed. "
            + "You cannot make real reservations or purchases — for those, add the item to the "
            + "itinerary and share a booking link instead. "
            + "SOURCES: search_email searches their connected Gmail (booking confirmations — "
            + "use targeted queries like from:airbnb.com newer_than:60d, then add findings "
            + "with the trip tools). import_from_url fetches public share links (Wanderlog, "
            + "Airbnb itineraries, blogs) so you can import them. browse_and_extract drives a "
            + "real browser for login-gated sites (slow; last resort). "
            + "LOCATION: when a request depends on where the traveler is right now (\"near me\", "
            + "\"from here\", distances, what's around), call get_current_location for their "
            + "exact coordinates before answering. "
            + "VISUALS: when the traveler asks to SEE something (photos of a place, dish, "
            + "hotel), search the web for DIRECT image file URLs (.jpg/.png/.webp — Wikimedia "
            + "Commons or official sites are reliable; never page URLs) and embed each as a "
            + "markdown image on its own line: ![description](url). When referencing websites, "
            + "use normal markdown links [title](url).",
        ]
        if let store = travelStore,
           let trip = store.trips.first(where: { $0.id == tripID }) {
            lines.append("")
            lines.append("CURRENT TRIP: \(trip.id) — \"\(trip.title)\", \(trip.destination), "
                         + "\(trip.startDate) to \(trip.endDate).")
            if let travelers = trip.travelers, !travelers.isEmpty {
                lines.append("TRAVELERS: \(travelers.joined(separator: ", "))")
            }
            lines.append("Use this trip's id for tool calls unless the traveler names another trip.")
        } else if let store = travelStore {
            // General assistant — no trip selected.
            lines.append("")
            if store.trips.isEmpty {
                lines.append("The traveler has no trips yet — offer to plan one and create it "
                             + "with create_trip (then add_booking for each itinerary item).")
            } else {
                lines.append("No specific trip is selected. Their trips:")
                for t in store.orderedTrips {
                    lines.append("  - \(t.id): \"\(t.title)\" — \(t.destination) (\(t.startDate) → \(t.endDate))")
                }
                lines.append("Plan and create NEW trips with create_trip + add_booking, or edit "
                             + "any trip above by its id.")
            }
        }
        lines.append("Today's date: \(ISO8601.dayKey(from: Date())).")
        return lines.joined(separator: "\n")
    }

    // MARK: - Message list plumbing

    private func append(_ message: ChatMessage, to tripID: String) {
        var list = messagesByTrip[tripID] ?? []
        list.append(message)
        messagesByTrip[tripID] = list
    }

    private func appendDelta(_ piece: String, messageID: String, tripID: String) {
        guard !piece.isEmpty else { return }
        guard var list = messagesByTrip[tripID],
              let idx = list.firstIndex(where: { $0.id == messageID }) else { return }
        list[idx].content += piece
        messagesByTrip[tripID] = list
    }

    private func assistantContent(tripID: String, id: String) -> String {
        messagesByTrip[tripID]?.first(where: { $0.id == id })?.content ?? ""
    }

    // MARK: - Persistence (on-device)

    private static func storageKey(_ tripID: String) -> String { "wanderbot.chat.\(tripID)" }

    private func persist(tripID: String) {
        let list = (messagesByTrip[tripID] ?? []).suffix(200)
        if let data = try? JSONEncoder().encode(Array(list)) {
            UserDefaults.standard.set(data, forKey: Self.storageKey(tripID))
        }
    }

    private static func loadTranscript(tripID: String) -> [ChatMessage] {
        guard let data = UserDefaults.standard.data(forKey: storageKey(tripID)),
              let list = try? JSONDecoder().decode([ChatMessage].self, from: data)
        else { return [] }
        // Anything persisted mid-stream is finished now.
        return list.map { m in
            var m = m; if m.pending == true { m.pending = false }; return m
        }
    }
}
