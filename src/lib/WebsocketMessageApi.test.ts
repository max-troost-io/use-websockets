import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebsocketMessageApi } from './WebsocketMessageApi';
import { SendToConnectionFn, WebsocketMessageOptions } from './types';
import { DEFAULT_MESSAGE_RESPONSE_TIMEOUT_MS, INITIATOR_REMOVAL_DELAY_MS } from './constants';

const createMockClient = (overrides?: { messageResponseTimeoutMs?: number }) => ({
  messageResponseTimeoutMs: overrides?.messageResponseTimeoutMs ?? DEFAULT_MESSAGE_RESPONSE_TIMEOUT_MS
});

describe('WebsocketMessageApi', () => {
  const mockUrl = 'wss://test.example.com';
  const mockKey = 'message-api-key';

  let mockSendToConnection: ReturnType<typeof vi.fn<SendToConnectionFn>>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockSendToConnection = vi.fn<SendToConnectionFn>();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create a WebsocketMessageApi instance with provided options', () => {
      const options: WebsocketMessageOptions = {
        url: mockUrl,
        key: mockKey
      };

      const api = new WebsocketMessageApi(options, createMockClient());

      expect(api.key).toBe(mockKey);
      expect(api.url).toBe(mockUrl);
      expect(api.isEnabled).toBe(true);
    });

    it('should merge provided options with defaults', () => {
      const api = new WebsocketMessageApi(
        {
          url: mockUrl,
          key: mockKey
        },
        createMockClient()
      );

      expect(api.isEnabled).toBe(true);
    });

    it('should respect custom responseTimeoutMs', () => {
      const api = new WebsocketMessageApi(
        {
          url: mockUrl,
          key: mockKey,
          responseTimeoutMs: 5000
        },
        createMockClient()
      );

      api.setSendToConnection(mockSendToConnection);
      const promise = api.sendMessage('/api/test', 'post', { foo: 'bar' });

      vi.advanceTimersByTime(5000);

      return expect(promise).rejects.toThrow('WebSocket response timeout');
    });
  });

  describe('sendMessage', () => {
    it('should send message with uri and body through connection', async () => {
      const api = new WebsocketMessageApi({ url: mockUrl, key: mockKey }, createMockClient());
      api.setSendToConnection(mockSendToConnection);

      const promise = api.sendMessage<{ result: string }, { action: string }>('/api/command', 'post', { action: 'refresh' });

      expect(mockSendToConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: '/api/command',
          method: 'post',
          body: { action: 'refresh' }
        })
      );

      api.deliverMessage('/api/command', { result: 'ok' });
      await expect(promise).resolves.toEqual({ result: 'ok' });
    });

    it('should support any URI string', async () => {
      const api = new WebsocketMessageApi({ url: mockUrl, key: mockKey }, createMockClient());
      api.setSendToConnection(mockSendToConnection);

      const uri1 = '/api/v1/users/123';
      const uri2 = '/custom/path/with/slashes';
      const uri3 = 'relative-path';

      api.sendMessage(uri1, 'post');
      expect(mockSendToConnection).toHaveBeenCalledWith(
        expect.objectContaining({ uri: uri1 })
      );

      api.deliverMessage(uri1, { done: true });
      mockSendToConnection.mockClear();

      api.sendMessage(uri2, 'post', { id: 1 });
      expect(mockSendToConnection).toHaveBeenCalledWith(
        expect.objectContaining({ uri: uri2, body: { id: 1 } })
      );

      api.deliverMessage(uri2, {});
      mockSendToConnection.mockClear();

      api.sendMessage(uri3, 'post');
      expect(mockSendToConnection).toHaveBeenCalledWith(
        expect.objectContaining({ uri: uri3 })
      );
    });

    it('should overwrite and cancel previous request when sending to same URI', async () => {
      const api = new WebsocketMessageApi({ url: mockUrl, key: mockKey }, createMockClient());
      api.setSendToConnection(mockSendToConnection);

      const promise1 = api.sendMessage('/api/test', 'post');
      const promise2 = api.sendMessage('/api/test', 'post', { overwrite: true });

      await expect(promise1).rejects.toThrow('WebSocket request overwritten');
      api.deliverMessage('/api/test', { second: true });
      await expect(promise2).resolves.toEqual({ second: true });
    });

    it('should reject on timeout when no response received', async () => {
      const api = new WebsocketMessageApi({ url: mockUrl, key: mockKey }, createMockClient());
      api.setSendToConnection(mockSendToConnection);

      const promise = api.sendMessage('/api/test', 'post');

      vi.advanceTimersByTime(DEFAULT_MESSAGE_RESPONSE_TIMEOUT_MS);

      await expect(promise).rejects.toThrow('WebSocket response timeout');
    });

    it('should allow per-call timeout override', async () => {
      const api = new WebsocketMessageApi(
        {
          url: mockUrl,
          key: mockKey,
          responseTimeoutMs: 10000
        },
        createMockClient()
      );
      api.setSendToConnection(mockSendToConnection);

      const promise = api.sendMessage('/api/test', 'post', undefined, { timeout: 1000 });

      vi.advanceTimersByTime(1000);

      await expect(promise).rejects.toThrow('WebSocket response timeout');
    });

    it('should queue messages when connection not yet set', async () => {
      const api = new WebsocketMessageApi({ url: mockUrl, key: mockKey }, createMockClient());

      const promise = api.sendMessage('/api/test', 'post', { queued: true });
      expect(mockSendToConnection).not.toHaveBeenCalled();

      api.setSendToConnection(mockSendToConnection);
      expect(mockSendToConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: '/api/test',
          method: 'post',
          body: { queued: true }
        })
      );

      api.deliverMessage('/api/test', { received: true });
      await expect(promise).resolves.toEqual({ received: true });
    });

    it('should reject when disabled', async () => {
      const api = new WebsocketMessageApi(
        {
          url: mockUrl,
          key: mockKey,
          enabled: false
        },
        createMockClient()
      );
      api.setSendToConnection(mockSendToConnection);

      const promise = api.sendMessage('/api/test', 'post');

      await expect(promise).rejects.toThrow('WebsocketMessageApi is disabled');
      expect(mockSendToConnection).not.toHaveBeenCalled();
    });
  });

  describe('sendMessageNoWait', () => {
    it('should send message without waiting for response', () => {
      const api = new WebsocketMessageApi({ url: mockUrl, key: mockKey }, createMockClient());
      api.setSendToConnection(mockSendToConnection);

      api.sendMessageNoWait('/api/fire-and-forget', 'post', { event: 'log' });

      expect(mockSendToConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: '/api/fire-and-forget',
          method: 'post',
          body: { event: 'log' }
        })
      );
    });

    it('should not send when disabled', () => {
      const api = new WebsocketMessageApi(
        {
          url: mockUrl,
          key: mockKey,
          enabled: false
        },
        createMockClient()
      );
      api.setSendToConnection(mockSendToConnection);

      api.sendMessageNoWait('/api/test', 'post');

      expect(mockSendToConnection).not.toHaveBeenCalled();
    });
  });

  describe('hasWaitingUri', () => {
    it('should return true for URI with pending request', () => {
      const api = new WebsocketMessageApi({ url: mockUrl, key: mockKey }, createMockClient());
      api.setSendToConnection(mockSendToConnection);

      api.sendMessage('/api/waiting', 'post');
      expect(api.hasWaitingUri('/api/waiting')).toBe(true);
      expect(api.hasWaitingUri('/api/other')).toBe(false);
    });

    it('should return false after response delivered', () => {
      const api = new WebsocketMessageApi({ url: mockUrl, key: mockKey }, createMockClient());
      api.setSendToConnection(mockSendToConnection);

      api.sendMessage('/api/waiting', 'post');
      api.deliverMessage('/api/waiting', {});
      expect(api.hasWaitingUri('/api/waiting')).toBe(false);
    });
  });

  describe('reset', () => {
    it('should cancel all pending requests', async () => {
      const api = new WebsocketMessageApi({ url: mockUrl, key: mockKey }, createMockClient());
      api.setSendToConnection(mockSendToConnection);

      const promise = api.sendMessage('/api/test', 'post');
      api.reset();

      await expect(promise).rejects.toThrow('WebSocket connection closed');
    });
  });

  describe('onMessageError', () => {
    it('should call onMessageError callback when provided', () => {
      const onMessageErrorSpy = vi.fn();
      const api = new WebsocketMessageApi(
        {
          url: mockUrl,
          key: mockKey,
          onMessageError: onMessageErrorSpy
        },
        createMockClient()
      );

      const serverError = {
        type: 'server' as const,
        message: { uri: '/api/test', method: 'error', body: { code: 'CONFLICT' } }
      };
      api.onMessageError(serverError);

      expect(onMessageErrorSpy).toHaveBeenCalledWith(serverError);
    });
  });

  describe('onClose', () => {
    it('should cancel pending and call onClose callback', async () => {
      const onClose = vi.fn();
      const api = new WebsocketMessageApi(
        {
          url: mockUrl,
          key: mockKey,
          onClose
        },
        createMockClient()
      );
      api.setSendToConnection(mockSendToConnection);

      const promise = api.sendMessage('/api/test', 'post');
      api.onClose(new CloseEvent('close'));

      await expect(promise).rejects.toThrow('WebSocket connection closed');
      expect(onClose).toHaveBeenCalledWith(expect.any(CloseEvent));
    });
  });

  describe('registerHook and unregisterHook', () => {
    it('should call onRemove when last hook is removed', () => {
      const api = new WebsocketMessageApi({ url: mockUrl, key: mockKey }, createMockClient());
      const onRemove = vi.fn();

      api.registerHook('hook-1');
      api.unregisterHook('hook-1', onRemove);

      expect(onRemove).not.toHaveBeenCalled();
      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS);
      expect(onRemove).toHaveBeenCalled();
    });

    it('should not call onRemove when other hooks remain', () => {
      const api = new WebsocketMessageApi({ url: mockUrl, key: mockKey }, createMockClient());
      const onRemove = vi.fn();

      api.registerHook('hook-1');
      api.registerHook('hook-2');
      api.unregisterHook('hook-1', onRemove);

      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS);
      expect(onRemove).not.toHaveBeenCalled();
    });
  });

  describe('setSendToConnection', () => {
    it('should cancel pending requests when connection is cleared', async () => {
      const api = new WebsocketMessageApi({ url: mockUrl, key: mockKey }, createMockClient());
      api.setSendToConnection(mockSendToConnection);

      const promise = api.sendMessage('/api/test', 'post');
      api.setSendToConnection(null);

      await expect(promise).rejects.toThrow('WebSocket connection closed');
    });
  });

  describe('disconnect', () => {
    it('should call onRemoveFromSocket after delay', () => {
      const api = new WebsocketMessageApi({ url: mockUrl, key: mockKey }, createMockClient());
      const onRemoveFromSocket = vi.fn();

      api.disconnect(onRemoveFromSocket);

      expect(onRemoveFromSocket).not.toHaveBeenCalled();
      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS);
      expect(onRemoveFromSocket).toHaveBeenCalled();
    });
  });
});
