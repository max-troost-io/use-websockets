/**
 * @fileoverview WebSocket connection management with automatic reconnection and URI-based routing.
 *
 * This module provides a robust WebSocket connection manager that handles:
 * - Connection lifecycle (connect, disconnect, reconnect)
 * - Automatic reconnection with three-phase exponential backoff
 * - Heartbeat/ping-pong to detect and recover from stale connections
 * - URI-based message routing to multiple listeners over a single connection
 * - Browser online/offline detection and deferred reconnection
 * - Singleton connection per URL key (via {@link WebsocketClient.addConnection})
 * - User notifications for connection status (with configurable threshold)
 *
 * ## Architecture
 *
 * Connections are created via {@link WebsocketClient.addConnection} which ensures one
 * connection per key. Listeners ({@link WebsocketSubscriptionApi} or {@link WebsocketMessageApi})
 * register via {@link addListener} and receive messages routed by URI.
 *
 * ## Edge Cases
 *
 * - **Cached messages**: Only non-subscribe messages are cached when the socket is not open;
 *   subscribe messages trigger connect but are not queued.
 * - **replaceUrl vs reconnect**: Both use `teardownAndReconnect`; a guard prevents concurrent
 *   cycles when both fire in the same render (e.g. auth context change).
 * - **Close code 1000**: Only this code does NOT trigger reconnection (intentional shutdown).
 * - **Max retries**: After {@link RECONNECTION_CONFIG.MAX_RETRY_ATTEMPTS}, automatic reconnection
 *   stops; user must click Retry in the notification.
 *
 * @module WebsocketConnection
 */

import { wait } from "./utils";
import {
  TEARDOWN_RECONNECT_DELAY_MS,
  WEBSOCKET_CLOSE_CODES,
} from "./constants";
import { SendMessage, WebsocketListener } from "./types";
import { WebsocketClient } from "./WebsocketClient";
import {
  createPingMessage,
  getPingTime,
  getSubscriptionUris,
  isBrowserOnline,
  isConnectionReady,
  isErrorMethod,
  isReconnectableCloseCode,
  isSocketOnline,
  isValidIncomingMessage,
  reconnectWaitTime,
} from "./WebsocketConnection.helpers";

/**
 * Manages a WebSocket connection with automatic reconnection, heartbeat monitoring, and URI-based message routing.
 *
 * This class provides:
 * - Automatic reconnection with exponential backoff on connection loss
 * - Heartbeat/ping mechanism to keep connections alive
 * - Multiple URI API registration for routing messages to different handlers
 * - Online/offline detection and handling
 * - Custom logger support for monitoring (configure via {@link WebsocketClient} connectionEvent)
 * - User notifications for connection status
 *
 * @example
 * ```typescript
 * const connection = new WebsocketConnection('ws://example.com/api');
 * const uriApi = new WebsocketSubscriptionApi({
 *   key: 'messages',
 *   url: '/api',
 *   uri: '/messages',
 *   onMessage: ({ data }) => console.log('Received:', data),
 *   onError: (error) => console.log('Error:', error),
 *   onClose: (event) => console.log('Closed:', event)
 * });
 * connection.addListener(uriApi);
 * ```
 *
 * @see {@link WebsocketClient.reconnectAllConnections} - Reconnect all connections (e.g. on auth change)
 */
export class WebsocketConnection {
  // ─── Properties ─────────────────────────────────────────────────────
  /** The underlying WebSocket instance */
  private _socket?: WebSocket;

  /** Map of all listeners (subscription and message APIs) keyed by their unique key */
  private _listeners: Map<string, WebsocketListener> = new Map();

  /** The WebSocket URL */
  private _url: string;

  /** Timeout for the next ping message */
  private pingTimeOut: ReturnType<typeof setTimeout> | undefined;

  /** Timeout for detecting missing pong after ping (dead-connection detection) */
  private pongTimeOut: ReturnType<typeof setTimeout> | undefined;

  /** Timeout for closing the connection when no URIs are registered */
  private closeConnectionTimeOut: ReturnType<typeof setTimeout> | undefined;

  /** Counter for reconnection attempts */
  private reconnectTries = 0;

