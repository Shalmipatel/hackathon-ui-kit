# Integrating an xAI Grok Voice Agent (wired to an OpenClaw backend)

A reusable guide / hand-off prompt for adding a real-time voice assistant to an
iOS (SwiftUI) app using the **xAI Grok Voice Agent realtime API**, wired so it
can (a) search the live internet and (b) take actions against an existing
**OpenClaw** agent backend (the same one a text chat uses).

> Hand this whole file to a capable engineer or coding assistant. It captures the
> architecture, the exact wire formats, and the gotchas we hit so they don't have
> to rediscover them.

---

## Architecture at a glance

```
        speaks 🎙        24kHz PCM audio          ┌──────────────────────────┐
  User ───────────►  iOS app  ◄──────────────────►│  xAI Grok Voice realtime │
        hears 🔊        (WebSocket)                │  (grok-voice-latest)     │
                          │                        └──────────────────────────┘
                          │                            │ runs hosted tools itself
                          │                            ▼  (web_search, x_search…)
                          │                          live internet
                          │
                          │ function tool "my_agent" (ACTIONS only)
                          ▼
              POST /v1/responses (SSE)
        ┌──────────────────────────────────┐
        │  OpenClaw gateway (OpenAI-        │  ← same backend the text chat uses;
        │  Responses-compatible agent)      │     shared session key = shared
        └──────────────────────────────────┘     transcript across devices
```

**The key idea:** Grok-voice has two kinds of tools. Use **hosted server-side
tools** (`web_search`, etc.) for live-info lookups — xAI runs them itself, no
client work. Use a **client function tool** *only* for app-specific actions
(mutating your data via your backend). Don't build a client bridge for web
search; it's slower and adds a timeout surface.

---

## 1. Realtime connection (WebSocket)

- Connect to `wss://api.x.ai/v1/realtime?model=grok-voice-latest`.
- **Auth gotcha:** `URLSessionWebSocketTask` strips the `Authorization` header on
  the HTTP→WS upgrade, so you cannot authenticate that way. Pass the key as a
  WebSocket **subprotocol** instead:
  `Sec-WebSocket-Protocol: xai-client-secret.<XAI_API_KEY>`.

  ```swift
  let task = URLSession.shared.webSocketTask(
      with: url,
      protocols: ["xai-client-secret.\(apiKey)"]
  )
  ```
- Handle `ping` events by replying with `pong`, echoing the `ping_timestamp`.

---

## 2. Audio (full-duplex)

- Format: **24 kHz, mono, Int16 PCM, base64**.
  - Mic → `{"type":"input_audio_buffer.append","audio":"<base64>"}`
  - Playback ← `response.output_audio.delta` (base64 Int16) → decode → feed an
    `AVAudioPlayerNode`.
- Use `AVAudioEngine` + `AVAudioSession` category `.playAndRecord`, mode
  `.voiceChat`, and `inputNode.setVoiceProcessingEnabled(true)`. This enables
  **hardware echo cancellation (AEC)** so the assistant's own voice isn't captured
  by the mic — this is what makes natural **barge-in** possible (interrupting the
  assistant mid-sentence).
  - ⚠️ The iOS **Simulator has no AEC** and loops your Mac's mic/speakers — test
    full-duplex on a **real device**.
- Use `turn_detection: {"type":"server_vad"}` so the server detects end-of-turn
  and auto-generates responses. On `input_audio_buffer.speech_started`, stop local
  playback to support barge-in.

---

## 3. Tools — the key design decision

Configure tools in the `session.update` event.

### Server-side hosted tools (xAI executes them; zero client work)
- `{"type":"web_search"}` — live web search
- `{"type":"x_search","allowed_x_handles":[...]}` — search X / real-time posts
- `{"type":"file_search","vector_store_ids":[...],"max_num_results":10}` — your collections
- `{"type":"mcp","server_url":"...","server_label":"...","allowed_tools":[...],"authorization":"Bearer ..."}` — remote MCP tools

**Use `web_search`/`x_search` for ALL live-info lookups** (weather, hours, prices,
events, directions, recommendations). The model runs them itself and the results
never touch your client.

### Client function tools (you execute them)
`{"type":"function","name":...,"parameters":{...}}` — use **only** for
app-specific *actions* the hosted tools can't do (e.g. mutating your data).

### Example `session.update`
```json
{
  "type": "session.update",
  "session": {
    "voice": "ara",
    "instructions": "You are <assistant>. Search the web directly for any current/real-world question. Use the my_agent function ONLY to change the user's data.",
    "turn_detection": { "type": "server_vad" },
    "input_audio_transcription": { "model": "whisper-1" },
    "tools": [
      { "type": "web_search" },
      { "type": "x_search" },
      {
        "type": "function",
        "name": "my_agent",
        "description": "Make a CHANGE to the user's data (only for actions that modify state).",
        "parameters": {
          "type": "object",
          "properties": { "request": { "type": "string" } },
          "required": ["request"]
        }
      }
    ]
  }
}
```
After sending it, the server echoes `session.updated` with the registered tools —
verify your combined array was accepted.

---

## 4. Client function-call flow (for the action tool)

