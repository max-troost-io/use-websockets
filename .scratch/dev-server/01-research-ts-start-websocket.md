---
label: wayfinder:research
status: closed
assigned: ~
---

# Research: TanStack Start WebSocket server integration

## Question

How does TanStack Start's underlying server stack (Vinxi / h3 / Nitro) handle WebSocket upgrade requests in development? Specifically:

1. Does h3 or Nitro expose a first-class WebSocket API, or must the raw Node.js `http.Server` be accessed directly?
2. Which WebSocket server package is the right fit (`ws`, `uWebSockets.js`, a Nitro/h3 peer)? Does Start's dev server conflict with a parallel `ws` server on the same port?
3. How do server functions communicate with the WebSocket server instance (shared singleton, event bus, etc.)?
4. What does the `pnpm dev` startup sequence look like — does one Vite/Vinxi command cover both the HTTP/WS upgrade and the client HMR?
5. Are there any known issues running a persistent WebSocket server alongside TanStack Start's HMR dev server?

Consult the TanStack Start docs, h3 source, and Nitro WebSocket docs. Check for official examples of WebSocket servers embedded in Start/Nitro apps.

## Resolution

Full findings: [`.scratch/dev-server/research/01-ts-start-websocket-integration.md`](research/01-ts-start-websocket-integration.md)

Key answers:

1. **h3's `defineWebSocketHandler` is experimental (nightly only).** The stable path is to wire `ws` (or `crossws/adapters/node`) directly to the Node.js `upgrade` event. Either way, you must touch the raw HTTP server — there is no bypass.

2. **In TanStack Start dev, the HTTP server is Vite's `httpServer`.** Access it via a Vite plugin's `configureServer(server)` hook: `server.httpServer.on('upgrade', ...)`. Vite's own HMR also attaches an upgrade handler — coexist by routing on `req.url`, or use a **separate port** (safest, no routing complexity, no `httpServer: null` risk in middleware mode).

3. **Server functions share the same Node.js process** as the WS server. Use a module-level singleton stashed on `globalThis` to survive HMR module reloads in dev.

4. **Single `pnpm dev` covers everything.** TanStack Start (React) uses plain Vite — just `vite dev`. No Vinxi orchestration in the current React Start architecture.

5. **No official WS examples exist** in the TanStack/router repo. Dev/prod wiring differs (Vite plugin hook vs. a node http server wrapper).

**Decided:** `ws` package on a **separate port** (e.g. `:3001`) wired via a Vite plugin, `globalThis` singleton shared with server functions.

