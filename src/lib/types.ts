import { RECONNECTION_CONFIG } from "./constants";
import { WebsocketMessageApi } from "./WebsocketMessageApi";
import { WebsocketSubscriptionApi } from "./WebsocketSubscriptionApi";

/**
 * Type definitions for the WebSocket connection system.
 *
 * @module types
 */

/**
 * WebSocket connection ready states.
 *
 * Values match the WebSocket API readyState constants, with an additional
 * UNINSTANTIATED state for connections that haven't been created yet.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState
 */
export enum ReadyState {
  /** Connection has not been instantiated yet */
  UNINSTANTIATED = -1,
  /** Connection is being established */
  CONNECTING = 0,
  /** Connection is open and ready to communicate */
  OPEN = 1,
  /** Connection is in the process of closing */
  CLOSING = 2,
  /** Connection is closed or couldn't be opened */
  CLOSED = 3,
}

/**
 * Structure for outgoing WebSocket messages.
 *
 * Messages are sent with a method (HTTP-like), URI for routing, optional body,
 * and an automatically generated correlation ID for tracking.
 *
 * @template TMethod - The type of the HTTP method (e.g., 'subscribe', 'unsubscribe', 'post')
 * @template TUri - The type of the URI string
 * @template TBody - The type of the message body payload
 */
export interface SendMessage<TMethod = string, TUri = string, TBody = unknown> {
  /** HTTP-like method for the message (e.g., 'subscribe', 'unsubscribe', 'post') */
  method?: TMethod;
  /** URI path for routing the message to the correct handler */
  uri?: TUri;
  /** Optional message body/payload */
  body?: TBody;
}

/**
 * Callback function for sending messages from a {@link WebsocketSubscriptionApi} to its parent {@link WebsocketConnection}.
 *
 * This callback is injected by the connection when a URI API is registered,
 * replacing the previous EventTarget/CustomEvent indirection with a direct,
 * type-safe function call.
 */
export type SendToConnectionFn = (
  message: SendMessage<string, string, unknown>
) => void;

/**
 * Structure of incoming WebSocket messages.
 *
 * Messages must have a URI for routing to the correct handler and can include
 * an optional body with the actual message data.
 *
 * @template TBody - The type of the message body payload
 */
export interface IncomingWebsocketMessage<TBody = unknown> {
  /** URI path that identifies which handler should process this message */
  uri: string;
  /** Optional message body/payload */
  body?: TBody;
  /** HTTP-like method for the message (e.g., 'subscribe', 'unsubscribe', 'post') */
  method?: string;
}

/**
 * Error sent by the server via a message with method 'error', 'conflict', or 'exception'.
 * Contains the parsed message body for application-level error handling.
 *
 * @template TBody - The type of the error body payload
 */
export interface WebsocketServerError<TBody = unknown> {
  readonly type: "server";
  readonly message: IncomingWebsocketMessage<TBody>;
}

/**
 * Error from the WebSocket transport layer (connection failure, network issues, etc.).
 * Contains the raw Event from the WebSocket 'error' handler.
 */
export interface WebsocketTransportError {
  readonly type: "transport";
  readonly event: Event;
}

/**
 * Configuration options for WebSocket URI APIs.
 *
 * Subscriptions automatically subscribe when the WebSocket connection opens.
 *
 * @template TData - The type of data received from the WebSocket
 * @template TBody - The type of message body sent to the WebSocket
 */
export interface WebsocketSubscriptionOptions<
  TData = unknown,
  TBody = unknown
