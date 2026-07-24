---
label: wayfinder:prototype
status: closed
assigned: agent
---

# Prototype: Online/offline scenario design

## Question

What does the online/offline scenario look like end-to-end?

The library observes `window.addEventListener('online' | 'offline')`. Unlike the other scenarios, this one is browser-side only — no server action required.

- **Browser trigger:** dispatch synthetic `online`/`offline` events via `window.dispatchEvent(new Event('offline'))` from a UI button
- **UI controls:** "Go offline" / "Come back online" buttons; or a single toggle
- **Status display:** current navigator.onLine value, ReadyState before/after, whether the library reconnects on the `online` event

Open question: should the scenario also physically close the WebSocket (simulating what a real network drop would do) in addition to firing the browser event, or is the event enough?

**Blocked by:** ~~`02-prototype-scenario-ui-structure`~~ ✔ resolved

**Unblocked. Layout: sidebar nav shell, `/online-offline` route, stats row + controls card + event log card.**

## Resolution

Prototype asset: [`.scratch/dev-server/prototype/online-offline.html`](prototype/online-offline.html)

**Decision: Variant R — single toggle.**

- "Simulate offline" toggle; when active the pane tints red and an explanatory banner appears
- Stats row: `navigator.onLine` (simulated) + ReadyState
- No server dependency — purely client-side: dispatches synthetic `offline` / `online` browser events; the library's `handleOffline` tears down the socket automatically
- Toggle back simulates coming online — library calls `connect()` and ReadyState transitions to CONNECTING → OPEN
