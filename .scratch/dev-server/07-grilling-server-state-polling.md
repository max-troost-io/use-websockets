---
label: wayfinder:grilling
status: closed
assigned: agent
---

# Grilling: Server-state polling mechanism

## Question

How does the browser UI read server-side scenario state — e.g. "the server is currently ignoring heartbeat pings", "reconnects are blocked until T+10s"?

The state lives on the server (in the `globalThis` WS singleton). The UI needs to show it in the stats row of the relevant scenario pane. Options:

- **Server function poll** — a `createServerFn` that returns current server state; the UI polls it on an interval (or via TanStack Query's `refetchInterval`). Simple, no extra infrastructure.
- **Server-Sent Events (SSE)** — server pushes state changes to the browser over an SSE stream. More responsive, but adds a second long-lived connection alongside the WebSocket under test. Potentially confusing.
- **A second WebSocket** — a separate "control" WebSocket on a different path or port that pushes server state. Overkill for a dev tool.
- **Optimistic local state only** — the UI owns the "is ignoring pings" flag (it set it via a server function button click); no round-trip needed. Works for simple boolean flags, breaks for derived state (e.g. "reconnects blocked until" countdown driven by the server clock).

The simplest answer is probably server function polling via TanStack Query — fits the existing Start architecture, no new infrastructure, refresh lag of ~1s is acceptable for a dev tool.

**Blocked by:** none — unblocked after `02-prototype-scenario-ui-structure` resolved.

## Resolution

**Decision: local React state only — no polling, no SSE.**

In all three scenarios the UI is always the initiator of the state change:
- Reconnection: UI calls drop/block server function — it owns the flag and can compute the countdown from the duration it chose
- Heartbeat: UI sets the ignore-pings toggle — it owns the boolean
- Online/Offline: entirely client-side, no server state involved

The server never generates scenario state independently. Plain React state (or a small TanStack Store slice) per scenario route is sufficient. No infrastructure beyond what the server functions already provide.