  /** Guard flag that prevents concurrent teardown-and-reconnect cycles (e.g. when both replaceUrl and reconnect fire in the same render). */
  private _isReconnecting = false;

  /** True when max retry attempts exceeded; stops automatic reconnection until manual retry. */
  private _maxRetriesExceeded = false;

  /**
   * Queue of non-subscribe messages sent while the socket was not open.
   * Flushed when the connection opens. Subscribe messages are NOT cached — they trigger connect only.
   */
  private cachedMessages: SendMessage<string, string, any>[] = [];

  /** The WebsocketClient instance */
  private _client: WebsocketClient;

  // ─── Constructor ────────────────────────────────────────────────────

  /**
   * Creates a new WebSocket connection instance.
   *
   * The connection is not established until a listener is added via {@link addListener}.
   *
   * @param url - The WebSocket URL to connect to
   * @param client - The {@link WebsocketClient} for configuration (reconnection, heartbeat, etc.)
   */
  constructor(url: string, client: WebsocketClient) {
    this._url = url;
    this._client = client;
  }

  // ─── Public Getters ─────────────────────────────────────────────────

  /**
   * Gets the current ready state of the WebSocket connection.
   *
   * @returns The WebSocket ready state (CONNECTING=0, OPEN=1, CLOSING=2, CLOSED=3) or undefined if no socket exists.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState | WebSocket.readyState}
   */
  public get readyState() {
    return this._socket?.readyState;
  }

  /**
   * Gets the WebSocket URL for this connection.
   *
   * @returns The WebSocket URL string
   */
  public get url() {
    return this._url;
  }

  /**
   * Gets the underlying WebSocket instance.
   *
   * @returns The WebSocket instance if connected, or undefined if the connection hasn't been established yet or has been closed.
   */
  public getSocket = (): WebSocket | undefined => {
    return this._socket;
  };

  // ─── Public API: URI Management ─────────────────────────────────────

  /**
   * Registers a listener (subscription or message API) with this connection.
   *
   * Initiates the WebSocket connection if not already connected. Sets up the send callback
   * so the listener can transmit messages through this connection.
   *
   * If the socket is already open, immediately notifies subscription listeners via `onOpen`.
   *
   * @param listener - The {@link WebsocketListener} to register
   * @returns The registered listener
   */
  public addListener = (listener: WebsocketListener) => {
    listener.setSendToConnection(this.handleSendMessage);
    this.connect();
    this._listeners.set(listener.key, listener);
    clearTimeout(this.closeConnectionTimeOut);

    if (this._socket?.readyState === WebSocket.OPEN && listener.onOpen) {
      listener.onOpen();
    }
    return listener;
  };

  /**
   * Unregisters a listener and schedules connection cleanup if no listeners remain.
   *
   * Disconnects the listener's send callback and removes it from the routing map.
   * The WebSocket connection will be closed after {@link CONNECTION_CLEANUP_DELAY_MS} if no other
   * listeners are registered.
   *
   * @param listener - The listener instance to unregister
   */
  public removeListener = (listener: WebsocketListener) => {
    const existing = this._listeners.get(listener.key);
    if (existing) {
      existing.setSendToConnection(null);
      this._listeners.delete(existing.key);
    }
    this._client.connectionEvent?.({
      type: "connection:remove-listener",
      url: this._url,
      uri: listener.uri,
      key: listener.key,
      uriApis: getSubscriptionUris(this._listeners),
    });
    clearTimeout(this.closeConnectionTimeOut);
    this.scheduleConnectionCleanup();
  };

  /** Schedules connection close after configured delay when no listeners remain. */
  private scheduleConnectionCleanup = () => {
    const { connectionCleanupDelayMs } = this._client;

    this.closeConnectionTimeOut = setTimeout(() => {
      if (this._listeners.size === 0) {
        this._socket?.close();
        this._client.removeConnection(this.url);
      }
    }, connectionCleanupDelayMs);
  };

  // ─── Public API: Connection Control ─────────────────────────────────

