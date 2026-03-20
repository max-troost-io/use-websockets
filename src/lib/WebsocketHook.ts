import { useStore } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { deepEqual } from "fast-equals";
import { useEffect, useId, useRef, useState } from "react";
import { WebsocketMessageApi } from "./WebsocketMessageApi";
import { useWebsocketClient } from "./WebsocketProvider";
import { WebsocketSubscriptionApi } from "./WebsocketSubscriptionApi";
import {
  createInitialWebsocketSubscriptionStore,
  WebsocketListener,
  WebsocketMessageApiPublic,
  WebsocketMessageOptions,
  WebsocketSubscriptionApiPublic,
  WebsocketSubscriptionOptions,
  WebsocketSubscriptionStore,
} from "./types";
import { useIsomorphicLayoutEffect } from "./utils";
import {
  createWebsocketMessageApi,
  createWebsocketSubscriptionApi,
  removeWebsocketListenerFromConnection,
} from "./websocketClient.helpers";

/**
 * WebSocket React hooks for the shared connection architecture.
 *
 * This module provides hooks that integrate with {@link WebsocketConnection}.
 * from a path and optional secret (for region-based auth from `@mono-fleet/iam-provider`).
 * Call `useWebsocketConnectionConfig` and `useReconnectWebsocketConnections` from
 * `@mono-fleet/common-components` at app root for logging and reconnection on region change.
 *
 * ## Hook Overview
 *
 * | Hook | Use Case |
 * |------|----------|
 * | `useWebsocketSubscription` | Subscribe to a URI and receive streaming data via a reactive store |
 * | `useWebsocketMessage` | Send request/response messages to any URI (no subscription) |
 * | `useWebsocketSubscriptionByKey` | Access the store of a subscription created elsewhere (e.g. parent) |
 *
 * ## Choosing the Right Hook
 *
 * - **Streaming data** (voyage list, notifications): `useWebsocketSubscription`
 * - **One-off commands** (validate, modify, mark read): `useWebsocketMessage`
 * - **Child needs parent's subscription data**: `useWebsocketSubscriptionByKey` with same `key`
 *
 * ## Edge Cases
 *
 * - **Same key, multiple components**: Subscription and Message APIs are singletons per key.
 *   Multiple hooks with the same key share one instance; `useWebsocketSubscriptionByKey` returns
 *   a fallback store if the subscription does not exist yet (parent not mounted).
 * - **Options object identity**: Options are deep-compared; avoid passing new object literals
 *   in dependency arrays to prevent unnecessary effect re-runs.
 * - **enabled=false**: Disconnects the listener and removes it from the connection after a delay.
 *
 * @module WebsocketHook
 */

/**
 * Returns a referentially stable version of `value` that only updates when its
 * content changes according to deep equality.
 *
 * Prevents effect re-runs when dependency arrays contain object literals that
 * are structurally identical across renders (e.g. `{ uri: '/api', body: {} }`).
 *
 * @param value - The value to memoize (object or array)
 * @returns A referentially stable reference; updates only when deep equality changes
 *
 * @internal
 */
function useDeepCompareMemoize<T>(value: T): T {
  const ref = useRef<T>(value);
  if (!deepEqual(ref.current, value)) {
    ref.current = value;
  }
  return ref.current;
}

/**
 * Internal interface for listeners that support hook lifecycle management.
 *
 * Extends {@link WebsocketListener} with methods for registering/unregistering
 * hook instances and disconnecting. Both {@link WebsocketSubscriptionApi} and
 * {@link WebsocketMessageApi} implement this interface, enabling the shared
 * {@link useWebsocketLifecycle} hook.
 *
 * @internal
 */
interface HookableListener extends WebsocketListener {
  registerHook(id: string): void;
  unregisterHook(id: string, onRemove: () => void): void;
  disconnect(onRemoveFromSocket: () => void): void;
}

/**
 * Shared hook that manages connection registration, URL replacement, and hook
 * lifecycle tracking for both subscription and message listeners.
 *
 * Extracted from `useWebsocketCore` and `useWebsocketMessage` to eliminate
 * duplicated effect logic.
 *
 * @param listener - The listener instance (subscription or message API)
 * @param url - The WebSocket URL used for connection lookup
 * @param enabled - When `false`, disconnects the listener; when `true` or `undefined`, registers it
 *
 * @internal
 */
