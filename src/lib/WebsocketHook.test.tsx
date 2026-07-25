import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { WebsocketClient } from './WebsocketClient';
import { WebsocketClientProvider } from './WebsocketProvider';
import { useWebsocketMessage } from './WebsocketHook';

describe('useWebsocketMessage', () => {
  let client: WebsocketClient;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new WebsocketClient({});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(WebsocketClientProvider, { client }, children);

  it('propagates responseTimeoutMs change to the api after re-render', async () => {
    const { rerender } = renderHook(
      ({ timeout }: { timeout: number }) =>
        useWebsocketMessage({ url: 'wss://localhost', key: 'msg-timeout-key', responseTimeoutMs: timeout }),
      { wrapper, initialProps: { timeout: 10000 } }
    );

    const api = client.getListener('msg-timeout-key', 'message')!;
    expect(api).toBeDefined();

    rerender({ timeout: 100 });

    const mockSend = vi.fn();
    api.setSendToConnection(mockSend);
    const promise = api.sendMessage('/test', 'post');
    vi.advanceTimersByTime(100);
    await expect(promise).rejects.toThrow('WebSocket response timeout');
  });

  it('propagates enabled=false to the api after re-render', () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useWebsocketMessage({ url: 'wss://localhost', key: 'msg-enabled-key', enabled }),
      { wrapper, initialProps: { enabled: true } }
    );

    const api = client.getListener('msg-enabled-key', 'message')!;
    expect(api.isEnabled).toBe(true);

    rerender({ enabled: false });

    expect(api.isEnabled).toBe(false);
  });
});