  /**
   * Replaces the WebSocket URL and re-establishes the connection.
   *
   * Closes the current connection, resets all listeners, and reconnects using the new URL
   * after a short delay (1 second) to allow cleanup to complete.
   *
   * @param newUrl - The new WebSocket URL to connect to
   */
  public replaceUrl = async (newUrl: string) => {
    if (this._url !== newUrl) {
      this._url = newUrl;
      await this.teardownAndReconnect();
    }
  };

  /**
   * Reconnects the WebSocket connection.
   *
   * Tears down the current connection by removing all event listeners, closing the socket,
   * and resetting all registered URI APIs. After a short delay (1 second) to allow cleanup,
   * re-establishes the connection. Typically triggered by {@link websocketConnectionsReconnect}
   * when {@link useReconnectWebsocketConnections} (from @mono-fleet/common-components) detects
   * the user's authentication context (region/role) change.
   *
   * Guarded by {@link _isReconnecting} in {@link teardownAndReconnect} — if a `replaceUrl`
   * layout effect already started a reconnect cycle in the same render, this call is a no-op.
   */
  public reconnect = async () => {
    await this.teardownAndReconnect();
  };

  /**
   * Resets the retry counter and re-establishes the connection.
   *
   * Used when the user manually retries after hitting {@link RECONNECTION_CONFIG.MAX_RETRY_ATTEMPTS}.
   * Clears the max-retries-exceeded state and initiates a fresh connection attempt.
   */
  public resetRetriesAndReconnect = (): void => {
    this.reconnectTries = 0;
    this._maxRetriesExceeded = false;
    this.connect();
  };

  // ─── Connection Lifecycle (Private) ─────────────────────────────────

  /**
   * Establishes the WebSocket connection if not already connecting or connected.
   * Only creates a socket if at least one registered listener (subscription or message API) is enabled.
   * Sets up all event listeners and logs the connection attempt via the custom logger if configured.
   */
  private connect = () => {
    const hasEnabledListener = Array.from(this._listeners.values()).some(
      (listener) => listener.isEnabled
    );
    if (isConnectionReady(this._socket) || !hasEnabledListener) {
      return;
    }
    this._client.connectionEvent?.({
      type: "connect",
      url: this._url,
      retries: this.reconnectTries,
      uriApis: getSubscriptionUris(this._listeners),
    });
    this._socket = new WebSocket(this._url);
    this._socket.addEventListener("close", this.handleClose);
    this._socket.addEventListener("message", this.handleMessage);
    this._socket.addEventListener("open", this.handleOpen);
    this._socket.addEventListener("error", this.handleError);
  };

  /**
   * Tears down the current socket: clears all timers, removes all event listeners,
   * closes the socket, and resets the socket reference.
   */
  private teardownSocket = () => {
    this.clearAllTimers();
    this.removeListeners();
    this._socket?.close();
    this._socket = undefined;
  };

  /**
   * Tears down the current connection, resets all listeners, waits for cleanup to complete,
   * and re-establishes the connection. Shared by {@link replaceUrl} and {@link reconnect}.
   *
   * Guarded by {@link _isReconnecting} to prevent concurrent cycles. When
   * `selectedRegionRole` changes, both the hook's `replaceUrl` layout effect and
   * `useReconnectWebsocketConnections`'s reconnect effect may fire. Because layout effects run
   * before regular effects, `replaceUrl` wins and updates the URL first; the reconnect call
   * is safely skipped.
   */
  private teardownAndReconnect = async () => {
    if (this._isReconnecting) return;
    this._isReconnecting = true;
    try {
      this.teardownSocket();
      this._listeners.forEach((listener) => listener.reset());
      this.reconnectTries = 0;
      this._maxRetriesExceeded = false;
      await wait(TEARDOWN_RECONNECT_DELAY_MS);
      this.connect();
    } finally {
      this._isReconnecting = false;
    }
  };

  /**
   * Cleans up the WebSocket connection when no listeners are registered.
   */
  private cleanupConnection = () => {
    if (this._listeners.size === 0) {
      this._client.connectionEvent?.({
        type: "cleanup",
        url: this._url,
      });
      this.removeListeners();
      this._socket = undefined;
    }
  };

  /**
   * Clears all active timers (ping heartbeat, pong timeout, and connection cleanup).
   */
  private clearAllTimers = () => {
    clearTimeout(this.pingTimeOut);
    clearTimeout(this.pongTimeOut);
    clearTimeout(this.closeConnectionTimeOut);
  };