> {
  /** The base URL of the WebSocket connection. */
  url: string;
  /** The URI path for this subscription. */
  uri: string;
  /**
   * Unique key for the URI API.
   *
   * Used to identify the URI API in the connection.
   */
  key: string;
  /** Whether this URI API is enabled (default: true). When disabled, messages are not sent. */
  enabled?: boolean;
  /** Optional body payload to send with subscription or initial message */
  body?: TBody;

  /** Optional HTTP method for custom messages sent via sendMessage */
  method?: string;
  /**
   * Callback invoked when subscription is successful.
   *
   * @param uri - The URI path that was subscribed to
   * @param body - The body that was sent with the subscription
   */
  onSubscribe?: (props: {
    uri: string;
    body?: TBody;
    uriApi: WebsocketSubscriptionApi<TData, TBody>;
  }) => void;
  /**
   * Callback invoked when a message is received for this URI.
   *
   * @param data - The message data received from the WebSocket
   * @param uriApi - The URI API instance that received the message
   */
  onMessage?: (props: {
    data: TData;
    uriApi: WebsocketSubscriptionApi<TData, TBody>;
  }) => void;
  /**
   * Callback invoked when a WebSocket error occurs.
   *
   * @param error - Discriminated error: use `error.type === 'server'` for server-sent error messages
   *                (parsed body in `error.message`), or `error.type === 'transport'` for connection failures.
   */
  onError?: (error: WebsocketTransportError) => void;

  /**
   * Callback invoked when a server error message is received for this subscription.
   *
   * @param error - Server error with parsed message body (`error.type === 'server'`, `error.message` contains the incoming message)
   */
  onMessageError?: (error: WebsocketServerError<TBody>) => void;
  /**
   * Callback invoked when the WebSocket connection closes.
   *
   * @param event - The close event from the WebSocket connection
   */
  onClose?: (event: CloseEvent) => void;
}

/**
 * Configuration options for WebSocket Message API.
 *
 * Message API is for request/response style communication: send a message to any URI
 * and optionally wait for a response. No subscription support.
 *
 * @template TData - The type of data received in the response
 * @template TBody - The type of message body sent to the WebSocket
 */
export interface WebsocketMessageOptions {
  /** The base URL of the WebSocket connection. */
  url: string;
  /**
   * Unique key for the Message API.
   *
   * Used to identify the API in the connection.
   */
  key: string;
  /** Whether this Message API is enabled (default: true). When disabled, messages are not sent. */
  enabled?: boolean;
  /**
   * Default timeout in ms when waiting for a response.
   *
   * Can be overridden per sendMessage call.
   */
  responseTimeoutMs?: number;
  /**
   * Callback invoked when a WebSocket transport error occurs.
   */
  onError?: (error: WebsocketTransportError) => void;
  /**
   * Callback invoked when a server error message is received.
   */
  onMessageError?: (error: WebsocketServerError) => void;
  /**
   * Callback invoked when the WebSocket connection closes.
   */
  onClose?: (event: CloseEvent) => void;
}

/**
 * Options for WebsocketMessageApi.sendMessage.
 */
export interface SendMessageOptions {
  /** Timeout in ms when waiting for a response. Overrides the default from options. */
  timeout?: number;
}

/**
 * Common interface for WebSocket listeners registered with {@link WebsocketConnection}.
 *
 * Both {@link WebsocketSubscriptionApi} and {@link WebsocketMessageApi} implement this interface,
 * allowing the connection to treat them uniformly via {@link addListener} / {@link removeListener}.
 *
 * - **Subscription listeners**: Have `uri`, `onOpen`, `onMessage` — route by URI match
 * - **Message listeners**: Have `hasWaitingUri`, `deliverMessage` — route by pending URI
 */
export interface WebsocketListener {
  readonly key: string;
  readonly url: string;
  readonly isEnabled: boolean;
  setSendToConnection(callback: SendToConnectionFn | null): void;
  onError(error: WebsocketTransportError): void;
  onMessageError(error: WebsocketServerError<unknown>): void;
  onClose(event: CloseEvent): void;
  reset(): void;
  /** Subscription listeners: fixed URI for this endpoint */
  readonly uri?: string;
  /** Subscription listeners: called when connection opens */
  onOpen?(): void;
  /** Subscription listeners: called when a message is received for this URI */
  onMessage?(data: unknown): void;
  /** Message listeners: returns true if waiting for a response for the given URI */
  hasWaitingUri?(uri: string): boolean;
  /** Message listeners: delivers a response for a pending request */
  deliverMessage?(uri: string, data: unknown): void;
  readonly type: "subscription" | "message";
}

export type WebsocketMessageApiPublic = Pick<
  WebsocketMessageApi,
  "sendMessage" | "sendMessageNoWait" | "reset" | "url" | "key" | "isEnabled"
>;

export type WebsocketSubscriptionApiPublic<
  TData = unknown,
  TBody = unknown
