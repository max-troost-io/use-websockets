/**
 * @fileoverview Helper functions for WebSocket connection and listener management.
 *
 * These functions implement the singleton patterns for connections (per URL key)
 * and listeners (per API key) via {@link WebsocketClient}. Used by the React hooks
 * in {@link WebsocketHook}.
 *
 * @module websocketClient.helpers
 */

import { WebsocketListener, WebsocketMessageOptions, WebsocketSubscriptionOptions } from './types';
import { WebsocketClient } from './WebsocketClient';
import { WebsocketMessageApi } from './WebsocketMessageApi';
import { WebsocketSubscriptionApi } from './WebsocketSubscriptionApi';

/**
 * Creates a WebSocket subscription API or returns the existing one for the given key.
 *
 * Singleton per key: multiple components with the same key share one instance.
 * The instance is stored in {@link WebsocketClient} and registered with a connection
 * via {@link WebsocketConnection.addListener}.
 *
 * @param client - The {@link WebsocketClient} instance
 * @template TData - The type of data received from the WebSocket
 * @template TBody - The type of message body sent to the WebSocket
 * @param key - Unique key for this subscription API
 * @param options - Configuration options
 * @returns Existing or newly created {@link WebsocketSubscriptionApi}
 *
 * @see {@link WebsocketClient.getListener} - Check for existing instance
 */
export const createWebsocketSubscriptionApi = <TData = unknown, TBody = unknown>(
  client: WebsocketClient,
  key: string,
  options: WebsocketSubscriptionOptions<TData, any>
): WebsocketSubscriptionApi<TData, any> => {
  const listener = client.getListener<TData, TBody>(key, 'subscription');
  if (listener) {
    return listener;
  }
  const uriApi = new WebsocketSubscriptionApi(options, client);
  client.addListener(uriApi);
  return uriApi;
};

/**
 * Creates a WebSocket Message API or returns the existing one for the given key.
 *
 * Singleton per key: multiple components with the same key share one instance.
 *
 * @param client - The {@link WebsocketClient} instance
 * @param key - Unique key for this Message API
 * @param options - Configuration options
 * @returns Existing or newly created {@link WebsocketMessageApi}
 */
export const createWebsocketMessageApi = (client: WebsocketClient, key: string, options: WebsocketMessageOptions): WebsocketMessageApi => {
  const listener = client.getListener(key, 'message');
  if (listener) {
    return listener;
  }
  const messageApi = new WebsocketMessageApi(options, client);
  client.addListener(messageApi);
  return messageApi;
};

/**
 * Removes a WebSocket listener from its connection and from the client.
 *
 * Calls {@link WebsocketConnection.removeListener} and removes the listener from
 * {@link WebsocketClient}. Call when the last hook unmounts or when the listener
 * is disabled (via `enabled=false`).
 *
 * @param client - The {@link WebsocketClient} instance
 * @param listener - The listener (subscription or message API) to remove
 */
export const removeWebsocketListenerFromConnection = (client: WebsocketClient, listener: WebsocketListener): void => {
  const connection = client.getConnection(listener.url);
  connection?.removeListener(listener);
  client.removeListener(listener);
};