  /**
   * Removes all event listeners from the WebSocket and window objects.
   * Used during cleanup and reconnection processes.
   */
  private removeListeners = () => {
    this._socket?.removeEventListener("message", this.handleMessage);
    this._socket?.removeEventListener("close", this.handleClose);
    this._socket?.removeEventListener("open", this.handleOpen);
    this._socket?.removeEventListener("error", this.handleError);

    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("online", this.handleOnlineForReconnection);
      window.removeEventListener("offline", this.handleOffline);
    }
  };

  // ─── Reconnection Logic (Private) ──────────────────────────────────

  /**
   * Attempts to reconnect the WebSocket connection with exponential backoff.
   * Shows user notifications after the threshold number of attempts.
   * Only attempts reconnection when the browser is online.
   * When closeCode is 1013 (Try Again Later), waits an extra delay before reconnecting.
   * Stops after configured MAX_RETRY_ATTEMPTS and shows a permanent error with a manual retry button.
   *
   * @param closeCode - Optional WebSocket close code; used to apply TRY_AGAIN_LATER delay when 1013
   */
  private attemptReconnection = async (closeCode?: number) => {
    const { maxRetryAttempts, notificationThreshold, tryAgainLaterDelayMs } =
      this._client;
    if (this.reconnectTries >= maxRetryAttempts) {
      this._maxRetriesExceeded = true;
      this._client.connectionEvent?.({
        type: "max-retries-exceeded",
        url: this._url,
        retries: this.reconnectTries,
      });
      return;
    }

    if (this.deferReconnectionUntilOnline()) {
      return;
    }

    if (closeCode === WEBSOCKET_CLOSE_CODES.TRY_AGAIN_LATER) {
      if (this.reconnectTries > notificationThreshold) {
        this._client.connectionEvent?.({
          type: "reconnecting",
          url: this._url,
          retries: this.reconnectTries,
        });
      }

      await wait(tryAgainLaterDelayMs);
      if (this.deferReconnectionUntilOnline()) {
        return;
      }
    }

    this.reconnectTries++;

    const waitTime = reconnectWaitTime(
      this.reconnectTries,
      this._client.delays,
      this._client.phaseThresholds
    );

    if (this.reconnectTries > notificationThreshold) {
      this._client.connectionEvent?.({
        type: "reconnecting",
        url: this._url,
        retries: this.reconnectTries,
      });
    }
    await wait(waitTime);

    // Check again after waiting - browser might have gone offline during the wait
    if (this.deferReconnectionUntilOnline()) {
      return;
    }

    if (this.reconnectTries > notificationThreshold) {
      this._client.connectionEvent?.({
        type: "reconnecting",
        url: this._url,
        retries: this.reconnectTries,
      });
    }
    this.connect();
  };

  /**
   * Checks if the browser is offline and, if so, defers reconnection until it comes back online
   * by registering a one-time 'online' event listener.
   *
   * @returns `true` if reconnection was deferred (browser is offline), `false` if browser is online
   */
  private deferReconnectionUntilOnline = (): boolean => {
    if (isBrowserOnline()) {
      return false;
    }
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnlineForReconnection, {
        once: true,
      });
    }
    return true;
  };

  // ─── WebSocket Event Handlers ──────────────────────────────────────

  /**
   * Handles WebSocket close events.
   *
   * Implements automatic reconnection for any non-intentional close (anything other than
   * 1000 Normal Closure). This includes 1001 Going Away, 1011 Internal Error, 1012 Service
   * Restart, 1013 Try Again Later, 1006 Abnormal Closure, and other server-initiated codes.
   * Reconnection only occurs when listeners are still registered. Shows user notifications
   * after {@link RECONNECTION_CONFIG.NOTIFICATION_THRESHOLD} failed attempts.
   * Cleans up the connection if no listeners remain. Logs the close event via the custom logger if configured.
   *
   * @param event - The WebSocket close event containing code, reason, and whether the close was clean
   */
  private handleClose = async (event: CloseEvent) => {
    this.clearAllTimers();

    this._client.connectionEvent?.({
      type: "close",
      url: this._url,
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
      subscriptions: this._listeners.size,
    });

    const shouldReconnect = isReconnectableCloseCode(event.code);
    const hasRegisteredApis = this._listeners.size > 0;

    if (shouldReconnect && hasRegisteredApis) {
      await this.attemptReconnection(event.code);
    }

    this.cleanupConnection();
  };

  /**
   * Handles WebSocket open/connected events.
   *
   * Sets up offline detection, dismisses reconnection notifications, shows success message
   * for recovered connections (only if {@link RECONNECTION_CONFIG.NOTIFICATION_THRESHOLD}
   * was exceeded), resets reconnection counter, notifies all listeners, flushes cached
   * messages, and initiates the heartbeat ping sequence.
   */
  private handleOpen = () => {
    if (typeof window !== "undefined") {
      window.addEventListener("offline", this.handleOffline);
    }

    this.reconnectTries = 0;

    const socket = this._socket;
    if (socket) {
      this._listeners.forEach((listener) => listener.onOpen?.());

      this._client.connectionEvent?.({
        type: "open",
        url: this._url,
        retries: this.reconnectTries,
        uriApis: getSubscriptionUris(this._listeners),
      });
      this.cachedMessages.forEach((message) =>
        socket.send(this.serializeMessage(message))
      );
    }
    this.cachedMessages = [];
    if (this._client.heartbeat.enabled) {
      this.schedulePing();
    }
  };

  /**
   * Handles incoming WebSocket messages.
   *
   * Routes messages to matching listeners: subscription APIs by URI, message APIs by pending request URI.
   * Special handling for 'ping' messages to maintain heartbeat.
   * Dispatches error-method messages to listener error handlers.
   *
   * @param event - The WebSocket message event containing JSON data
   */
  private handleMessage = (event: MessageEvent<string>) => {
    try {
      const parsed: unknown = JSON.parse(event.data);

      if (!isValidIncomingMessage(parsed)) {
        this._client.connectionEvent?.({
          type: "invalid-message",
          url: this._url,
          uriApis: getSubscriptionUris(this._listeners),
          message: parsed,
        });
        this._listeners.forEach((listener) =>
          listener.onError({ type: "transport", event })
        );
        return;
      }

      if (parsed.uri === "ping") {
        this.clearPongTimeout();
        if (this._client.heartbeat.enabled) {
          this.schedulePing();
        }
        return;
      }

      if (isErrorMethod(parsed.method)) {
        this._client.connectionEvent?.({
          type: "message-error",
          url: this._url,
          uri: parsed.uri,
          uriApis: getSubscriptionUris(this._listeners),
          message: parsed,
        });
        this.forEachMatchingListener(parsed.uri, (listener) =>
          listener.onMessageError!({ type: "server", message: parsed })
        );
        return;
      }

      this.forEachMatchingListener(parsed.uri, (listener) => {
        if (listener.uri === parsed.uri) {
          listener.onMessage?.(parsed.body);
        } else {
          listener.deliverMessage?.(parsed.uri, parsed.body);
        }
      });
    } catch (error) {
      this._client.connectionEvent?.({
        type: "parse-error",
        url: this._url,
        uriApis: getSubscriptionUris(this._listeners),
        message: event.data,
        error: error,
      });
      this._listeners.forEach((listener) =>
        listener.onError({ type: "transport", event })
      );
    }
  };

  /**
   * Handles WebSocket error events.
   * Logs the error via the custom logger if configured and notifies all registered listeners.
   *
   * @param event - The WebSocket error event
   */
  private handleError = (event: Event) => {
    this._listeners.forEach((listener) =>
      listener.onError({ type: "transport", event })
    );

    this._client.connectionEvent?.({
      type: "error",
      url: this._url,
      uriApis: getSubscriptionUris(this._listeners),
      event: event,
    });
  };

  // ─── Browser Online/Offline Handlers ───────────────────────────────

  /**
   * Handles browser coming back online during offline detection.
   * Removes the online listener and re-establishes the connection.
   */
  private handleOnline = () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
    }
    this.connect();
  };

  /**
   * Handles browser coming back online during reconnection attempts.
   * Removes the online listener and resumes reconnection with a decremented counter
   * to avoid adding extra wait time from being offline.
   */
  private handleOnlineForReconnection = () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnlineForReconnection);
    }
    this.reconnectTries--;
    this.attemptReconnection();
  };

  /**
   * Handles browser going offline.
   *
   * Notifies all listeners of the closure, tears down the socket, and sets up
   * a listener to reconnect when the browser comes back online.
   */
  private handleOffline = () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("offline", this.handleOffline);
    }
    if (this._socket) {
      this._listeners.forEach((listener) =>
        listener.onClose(new CloseEvent("offline"))
      );
    }
    this.teardownSocket();
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
    }
  };

  // ─── Message Utilities (Private) ───────────────────────────────────

  /**
   * Handles outgoing messages from listeners.
   *
   * - If socket is OPEN: serializes with correlation ID and sends immediately.
   * - If socket is not open: subscribe messages trigger connect only; other messages are
   *   cached and sent when the connection opens.
   *
   * Passed to each listener via {@link WebsocketListener.setSendToConnection}.
   */
  private handleSendMessage = (message: SendMessage<string, string, any>) => {
    if (this._socket?.readyState === WebSocket.OPEN) {
      this._client.connectionEvent?.({
        type: "send-message",
        url: this._url,
        uri: message.uri,
        body: message.body,
        method: message.method,
      });
      this._socket.send(this.serializeMessage(message));
      return;
    }

    if (message.method !== "subscribe") {
      this.cachedMessages.push(message);
    }
    this.connect();
  };

  /**
   * Sends a heartbeat ping message to keep the connection alive and detect disconnections.
   * Sets a pong timeout; if no pong arrives within HEARTBEAT_CONFIG.PONG_TIMEOUT_MS,
   * the connection is force-closed to trigger reconnection.
   */
  private sendPing = () => {
    if (!isSocketOnline(this._socket)) return;
    this._socket?.send(this.serializeMessage(createPingMessage()));
    this.schedulePongTimeout();
  };

  /**
   * Clears the pong timeout (e.g. when a pong is received).
   */
  private clearPongTimeout = () => {
    clearTimeout(this.pongTimeOut);
    this.pongTimeOut = undefined;
  };

  /**
   * Schedules a timeout to detect missing pong. If no pong arrives within
   * configured pong timeout, force-closes the socket to trigger reconnection.
   */
  private schedulePongTimeout = () => {
    this.clearPongTimeout();
    const pongTimeoutMs = this._client.heartbeat.pongTimeoutMs;
    this.pongTimeOut = setTimeout(() => {
      this._client.connectionEvent?.({
        type: "pong-timeout",
        url: this._url,
      });
      this.teardownSocket();
      this.attemptReconnection();
    }, pongTimeoutMs);
  };

  /**
   * Schedules the next heartbeat ping after the configured interval (40 seconds).
   * @see {@link getPingTime}
   */
  private schedulePing = () => {
    this.pingTimeOut = setTimeout(() => {
      this.sendPing();
    }, getPingTime());
  };

  /**
   * Serializes a message with a unique correlation ID for WebSocket transmission.
   * @param message - The message to serialize
   * @returns JSON string for WebSocket send
   */
  private serializeMessage = (
    message: SendMessage<string, string, any>
  ): string => {
    const transformMessagePayload = this._client.transformMessagePayload;
    if (transformMessagePayload) {
      message = transformMessagePayload(message);
    }
    return JSON.stringify(message);
  };

  /**
   * Executes a callback for each listener that matches the given URI.
   *
   * - **Subscription listeners**: Match when `listener.uri === uri`
   * - **Message listeners**: Match when `listener.hasWaitingUri(uri)` (pending request/response)
   *
   * A single message can be delivered to multiple listeners if both a subscription
   * and a message API are waiting for the same URI.
   *
   * @param uri - The URI from the incoming message
   * @param callback - Callback invoked for each matching listener
   */
  private forEachMatchingListener = (
    uri: string,
    callback: (listener: WebsocketListener) => void
  ) => {
    this._listeners.forEach((listener) => {
      if (listener.uri === uri || listener.hasWaitingUri?.(uri)) {
        callback(listener);
      }
    });
  };
}
