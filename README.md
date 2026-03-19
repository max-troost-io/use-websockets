# @maxtroost/use-websocket

A robust WebSocket connection management package for React applications with automatic reconnection, heartbeat monitoring, URI-based message routing, and React integration via TanStack Store.

## Installation

```bash
npm install @maxtroost/use-websocket
```

**Peer dependencies:** React 18+, React DOM 18+

### Message Format

All outgoing WebSocket messages share the same structure and are sent as JSON:

```json
{
  "method": "subscribe" | "unsubscribe" | "post",
  "uri": "/path/to/endpoint",
  "body": { ... }
}
```

| Field   | Required | Description                                                                 |
| ------- | -------- | --------------------------------------------------------------------------- |
| `method`| Optional | HTTP-like method: `subscribe`, `unsubscribe`, or `post` (default for custom messages) |
| `uri`   | Yes      | Path for routing; the server uses this to dispatch to the correct handler  |
| `body`  | Optional | Payload sent with the message                                               |

**Examples:**

- **Subscribe** (streaming): `{ "method": "subscribe", "uri": "/notifications", "body": { "status": "active" } }`
- **Unsubscribe**: `{ "method": "unsubscribe", "uri": "/notifications" }`
- **Request/response** (e.g. validate, mark read): `{ "method": "post", "uri": "/voyages/modify/validate", "body": { ... } }`

You can add extra fields (e.g. auth headers) via `transformMessagePayload` in `WebsocketClient`.

### Subscription vs Message

The package offers two patterns for different use cases:

| | **Subscription** (`useWebsocketSubscription`) | **Message** (`useWebsocketMessage`) |
| --- | --- | --- |
| **Pattern** | Streaming — subscribe once, receive ongoing updates | Request/response — send a message, get one reply (or none) |
| **Use case** | Live data feeds (notifications, voyage list, real-time dashboards) | One-off commands (validate, modify, mark read) |
| **URI** | Fixed per hook — one URI per subscription | Any URI — send to different endpoints per call |
| **State** | TanStack Store — reactive `message`, `pendingSubscription`, `connected` | No store — returns a Promise or fire-and-forget |
| **Lifecycle** | Auto-subscribes when connection opens; unsubscribes when last component unmounts | No subscription — just send when needed |

---

## Basic Setup

1. Create a `WebsocketClient` and wrap your app with `WebsocketClientProvider`:

```tsx
import { WebsocketClient, WebsocketClientProvider } from "@maxtroost/use-websocket";

const websocketClient = new WebsocketClient({
  maxRetryAttempts: 20,
  // Optional: customize heartbeat, timeouts, logging, etc.
});

function App() {
  return (
    <WebsocketClientProvider client={websocketClient}>
      <YourApp />
    </WebsocketClientProvider>
  );
}
```

2. Use the hooks in your components:

```tsx
import { useWebsocketSubscription } from "@maxtroost/use-websocket";
import { useStore } from "@tanstack/react-store";

function LiveNotifications() {
  const api = useWebsocketSubscription<Notification[]>({
    key: "notifications",
    url: "wss://api.example.com/ws",
    uri: "/notifications",
  });

  const notifications = useStore(api.store, (s) => s.message);
  const loading = useStore(api.store, (s) => s.pendingSubscription);

  if (loading) return <div>Connecting...</div>;
  return (
    <ul>
      {notifications?.map((n) => (
        <li key={n.id}>{n.text}</li>
      ))}
    </ul>
  );
}
```

---

## Features

- **Automatic reconnection** — Exponential backoff (4s → 30s → 90s) with configurable max attempts
- **Heartbeat monitoring** — Ping/pong to detect stale connections
- **URI-based routing** — Messages routed by URI; one connection per URL shared across subscriptions
- **TanStack Store integration** — Reactive state for subscriptions; components re-render on updates
- **Two patterns** — `useWebsocketSubscription` for streaming data, `useWebsocketMessage` for request/response
- **Shared stores** — Child components access parent subscriptions via `useWebsocketSubscriptionByKey`
- **Conditional subscriptions** — `enabled` option to pause when unauthenticated or feature-flagged off
- **Lifecycle callbacks** — `onSubscribe`, `onMessage`, `onError`, `onClose` for logging and side effects
- **Connection events** — `connectionEvent` callback for reconnection status, logging, or custom notifications

---

## API Reference

| Export | Description |
| ------ | ----------- |
| `useWebsocketSubscription` | Subscribe to a URI and receive streaming data via a reactive store |
| `useWebsocketSubscriptionByKey` | Access the store of a subscription created elsewhere (by key) |
| `useWebsocketMessage` | Send request/response messages to any URI |
| `WebsocketClient` | Client configuration; instantiate and pass to `WebsocketClientProvider`; `reconnectAllConnections()` for manual retry |
| `WebsocketClientProvider` | Context provider; wrap your app to enable hooks |
| `WebsocketConnection` | Low-level connection class; `setCustomLogger` for debugging |
| `ReadyState`, `WebsocketSubscriptionStore`, `WebsocketTransportError`, `WebsocketServerError` | Types |

---

## Examples

### Subscription (Streaming Data)

Subscribe to a URI and receive streaming data via a reactive TanStack Store.