function useWebsocketLifecycle(
  listener: HookableListener,
  url: string,
  enabled: boolean | undefined
): void {
  const id = useId();
  const client = useWebsocketClient();

  useIsomorphicLayoutEffect(() => {
    if (enabled !== false) {
      const connection = client.addConnection(url, url);
      connection.addListener(listener);
    } else {
      listener.disconnect(() =>
        removeWebsocketListenerFromConnection(client, listener)
      );
    }
  }, [enabled, listener, client, url]);

  useIsomorphicLayoutEffect(() => {
    const connection = client.getConnection(url);
    connection?.replaceUrl(url);
  }, [url, client]);

  useEffect(() => {
    const initiatorId = id;
    if (enabled !== false) {
      listener.registerHook(id);
    }
    return () => {
      listener.unregisterHook(initiatorId, () =>
        removeWebsocketListenerFromConnection(client, listener)
      );
    };
  }, [client, enabled, id, listener]);
}

/**
 * React hook that manages a WebSocket subscription for a specific Subscription endpoint.
 *
 * This hook provides a reactive interface to the WebSocket connection system. It establishes
 * the connection architecture by linking three key components:
 *
 * ## Architecture Overview
 *
 * The hook integrates with a two-layer class architecture:
 *
 * 1. **WebsocketConnection** (singleton per URL)
 *    - Manages the underlying WebSocket connection lifecycle
 *    - Handles reconnection, heartbeat, and connection state
 *    - Routes incoming messages to the appropriate Subscription handlers
 *    - Retrieved via `WebsocketClient.addConnection()` which ensures only one
 *      connection exists per WebSocket URL
 *
 * 2. **WebsocketSubscriptionApi** (one per subscription per connection)
 *    - Manages subscription lifecycle for a specific URI endpoint
 *    - Provides a TanStack Store for reactive data updates
 *    - Handles subscribe/unsubscribe operations
 *    - Registered via `connection.addListener(subscriptionApi)` which routes messages by URI
 *
 * ## How the Hook Links to Classes
 *
 * ```
 * useWebsocketSubscription
 *   │
 *   ├─→ createWebsocketSubscriptionApi(key, options)
 *   │     └─→ Returns/creates WebsocketSubscriptionApi singleton (per key)
 *   │           ├─→ Manages subscription for this specific URI
 *   │           ├─→ Provides reactive store for data updates
 *   │           └─→ Handles subscribe/unsubscribe lifecycle
 *   │
 *   └─→ client.addConnection(url, url)
 *         └─→ Returns/creates WebsocketConnection singleton (per URL)
 *               ├─→ Manages WebSocket connection (connect, reconnect, heartbeat)
 *               ├─→ Routes messages to registered listeners
 *               └─→ connection.addListener(subscriptionApi) registers the listener
 * ```
 *
 * ## Lifecycle Management
 *
 * - **URI API**: Created once via `useState` initializer (singleton per key via
 *   `createWebsocketUriApi`). Multiple components can share the same URI API,
 *   tracked via registered hook IDs.
 *
 * - **Connection**: Found or created in a `useIsomorphicLayoutEffect` that watches
 *   `enabled`. The connection is a singleton per key, shared across all hooks using
 *   the same base URL path.
 *
 * - **Options Updates**: `useIsomorphicLayoutEffect` synchronously updates URI API options
 *   via the `options` setter when they change (deep-compared via `useDeepCompareMemoize`),
 *   preventing rendering with stale configuration.
 *
 * - **URL Replacement**: A separate `useIsomorphicLayoutEffect` watches `wsUrl` and calls
 *   `connection.replaceUrl()` when the URL changes (e.g. due to auth context changes).
 *
 * - **Cleanup**: `useEffect` registers this hook instance as a hook and provides cleanup
 *   that removes it. When the last hook is removed, the URI API automatically unsubscribes
 *   and is removed from the connection.
 *
 * @template TData - The type of data received from the WebSocket for this URI
 * @template TBody - The type of message body sent to the WebSocket for this URI
 *
 * @param options - Configuration options including:
 *   - `url`: The WebSocket URL
 *   - `uri`: The specific URI endpoint for this subscription
 *   - `key`: Unique identifier for this subscription (used to retrieve it elsewhere via `useWebsocketSubscriptionByKey`)
 *   - `enabled`: Whether this subscription is enabled (default: true)
 *   - `body`: Optional payload for subscription or initial message
 *   - `onMessage`, `onSubscribe`, `onError`, `onMessageError`, `onClose`: Optional callbacks
 * @returns The {@link WebsocketSubscriptionApiPublic} instance. Use `useSelector(api.store, (s) => s.message)` to read data reactively.
 *
 * @example
 * ```typescript
 * // Create subscription and read data via TanStack Store
 * const voyageApi = useWebsocketSubscription<Voyage[], VoyageFilters>({
 *   key: 'voyages-list',
 *   url: '/api',
 *   uri: '/api/voyages',
 *   body: { status: 'active' }
 * });
 * const voyages = useSelector(voyageApi.store, (s) => s.message);
 *
 * // Or use useWebsocketSubscriptionByKey in children to access the same store
 * const voyagesStore = useWebsocketSubscriptionByKey<Voyage[]>('voyages-list');
 * const voyages = useSelector(voyagesStore, (s) => s.message);
 * ```
 *
 * ## Edge Cases
 *
 * - **Multiple initiators**: Using the same `key` in multiple components registers multiple hooks.
 *   A console warning is emitted; multiple initiators can cause unexpected behavior.
 * - **pendingSubscription**: Use `store.pendingSubscription` for loading states — it is `true`
 *   from subscribe until the first message is received.
 *
 * @see {@link useWebsocketSubscriptionByKey} - Access the store when the subscription is created in a parent
 * @see {@link WebsocketSubscriptionStore} - Store shape: `{ message, subscribed, connected, ... }`
 */

