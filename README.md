# @maxtroost/use-websocket

A robust WebSocket connection management package for React applications. It handles the hard parts — automatic reconnection with exponential backoff, heartbeat monitoring, URI-based message routing — and gives you a clean React interface via two hooks and TanStack Store.

**Peer dependencies:** React 18+, React DOM 18+

## Installation

```bash
npm install @maxtroost/use-websocket
# or
pnpm add @maxtroost/use-websocket
# or
yarn add @maxtroost/use-websocket
```

## Quick Start

The fastest path to a live WebSocket subscription:

```tsx
import {
  WebsocketClient,
  WebsocketClientProvider,
  useWebsocketSubscription,
  useSubscriptionSelector,
} from "@maxtroost/use-websocket";

// 1. Create a client once, outside any component
const client = new WebsocketClient({});

// 2. Wrap your app
function App() {
  return (
    <WebsocketClientProvider client={client}>
      <YourApp />
    </WebsocketClientProvider>
  );
}

// 3. Subscribe to data in any component
function LiveData() {
  const api = useWebsocketSubscription<{ count: number }>({
    key: "live-count",
    url: "wss://api.example.com/ws",
    uri: "/api/count",
  });

  const data = useSubscriptionSelector(api.store, (s) => s.message);
  const loading = useSubscriptionSelector(api.store, (s) => s.pendingSubscription);

  if (loading) return <p>Connecting…</p>;
  return <p>Count: {data?.count}</p>;
}
```

That's it. The hook manages the full connection lifecycle: it opens the socket, subscribes on connect, re-subscribes after reconnection, and cleans up on unmount.

---

## Two patterns, one connection

The package gives you two hooks for different communication styles. Both share a single underlying WebSocket connection per URL — you don't manage the connection yourself.

| | **`useWebsocketSubscription`** | **`useWebsocketMessage`** |
|---|---|---|
| **Pattern** | Streaming — subscribe once, receive ongoing updates | Request/response — send a message, optionally await a reply |
| **Use case** | Live feeds: notifications, dashboards, real-time lists | One-off commands: validate, submit, mark read |
| **URI** | Fixed per hook — one URI per subscription | Any URI — send to different endpoints per call |
| **State** | TanStack Store — reactive `message`, `pendingSubscription`, `connected` | Promise-based — no persistent store |
| **Lifecycle** | Auto-subscribes on open; unsubscribes on unmount | Fire when needed; no subscription |

---

## Setup

### 1. Create a `WebsocketClient`

The client holds configuration shared across all connections in your app. Create it once, outside any component.

```tsx
import { WebsocketClient } from "@maxtroost/use-websocket";

const websocketClient = new WebsocketClient({
  maxRetryAttempts: 20,
});
```

### 2. Wrap your app with `WebsocketClientProvider`

```tsx
import { WebsocketClientProvider } from "@maxtroost/use-websocket";

function App() {
  return (
    <WebsocketClientProvider client={websocketClient}>
      <YourApp />
    </WebsocketClientProvider>
  );
}
```

---

## Subscriptions

Use `useWebsocketSubscription` when you need to receive a stream of updates from the server.

### Basic subscription

```tsx
import { useWebsocketSubscription, useSubscriptionSelector } from "@maxtroost/use-websocket";

interface Voyage {
  id: string;
  name: string;
  status: string;
}

function VoyageList() {
  const api = useWebsocketSubscription<Voyage[], { status: string }>({
    key: "voyages-list",
    url: "wss://api.example.com/ws",
    uri: "/api/voyages",
    body: { status: "active" }, // sent with the subscribe message
  });

  const voyages = useSubscriptionSelector(api.store, (s) => s.message);
  const pending = useSubscriptionSelector(api.store, (s) => s.pendingSubscription);
  const connected = useSubscriptionSelector(api.store, (s) => s.connected);

  if (pending) return <Skeleton />;
  return (
    <div>
      {!connected && <p>Reconnecting…</p>}
      {voyages?.map((v) => (
        <div key={v.id}>{v.name}</div>
      ))}
    </div>
  );
}
```

