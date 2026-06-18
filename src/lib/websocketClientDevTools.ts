/**
 * @fileoverview Dev-only helpers for tweaking WebSocket client settings from the browser console.
 *
 * @module websocketClientDevTools
 */

import { WebsocketClient } from "./WebsocketClient";

/** Narrow dev-console API exposed on `window.__websocketClientDev`. */
export interface WebsocketClientDevTools {
  getMessageResponseTimeoutMs(): number;
  setMessageResponseTimeoutMs(ms: number): void;
}

/** Global key used when mounting {@link WebsocketClientDevTools} on `window`. */
export const WEBSOCKET_CLIENT_DEV_GLOBAL_KEY = "__websocketClientDev";

/**
 * Mounts a narrow dev-console API on `window` for the given client.
 *
 * Does not expose the full {@link WebsocketClient} instance. Call from the
 * consumer's dedicated client file behind a dev guard, e.g. `import.meta.env.DEV`.
 */
export function exposeWebsocketClientDevTools(client: WebsocketClient): void {
  if (typeof window === "undefined") return;

  const tools: WebsocketClientDevTools = {
    getMessageResponseTimeoutMs: () => client.messageResponseTimeoutMs,
    setMessageResponseTimeoutMs: (ms) => client.setMessageResponseTimeoutMs(ms),
  };

  (
    window as Window & {
      [WEBSOCKET_CLIENT_DEV_GLOBAL_KEY]?: WebsocketClientDevTools;
    }
  )[WEBSOCKET_CLIENT_DEV_GLOBAL_KEY] = tools;
}