// Implementation
export function useWebsocketSubscription<TData = unknown, TBody = unknown>(
  options: WebsocketSubscriptionOptions<TData, TBody>
): WebsocketSubscriptionApiPublic<TData, TBody> {
  const client = useWebsocketClient();
  const [subscriptionApi] = useState<WebsocketSubscriptionApi<TData, TBody>>(
    () => createWebsocketSubscriptionApi(client, options.key, options)
  );

  const stableOptions = useDeepCompareMemoize(options);

  useIsomorphicLayoutEffect(() => {
    subscriptionApi.options = stableOptions;
  }, [stableOptions, subscriptionApi]);

  useWebsocketLifecycle(subscriptionApi, options.url, options.enabled);

  return subscriptionApi;
}

/**
 * React hook that returns the store of a WebSocket subscription by key.
 *
 * Use when a parent creates the subscription via `useWebsocketSubscription` and
 * children need to read the data. The `key` must match the one used when creating
 * the subscription.
 *
 * **Edge case**: Returns a fallback store (initial empty state) if the subscription
 * does not exist yet (e.g. parent hasn't mounted). This avoids null checks but means
 * children may briefly see empty data before the parent mounts and subscribes.
 *
 * @template TData - The type of data in the store's `message` field
 * @param key - Unique key (must match `useWebsocketSubscription` options.key)
 * @returns TanStack {@link Store} with shape {@link WebsocketSubscriptionStore}
 *
 * @example
 * ```typescript
 * // Parent creates subscription
 * useWebsocketSubscription<Voyage[]>({ key: 'voyages-list', url: '...', uri: '...' });
 *
 * // Child reads store by key
 * const voyagesStore = useWebsocketSubscriptionByKey<Voyage[]>('voyages-list');
 * const voyages = useSelector(voyagesStore, (s) => s.message);
 * ```
 *
 * @see {@link WebsocketSubscriptionStore} - Store shape
 */
export const useWebsocketSubscriptionByKey = <TData = unknown>(key: string) => {
  const client = useWebsocketClient();
  const subscription = client.getListener<TData, any>(key, "subscription");

  const [fallbackStore] = useState<Store<WebsocketSubscriptionStore<TData>>>(
    () =>
      new Store<WebsocketSubscriptionStore<TData>>(
        createInitialWebsocketSubscriptionStore<TData>()
      )
  );
  return subscription?.store ?? fallbackStore;
};