The `store` is a [TanStack Store](https://tanstack.com/store). Use `useSubscriptionSelector` to subscribe to specific fields — this prevents re-renders when unrelated parts of the store update.

### Accessing a subscription's store from a child component

If a parent creates the subscription and a child needs the same data, use `useWebsocketSubscriptionByKey` with the same `key`. No prop-drilling or context wiring required.

```tsx
import { useWebsocketSubscriptionByKey, useSubscriptionSelector } from "@maxtroost/use-websocket";

function VoyageCount() {
  const store = useWebsocketSubscriptionByKey<Voyage[]>("voyages-list");
  const voyages = useSubscriptionSelector(store, (s) => s.message);
  return <span>Total: {voyages?.length ?? 0}</span>;
}
```

If the parent hasn't mounted yet, this hook returns a store with initial empty state — no null checks needed.

### Conditional subscriptions

Set `enabled: false` to pause a subscription without unmounting the component. Useful when the user isn't authenticated yet, or a feature flag is off.

```tsx
function VoyageList({ isAuthenticated }: { isAuthenticated: boolean }) {
  const api = useWebsocketSubscription<Voyage[]>({
    key: "voyages",
    url: "wss://api.example.com/ws",
    uri: "/api/voyages",
    enabled: isAuthenticated, // unsubscribes and disconnects when false
  });
  // ...
}
```

---

## Messages (Request / Response)

Use `useWebsocketMessage` when you need to send a command and optionally wait for a response.

```tsx
import { useWebsocketMessage } from "@maxtroost/use-websocket";

interface ValidationResult { valid: boolean; errors: string[] }
interface FormValues { name: string; date: string }

function VoyageEditor() {
  const api = useWebsocketMessage<ValidationResult, FormValues>({
    key: "voyages/modify",
    url: "wss://api.example.com/ws",
    responseTimeoutMs: 5000,
  });

  const handleValidate = async () => {
    try {
      const result = await api.sendMessage(
        "voyages/modify/validate", // URI
        "post",                    // method
        formValues                 // body
      );
      if (result.valid) { /* proceed */ }
    } catch (err) {
      // timeout, connection closed, or api disabled
    }
  };

  // Fire-and-forget (no response needed)
  const handleMarkRead = () => {
    api.sendMessageNoWait(`notifications/${id}/read`, "post");
  };

  return (
    <>
      <button onClick={handleValidate}>Validate</button>
      <button onClick={handleMarkRead}>Mark Read</button>
    </>
  );
}
```

> **Note:** If a second `sendMessage` to the same URI fires while the first is still pending, the first Promise rejects with `"WebSocket request overwritten for URI"`.

---

## Advanced

### Dynamic URL (e.g. auth tokens)

When your WebSocket URL includes an auth token, pass the full URL as the `url` option. The hook automatically reconnects with the new URL when it changes.

```tsx
function VoyageList() {
  const { token } = useAuth();
  const wsUrl = token ? `wss://api.example.com/ws?token=${token}` : "";

  const api = useWebsocketSubscription<Voyage[]>({
    key: "voyages",
    url: wsUrl,
    uri: "/api/voyages",
    enabled: !!token,
  });
}
```

To manually trigger reconnection across all connections (e.g. after a region or role change):

```ts
websocketClient.reconnectAllConnections();
```

### Adding auth headers to every message

```tsx
const client = new WebsocketClient({
  transformMessagePayload: (payload) => ({
    ...payload,
    headers: { Authorization: `Bearer ${getAuthToken()}` },
  }),
});
```

### Lifecycle callbacks

```tsx
const api = useWebsocketSubscription<Voyage[]>({
  key: "voyages",
  url: "wss://api.example.com/ws",
  uri: "/api/voyages",
  onSubscribe: ({ uri }) => console.log("Subscribed to", uri),
  onMessage: ({ data }) => console.log("Received", data),
  onError: (error) => {
    if (error.type === "transport") console.error("Connection error", error.event);
  },
  onMessageError: (error) => {
    // Server sent an error-method message (type: "error" | "conflict" | "exception")
    console.error("Server error", error.message);
  },
  onClose: (event) => console.log("Closed", event.code),
});
```

### Per-call timeout override

```tsx
const result = await api.sendMessage("/api/command", "post", body, {
  timeout: 3000, // overrides responseTimeoutMs for this call only
});
```

### Dev console: inspect and adjust timeouts at runtime

Create the client in a dedicated file and expose a narrow console API in development — not the full client instance.

```tsx
// src/websocketClient.ts
import { WebsocketClient, exposeWebsocketClientDevTools } from "@maxtroost/use-websocket";

