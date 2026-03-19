/**
 * @fileoverview Pure helper functions for WebSocket connection management.
 *
 * These utilities support {@link WebsocketConnection} with reconnection timing,
 * message validation, heartbeat, and user notifications. All functions are
 * stateless and side-effect free except the notification helpers.
 *
 * @module WebsocketConnection.helpers
 */

import { RECONNECTION_CONFIG, WEBSOCKET_CLOSE_CODES } from "./constants";
import {
  IncomingWebsocketMessage,
  ReconnectionConfig,
  SendMessage,
  WebsocketClientOverrides,
  WebsocketListener,
} from "./types";

/**
 * Extracts URIs from subscription listeners for connection event logging.
 *
 * @param listeners - Map of listeners keyed by their unique key
 * @returns Array of URIs from subscription listeners (message APIs are excluded)
 * @internal
 */
export const getSubscriptionUris = (
  listeners: Map<string, WebsocketListener>
): string[] =>
  Array.from(listeners)
    .filter(([, listener]) => "uri" in listener)
    .map(([, listener]) => (listener as { uri: string }).uri);

/**
 * Calculates the wait time before attempting to reconnect based on the number of failed attempts.
 *
 * Uses a three-phase exponential backoff strategy to avoid hammering a failing server:
 * - **First phase** (attempts 0–4): 4 seconds — quick recovery for transient issues
 * - **Second phase** (attempts 5–9): 30 seconds — moderate backoff for persistent issues
 * - **Third phase** (attempts 10+): 90 seconds — long backoff to reduce load on dead endpoints
 *
 * @param tries - The number of reconnection attempts made so far
 * @param reconnectionConfig - Optional reconnection config (defaults to global config)
 * @returns Wait time in milliseconds before next reconnection attempt
 *
 * @see {@link RECONNECTION_CONFIG} - Phase thresholds and delay values
 * @internal
 */
export const reconnectWaitTime = (
  tries: number,
  delays: NonNullable<Required<WebsocketClientOverrides["delays"]>>,
  phaseThresholds: NonNullable<
    Required<WebsocketClientOverrides["phaseThresholds"]>
  >
) => {
  if (tries < phaseThresholds.first) {
    return delays.firstPhase;
  }
  if (tries < phaseThresholds.second) {
    return delays.secondPhase;
  }
  return delays.thirdPhase;
};

/**
 * Gets the ping interval time in milliseconds for keeping WebSocket connections alive.
 *
 * The heartbeat sends a ping every 40 seconds. If no pong arrives within
 * {@link HEARTBEAT_CONFIG.PONG_TIMEOUT_MS}, the connection is force-closed to trigger reconnection.
 *
 * @returns The ping interval in milliseconds (40 seconds)
 *
 * @see {@link HEARTBEAT_CONFIG.PONG_TIMEOUT_MS} - Time to wait for pong before considering connection dead
 * @internal
 */
export const getPingTime = (): number => 40 * 1000;

/**
 * Type guard to validate that a parsed value is a valid incoming WebSocket message.
 *
 * Valid messages must be an object with a string `uri` property. Messages without
 * a valid structure are rejected and trigger {@link WebsocketListener.onError} with
 * type `'transport'`.
 *
 * @param value - The value to check (typically from `JSON.parse`)
 * @returns `true` if the value is a valid {@link IncomingWebsocketMessage}
 *
 * @internal
 */
export const isValidIncomingMessage = (
  value: unknown
): value is IncomingWebsocketMessage => {
  return (
    typeof value === "object" &&
    value !== null &&
    "uri" in value &&
    typeof (value as Record<string, unknown>).uri === "string"
  );
};

/**
 * Checks if the method indicates a server-side error message.
 *
 * Server errors use methods `'error'`, `'conflict'`, or `'exception'`. These are
 * routed to {@link WebsocketListener.onMessageError} instead of `onMessage`.
 *
 * @param method - The message method to check (optional)
 * @returns `true` if the method is an error method; `false` if undefined or not an error
 *
 * @internal
 */
export const isErrorMethod = (method?: string): boolean => {
  if (!method) return false;
  const errorMethods = ["error", "conflict", "exception"];
  return errorMethods.includes(method);
};

/**
 * Checks if the browser reports an online network state.
 *
 * Uses `window.navigator.onLine`. Note: this can be unreliable — it may report
 * `true` when the user is on a network but has no internet (e.g. captive portal).
 *
 * @returns `true` if the browser is online; `false` in SSR or when offline
 *
 * @internal
 */
export const isBrowserOnline = (): boolean => {
  return typeof window !== "undefined" && window.navigator.onLine;
};

/**
 * Checks if the WebSocket is ready to send and receive messages.
 *
 * Requires both browser online state and socket in {@link WebSocket.OPEN} state.
 * Use this before sending messages (e.g. heartbeat ping).
 *
 * @param socket - The WebSocket instance to check
 * @returns `true` if browser is online and socket is OPEN
 *
 * @see {@link isConnectionReady} - Less strict: also allows CONNECTING
 * @internal
 */
export const isSocketOnline = (socket?: WebSocket): boolean => {
  return (
    typeof window !== "undefined" &&
    window.navigator.onLine &&
    socket !== undefined &&
    socket.readyState === WebSocket.OPEN
  );
};

/**
 * Creates a ping message for the WebSocket heartbeat mechanism.
 *
 * Format: `{ method: 'post', uri: 'ping', body: timestamp, correlation: uuid }`.
 * The server should respond with a pong; missing pong triggers reconnection.
 *
 * @returns JSON string of the ping message
 *
 * @internal
 */
export const createPingMessage = (): SendMessage<string, string, number> => {
  return {
    method: "post",
    uri: "ping",
    body: Date.now(),
  };
};

/**
 * Checks if the WebSocket connection is in a valid state (open or connecting).
 *
 * Used to avoid creating duplicate connections. Unlike {@link isSocketOnline},
 * this returns `true` for CONNECTING state — useful when deciding whether to
 * call `connect()`.
 *
 * @param socket - The WebSocket instance to check
 * @returns `true` if socket is OPEN or CONNECTING; `false` if undefined, CLOSING, or CLOSED
 *
 * @see {@link isSocketOnline} - Stricter: requires OPEN and browser online
 * @internal
 */
export const isConnectionReady = (socket?: WebSocket): boolean => {
  return (
    socket?.readyState === WebSocket.OPEN ||
    socket?.readyState === WebSocket.CONNECTING
  );
};

/**
 * Determines whether a WebSocket close event warrants an automatic reconnection attempt.
 *
 * **Only code 1000 (Normal Closure) does NOT trigger reconnection** — it indicates a
 * clean, intentional shutdown. All other codes trigger reconnection when listeners
 * are still registered, including:
 * - 1001 Going Away, 1011 Internal Error, 1012 Service Restart, 1013 Try Again Later
 * - 1006 Abnormal Closure (no close frame received — network/server crash)
 *
 * @param closeCode - The close event code from the WebSocket CloseEvent
 * @returns `true` if reconnection should be attempted; `false` for 1000 only
 *
 * @see {@link WEBSOCKET_CLOSE_CODES} - Close code constants
 */
export const isReconnectableCloseCode = (closeCode: number): boolean => {
  return closeCode !== WEBSOCKET_CLOSE_CODES.NORMAL_CLOSURE;
};
