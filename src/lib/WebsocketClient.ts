/**
 * @fileoverview Global WebSocket configuration for all WebsocketConnection instances.
 *
 * Provides a single source of truth for connection behavior. Instantiate with
 * {@link WebsocketClientOverrides} at app startup to customize defaults.
 * Use the connectionEvent callback to configure event logging.
 *
 * @module WebsocketClient
 */

import { createStore, Store } from "@tanstack/react-store";
import {
  CONNECTION_CLEANUP_DELAY_MS,
  DEFAULT_HEARTBEAT_CONFIG,
  DEFAULT_MESSAGE_RESPONSE_TIMEOUT_MS,
  RECONNECTION_CONFIG,
} from "./constants";
import type {
  HeartbeatConfig,
  SendMessage,
  WebsocketClientOverrides,
  WebsocketListener,
  WebsocketLoggerConnectionEvent,
} from "./types";
import { WebsocketConnection } from "./WebsocketConnection";
import type { WebsocketMessageApi } from "./WebsocketMessageApi";
import type { WebsocketSubscriptionApi } from "./WebsocketSubscriptionApi";

/**
 * Global WebSocket configuration used by all WebsocketConnection instances.
 *
 * Instantiate with {@link WebsocketClientOverrides} to customize behavior.
 * All overrides are merged with defaults; partial overrides are supported.
 *
 * @example
 * ```typescript
 * const client = new WebsocketClient({
 *   maxRetryAttempts: 10,
 *   heartbeat: { enabled: false },
 *   messageResponseTimeoutMs: 5000
 * });
 * ```
 */
export class WebsocketClient {
  /**
   * Global map of active WebSocket connections, keyed by URL.
   *
   * One connection per key. Managed by {@link addConnection} and {@link removeConnection}.
   */
  private _connections = createStore<Map<string, WebsocketConnection>>(
    new Map()
  );

  /**
   * Global map of active WebSocket listeners (subscription and message APIs), keyed by API key.
   *
   * One listener per key. Subscription APIs have `uri`; message APIs have `hasWaitingUri`.
   * Managed by {@link createWebsocketSubscriptionApi}, {@link createWebsocketMessageApi},
   * and {@link removeWebsocketListenerFromConnection}.
   */
  private _listeners = createStore<Map<string, WebsocketListener>>(new Map());

  /** Maximum reconnection attempts before stopping. */
  public maxRetryAttempts: number;
  /** Attempts before showing user notifications. */
  public notificationThreshold: number;
  /** Delay (ms) when server closes with 1013 Try Again Later. */
  public tryAgainLaterDelayMs: number;
  /** Delay durations (ms) for each reconnection phase. */
  public delays: {
    firstPhase: number;
    secondPhase: number;
    thirdPhase: number;
  };
  public phaseThresholds: {
    first: number;
    second: number;
  };
  /** Delay (ms) before closing connection when no listeners remain. */
  public connectionCleanupDelayMs: number;
  /** Default timeout (ms) for message API responses. */
  public messageResponseTimeoutMs: number;
  /** Heartbeat (ping/pong) configuration. */
  public heartbeat: HeartbeatConfig;
  /** Optional transform for outgoing message payloads. */
  public transformMessagePayload:
    | ((
        payload: SendMessage<string, string, unknown>
      ) => SendMessage<string, string, unknown>)
    | undefined;
  /** Optional callback for connection event logging. */
  public connectionEvent:
    | ((event: WebsocketLoggerConnectionEvent) => void)
    | undefined;

