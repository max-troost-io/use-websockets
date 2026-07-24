---
label: wayfinder:prototype
status: closed
assigned: agent
---

# Prototype: Heartbeat failure scenario design

## Question

What does the heartbeat failure scenario look like end-to-end?

The library sends a ping every 40 seconds and closes the connection if no pong is received. This scenario needs the server to silently drop pings.

- **Server behavior:** a "Stop responding to heartbeats" toggle via server function; the server receives the ping message but does not reply with a pong
- **UI controls:** "Ignore heartbeats" toggle; a countdown showing time until the library's heartbeat timeout fires
- **Status display:** ping sent / pong received log, ReadyState transition when the library detects a stale connection

Open question: does the library's 40s interval make this scenario too slow for interactive testing? If so, should the dev-server override the heartbeat interval for testing?

**Blocked by:**
- ~~`01-research-ts-start-websocket`~~ ✔ resolved
- ~~`02-prototype-scenario-ui-structure`~~ ✔ resolved

**Unblocked. Layout: sidebar nav shell, `/heartbeat` route, stats row + controls card + event log card.**

## Resolution

Prototype asset: [`.scratch/dev-server/prototype/heartbeat.html`](prototype/heartbeat.html)

**Decision: Variant P — pipeline.**

- Three-phase horizontal pipeline: `Next ping in Xs` → `Awaiting pong Xs` → `✓ Pong received` or `✗ Stale`
- Progress bar fills under the active phase (blue during interval, amber during pong timeout)
- Stats row: Pings sent, Pongs received, Missed pongs
- Single "Ignore heartbeat pings" toggle; when on, the await phase counts down to stale, closes, and reconnects automatically
- Dev-server sets `pingIntervalMs: 5000` (via ticket 08 library change); production default stays 40s
- Server behavior: receives ping message, does not reply with pong when ignoring