```tsx
import { useWebsocketSubscription } from "@maxtroost/use-websocket";
import { useStore } from "@tanstack/react-store";

interface Voyage {
  id: string;
  name: string;
  status: string;
}

function VoyageList() {
  const voyageApi = useWebsocketSubscription<Voyage[], { status: string }>({
    key: "voyages-list",
    url: "wss://api.example.com/ws",
    uri: "/api/voyages",
    body: { status: "active" },
  });

  const voyages = useStore(voyageApi.store, (s) => s.message);
  const pending = useStore(voyageApi.store, (s) => s.pendingSubscription);
  const connected = useStore(voyageApi.store, (s) => s.connected);

  if (pending) return <Skeleton />;
  return (
    <div>
      {!connected && <span>Reconnecting...</span>}
      {voyages?.map((v) => (
        <div key={v.id}>{v.name}</div>
      ))}
    </div>
  );
}
```

### Access Store by Key (Child Components)

When a parent creates the subscription, children can access the same store by key.

```tsx
import { useWebsocketSubscriptionByKey } from "@maxtroost/use-websocket";
import { useStore } from "@tanstack/react-store";

function VoyageCount() {
  const voyagesStore = useWebsocketSubscriptionByKey<Voyage[]>("voyages-list");
  const voyages = useStore(voyagesStore, (s) => s.message);
  return <div>Total: {voyages?.length ?? 0}</div>;
}
```

### Message API (Request/Response)

For one-off commands (validate, modify, mark read) — send a message and optionally await a response.

```tsx
import { useWebsocketMessage } from "@maxtroost/use-websocket";

function VoyageActions() {
  const api = useWebsocketMessage<ValidationResult, FormValues>({
    key: "voyages/modify",
    url: "wss://api.example.com/ws",
    responseTimeoutMs: 5000,
  });

  const handleValidate = async () => {
    const result = await api.sendMessage(
      "voyages/modify/validate",
      "post",
      formValues
    );
    if (result.valid) {
      // proceed
    }
  };

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

### Conditional Subscription

Disable the subscription when the user is not authenticated or when a feature flag is off.

```tsx
function VoyageList({ isAuthenticated }: { isAuthenticated: boolean }) {
  const api = useWebsocketSubscription<Voyage[]>({
    key: "voyages-list",
    url: "wss://api.example.com/ws",
    uri: "/api/voyages",
    enabled: isAuthenticated,
  });
  // ...
}
```

---

## Advanced Examples

### Custom WebsocketClient Configuration

```tsx
const websocketClient = new WebsocketClient({
  maxRetryAttempts: 10,
  notificationThreshold: 5,
  messageResponseTimeoutMs: 5000,
  heartbeat: { enabled: true, intervalMs: 30000 },
  connectionEvent: (event) => {
    if (event.type === "reconnecting") {
      analytics.track("websocket_reconnecting", { url: event.url });
    }
  },
});
```

### Auth Token in WebSocket URL

When the WebSocket URL includes an auth token, pass the full URL to the hook. When the token changes, the hook automatically calls `replaceUrl` to reconnect with the new URL.

```tsx
function VoyageList() {
  const { token } = useAuth();
  const wsUrl = token ? `wss://api.example.com/ws?token=${token}` : null;

  const api = useWebsocketSubscription<Voyage[]>({
    key: "voyages",
    url: wsUrl ?? "", // Hook handles URL changes via replaceUrl
    uri: "/api/voyages",
    enabled: !!token,
  });
  // ...
}
```

To manually retry after reconnection stops (e.g. user clicks "Retry"): `websocketClient.reconnectAllConnections()`.

### Transform Outgoing Messages (e.g. Add Auth Header)

```tsx
const websocketClient = new WebsocketClient({
  transformMessagePayload: (payload) => ({
    ...payload,
    headers: {
      ...payload.headers,
      Authorization: `Bearer ${getAuthToken()}`,
    },
  }),
});
```

### Lifecycle Callbacks

```tsx
const api = useWebsocketSubscription<Voyage[]>({
  key: "voyages",
  url: "wss://api.example.com/ws",
  uri: "/api/voyages",
  onSubscribe: ({ uri }) => console.log("Subscribed to", uri),
  onMessage: ({ data }) => console.log("Received", data),
  onError: (error) => {
    if (error.type === "transport")
      console.error("Connection error", error.event);
  },
  onMessageError: (error) => {
    if (error.type === "server")
      console.error("Server error", error.message);
  },
  onClose: (event) => console.log("Connection closed", event.code),
});
```

### Per-Call Timeout Override

```tsx
const result = await api.sendMessage("/api/command", "post", body, {
  timeout: 3000,
});
```

---

## Documentation

For contributors and deeper architecture details:

- **[WEBSOCKET_CONNECTION.md](https://github.com/max-troost-io/mt-use-websockets/blob/main/src/lib/WEBSOCKET_CONNECTION.md)** — Connection lifecycle, class diagrams, URI API lifecycle, browser online/offline handling, full API reference
- **[CHART.md](https://github.com/max-troost-io/mt-use-websockets/blob/main/src/lib/CHART.md)** — Mermaid flow diagrams for hooks, connection, and error flows

---

## License

MIT
