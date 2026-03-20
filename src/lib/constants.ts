import { HeartbeatConfig } from "./types";

/**
 * WebSocket constants and configuration.
 *
 * @module constants
 */

/**
 * WebSocket close codes used for connection state detection.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code
 */
export const WEBSOCKET_CLOSE_CODES = {
  /** Clean intentional closure — do not reconnect */
  NORMAL_CLOSURE: 1000,
  /** Endpoint going away (e.g. server restarting) — reconnect */
  GOING_AWAY: 1001,
  /** Server internal error — reconnect */
  INTERNAL_ERROR: 1011,
  /** Service restart — reconnect */
  SERVICE_RESTART: 1012,
  /** Try again later — reconnect */
  TRY_AGAIN_LATER: 1013,
  /**
   * Abnormal closure (1006) indicates the connection was closed without
   * receiving a close frame. Typically occurs due to network issues,
   * server crashes, or unexpected termination — reconnect.
   */
  ABNORMAL_CLOSURE: 1006
} as const;

/**
 * Configuration for WebSocket reconnection behavior with exponential backoff.
 *
 * The reconnection strategy uses three phases:
 * - First phase (attempts 0-4): 4 second delay
 * - Second phase (attempts 5-9): 30 second delay
 * - Third phase (attempts 10+): 90 second delay
 *
 * User notifications are only shown after the notification threshold is exceeded
 * to avoid spamming users during brief network interruptions.
 *
 * After MAX_RETRY_ATTEMPTS, reconnection stops to avoid infinite retries on dead
 * endpoints (e.g. ~10 attempts ≈ 12 minutes); the user can manually retry via the
 * notification action.
 */
export const RECONNECTION_CONFIG = {
  /**
   * Maximum number of reconnection attempts before stopping and showing a permanent
   * error. Prevents infinite retries on dead endpoints (CPU wake-ups, battery drain).
   * ~10 attempts ≈ 12 minutes at phase 3 (90s interval). User can retry manually.
   */
  MAX_RETRY_ATTEMPTS: 20,
  /**
   * Number of failed reconnection attempts before showing user notifications.
   * Prevents notification spam during brief network interruptions.
   */
  NOTIFICATION_THRESHOLD: 10,
  /**
   * Initial delay (in ms) when server closes with 1013 Try Again Later.
   * The server explicitly asks to wait before reconnecting.
   */
  TRY_AGAIN_LATER_DELAY_MS: 30000,
  /**
   * Delay durations (in milliseconds) for each reconnection phase.
   */
  DELAYS: {
    /** First phase delay: 4 seconds for the first 5 attempts */
    FIRST_PHASE: 4000,
    /** Second phase delay: 30 seconds for attempts 6-10 */
    SECOND_PHASE: 30000,
    /** Third phase delay: 90 seconds for attempts 11+ */
    THIRD_PHASE: 90000
  },
  /**
   * Threshold values that determine when to transition between reconnection phases.
   */
  PHASE_THRESHOLDS: {
    /** Maximum attempts in the first phase (0-4) */
    FIRST: 5,
    /** Maximum attempts in the second phase (5-9) */
    SECOND: 10
  }
} as const;

/**
 * Delay configuration for WebSocket connection cleanup.
 *
 * When all URI APIs are removed, the connection is closed after a delay to allow
 * for efficient resource cleanup while avoiding unnecessary reconnections for
 * quick re-registrations. Different delays are used for production vs test environments.
 */
// export const CONNECTION_CLEANUP_DELAY = {
//   /** Production delay: 3 seconds to allow for quick re-registrations */
//   PRODUCTION_MS: 3000,
//   /** Test delay: 10ms for faster test execution */
//   TEST_MS: 10
// } as const;
export const CONNECTION_CLEANUP_DELAY_MS = 3000;

/**
 * Delay in milliseconds before reconnecting after teardown.
 *
 * Used in {@link WebsocketConnection.teardownAndReconnect} to allow cleanup
 * to complete before establishing a new connection.
 */
export const TEARDOWN_RECONNECT_DELAY_MS = 1000;

/**
 * Delay in milliseconds before removing a WebSocket URI API initiator.
 *
 * When an initiator (component/hook) is removed, there's a short delay before
 * unsubscribing and cleaning up. This prevents rapid subscribe/unsubscribe cycles
 * that could occur during React component re-renders or fast user interactions.
 */
export const INITIATOR_REMOVAL_DELAY_MS = 1000;

/**
 * Configuration for WebSocket heartbeat (ping/pong) mechanism.
 *
 * After sending a ping, we expect a pong within PONG_TIMEOUT_MS. If no pong arrives,
 * the connection is considered dead and we force-close to trigger reconnection.
 */
export const HEARTBEAT_CONFIG = {
  /** Time in ms to wait for a pong before considering the connection dead. Default: 10 seconds */
  PONG_TIMEOUT_MS: 10000
} as const;

/**
 * Default options for WebSocket URI APIs.
 *
 * These defaults are used when creating a new URI API instance if options
 * are not explicitly provided. Subscriptions automatically subscribe when
 * the WebSocket connection opens.
 *
 * @see {@link WebsocketUriOptions} - The type definition for URI options
 * @see {@link WebsocketSubscriptionApi} - The class that uses these defaults
 */
export const DEFAULT_URI_OPTIONS: {
  enabled: boolean;
} = {
  enabled: true
};

/**
 * Default timeout in milliseconds when waiting for a WebSocket message response.
 *
 * Used by {@link WebsocketMessageApi} when no explicit timeout is provided.
 */
export const DEFAULT_MESSAGE_RESPONSE_TIMEOUT_MS = 10000;


/**
 * Default heartbeat configuration for WebSocket connections.
 *
 * Enables ping/pong with the default timeout from {@link HEARTBEAT_CONFIG}.
 */
export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  enabled: true,
  pongTimeoutMs: HEARTBEAT_CONFIG.PONG_TIMEOUT_MS
};