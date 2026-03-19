import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebsocketClient } from './WebsocketClient';
import { WebsocketMessageApi } from './WebsocketMessageApi';
import { WebsocketSubscriptionApi } from './WebsocketSubscriptionApi';
import {
  CONNECTION_CLEANUP_DELAY_MS,
  DEFAULT_MESSAGE_RESPONSE_TIMEOUT_MS,
  RECONNECTION_CONFIG
} from './constants';
import { WebsocketMessageOptions, WebsocketSubscriptionOptions } from './types';

describe('WebsocketClient', () => {
  const mockUrl = 'wss://test.example.com';
  const mockKey = 'test-key';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use default values when no overrides provided', () => {
      const client = new WebsocketClient({});

      expect(client.maxRetryAttempts).toBe(RECONNECTION_CONFIG.MAX_RETRY_ATTEMPTS);
      expect(client.notificationThreshold).toBe(RECONNECTION_CONFIG.NOTIFICATION_THRESHOLD);
      expect(client.tryAgainLaterDelayMs).toBe(RECONNECTION_CONFIG.TRY_AGAIN_LATER_DELAY_MS);
      expect(client.delays.firstPhase).toBe(RECONNECTION_CONFIG.DELAYS.FIRST_PHASE);
      expect(client.delays.secondPhase).toBe(RECONNECTION_CONFIG.DELAYS.SECOND_PHASE);
      expect(client.delays.thirdPhase).toBe(RECONNECTION_CONFIG.DELAYS.THIRD_PHASE);
      expect(client.phaseThresholds.first).toBe(RECONNECTION_CONFIG.PHASE_THRESHOLDS.FIRST);
      expect(client.phaseThresholds.second).toBe(RECONNECTION_CONFIG.PHASE_THRESHOLDS.SECOND);
      expect(client.connectionCleanupDelayMs).toBe(CONNECTION_CLEANUP_DELAY_MS);
      expect(client.messageResponseTimeoutMs).toBe(DEFAULT_MESSAGE_RESPONSE_TIMEOUT_MS);
      expect(client.heartbeat.enabled).toBe(true);
      expect(client.heartbeat.pongTimeoutMs).toBe(10000);
    });

    it('should merge provided overrides with defaults', () => {
      const client = new WebsocketClient({
        maxRetryAttempts: 5,
        notificationThreshold: 3,
        connectionCleanupDelayMs: 1000,
        messageResponseTimeoutMs: 5000,
        heartbeat: { enabled: false }
      });

      expect(client.maxRetryAttempts).toBe(5);
      expect(client.notificationThreshold).toBe(3);
      expect(client.connectionCleanupDelayMs).toBe(1000);
      expect(client.messageResponseTimeoutMs).toBe(5000);
      expect(client.heartbeat.enabled).toBe(false);
      expect(client.delays.firstPhase).toBe(RECONNECTION_CONFIG.DELAYS.FIRST_PHASE);
    });

    it('should support partial delay and phaseThreshold overrides', () => {
      const client = new WebsocketClient({
        delays: { firstPhase: 2000 },
        phaseThresholds: { second: 15 }
      });

      expect(client.delays.firstPhase).toBe(2000);
      expect(client.delays.secondPhase).toBe(RECONNECTION_CONFIG.DELAYS.SECOND_PHASE);
      expect(client.phaseThresholds.first).toBe(RECONNECTION_CONFIG.PHASE_THRESHOLDS.FIRST);
      expect(client.phaseThresholds.second).toBe(15);
    });
  });

  describe('addListener and removeListener', () => {
    it('should add and remove listeners', () => {
      const client = new WebsocketClient({});
      const subscription = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: '/api/test',
        key: mockKey
      });

      client.addListener(subscription);
      expect(client.getListener(mockKey, 'subscription')).toBe(subscription);

      client.removeListener(subscription);
      expect(client.getListener(mockKey, 'subscription')).toBeUndefined();
    });
  });

  describe('getListener', () => {
    it('should return subscription listener by key and type', () => {
      const client = new WebsocketClient({});
      const subscription = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: '/api/test',
        key: mockKey
      });
      client.addListener(subscription);

      expect(client.getListener(mockKey, 'subscription')).toBe(subscription);
      expect(client.getListener(mockKey, 'message')).toBeUndefined();
    });

    it('should return message listener by key and type', () => {
      const client = new WebsocketClient({});
      const messageApi = new WebsocketMessageApi(
        { url: mockUrl, key: mockKey },
        client
      );
      client.addListener(messageApi);

      expect(client.getListener(mockKey, 'message')).toBe(messageApi);
      expect(client.getListener(mockKey, 'subscription')).toBeUndefined();
    });

    it('should return undefined for unknown key', () => {
      const client = new WebsocketClient({});

      expect(client.getListener('unknown-key', 'subscription')).toBeUndefined();
      expect(client.getListener('unknown-key', 'message')).toBeUndefined();
    });

    it('should return undefined when type does not match', () => {
      const client = new WebsocketClient({});
      const subscription = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: '/api/test',
        key: mockKey
      });
      client.addListener(subscription);

      expect(client.getListener(mockKey, 'message')).toBeUndefined();
    });
  });

  describe('addConnection and getConnection', () => {
    it('should add connection and return it via getConnection', () => {
      const client = new WebsocketClient({});

      const connection = client.addConnection(mockUrl, mockUrl);

      expect(connection).toBeDefined();
      expect(connection.url).toBe(mockUrl);
      expect(client.getConnection(mockUrl)).toBe(connection);
    });

    it('should return existing connection when adding with same key', () => {
      const client = new WebsocketClient({});

      const connection1 = client.addConnection(mockUrl, mockUrl);
      const connection2 = client.addConnection(mockUrl, mockUrl);

      expect(connection1).toBe(connection2);
    });

    it('should return undefined for unknown key', () => {
      const client = new WebsocketClient({});

      expect(client.getConnection('unknown-url')).toBeUndefined();
    });
  });

  describe('removeConnection', () => {
    it('should remove connection from client', () => {
      const client = new WebsocketClient({});

      client.addConnection(mockUrl, mockUrl);
      expect(client.getConnection(mockUrl)).toBeDefined();

      client.removeConnection(mockUrl);
      expect(client.getConnection(mockUrl)).toBeUndefined();
    });
  });

  describe('reconnectAllConnections', () => {
    it('should call reconnect on all connections', async () => {
      const client = new WebsocketClient({});

      const connection1 = client.addConnection('url1', 'wss://url1.com');
      const connection2 = client.addConnection('url2', 'wss://url2.com');

      const reconnectSpy1 = vi.spyOn(connection1, 'reconnect');
      const reconnectSpy2 = vi.spyOn(connection2, 'reconnect');

      client.reconnectAllConnections();

      expect(reconnectSpy1).toHaveBeenCalled();
      expect(reconnectSpy2).toHaveBeenCalled();
    });

    it('should not throw when no connections exist', () => {
      const client = new WebsocketClient({});

      expect(() => client.reconnectAllConnections()).not.toThrow();
    });
  });
});
