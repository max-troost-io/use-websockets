/**
 * @fileoverview WebSocket subscription API for streaming data over a single URI.
 *
 * Manages subscribe/unsubscribe lifecycle, reactive store updates, and hook tracking.
 * Used by {@link useWebsocketSubscription}. See {@link WebsocketMessageApi} for
 * request/response style messaging.
 *
 * @module WebsocketSubscriptionApi
 */

import { Store } from "@tanstack/react-store";
import { deepEqual } from "fast-equals";
import { DEFAULT_URI_OPTIONS, INITIATOR_REMOVAL_DELAY_MS } from "./constants";
import {
  createInitialWebsocketSubscriptionStore,
  SendMessage,
  SendToConnectionFn,
  WebsocketListener,
  WebsocketServerError,
  WebsocketSubscriptionOptions,
  WebsocketSubscriptionStore,
  WebsocketTransportError,
} from "./types";
import { getSubscriptionUris } from "./WebsocketConnection.helpers";
import { WebsocketClient } from "./WebsocketClient";

/**
 * Manages a single WebSocket URI endpoint with subscription lifecycle and message handling.
 *
 * Use for streaming data (voyage list, notifications). Provides a TanStack Store for
 * reactive updates. Multiple components share one instance via a unique key.
 *
 * ## Key Features
 *
 * - **Reactive Store**: TanStack Store updates when messages are received
 * - **pendingSubscription**: `true` from subscribe until first message (use for loading states)
 * - **Auto-subscribe**: Subscribes when the WebSocket connection opens
 * - **Hook Tracking**: Tracks components; unsubscribes when the last hook unmounts
 *
 * ## Edge Cases
 *
 * - **Multiple initiators**: Using the same key in multiple components emits a console warning;
 *   multiple initiators can cause unexpected behavior.
 * - **Body change in subscribe-on-open**: When `options.body` changes, re-subscribes automatically.
 * - **enabled=false**: Unsubscribes and disconnects; re-enabling triggers subscribe.
 * - **reset**: Called by connection on URL change/reconnect; clears store state.
 *
 * ## Cleanup
 *
 * {@link reset} is called by WebsocketConnection on URL change or reconnection.
 * {@link unregisterHook} triggers removal after {@link INITIATOR_REMOVAL_DELAY_MS}.
 *
 * @template TData - The type of data received from the WebSocket
 * @template TBody - The type of message body sent
 *
 * @example
 * ```typescript
 * const api = new WebsocketSubscriptionApi<MyData, MyBody>({
 *   url: 'wss://example.com',
 *   uri: '/api/stream',
 *   key: 'my-stream-key',
 *   body: { filter: 'active' },
 *   onMessage: (data) => console.log('Received:', data)
 * });
 *
 * const data = useSelector(api.store, (s) => s.message);
 * const isPending = useSelector(api.store, (s) => s.pendingSubscription);
 * api.sendMessage({ method: 'refresh', body: { force: true } });
 * ```
 *
 * @see {@link useWebsocketSubscription} - React hook
 * @see {@link WebsocketConnection} - Connection manager
 */