/**
 * React hook that manages a WebSocket Message API for request/response style messaging.
 *
 * Use this for one-off commands (validate, modify, mark read) rather than streaming
 * subscriptions. Send to any URI; optionally await a response.
 *
 * ## Key Features
 *
 * - **Request/Response**: `sendMessage(uri, method, body?, options?)` returns a Promise that resolves with the response
 * - **Fire-and-forget**: `sendMessageNoWait(uri, method, body?)` for commands that don't need a response
 * - **Any URI**: Not bound to a single URI like subscription APIs
 * - **Shared Instance**: Multiple components with the same `key` share the same Message API
 * - **Automatic Cleanup**: Removes from connection when the last hook unmounts
 *
 * @template TData - The type of data received in the response
 * @template TBody - The type of message body sent to the WebSocket
 *
 * @param options - Configuration options including:
 *   - `url`: The WebSocket URL
 *   - `key`: Unique identifier (components with same key share the API)
 *   - `enabled`: Whether this API is enabled (default: true)
 *   - `responseTimeoutMs`: Default timeout for `sendMessage` (default: 10000)
 *   - `onError`, `onMessageError`, `onClose`: Optional callbacks
 * @returns {@link WebsocketMessageApiPublic} with `sendMessage`, `sendMessageNoWait`, `reset`, `url`, `key`, `isEnabled`
 *
 * @example
 * ```typescript
 * const api = useWebsocketMessage<ModifyVoyageUim, ModifyVoyageUim>({
 *   key: 'voyages/modify',
 *   url: '/api',
 *   responseTimeoutMs: 10000
 * });
 *
 * // Await response (full form: uri, method, body?, options?)
 * const result = await api.sendMessage('voyages/modify/validate', 'post', formValues);
 *
 * // Fire-and-forget
 * api.sendMessageNoWait(`notifications/${id}/read`, 'post');
 * ```
 *
 * ## Edge Cases
 *
 * - **Overwrite**: Sending to the same URI while a request is pending cancels the previous
 *   request (rejects with "WebSocket request overwritten for URI").
 * - **Disabled**: When `enabled=false`, `sendMessage` rejects; `sendMessageNoWait` is a no-op.
 * - **Connection closed**: Pending requests are rejected with "WebSocket connection closed".
 *
 * @see {@link WebsocketMessageApiPublic} - Public API surface
 */
export const useWebsocketMessage = (
  options: WebsocketMessageOptions
): WebsocketMessageApiPublic => {
  const client = useWebsocketClient();
  const [messageApi] = useState<WebsocketMessageApi>(() =>
    createWebsocketMessageApi(client, options.key, options)
  );

  useWebsocketLifecycle(messageApi, options.url, options.enabled);

  return messageApi;
};

/**
 * Selects a value from a WebSocket subscription store with reactive updates.
 *
 * The store type is inferred from the first argument, so the selector
 * receives properly typed state (including `message: TData`) without explicit generics.
 *
 * Use this to subscribe to specific slices of subscription state and avoid re-renders when
 * unrelated fields change. The selector runs on every store update; return a primitive or
 * memoized value for optimal performance.
 *
 * @template TStore - The store state type (extends {@link WebsocketSubscriptionStore})
 * @template TResult - The type of the selected value
 * @param store - The TanStack Store from {@link WebsocketSubscriptionApi.store} or {@link useWebsocketSubscriptionByKey}
 * @param selector - Function that maps store state to the desired value. Receives typed state with `message`, `subscribed`, `pendingSubscription`, `connected`, etc.
 * @returns The selected value; triggers re-renders when the selected value changes (shallow comparison)
 *
 * @example
 * ```tsx
 * const voyageApi = useWebsocketSubscription<Voyage>({
 *   key: 'voyages',
 *   url: 'wss://api.example.com',
 *   uri: '/api/voyages'
 * });
 *
 * // Select only message — re-renders when message changes, not when connected/subscribed change
 * const voyage = useSelector(voyageApi.store, (s) => s.message);
 *
 * // Select derived state
 * const isLoading = useSelector(voyageApi.store, (s) => s.pendingSubscription || !s.connected);
 *
 * // Select multiple fields (returns new object each time — consider useMemo if used as dependency)
 * const status = useSelector(voyageApi.store, (s) => ({
 *   hasData: s.message !== undefined,
 *   error: s.serverError ?? s.messageError
 * }));
 * ```
 *
 * @see {@link WebsocketSubscriptionStore} - Store shape and field descriptions
 * @see {@link useWebsocketSubscription} - Creates a subscription and returns the store
 * @see {@link useWebsocketSubscriptionByKey} - Access a subscription store by key
 */
export const useSelector = <
  TStore extends WebsocketSubscriptionStore<unknown>,
  TResult = unknown
>(
  store: Store<TStore>,
  selector: (state: TStore) => TResult
) => useStore(store, selector);
