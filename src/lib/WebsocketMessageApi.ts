/**
 * @fileoverview WebSocket Message API for request/response style messaging.
 *
 * Send to any URI; optionally await a response. No subscription support.
 * Used by {@link useWebsocketMessage}. See {@link WebsocketSubscriptionApi} for
 * streaming subscriptions.
 *
 * @module WebsocketMessageApi
 */

import { WebsocketClient } from './WebsocketClient';
import { INITIATOR_REMOVAL_DELAY_MS } from './constants';
import {
  SendMessage,
  SendMessageOptions,
  SendToConnectionFn,
  WebsocketListener,
  WebsocketMessageOptions,
  WebsocketServerError,
  WebsocketTransportError
} from './types';

interface PendingRequest<TData = unknown> {
  resolve: (value: TData) => void;
  reject: (reason: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * Manages WebSocket request/response messaging without subscription.
 *
 * Use for one-off commands (validate, modify, mark read) rather than streaming.
 * Send to any URI; optionally await a response. Tracks URIs only while waiting.
 *
 * ## Key Features
 *
 * - **Any URI**: Not bound to a single URI like {@link WebsocketSubscriptionApi}
 * - **Request/Response**: `sendMessage` returns a Promise; optional per-call timeout
 * - **Fire-and-forget**: `sendMessageNoWait` for commands that don't need a response
 * - **No Subscription**: Use WebsocketSubscriptionApi for streaming data
 *
 * ## Edge Cases
 *
 * - **Overwrite**: Sending to the same URI while a request is pending cancels the previous
 *   request — the previous Promise rejects with "WebSocket request overwritten for URI".
 * - **Disabled**: When `enabled=false`, `sendMessage` rejects; `sendMessageNoWait` is a no-op.
 * - **Connection closed**: All pending requests reject with "WebSocket connection closed".
 * - **Queued messages**: If the connection is not yet open, messages are queued and sent
 *   when the connection opens (via `setSendToConnection`).
 *
 * ## Cleanup
 *
 * {@link reset} is called by WebsocketConnection when the URL changes or during reconnection.
 * When the last hook unmounts, {@link unregisterHook} triggers removal after
 * {@link INITIATOR_REMOVAL_DELAY_MS}.
 *
 * @template TData - The type of data received in the response
 * @template TBody - The type of message body sent to the WebSocket
 *
 * @example
 * ```typescript
 * const api = new WebsocketMessageApi<MyResponse, MyRequest>({
 *   url: 'wss://example.com',
 *   key: 'my-message-api',
 *   responseTimeoutMs: 5000
 * });
 * connection.addListener(api);
 *
 * const response = await api.sendMessage('/api/command', 'post', { action: 'refresh' });
 * ```
 */
export class WebsocketMessageApi implements WebsocketListener {
  private _options: WebsocketMessageOptions;
  private _sendToConnection: SendToConnectionFn | null = null;
  private _pendingByUri: Map<string, PendingRequest> = new Map();
  private _pendingMessages: SendMessage<string, string, unknown>[] = [];
  private _registeredHooks: Set<string> = new Set();
  private _hookRemovalTimeout: ReturnType<typeof setTimeout> | undefined;
  private _client: WebsocketClient;
  public readonly type = 'message';

  /**
   * Creates a new WebsocketMessageApi.
   *
   * @param options - Configuration options (url, key, callbacks, etc.)
   * @param client - The {@link WebsocketClient} for timeout defaults and connection management
   */
  constructor(options: WebsocketMessageOptions, client: WebsocketClient) {
    this._client = client;
    const defaultTimeout = client.messageResponseTimeoutMs;
    this._options = {
      enabled: true,
      responseTimeoutMs: defaultTimeout,
      ...options
    };
  }

  /** Unique key identifier for this Message API. */
  public get key(): string {
    return this._options.key;
  }

  /** WebSocket URL for Datadog tracking. */
  public get url(): string {
    return this._options.url;
  }

  /** Whether this Message API is enabled. */
  public get isEnabled(): boolean {
    return this._options.enabled ?? true;
  }

  /**
   * Returns whether this API is waiting for a response for the given URI.
   *
   * Used by {@link WebsocketConnection} to route incoming messages to the correct
   * listener. Message API receives messages only for URIs with pending requests.
   *
   * @param uri - The URI to check
   * @returns `true` if a request is pending for this URI
   */
  public hasWaitingUri = (uri: string): boolean => {
    return this._pendingByUri.has(uri);
  };

  /**
   * Registers a hook (component) that is using this Message API.
   *
   * Tracks the hook ID so the API is only removed from the connection when
   * the last hook unmounts.
   *
   * @param id - Unique identifier for the registering hook
   */
  public registerHook = (id: string): void => {
    this._clearHookRemovalTimeout();
    this._registeredHooks.add(id);
  };

  /**
   * Unregisters a hook from this Message API.
   *
   * After {@link INITIATOR_REMOVAL_DELAY_MS}, if no hooks remain, invokes the
   * cleanup callback to remove this API from the connection. The delay prevents
   * rapid subscribe/unsubscribe cycles during React re-renders.
   *
   * @param id - The hook ID to unregister
   * @param onRemove - Callback invoked when the last hook is removed (after delay)
   */
  public unregisterHook = (id: string, onRemove: () => void): void => {
    this._registeredHooks.delete(id);
    this._scheduleHookRemoval(onRemove);
  };

  /**
   * Disconnects this Message API from the parent WebSocket connection.
   *
   * Called when the hook is disabled. After a delay, invokes the cleanup callback.
   * Clears any pending hook-removal timeout to avoid duplicate cleanup.
   *
   * @param onRemoveFromSocket - Callback invoked after delay to remove from connection
   */
  public disconnect = (onRemoveFromSocket: () => void): void => {
    this._clearHookRemovalTimeout();
    this._hookRemovalTimeout = setTimeout(() => {
      this._hookRemovalTimeout = undefined;
      onRemoveFromSocket();
    }, INITIATOR_REMOVAL_DELAY_MS);
  };

  /**
   * Sets or clears the callback used to send messages through the parent WebSocket connection.
   *
   * When setting a callback, flushes any queued messages. When clearing, cancels all
   * pending requests and clears the hook removal timeout to avoid redundant cleanup.
   *
   * @param callback - The send function, or null to disconnect
   */
  public setSendToConnection = (callback: SendToConnectionFn | null): void => {
    this._sendToConnection = callback;

    if (callback) {
      this._flushPendingMessages(callback);
    } else {
      this._clearHookRemovalTimeout();
      this._pendingMessages = [];
      this._cancelAllPending();
    }
  };

  /**
   * Delivers an incoming message for a URI we're waiting on.
   *
   * Called by WebsocketConnection when a message arrives for a URI with a pending request.
   *
   * @param uri - The URI the response is for
   * @param data - The response data
   */
  public deliverMessage = (uri: string, data: unknown): void => {
    const pending = this._pendingByUri.get(uri);
    if (!pending) return;

    clearTimeout(pending.timeoutId);
    this._pendingByUri.delete(uri);
    pending.resolve(data);
  };

  /**
   * Sends a message to the given URI and optionally waits for a response.
   *
   * **Overwrite behavior**: If a request is already pending for this URI, it is
   * cancelled (rejected with "WebSocket request overwritten for URI") and replaced.
   *
   * @param uri - The URI to send the message to
   * @param bodyOrMethod - Message body (short form) or HTTP method (full form)
   * @param bodyOrOptions - Message body or options (full form)
   * @param options - Per-call options when using full signature
   * @returns Promise that resolves with the response data; rejects on timeout, overwrite, or disabled
   *
   * @example
   * await api.sendMessage('/api/command', 'post', { action: 'refresh' });
   * await api.sendMessage('/api/command', 'post', { action: 'refresh' }, { timeout: 5000 });
   */
  public sendMessage<TData = unknown, TBody = unknown>(
    uri: string,
    method: string,
    body?: TBody,
    options?: SendMessageOptions
  ): Promise<TData> {
    if (!this.isEnabled) {
      return Promise.reject(new Error('WebsocketMessageApi is disabled'));
    }

    this._cancelPendingForUri(uri);

    const timeoutMs = options?.timeout ?? this._options.responseTimeoutMs ?? this._client.messageResponseTimeoutMs;

    return new Promise<TData>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this._pendingByUri.get(uri)?.timeoutId === timeoutId) {
          this._pendingByUri.delete(uri);
          reject(new Error(`WebSocket response timeout for URI: ${uri}`));
        }
      }, timeoutMs);

