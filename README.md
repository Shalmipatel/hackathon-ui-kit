# Hackathon UI Kit

A short React chat interface that communicates with an OpenClaw instance.

It includes a browser connection so the assistant can connect to and interact with browser-based workflows.

## How It Communicates With OpenClaw

The app uses OpenClaw's OpenAI-compatible Responses API by default: `POST /v1/responses`.
OpenClaw streams assistant responses back to the UI with server-sent events. Browser connectivity is routed through the same gateway, including browser/websocket traffic such as `/websockify`.

## Run

```bash
npm install
npm run dev
```

The dev server starts at `http://localhost:5173`.
