---
label: wayfinder:map
---

# Dev Server for Testing — Wayfinder Map

## Destination

A `dev-server/` TanStack Start app in this repo — a browser UI that uses the library itself and controls an embedded WebSocket server via server functions to trigger edge-case scenarios: reconnection backoff, heartbeat failure, and online/offline detection. A single `pnpm dev` starts everything.

## Notes

Domain: WebSocket library dev tooling.
Skills to consult per ticket type: `/research` (AFK), `/prototype` (HITL), `/grilling` (HITL).
Repo: `@maxtroost/use-websocket` — the dev-server is a consumer of this library, not part of its build artifact. The library uses TanStack Store for reactive state; the dev-server can observe that state directly since it imports the library.

## Decisions so far

- [Research: TanStack Start WebSocket server integration](01-research-ts-start-websocket.md) — `ws` on a separate port (`:3001`), wired via a Vite plugin `configureServer` hook; `globalThis` singleton shared with server functions; single `vite dev` covers everything; h3's `defineWebSocketHandler` is experimental and not used.
- [Prototype: Scenario control UI structure](02-prototype-scenario-ui-structure.md) — Variant B: sidebar nav + detail pane; separate route per scenario; event log scoped per scenario; server-state indicators live in the stats row of each scenario's detail pane.
- [Grilling: Library import strategy in dev-server](03-grilling-library-import.md) — Vite path alias `@maxtroost/use-websocket` → `../src/index.ts`; live HMR on library source changes, no build step needed.
- [Prototype: Reconnection scenario design](04-prototype-reconnection-scenario.md) — Variant Y: unified drop+block; duration picker (No block / 10s / 60s / 120s / Hold); countdown ring + phase bar (Phase 1·4s×5 → Phase 2·30s×5 → Phase 3·90s×10); server refuses handshakes during block window via `globalThis` flag.
- [Prototype: Heartbeat failure scenario design](05-prototype-heartbeat-scenario.md) — Variant P: three-phase pipeline (`Next ping in` → `Awaiting pong` → `✓ Pong` / `✗ Stale`) with filling progress bar; single "Ignore pings" toggle; dev-server sets `pingIntervalMs: 5000` (requires ticket 08 library change).
- [Prototype: Online/offline scenario design](06-prototype-online-offline-scenario.md) — Variant R: single "Simulate offline" toggle; pane tints red when offline with explanatory banner; purely client-side (synthetic browser events); library's `handleOffline` tears down socket automatically.
- [Grilling: Server-state polling mechanism](07-grilling-server-state-polling.md) — Local React state only; no polling or SSE needed. The UI always initiates scenario state changes, so it already owns every flag. No extra infrastructure.
- [Task: Add `pingIntervalMs` to `HeartbeatConfig`](08-task-ping-interval-config.md) — Added `pingIntervalMs?: number` to `HeartbeatConfig`; `schedulePing()` reads it with `?? getPingTime()` fallback. Non-breaking; all 169 tests pass. Dev-server sets `pingIntervalMs: 5000`.

## Not yet specified

<!-- none — all fog cleared -->

## Out of scope

- Automated e2e testing — confirmed manual/visual exploration only
- Deployment or hosting of the dev server anywhere other than localhost
- Additional scenarios (multiple URI routing, multiple concurrent connections) — the destination named three specific scenarios; follow-on effort if needed, using the same sidebar+detail pattern established here