      this._pendingByUri.set(uri, {
        resolve: (v: unknown) => resolve(v as TData),
        reject,
        timeoutId
      });

      const message: SendMessage<string, string, TBody> = { uri, method, body };
      this._sendOrQueue<TBody>(message);
    });
  }

  /**
   * Sends a message without waiting for a response (fire-and-forget).
   *
   * @param uri - The URI to send the message to
   * @param methodOrBody - HTTP method (full form) or message body (short form)
   * @param body - Message body when using full form
   *
   * @example
   * api.sendMessageNoWait('/api/log', 'post', { event: 'click' });
   */
  public sendMessageNoWait<TBody = unknown>(uri: string, method: string, body?: TBody): void {
    if (!this.isEnabled) return;

    const message: SendMessage<string, string, TBody> = { uri, method, body };
    this._sendOrQueue<TBody>(message);
  }

  /** @inheritdoc */
  public onError = (error: WebsocketTransportError): void => {
    this._options.onError?.(error);
  };

  /** @inheritdoc */
  public onMessageError = (error: WebsocketServerError): void => {
    this._options.onMessageError?.(error);
  };

  /** @inheritdoc */
  public onClose = (event: CloseEvent): void => {
    this._cancelAllPending();
    this._options.onClose?.(event);
  };

  /**
   * Resets this Message API, cancelling all pending requests.
   *
   * Called by WebsocketConnection when the URL changes or during reconnection.
   * Clears the hook removal timeout to prevent stale cleanup callbacks.
   */
  public reset = (): void => {
    this._clearHookRemovalTimeout();
    this._cancelAllPending();
  };

  private _clearHookRemovalTimeout(): void {
    if (this._hookRemovalTimeout !== undefined) {
      clearTimeout(this._hookRemovalTimeout);
      this._hookRemovalTimeout = undefined;
    }
  }

  private _scheduleHookRemoval(onRemove: () => void): void {
    this._clearHookRemovalTimeout();
    this._hookRemovalTimeout = setTimeout(() => {
      this._hookRemovalTimeout = undefined;
      if (this._registeredHooks.size === 0) {
        onRemove();
      }
    }, INITIATOR_REMOVAL_DELAY_MS);
  }

  private _flushPendingMessages(callback: SendToConnectionFn): void {
    if (this._pendingMessages.length === 0) return;
    this._pendingMessages.forEach((msg) => callback(msg));
    this._pendingMessages = [];
  }

  private _sendOrQueue<TBody = unknown>(message: SendMessage<string, string, TBody>): void {
    if (this._sendToConnection) {
      this._sendToConnection(message);
    } else {
      this._pendingMessages.push(message);
    }
  }

  private _cancelPendingForUri(uri: string): void {
    const pending = this._pendingByUri.get(uri);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this._pendingByUri.delete(uri);
      pending.reject(new Error(`WebSocket request overwritten for URI: ${uri}`));
    }
  }

  private _cancelAllPending(): void {
    this._pendingByUri.forEach((pending) => {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('WebSocket connection closed'));
    });
    this._pendingByUri.clear();
  }
}