  /**
   * Creates a new WebsocketClient with optional overrides.
   *
   * All overrides are merged with defaults from {@link RECONNECTION_CONFIG},
   * {@link CONNECTION_CLEANUP_DELAY_MS}, and {@link DEFAULT_HEARTBEAT_CONFIG}.
   *
   * @param overrides - Partial configuration overrides. Omitted values use defaults.
   */
  constructor({
    maxRetryAttempts,
    notificationThreshold,
    tryAgainLaterDelayMs,
    delays,
    phaseThresholds,
    connectionCleanupDelayMs,
    messageResponseTimeoutMs,
    heartbeat,
    transformMessagePayload,
    connectionEvent,
  }: WebsocketClientOverrides) {
    this.maxRetryAttempts =
      maxRetryAttempts ?? RECONNECTION_CONFIG.MAX_RETRY_ATTEMPTS;
    this.notificationThreshold =
      notificationThreshold ?? RECONNECTION_CONFIG.NOTIFICATION_THRESHOLD;
    this.tryAgainLaterDelayMs =
      tryAgainLaterDelayMs ?? RECONNECTION_CONFIG.TRY_AGAIN_LATER_DELAY_MS;
    this.delays = {
      firstPhase: delays?.firstPhase ?? RECONNECTION_CONFIG.DELAYS.FIRST_PHASE,
      secondPhase:
        delays?.secondPhase ?? RECONNECTION_CONFIG.DELAYS.SECOND_PHASE,
      thirdPhase: delays?.thirdPhase ?? RECONNECTION_CONFIG.DELAYS.THIRD_PHASE,
    };
    this.phaseThresholds = {
      first:
        phaseThresholds?.first ?? RECONNECTION_CONFIG.PHASE_THRESHOLDS.FIRST,
      second:
        phaseThresholds?.second ?? RECONNECTION_CONFIG.PHASE_THRESHOLDS.SECOND,
    };
    this.connectionCleanupDelayMs =
      connectionCleanupDelayMs ?? CONNECTION_CLEANUP_DELAY_MS;
    this.messageResponseTimeoutMs =
      messageResponseTimeoutMs ?? DEFAULT_MESSAGE_RESPONSE_TIMEOUT_MS;
    this.heartbeat = {
      enabled: heartbeat?.enabled ?? DEFAULT_HEARTBEAT_CONFIG.enabled,
      pongTimeoutMs:
        heartbeat?.pongTimeoutMs ?? DEFAULT_HEARTBEAT_CONFIG.pongTimeoutMs,
    };
    this.transformMessagePayload = transformMessagePayload ?? undefined;

    this.connectionEvent = connectionEvent ?? undefined;
  }

  /** Reconnects all active WebSocket connections. Use after auth/region change. */
  public reconnectAllConnections = () => {
    this._connections.state.forEach((connection) => {
      connection.reconnect();
    });
  };

  /** Registers a listener (subscription or message API) in the client. */
  public addListener = (listener: WebsocketListener) => {
    this._listeners.setState((prev) => {
      const next = new Map(prev);
      next.set(listener.key, listener);
      return next;
    });
  };

  /** Unregisters a listener from the client. */
  public removeListener = (listener: WebsocketListener) => {
    this._listeners.setState((prev) => {
      const next = new Map(prev);
      next.delete(listener.key);
      return next;
    });
  };

  /**
   * Returns a listener by key and type.
   *
   * @param key - The listener's unique key
   * @param type - `'subscription'` or `'message'`
   * @returns The listener if found, otherwise undefined
   */
  public getListener<TData = unknown, TBody = unknown>(
    key: string,
    type: "subscription"
  ): WebsocketSubscriptionApi<TData, TBody> | undefined;
  public getListener(
    key: string,
    type: "message"
  ): WebsocketMessageApi | undefined;
  public getListener<TData = unknown, TBody = unknown>(
    key: string,
    type: "subscription" | "message"
  ): WebsocketSubscriptionApi<TData, TBody> | WebsocketMessageApi | undefined {
    const listener = this._listeners.state.get(key);
    if (listener && listener.type === type) {
      return listener as
        | WebsocketSubscriptionApi<TData, TBody>
        | WebsocketMessageApi;
    }
    return undefined;
  }

  /** Returns the WebSocket connection for the given URL key, or undefined. */
  public getConnection = (key: string): WebsocketConnection | undefined => {
    return this._connections.state.get(key);
  };

  /**
   * Adds or returns an existing WebSocket connection for the given URL.
   *
   * @param key - The key used to identify the connection (typically the URL)
   * @param url - The WebSocket URL to connect to
   * @returns The existing or newly created connection
   */
  public addConnection = (key: string, url: string) => {
    const existingConnection = this._connections.state.get(key);
    if (existingConnection) {
      return existingConnection;
    }
    const connection = new WebsocketConnection(url, this);
    this._connections.setState((prev) => {
      const next = new Map(prev);
      next.set(key, connection);
      return next;
    });
    return connection;
  };

  /**
   * Removes a connection from the client.
   *
   * @param url - The WebSocket URL used as the key when calling {@link addConnection}.
   */
  public removeConnection = (url: string) => {
    this._connections.setState((prev) => {
      const next = new Map(prev);
      next.delete(url);
      return next;
    });
  };
}
