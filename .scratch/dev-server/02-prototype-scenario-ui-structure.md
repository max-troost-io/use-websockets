---
label: wayfinder:prototype
status: closed
assigned: agent
---

# Prototype: Scenario control UI structure

## Question

How should the scenario control UI be laid out?

Key tensions to resolve:
- **Single dashboard vs separate routes** — one page with collapsible panels per scenario (quicker to switch between scenarios) vs `/reconnection`, `/heartbeat`, `/online-offline` routes (each scenario isolated, cleaner URL-driven state)
- **Per-scenario controls** — what buttons/sliders does each scenario panel expose? (e.g. "Drop connection", "Delay reconnect", "Stop heartbeat response")
- **Status feedback panel** — what does the client-side display show? ReadyState, reconnection attempt count, last message timestamp, raw message log?

Produce a rough wireframe or outline to react to.

**Blocked by:** none — this can be prototyped before the server API is known; server-state indicators can be added once `01-research-ts-start-websocket` resolves.

## Resolution

Prototype asset: [`.scratch/dev-server/prototype/index.html`](prototype/index.html)

**Decision: Variant B — sidebar nav + detail pane.**

- Left sidebar: scenario list (Reconnection, Heartbeat, Online/Offline) + connection status badge at bottom
- Right main pane: one scenario at a time — state stats row, controls card, event log card
- Structure: separate routes per scenario (e.g. `/reconnection`, `/heartbeat`, `/online-offline`), with the sidebar as a persistent layout shell
- Event log is scoped per scenario (not shared), lives in the detail pane
- Server-state indicators (e.g. "ignoring pings") belong in the stats row of the relevant scenario pane