export class WebsocketSubscriptionApi<TData = unknown, TBody = unknown>
  implements WebsocketListener
{
  private _options: WebsocketSubscriptionOptions<TData, TBody>;
  private _state: Store<WebsocketSubscriptionStore<TData>> = new Store<
    WebsocketSubscriptionStore<TData>
  >(createInitialWebsocketSubscriptionStore<TData>());
  private _registeredHooks: Set<string> = new Set();
  private _disconnectTimeout: ReturnType<typeof setTimeout> | undefined;
  private _hookRemovalTimeout: ReturnType<typeof setTimeout> | undefined;
  private _sendToConnection: SendToConnectionFn | null = null;
  private _pendingMessages: SendMessage<string, string, TBody>[] = [];
  public readonly type = "subscription";
  private _client: WebsocketClient;
  /**
   * Creates a new WebsocketSubscriptionApi.
   *
   * @param options - Configuration options (url, uri, key, callbacks, etc.)
   */
  constructor(
    options: WebsocketSubscriptionOptions<TData, TBody>,
    client: WebsocketClient
  ) {
    this._options = { ...DEFAULT_URI_OPTIONS, ...options };
    this._client = client;
  }

  /** Unique key identifier for this WebSocket URI API. */
  public get key(): string {
    return this._options.key;
  }

  /** URI path for this WebSocket subscription. */
  public get uri(): string {
    return this._options.uri;
  }

  /** WebSocket URL for Datadog tracking. */
  public get url(): string {
    return this._options.url;
  }

  /** Configuration options for this WebSocket URI. */
  public get options(): WebsocketSubscriptionOptions<TData, TBody> {
    return this._options;
  }

  /**
   * Current data from the store.
   *
   * **Do not use in React components** — it does not trigger re-renders. Use
   * `useSelector(api.store, (s) => s.message)` for reactive updates.
   */
  public get data(): TData | undefined {
    return this._state.state.message;
  }

  /** TanStack store containing subscription state (message, subscribed, connected, pendingSubscription, etc.). */
  public get store(): Store<WebsocketSubscriptionStore<TData>> {
    return this._state;
  }

  /** Whether this WebSocket URI is enabled. */
  public get isEnabled(): boolean {
    return this._options.enabled ?? true;
  }

  /**
   * Updates the configuration options for this subscription.
   *
   * Handles lifecycle changes:
   * - **Body change** (subscribe-on-open): Re-subscribes with new body
   * - **Enabled: false → true**: Subscribes
   * - **Enabled: true → false**: Unsubscribes
   *
   * Uses deep equality to skip no-op updates.
   *
   * @param options - New options (merged with existing)
   */
  public set options(options: WebsocketSubscriptionOptions<TData, TBody>) {
    const updatedOptions: WebsocketSubscriptionOptions<TData, TBody> = {
      ...DEFAULT_URI_OPTIONS,
      ...this._options,
      ...options,
    };

    if (deepEqual(this._options, updatedOptions)) return;

    const previousOptions = this._options;
    this._options = updatedOptions;

    this._handleSubscriptionUpdates(previousOptions, updatedOptions);
    this._handleUnsubscribeOnDisable(previousOptions, updatedOptions);
  }

  /**
   * Sets or clears the callback used to send messages through the parent WebSocket connection.
   *
   * When clearing, flushes pending messages and clears removal timeouts to avoid redundant cleanup.
   *
   * @param callback - The send function, or null to disconnect
   */
  public setSendToConnection = (callback: SendToConnectionFn | null): void => {
    this._sendToConnection = callback;

    if (callback) {
      this._flushPendingMessages(callback);
    } else {
      this._clearPendingTimeouts();
      this._pendingMessages = [];
    }
  };

  /**
   * Registers a hook (component) that is using this subscription.
   *
   * Clears pending removal/disconnect timeouts and tracks the hook ID.
   * Emits a console warning if more than one hook is registered (multiple initiators).
   *
   * @param id - Unique identifier for the registering hook
   */
  public registerHook = (id: string): void => {
    this._clearPendingTimeouts();
    this._registeredHooks.add(id);
    if (this._registeredHooks.size > 1) {
      console.warn(
        `the uri ${this.uri} has more than one initiator, multiple initiators could cause unexpected behavior`
      );
    }
  };

  /**
   * Unregisters a hook from this subscription.
   *
   * After {@link INITIATOR_REMOVAL_DELAY_MS}, if no hooks remain, unsubscribes
   * and invokes the cleanup callback. The delay prevents rapid subscribe/unsubscribe
   * during React re-renders.
   *
   * @param id - The hook ID to unregister
   * @param onRemove - Callback invoked when the last hook is removed (after delay)
   */
  public unregisterHook = (id: string, onRemove: () => void): void => {
    this._registeredHooks.delete(id);
    this._scheduleHookRemoval(onRemove);
  };

  /**
   * Disconnects this subscription from the parent WebSocket connection.
   *
   * Immediately unsubscribes, then after {@link INITIATOR_REMOVAL_DELAY_MS} invokes
   * the cleanup callback. Called when the hook is disabled (`enabled=false`).
   *
   * @param onRemoveFromSocket - Callback invoked after delay to remove from connection
   */
  public disconnect = (onRemoveFromSocket: () => void): void => {
    this._clearPendingTimeouts();
    this.unsubscribe();
    this._client.connectionEvent?.({
      type: "subscription:disconnect-attempt",
      uri: this.uri,
      key: this.key,
    });
    this._disconnectTimeout = setTimeout(() => {
      this._disconnectTimeout = undefined;
      this._state.setState((prev) => ({
        ...prev,
        connected: false,
        subscribed: false,
        pendingSubscription: false,
      }));
      onRemoveFromSocket();
    }, INITIATOR_REMOVAL_DELAY_MS);
  };

  /**
   * Resets this subscription to its initial state.
   *
   * Clears connection/subscription state, resets store data, and cancels pending timeouts.
   * Only runs when currently connected. Called by WebsocketConnection on URL change
   * or reconnection.
   */
  public reset = (): void => {
    if (!this._state.state.connected) return;
    this._client.connectionEvent?.({
      type: "subscription:reset",
      uri: this.uri,
      key: this.key,
    });
    this._state.setState((prev) => ({
      ...prev,
      connected: false,
      subscribed: false,
      pendingSubscription: false,
      message: undefined,
    }));
    this._clearPendingTimeouts();
  };

  /**
   * Sends a custom message through the WebSocket for this URI.
   *
   * Automatically appends the URI and method. Queues if connection not yet set.
   *
   * @param message - The message to send (uri and method may be overridden)
   */
  public sendMessage = (message: SendMessage<string, string, TBody>): void => {
    if (!this.isEnabled) return;

    this._clearPendingTimeouts();
    const messageWithUri = {
      ...message,
      uri: this.uri,
      method: message.method ?? this._options.method ?? "post",
    };
    this._sendOrQueue(messageWithUri);
  };

  /**
   * Subscribes to this WebSocket URI to start receiving messages.
   *
   * Only subscribes when enabled. Sends a 'subscribe' message through the parent connection.
   *
   * @param body - Optional body to send with the subscription
   */
  public subscribe = (body?: TBody): void => {
    if (!this.isEnabled) return;

    this._clearPendingTimeouts();
    this._state.setState((prev) => ({
      ...prev,
      subscribed: true,
      pendingSubscription: true,
      subscribedAt: Date.now(),
    }));
    this._sendOrQueue({ body, uri: this.uri, method: "subscribe" });
    this._options.onSubscribe?.({
      uri: this.uri,
      body: this._options.body,
      uriApi: this,
    });
  };

  /**
   * Unsubscribes from this WebSocket URI to stop receiving messages.
   *
   * Only unsubscribes when currently subscribed.
   */
  public unsubscribe = (): void => {
    if (!this._state.state.subscribed) return;
    this._state.setState((prev) => ({
      ...prev,
      subscribed: false,
      pendingSubscription: false,
      message: undefined,
    }));
    this._client.connectionEvent?.({
      type: "subscription:unsubscribe",
      uri: this.uri,
      key: this.key,
    });
    this._sendOrQueue({ uri: this.uri, method: "unsubscribe" });
  };

  /**
   * Called by WebsocketConnection when the WebSocket connection opens.
   *
   * Subscribes with the configured body.
   */
  public onOpen = (): void => {
    if (this._state.state.connected) return;
    this._state.setState((prev) => ({ ...prev, connected: true }));
    this.subscribe(this._options.body);
  };

  /**
   * Called by WebsocketConnection when a message is received for this URI.
   *
   * @param data - The message data
   */
  public onMessage = (data: TData): void => {
    this._state.setState((prev) => ({
      ...prev,
      message: data,
      pendingSubscription: false,
      receivedAt: Date.now(),
    }));
    this._options.onMessage?.({ data, uriApi: this });
  };

  /** @inheritdoc */
  public onError = (error: WebsocketTransportError): void => {
    this._state.setState((prev) => ({ ...prev, pendingSubscription: false }));
    this._options.onError?.(error);
  };

  /**
   * Called by WebsocketConnection when a server error message is received.
   *
   * @param error - Server error with parsed message body
   */
  public onMessageError = (error: WebsocketServerError<TBody>): void => {
    this._state.setState((prev) => ({ ...prev, pendingSubscription: false }));
    this._options.onMessageError?.(error);
  };

  /**
   * Called by WebsocketConnection when the WebSocket connection closes.
   *
   * Resets subscription state to ensure a fresh subscription on reconnect.
   */
  public onClose = (event: CloseEvent): void => {
    this._state.setState((prev) => ({
      ...prev,
      subscribed: false,
      pendingSubscription: false,
    }));
    this._options.onClose?.(event);
  };

  private _clearPendingTimeouts(): void {
    if (this._disconnectTimeout !== undefined) {
      clearTimeout(this._disconnectTimeout);
      this._disconnectTimeout = undefined;
    }
    if (this._hookRemovalTimeout !== undefined) {
      clearTimeout(this._hookRemovalTimeout);
      this._hookRemovalTimeout = undefined;
    }
  }

  private _scheduleHookRemoval(onRemove: () => void): void {
    this._clearPendingTimeouts();
    this._hookRemovalTimeout = setTimeout(() => {
      this._hookRemovalTimeout = undefined;
      if (this._registeredHooks.size === 0) {
        this._state.setState((prev) => ({ ...prev, connected: false }));
        this.unsubscribe();
        onRemove();
        this._client.connectionEvent?.({
          type: "subscription:unmount-hook",
          uri: this.uri,
          key: this.key,
        });
      }
    }, INITIATOR_REMOVAL_DELAY_MS);
  }

  private _flushPendingMessages(callback: SendToConnectionFn): void {
    if (this._pendingMessages.length === 0) return;
    this._pendingMessages.forEach((msg) =>
      callback({
        ...msg,
        uri: this.uri,
        method: msg.method ?? this._options.method ?? "post",
      })
    );
    this._pendingMessages = [];
  }

  private _sendOrQueue(message: SendMessage<string, string, TBody>): void {
    if (this._sendToConnection) {
      this._sendToConnection(message);
      this._client.connectionEvent?.({
        type: "subscription:send-message",
        uri: this.uri,
        key: this.key,
        message,
      });
    } else {
      this._client.connectionEvent?.({
        type: "subscription:queue-message",
        uri: this.uri,
        key: this.key,
        message,
      });
      this._pendingMessages.push(message);
    }
  }

  private _handleSubscriptionUpdates(
    previousOptions: WebsocketSubscriptionOptions<TData, TBody>,
    updatedOptions: WebsocketSubscriptionOptions<TData, TBody>
  ): void {
    const bodyChanged = !deepEqual(previousOptions.body, updatedOptions.body);
    const becameEnabled = !previousOptions.enabled && updatedOptions.enabled;

    if (bodyChanged || becameEnabled) {
      this.subscribe(updatedOptions.body);
    }
  }

  private _handleUnsubscribeOnDisable(
    previousOptions: WebsocketSubscriptionOptions<TData, TBody>,
    updatedOptions: WebsocketSubscriptionOptions<TData, TBody>
  ): void {
    const isDisabled = !updatedOptions.enabled;
    const wasEnabled = previousOptions.enabled;

    if (isDisabled && wasEnabled && this._state.state.subscribed) {
      this.unsubscribe();
    }
  }
}
