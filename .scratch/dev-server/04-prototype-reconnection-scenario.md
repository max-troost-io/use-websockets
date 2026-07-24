---
label: wayfinder:prototype
status: closed
assigned: agent
---

# Prototype: Reconnection scenario design

## Question

What does the reconnection scenario look like end-to-end?

- **Server behavior:** server closes the socket on demand (e.g. a "Drop connection" button triggers a server function that calls `socket.close()`). Does the server also support a "refuse reconnection for N seconds" mode to make the backoff phases visible?
- **UI controls:** "Drop connection" button; optionally a delay slider or "block reconnects for Xs" toggle
- **Status display:** ReadyState transitions (OPEN → CLOSED → CONNECTING → OPEN), reconnection attempt counter, backoff delay display, timestamps

**Blocked by:**
- ~~`01-research-ts-start-websocket`~~ ✔ resolved
- ~~`02-prototype-scenario-ui-structure`~~ ✔ resolved

**Unblocked. Layout: sidebar nav shell, `/reconnection` route, stats row + controls card + event log card.**

## Resolution

Prototype asset: [`.scratch/dev-server/prototype/reconnection.html`](prototype/reconnection.html)

**Decision: Variant Y — unified drop+block.**

- Single "Drop Connection" button; block duration chosen upfront via a duration picker (No block / 10s / 60s / 120s / Hold)
- Countdown ring shows time remaining while server is blocking reconnects; "Release Block" button available at any time
- Phase bar (Phase 1 · 4s ×5 → Phase 2 · 30s ×5 → Phase 3 · 90s ×10) shows where the library is in its backoff sequence
- Stats row: ReadyState, Attempts, Next retry in
- Event log: per-scenario, scoped to the `/reconnection` route
- Server behavior: `socket.close()` on drop; `globalThis` flag to refuse handshakes during block window