export const websocketClient = new WebsocketClient({
  messageResponseTimeoutMs: 10_000,
});

if (import.meta.env.DEV) {
  exposeWebsocketClientDevTools(websocketClient);
}
```

In the browser console:

```js
__websocketClientDev.setMessageResponseTimeoutMs(2000);
__websocketClientDev.getMessageResponseTimeoutMs(); // → 2000
```

This updates the default for all subsequent `sendMessage` calls. In-flight requests keep their original timeout; per-call overrides take precedence.

### Connection event logging

```tsx
const client = new WebsocketClient({
  connectionEvent: (event) => {
    switch (event.type) {
      case "reconnecting":
        analytics.track("ws_reconnecting", { url: event.url, retries: event.retries });
        break;
      case "max-retries-exceeded":
        // Show a manual retry button — call websocketClient.reconnectAllConnections() on click
        break;
    }
  },
});
```

---

## Message format

All outgoing messages are sent as JSON:

```json
{ "method": "subscribe", "uri": "/path/to/endpoint", "body": { ... } }
```

| Field | Required | Description |
|---|---|---|
| `method` | No | `"subscribe"`, `"unsubscribe"`, or `"post"` (default for custom messages) |
| `uri` | Yes | Path used by the server to route the message to the correct handler |
| `body` | No | Arbitrary payload |

---

## API Reference

### `WebsocketClient` constructor options

All fields are optional.

| Option | Type | Default | Description |
|---|---|---|---|
| `maxRetryAttempts` | `number` | — | Max reconnection attempts before stopping. ~10 attempts ≈ 12 min at phase 3. |
| `notificationThreshold` | `number` | — | Attempts before triggering user-facing `connectionEvent` notifications. |
| `messageResponseTimeoutMs` | `number` | `10000` | Default `sendMessage` timeout in ms. |
| `delays.firstPhase` | `number` | `4000` | Reconnect delay for attempts 0–4. |
| `delays.secondPhase` | `number` | `30000` | Reconnect delay for attempts 5–9. |
| `delays.thirdPhase` | `number` | `90000` | Reconnect delay for attempts 10+. |
| `connectionCleanupDelayMs` | `number` | — | Delay before closing a connection that has no remaining listeners. |
| `heartbeat.enabled` | `boolean` | `true` | Enable ping/pong keepalive. |
| `heartbeat.pongTimeoutMs` | `number` | `10000` | Time to wait for a pong before treating the connection as dead and reconnecting. |
| `transformMessagePayload` | `(payload) => payload` | — | Transform every outgoing message (e.g. add auth headers). |
| `connectionEvent` | `(event) => void` | — | Callback for connection lifecycle events: `open`, `close`, `reconnecting`, `max-retries-exceeded`, `message-error`, `parse-error`, `pong-timeout`, and others. |

### `WebsocketClient` methods

| Method | Description |
|---|---|
| `reconnectAllConnections()` | Reconnect all active connections. Use after auth or region changes. |
| `setMessageResponseTimeoutMs(ms)` | Update the default response timeout and propagate it to all registered message APIs. |

### Hooks

| Hook | Returns | Description |
|---|---|---|
| `useWebsocketSubscription(options)` | `WebsocketSubscriptionApiPublic` | Subscribe to a URI; read data via `.store`. |
| `useWebsocketSubscriptionByKey(key)` | `Store<WebsocketSubscriptionStore>` | Access an existing subscription's store by key. |
| `useWebsocketMessage(options)` | `WebsocketMessageApiPublic` | Send request/response messages to any URI. |
| `useSubscriptionSelector(store, selector)` | `TResult` | Select a value from a subscription store with reactive updates. |

### `useWebsocketSubscription` options

| Option | Type | Description |
|---|---|---|
| `key` | `string` | Unique identifier. Components with the same key share one subscription instance. |
| `url` | `string` | WebSocket URL. Changing this triggers an automatic reconnect. |
| `uri` | `string` | Subscription path sent to the server. |
| `enabled` | `boolean` | Default `true`. Set to `false` to pause without unmounting. |
| `body` | `TBody` | Payload sent with the subscribe message. Body changes trigger a re-subscribe. |
| `onSubscribe` | `({ uri, body, uriApi }) => void` | Called when the subscribe message is sent. |
| `onMessage` | `({ data, uriApi }) => void` | Called when a message arrives for this URI. |
| `onError` | `(error: WebsocketTransportError) => void` | Called on transport (network) errors. |
| `onMessageError` | `(error: WebsocketServerError) => void` | Called when the server sends a message with method `"error"`, `"conflict"`, or `"exception"`. |
| `onClose` | `(event: CloseEvent) => void` | Called when the connection closes. |

### `WebsocketSubscriptionStore` shape

Read reactively with `useSubscriptionSelector(api.store, (s) => s.fieldName)`.

| Field | Type | Description |
|---|---|---|
| `message` | `TData \| undefined` | Latest message received from the server. |
| `subscribed` | `boolean` | Whether the subscribe message has been sent and acknowledged. |
| `pendingSubscription` | `boolean` | `true` from the time of subscribing until the first message arrives. Use this for loading states. |
| `connected` | `boolean` | Whether the underlying WebSocket connection is currently open. |
| `receivedAt` | `number \| undefined` | Timestamp of the last received message. |
| `serverError` | `WebsocketServerError \| undefined` | Last server-sent error, if any. |
| `messageError` | `WebsocketTransportError \| undefined` | Last transport error, if any. |

### `useWebsocketMessage` options

| Option | Type | Description |
|---|---|---|
| `key` | `string` | Unique identifier. Components with the same key share one API instance. |
| `url` | `string` | WebSocket URL. |
| `enabled` | `boolean` | Default `true`. When `false`, `sendMessage` rejects and `sendMessageNoWait` is a no-op. |
| `responseTimeoutMs` | `number` | Default timeout for `sendMessage`. Override per call with `{ timeout }`. |
| `onError` | `(error: WebsocketTransportError) => void` | Called on transport errors. |
| `onMessageError` | `(error: WebsocketServerError) => void` | Called on server error messages. |
| `onClose` | `(event: CloseEvent) => void` | Called when the connection closes. |

### Types

| Type | Description |
|---|---|
| `ReadyState` | Enum: `UNINSTANTIATED (-1)`, `CONNECTING (0)`, `OPEN (1)`, `CLOSING (2)`, `CLOSED (3)` |
| `WebsocketSubscriptionStore<TData>` | Shape of the TanStack Store returned by `useWebsocketSubscription`. |
| `WebsocketTransportError` | `{ type: "transport"; event: Event }` — network or connection-level failure. |
| `WebsocketServerError<TBody>` | `{ type: "server"; message: IncomingWebsocketMessage<TBody> }` — error message sent by the server. |
| `WebsocketClientOverrides` | Constructor options for `WebsocketClient`. |
| `WebsocketSubscriptionOptions` | Options for `useWebsocketSubscription`. |
| `WebsocketMessageOptions` | Options for `useWebsocketMessage`. |

---

## Further reading

- **[WEBSOCKET_CONNECTION.md](https://github.com/max-troost-io/mt-use-websockets/blob/main/src/lib/WEBSOCKET_CONNECTION.md)** — Connection lifecycle, class diagrams, URI API lifecycle, browser online/offline handling
- **[CHART.md](https://github.com/max-troost-io/mt-use-websockets/blob/main/src/lib/CHART.md)** — Mermaid flow diagrams for hooks, connection, and error flows

---

## License

MIT
