import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebsocketClient } from './WebsocketClient';
import {
  exposeWebsocketClientDevTools,
  WEBSOCKET_CLIENT_DEV_GLOBAL_KEY,
} from './websocketClientDevTools';

describe('websocketClientDevTools', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window: typeof originalWindow }).window = originalWindow;
    }
  });

  it('should mount a narrow dev API on window', () => {
    const client = new WebsocketClient({ messageResponseTimeoutMs: 10_000 });
    Object.defineProperty(globalThis, 'window', {
      value: {},
      configurable: true,
      writable: true,
    });

    exposeWebsocketClientDevTools(client);

    const devTools = (window as Window & Record<string, unknown>)[
      WEBSOCKET_CLIENT_DEV_GLOBAL_KEY
    ] as {
      getMessageResponseTimeoutMs: () => number;
      setMessageResponseTimeoutMs: (ms: number) => void;
    };

    expect(devTools).toBeDefined();
    expect(devTools.getMessageResponseTimeoutMs()).toBe(10_000);

    devTools.setMessageResponseTimeoutMs(3000);

    expect(client.messageResponseTimeoutMs).toBe(3000);
    expect(devTools.getMessageResponseTimeoutMs()).toBe(3000);
  });

  it('should not expose the raw WebsocketClient instance on window', () => {
    const client = new WebsocketClient({});
    Object.defineProperty(globalThis, 'window', {
      value: {},
      configurable: true,
      writable: true,
    });

    exposeWebsocketClientDevTools(client);

    expect(window).not.toHaveProperty('websocketClient');
    expect((window as Window & Record<string, unknown>)[WEBSOCKET_CLIENT_DEV_GLOBAL_KEY]).not.toBe(
      client
    );
  });

  it('should no-op when window is undefined', () => {
    delete (globalThis as { window?: unknown }).window;

    expect(() => exposeWebsocketClientDevTools(new WebsocketClient({}))).not.toThrow();
  });
});