> = Pick<
  WebsocketSubscriptionApi<TData, TBody>,
  "reset" | "url" | "key" | "isEnabled" | "store"
>;

export interface WebsocketSubscriptionStore<TData = unknown> {
  message: TData | undefined;
  subscribed: boolean;
  /**
   * Whether a subscription has been sent but no response received yet.
   *
   * - `true`: A subscribe message was sent and we are waiting for the first (or next) message.
   * - `false`: No subscription is active, the connection is closed, or we have already received a response.
   *
   * Use this to show loading/placeholder UI while waiting for initial data after subscribing.
   */
  pendingSubscription: boolean;
  subscribedAt: number | undefined;
  receivedAt: number | undefined;
  connected: boolean;
  messageError: WebsocketTransportError | undefined;
  serverError: WebsocketServerError<unknown> | undefined;
}

/**
 * Creates the initial state for a {@link WebsocketSubscriptionStore}.
 *
 * @template TData - The type of data in the store's `message` field
 * @returns A new store with default values (message: undefined, subscribed: false, etc.)
 */
export function createInitialWebsocketSubscriptionStore<
  TData = unknown
>(): WebsocketSubscriptionStore<TData> {
  return {
    message: undefined,
    subscribed: false,
    pendingSubscription: false,
    subscribedAt: undefined,
    receivedAt: undefined,
    connected: false,
    messageError: undefined,
    serverError: undefined,
  };
}

/**
 * Optional custom logger for WebSocket connection events.
 * Set via {@link WebsocketConfig.setCustomLogger}.
 */
export interface WebsocketLogger {
  /** Logs connection events (e.g. ws-connect, ws-close, ws-error, ws-reconnect) */
  // log?(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void;
  /** Called when max retry attempts exceeded; use to trigger token refresh or other recovery */
  connectionEvents?: (event: WebsocketLoggerConnectionEvent) => void;
}

/** Union of all connection event types passed to {@link WebsocketClientOverrides.connectionEvent}. */

export type WebsocketLoggerConnectionEvent =
  | WebsocketLoggerCloseEvent
  | WebsocketLoggerOpenEvent
  | WebsocketLoggerMessageEvent
  | WebsocketLoggerErrorEvent
  | WebsocketLoggerReconnectingEvent
  | WebsocketLoggerPongTimeoutEvent
  | WebsocketLoggerInvalidMessageEvent
  | WebsocketLoggerMessageErrorEvent
  | WebsocketLoggerParseErrorEvent
  | WebsocketLoggerSendMessageEvent
  | WebsocketLoggerCleanupEvent
  | WebsocketLoggerRemoveListenerFromConnectionEvent
  | WebsocketLoggerSubscriptionEvent
  | WebsocketLoggerSubscriptionSendMessageEvent;

/** @internal */
interface WebsocketLoggerCloseEvent {
  /** WebSocket connection closed */
  type: "close";
  url: string;
  code: number;
  reason: string;
  wasClean: boolean;
  subscriptions: number;
}
/** @internal */
interface WebsocketLoggerCleanupEvent {
  /** Connection cleaned up (no listeners remain) */
  type: "cleanup";
  url: string;
}

/** @internal */
interface WebsocketLoggerOpenEvent {
  /** WebSocket connection opened or connecting */
  type: "open" | "connect";
  url: string;
  retries: number;
  uriApis: string[];
}
/** @internal */
interface WebsocketLoggerMessageEvent {
  /** Incoming message received */
  type: "message";
  uri: string;
  url: string;
  body: unknown;
  method: string;
}
/** @internal */
interface WebsocketLoggerSendMessageEvent {
  /** Outgoing message sent */
  type: "send-message";
  uri?: string;
  url: string;
  body: unknown;
  method?: string;
}

/** @internal */
interface WebsocketLoggerErrorEvent {
  /** WebSocket transport error */
  type: "error";
  event: unknown;
  url: string;
  uriApis: string[];
}
/** @internal */
interface WebsocketLoggerParseErrorEvent {
  /** Failed to parse incoming message JSON */
  type: "parse-error";
  error: unknown;
  url: string;
  uriApis: string[];
  message: unknown;
}