1. `response.output_item.added` — item `type:"function_call"`, carries `name` +
   `call_id`. Stash it.
2. `response.function_call_arguments.delta` — accumulate argument chunks.
3. `response.function_call_arguments.done` — final `arguments` JSON string.
4. Execute the action (see §5), then return the result:
   ```json
   { "type":"conversation.item.create",
     "item": { "type":"function_call_output", "call_id":"<same id>", "output":"<result text>" } }
   ```
5. Send `{"type":"response.create"}` so the model speaks the result.

---

## 5. Connecting the action tool to OpenClaw

OpenClaw exposes an **OpenAI-compatible Responses API** at
`<gateway>/v1/responses`.

**Request**
- Headers:
  - `Authorization: Bearer <gateway_key>`
  - `x-openclaw-agent-id: main`
  - `x-openclaw-session-key: <session_key>`  ← see "shared session" below
  - `Content-Type: application/json`
  - `Accept: text/event-stream`
- Body:
  ```json
  { "model":"openclaw", "stream":true, "user":"<id>",
    "input":[{"type":"message","role":"user","content":"<the request text>"}] }
  ```

**Response (SSE)** — parse line-oriented `event:` / `data:` frames:
- `response.output_text.delta` → append `delta`
- `response.completed` or a `data: [DONE]` line → finish
- `response.failed` → surface `error.message`

Feed the collected text back to grok as the `function_call_output` (§4.4).

**Shared session across devices.** Make the `x-openclaw-session-key`
deterministic per conversation — e.g. `agent:main:neoclaw-<clientId>` (we use
`agent:main:neoclaw-trip-<id>`). Using the **same key the web app uses** means the
OpenClaw server-side session — and the conversation transcript — is shared across
web and mobile automatically. The gateway chains turns by this key, so you don't
need to track `previous_response_id` yourself.

---

## 6. Gotchas we hit (avoid these)

- **60s request timeout.** `URLRequest` defaults to a 60s timeout that *overrides*
  `URLSessionConfiguration.timeoutIntervalForRequest`. Long agent calls (web
  search can take 30–90s) get cut off at ~1 minute and return empty. Set
  `request.timeoutInterval = 300` explicitly. *(Best avoided entirely by using the
  hosted `web_search` tool for lookups so they never go through your backend.)*
- **Don't bridge web search through your backend.** Early on we routed lookups
  client → backend → client. It was slow and timed out. The hosted `web_search`
  tool is the correct path; only **mutations** need the function bridge.
- **Transcript duplicates.** The server may send multiple partial/final
  `conversation.item.input_audio_transcription.*` events per utterance. De-dupe by
  the event's `item_id` and update one bubble in place.
- **Echo / half-duplex temptation.** It's tempting to mute the mic while the
  assistant speaks to stop echo, but that kills barge-in. Rely on hardware AEC
  (`.voiceChat` + voice processing) and keep the mic open. Test on a device.
- **Verify against the live API before wiring the app.** A tiny Python
  `websockets` probe (below) confirms auth, tool registration, and the
  function-call round-trip in minutes.

---

## 7. Quick verification probe (Python)

```python
import asyncio, json, websockets

KEY = "<XAI_API_KEY>"
URL = "wss://api.x.ai/v1/realtime?model=grok-voice-latest"

async def main():
    async with websockets.connect(URL, subprotocols=[f"xai-client-secret.{KEY}"]) as ws:
        await ws.send(json.dumps({"type": "session.update", "session": {
            "voice": "ara",
            "instructions": "Use web_search for current info, then answer concisely.",
            "turn_detection": {"type": "server_vad"},
            "tools": [{"type": "web_search"}],
        }}))
        # send a text turn (no audio needed to test tools)
        await ws.send(json.dumps({"type": "conversation.item.create", "item": {
            "type": "message", "role": "user",
            "content": [{"type": "input_text", "text": "What's the weather in Zurich right now?"}]}}))
        await ws.send(json.dumps({"type": "response.create"}))
        spoke = ""
        for _ in range(200):
            j = json.loads(await asyncio.wait_for(ws.recv(), timeout=30))
            t = j.get("type")
            if t == "ping":
                await ws.send(json.dumps({"type": "pong", "ping_timestamp": j.get("ping_timestamp")}))
            elif t == "response.output_audio_transcript.delta":
                spoke += j.get("delta", "")
            elif t == "response.done":
                break
            elif t == "error":
                print("ERROR", j); break
        print("Assistant said:", spoke)

asyncio.run(main())
```
If this prints real current weather, hosted `web_search` is working end-to-end —
you can confidently wire it into the app.

---

## 8. Suggested app structure

- **WebSocketClient** — connect (with subprotocol auth), send/receive JSON, ping/pong.
- **AudioEngine** — `AVAudioEngine` wrapper: mic tap → 24kHz Int16 base64; decode &
  play `output_audio.delta`; AEC via `.voiceChat` + voice processing.
- **VoiceStore (orchestrator)** — owns the session, sends `session.update` with the
  tools, routes events, runs the OpenClaw bridge for the action tool, exposes
  transcript/state to the UI.
- **Call UI** — an animated state indicator (listening/speaking), optional
  transcript, mute / end controls.
