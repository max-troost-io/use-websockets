# TanStack Start + WebSocket Integration Research

**Researched:** 2026-07-24  
**Sources:** Official docs, GitHub source, primary specs only

---

## Summary

Key takeaways for wiring up a WebSocket server in TanStack Start dev mode:

1. **TanStack Start's `fetch`-based server entry cannot handle WebSocket upgrades.** The WinterCG `fetch` API is a request/response model — WebSocket upgrades are a raw TCP socket handoff that happens below it. You must reach into the underlying Node.js `http.Server`.

2. **In dev mode, the Node.js HTTP server is Vite's `httpServer`.** Access it via a Vite plugin's `configureServer(server)` hook: `server.httpServer.on('upgrade', ...)`. Vite exposes `server.httpServer: http.Server | null` ([Vite JavaScript API docs](https://vite.dev/guide/api-javascript#vitedevserver)).

3. **Vite's HMR already attaches its own `upgrade` handler** to `httpServer`. You must coexist with it by routing upgrade requests by path (e.g., check `req.url`) — Vite's HMR uses `/__vite_hmr` or `/@vite/client`-related paths.

4. **h3's `defineWebSocketHandler` is experimental (nightly channel only)** in v1. For a stable path, attach crossws or raw `ws` directly to the Node.js server's `upgrade` event.

5. **There is no official TanStack Start WebSocket example** in the TanStack/router repository as of the research date.

6. **Server functions share a Node.js process with the WS server.** A module-level singleton is the right pattern, but guard against HMR resets in dev.

---

## Q1: Does h3 or Nitro expose a first-class WebSocket API, or must raw `http.Server` be accessed directly?

### h3 (v1 stable)

h3 has built-in WebSocket support via `defineWebSocketHandler`, backed by [CrossWS](https://crossws.unjs.io/). From the h3 docs:

> "H3 natively supports runtime agnostic WebSocket API using CrossWS."  
> ⚠️ "WebSockets support is currently experimental and available in [nightly channel](https://v1.h3.dev/guide/nightly)."  
> — [h3 WebSocket guide](https://v1.h3.dev/guide/websocket)

The API looks like this:

```ts
import { createApp, defineWebSocketHandler } from "h3";

const app = createApp();
app.use("/_ws", defineWebSocketHandler({
  open(peer) { peer.send("Welcome!"); },
  message(peer, msg) { peer.send(msg); },
  close(peer) { },
}));
```

**However, even with this API, the Node.js adapter still requires manual wiring to the raw `http.Server` upgrade event.** From the [h3 Node.js adapter docs](https://v1.h3.dev/adapters/node#websocket-support):

```js
import wsAdapter from "crossws/adapters/node";

const { handleUpgrade } = wsAdapter(app.websocket);
server.on("upgrade", handleUpgrade);
```

So the answer is: **h3 exposes a first-class API (`defineWebSocketHandler`), but it is still experimental (nightly), and it still requires hooking the raw `server.on("upgrade", ...)` event on the Node.js HTTP server.** You cannot avoid touching the HTTP server.

### Nitro

Nitro wraps h3 and has its own WebSocket guide at [nitro.build/guide/websocket](https://nitro.build/guide/websocket). The page content did not render via web scraping (the Nitro docs site serves the raw markdown path dynamically), but the Nitro GitHub shows [a `node` preset directory](https://github.com/nitrojs/nitro/tree/main/src/presets/node) and Nitro's architecture clearly delegates to h3's crossws integration.

**Important:** TanStack Start's React variant does **not** use Nitro directly in its default setup. Only the Solid Start variant has an explicit `nitro/vite` plugin example:

```ts
// examples/solid/start-basic-nitro/vite.config.ts (TanStack/router repo)
import { nitro } from 'nitro/vite'
plugins: [nitro({ preset: 'node-server' }), tanstackStart(...)]
```

The React Start variant uses `tanstackStart()` alone, which internally uses srvx for the production server entry.

### Verdict

You must access the raw Node.js `http.Server`. The h3 `defineWebSocketHandler` API is a convenience wrapper, not a bypass of this requirement. In the TanStack Start React context, the relevant server is Vite's `httpServer` in dev, and whatever node server (express + `toNodeHandler`, or srvx) is used in production.

---

## Q2: Which WebSocket package is the right fit, and does the Start dev server conflict with a parallel `ws` server on the same port?

### Package options

**Option A: `crossws/adapters/node` (recommended for h3/Nitro users)**  
crossws is the UnJS-family WebSocket adapter used internally by h3. It prebundles `ws` internally.

```js
import crossws from "crossws/adapters/node";
const ws = crossws({ hooks: { message: console.log } });
server.on("upgrade", (req, socket, head) => {
  if (req.headers.upgrade === "websocket") {
    ws.handleUpgrade(req, socket, head);
  }
});
```
Source: [crossws Node.js adapter docs](https://crossws.h3.dev/adapters/node)

**Option B: Raw `ws` library**  
Works fine. Must be attached to the Node.js upgrade event manually (`noServer: true` option):

```js
import { WebSocketServer } from "ws";
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/my-ws") {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  }
});
```

**Option C: h3's `defineWebSocketHandler` (experimental)**  
Available in h3 nightly only. Uses crossws under the hood. Not suitable for production code yet.

### Port conflict analysis

The key fact is: **Vite's `httpServer` uses a single port for HTTP, SSR requests, AND HMR WebSocket upgrades.**

From the [Vite JavaScript API docs](https://vite.dev/guide/api-javascript#vitedevserver):

```ts
interface ViteDevServer {
  httpServer: http.Server | null  // native Node http server
  ws: WebSocketServer             // Vite's HMR WebSocket server
}
```

Vite's HMR server listens on the same port and handles `upgrade` events for its own clients. The upgrade path Vite uses is implementation-specific (tied to Vite internals, not documented as stable).

**Running a parallel `ws` server on a different port: No conflict.** This is the safest approach.

**Running on the same port via `httpServer.on('upgrade', ...)`: Possible, but requires path routing.** You must inspect `req.url` in the upgrade handler and forward the request to the right handler:

```js
server.httpServer.on("upgrade", (req, socket, head) => {
  if (req.url === "/my-ws") {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    // do NOT call next; don't let Vite also handle it
  }
  // Otherwise: Vite's own upgrade handler (installed separately) will process it
});
```

Note: Attaching to `httpServer` only works when `httpServer !== null`. In middleware mode (`server.middlewareMode: true`), Vite does not create an `httpServer` and `server.httpServer` is `null`.

**Conclusion:** Use a separate port in dev to avoid any risk of upgrade-handler ordering bugs. In production the deployment target (srvx, express) controls the HTTP server and you have full control.

---

## Q3: How do server functions communicate with a shared WebSocket server instance?

### Architecture

Server functions (`createServerFn`) run on the same Node.js process as the rest of the dev server. From the [TanStack Start server functions docs](https://tanstack.com/start/latest/docs/framework/react/build-from-scratch):

```ts
const getCount = createServerFn({ method: 'GET' }).handler(() => readCount())
```

These are serialized RPC calls that ultimately run Node.js code in the same process. There is no worker thread or process isolation.

### Pattern: Module-level singleton

The standard pattern is to export a singleton from a dedicated module:

```ts
// src/lib/ws-server.ts
import { WebSocketServer } from "ws";
export const wss = new WebSocketServer({ noServer: true });
```

Server functions import this module:

```ts
// src/routes/api.broadcast.ts
import { createFileRoute } from "@tanstack/react-router";
import { wss } from "~/lib/ws-server";

export const Route = createFileRoute("/api/broadcast")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { message } = await request.json();
        wss.clients.forEach(client => {
          if (client.readyState === 1) client.send(message);
        });
        return Response.json({ ok: true });
      },
    },
  },
});
```

### HMR caveat in dev

In development, Vite's HMR can reload modules when files change, resetting module-level singletons. Two mitigations:

1. **`globalThis` stashing** (reliable but inelegant):
   ```ts
   // src/lib/ws-server.ts
   import { WebSocketServer } from "ws";
   const g = globalThis as any;
   if (!g.__wss) {
     g.__wss = new WebSocketServer({ noServer: true });
   }
   export const wss: WebSocketServer = g.__wss;
   ```

2. **Vite's `import.meta.hot.data`** (only available inside Vite plugin code, not in app modules directly).

The `globalThis` approach is the practical choice for app-level code.

### Event bus alternative

For more complex scenarios (e.g., multiple route files need to publish to WebSocket clients), a shared event emitter works:

```ts
// src/lib/ws-bus.ts
import { EventEmitter } from "node:events";
const g = globalThis as any;
if (!g.__wsBus) g.__wsBus = new EventEmitter();
export const wsBus: EventEmitter = g.__wsBus;
```

Clients register listeners on connect; server functions emit events on the bus. The WebSocket server listens on the bus and forwards to connected clients.

---

## Q4: What does the `pnpm dev` startup sequence look like?

### Current TanStack Start (React variant) startup

TanStack Start's React variant (as documented in [Build from Scratch](https://tanstack.com/start/latest/docs/framework/react/build-from-scratch)) uses `vite dev` directly:

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build"
  }
}
```

The `vite.config.ts` uses the `tanstackStart()` plugin:

```ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
export default defineConfig({
  server: { port: 3000 },
  plugins: [tanstackStart(), viteReact()],
})
```

Source: All React Start examples in [TanStack/router repo](https://github.com/TanStack/router/tree/main/examples/react/start-counter/vite.config.ts)

### Startup sequence (single command, single port)

When `vite dev` runs:

1. **Vite initializes** and reads `vite.config.ts`
2. **`tanstackStart()` plugin activates** — sets up SSR routing, server function compilation, route generation
3. **Vite creates an `http.Server`** on port 3000
4. **Vite's HMR WebSocket server starts** on the same port 3000 (not a separate port) — uses the same `http.Server`, routes upgrade requests internally
5. **Vite's connect-based middleware stack handles all HTTP**: static assets, SSR requests, server routes, server function calls (via the `tanstackStart` plugin)

**There is ONE process and ONE port.** `pnpm dev` = `vite dev` = one Vite command covering HTTP, SSR, HMR WebSocket, server routes, and server functions.

### Solid Start with Nitro variant (different)

The Solid Start + Nitro example uses:
```ts
// examples/solid/start-basic-nitro/vite.config.ts
import { nitro } from 'nitro/vite'
plugins: [nitro({ preset: 'node-server' }), tanstackStart(...)]
```
This adds Nitro's layer on top, which would bring Nitro's WebSocket support (`defineWebSocketHandler`). However, this is the Solid variant, not React.

---

## Q5: Known issues running a persistent WebSocket server alongside Start's HMR dev server?

### Issue 1: Upgrade handler ordering

Vite attaches its HMR upgrade handler to `httpServer` automatically. If you also attach an `upgrade` listener, Node.js fires **all** registered `upgrade` listeners in order of registration. If your handler calls `socket.destroy()` or `socket.end()` for connections it doesn't handle (which some libraries do), it will kill Vite's HMR socket too.

**Mitigation:** Only handle upgrades that match your path. Let everything else fall through:
```js
server.httpServer.on("upgrade", (req, socket, head) => {
  if (req.url === "/my-ws") {
    wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
  }
  // Don't destroy socket; let other listeners (Vite's) handle it
});
```

### Issue 2: `httpServer` is `null` in middleware mode

If Vite is started with `server.middlewareMode: true`, `server.httpServer === null`. In that case there's no server to attach to from within a Vite plugin's `configureServer` hook.
Source: [Vite JS API docs](https://vite.dev/guide/api-javascript#vitedevserver)

### Issue 3: Module singleton reset on HMR

When any file in your server module graph changes, Vite may re-execute the affected modules. If your WebSocket server is created in one of those modules, it will be re-created — losing all existing connections. Use `globalThis` stashing (see Q3) to avoid this.

### Issue 4: No first-class TanStack Start WebSocket API

There is no `defineWebSocketHandler`, `useWebSocket`, or equivalent in `@tanstack/react-start`. The repo's examples (as of research date) do not include a WebSocket example. You are working outside the framework's documented surface.

### Issue 5: Dev vs. production behavior difference

In dev, the HTTP server is Vite's internal Node.js server. In production, the server is whatever the deployment preset provides (srvx, express, Bun, etc.). The upgrade hook wiring must be adapted for each environment:
- Dev: Vite plugin `configureServer` hook
- Production (node-server): attach to the srvx/express server before calling `.listen()`

This makes the WebSocket integration non-portable and requires duplicating the wiring logic.

### Issue 6: h3's `defineWebSocketHandler` is not available in React Start without adding Nitro

Since the React Start variant doesn't include Nitro by default, `defineWebSocketHandler` from h3 is not available without explicitly adding it. The Solid variant has a `nitro/vite` example, but the React variant does not.

---

## Recommended Approach

### For development (safe, minimal conflict risk)

Use a **separate port** for the WebSocket server during development. This eliminates all upgrade-handler ordering concerns.

```ts
// vite.config.ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import { WebSocketServer } from 'ws'
import type { Plugin } from 'vite'

function wsPlugin(): Plugin {
  return {
    name: 'app-ws-server',
    configureServer(server) {
      // Use a separate port to avoid conflicting with Vite's HMR
      const wss = getOrCreateWss(9000)
      wss.on('connection', (ws) => {
        ws.on('message', (msg) => ws.send(`echo: ${msg}`))
      })
    },
  }
}

export default defineConfig({
  server: { port: 3000 },
  plugins: [tanstackStart(), wsPlugin()],
})
```

Store the `wss` on `globalThis` so it survives HMR module reloads (see Q3 pattern). The client connects to `ws://localhost:9000`.

### For production (same port via srvx/express)

In production, after building with `vite build`, Start exports a `fetch`-based server handler. Wrap it in express (or srvx) and attach the WebSocket server to the same express HTTP server:

```ts
// server.ts (production entry)
import express from 'express'
import { toNodeHandler } from 'srvx/node'
import { WebSocketServer } from 'ws'
import { getSharedWss } from './src/lib/ws-server.js'

const app = express()
const httpServer = app.listen(3000)
const wss = getSharedWss() // singleton from shared module

httpServer.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  }
})

// Start's fetch handler
const { default: handler } = await import('./dist/server/server.js')
app.use(toNodeHandler(handler.fetch))
```

### Package choice

- Use **`ws`** directly if you want minimal dependencies and full control.
- Use **`crossws/adapters/node`** if you want to use h3's `defineWebSocketHandler` API and are willing to use the nightly channel — or if you want crossws's built-in idle-timeout / dead-connection detection.
- **Do not** use h3's `defineWebSocketHandler` in production code until it exits the nightly/experimental stage.

### Summary table

| Concern | Recommendation |
|---|---|
| Dev port | Separate port (e.g., 9000) for WS server |
| Access `httpServer` in dev | Vite plugin `configureServer(server)` hook |
| Package | `ws` (stable) or `crossws/adapters/node` (experimental) |
| Shared state with server functions | `globalThis`-stashed singleton module |
| HMR resilience | Guard singleton creation with `if (!globalThis.__wss)` |
| Production wiring | express/srvx wrapper around Start's `fetch` handler |
| h3 `defineWebSocketHandler` | Available but experimental (h3 nightly only, not in react-start by default) |

---

## Source Citations

| Source | URL | Key fact referenced |
|---|---|---|
| TanStack Start overview | https://tanstack.com/start/latest/docs/framework/react/overview | Start uses Vite/Rsbuild; no Vinxi in current version |
| TanStack Start build from scratch | https://tanstack.com/start/latest/docs/framework/react/build-from-scratch | `vite dev` is the dev command; `tanstackStart()` plugin |
| TanStack Start server entry point | https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point | `fetch` handler pattern; WinterCG format |
| TanStack Start server routes | https://tanstack.com/start/latest/docs/framework/react/guide/server-routes | HTTP-only handler surface; no WS |
| TanStack/router GitHub (examples) | https://github.com/TanStack/router/tree/main/examples/react/start-counter/vite.config.ts | `pnpm dev` = `vite dev` |
| TanStack/router GitHub (solid Nitro) | https://github.com/TanStack/router/tree/main/examples/solid/start-basic-nitro/vite.config.ts | `nitro/vite` plugin; Solid-only |
| TanStack/router GitHub (e2e rsbuild) | https://github.com/TanStack/router/tree/main/e2e/react-start/custom-server-rsbuild/express-server.ts | `toNodeHandler` / `connectWebSocket` in production |
| h3 WebSocket guide (v1) | https://v1.h3.dev/guide/websocket | `defineWebSocketHandler` is experimental/nightly |
| h3 Node.js adapter | https://v1.h3.dev/adapters/node#websocket-support | `server.on("upgrade", handleUpgrade)` required |
| crossws guide | https://crossws.h3.dev/guide | crossws provides runtime-agnostic WS hooks |
| crossws Node.js adapter | https://crossws.h3.dev/adapters/node | Node adapter uses prebundled `ws`; `fromNodeUpgradeHandler` for existing `ws` servers |
| Vite JavaScript API | https://vite.dev/guide/api-javascript#vitedevserver | `httpServer: http.Server \| null`; `ws: WebSocketServer` |
| Vite Plugin API (configureServer) | https://vite.dev/guide/api-plugin#configureserver | Plugin hook for accessing `httpServer` in dev |