/** @internal */
interface WebsocketLoggerMessageErrorEvent {
  /** Server sent error message (method: error, conflict, or exception) */
  type: "message-error";
  uri: string;
  url: string;
  uriApis: string[];
  message: unknown;
}
/** @internal */
interface WebsocketLoggerReconnectingEvent {
  /** Reconnection attempt or max retries exceeded */
  type: "reconnecting" | "max-retries-exceeded";
  retries: number;
  url: string;
}

/** @internal */
interface WebsocketLoggerInvalidMessageEvent {
  /** Incoming message missing required structure (e.g. uri) */
  type: "invalid-message";
  url: string;
  uriApis: string[];
  message: unknown;
}

/** @internal */
interface WebsocketLoggerRemoveListenerFromConnectionEvent {
  /** Listener removed from connection */
  type: "connection:remove-listener";
  url: string;
  uri?: string;
  key: string;
  uriApis?: string[];
}

/** @internal */
interface WebsocketLoggerSubscriptionEvent {
  /** Subscription disconnect attempt */
  type:
    | "subscription:reset"
    | "subscription:disconnect-attempt"
    | "subscription:unsubscribe"
    | "subscription:unmount-hook";
  uri: string;
  key: string;
}
interface WebsocketLoggerSubscriptionSendMessageEvent {
  /** Subscription disconnect attempt */
  type: "subscription:send-message"|"subscription:queue-message";
  uri: string;
  key: string;
  message: SendMessage<string, string, unknown>;
}

/** @internal */
interface WebsocketLoggerPongTimeoutEvent {
  /** No pong received within heartbeat timeout */
  type: "pong-timeout";
  url: string;
}

export type ReconnectionConfig = typeof RECONNECTION_CONFIG;

/** Heartbeat (ping/pong) configuration */
export interface HeartbeatConfig {
  /** Whether to send ping messages and expect pong responses. Default: true */
  enabled: boolean;
  /** Time in ms to wait for a pong before considering the connection dead. Default: 10000 */
  pongTimeoutMs: number;
}

/** Overrides for the global WebSocket configuration. All fields are optional. */
export interface WebsocketClientOverrides {
  /** Maximum number of reconnection attempts before stopping and showing a permanent error. Prevents infinite retries on dead endpoints (CPU wake-ups, battery drain). ~10 attempts ≈ 12 minutes at phase 3 (90s interval). User can retry manually. */
  maxRetryAttempts?: number;
  /** Number of failed reconnection attempts before showing user notifications. Prevents notification spam during brief network interruptions. */
  notificationThreshold?: number;
  /** Initial delay (in ms) when server closes with 1013 Try Again Later. The server explicitly asks to wait before reconnecting. */
  tryAgainLaterDelayMs?: number;
  /** Delay durations (in milliseconds) for each reconnection phase. */
  delays?: {
    firstPhase?: number;
    secondPhase?: number;
    thirdPhase?: number;
  };
  /** Threshold values that determine when to transition between reconnection phases. */
  phaseThresholds?: {
    first?: number;
    second?: number;
  };
  /** Override connection cleanup delay when no listeners remain */
  connectionCleanupDelayMs?: number;
  /** Default timeout in ms when waiting for a message response. Used by WebsocketMessageApi */
  messageResponseTimeoutMs?: number;
  /** Override ping/pong heartbeat behavior */
  heartbeat?: Partial<HeartbeatConfig>;

  transformMessagePayload?: (
    payload: SendMessage<string, string, unknown>
  ) => SendMessage<string, string, unknown>;
  /**
   * Callback for connection event logging. Receives events such as:
   * - `{ type: 'open' | 'connect', url, retries, uriApis }`
   * - `{ type: 'close', url, code, reason, wasClean, subscriptions }`
   * - `{ type: 'reconnecting' | 'max-retries-exceeded', url, retries }`
   * - `{ type: 'message-error', url, uri, uriApis, message }`
   * - `{ type: 'invalid-message', url, uriApis, message }`
   * - `{ type: 'parse-error', url, uriApis, message, error }`
   * - `{ type: 'send-message', url, uri?, body, method? }`
   * - `{ type: 'cleanup', url }`
   * - `{ type: 'pong-timeout', url }`
   *
   * @param event - The connection event
   */
  connectionEvent?: (event: WebsocketLoggerConnectionEvent) => void;
}
