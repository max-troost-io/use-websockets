import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createWebsocketSubscriptionApi,
  createWebsocketMessageApi,
  removeWebsocketListenerFromConnection
} from './websocketClient.helpers';
import { WebsocketClient } from './WebsocketClient';
import { WebsocketMessageApi } from './WebsocketMessageApi';
import { WebsocketSubscriptionApi } from './WebsocketSubscriptionApi';
import { WebsocketMessageOptions, WebsocketSubscriptionOptions } from './types';

describe('websocketClient.helpers', () => {
  const mockUrl = 'wss://test.example.com';
  const mockUri = '/api/test';
  const mockKey = 'test-key';

  let client: WebsocketClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new WebsocketClient({});
  });

  describe('createWebsocketSubscriptionApi', () => {
    const subscriptionOptions: WebsocketSubscriptionOptions = {
      url: mockUrl,
      uri: mockUri,
      key: mockKey
    };

    it('should create new subscription API when none exists', () => {
      const api = createWebsocketSubscriptionApi(client, mockKey, subscriptionOptions);

      expect(api).toBeInstanceOf(WebsocketSubscriptionApi);
      expect(api.key).toBe(mockKey);
      expect(api.uri).toBe(mockUri);
      expect(client.getListener(mockKey, 'subscription')).toBe(api);
    });

    it('should return existing subscription API when same key', () => {
      const api1 = createWebsocketSubscriptionApi(client, mockKey, subscriptionOptions);
      const api2 = createWebsocketSubscriptionApi(client, mockKey, {
        ...subscriptionOptions,
        uri: '/api/different'
      });

      expect(api1).toBe(api2);
      expect(api2.uri).toBe(mockUri);
    });
  });

  describe('createWebsocketMessageApi', () => {
    const messageOptions: WebsocketMessageOptions = {
      url: mockUrl,
      key: mockKey
    };

    it('should create new message API when none exists', () => {
      const api = createWebsocketMessageApi(client, mockKey, messageOptions);

      expect(api).toBeInstanceOf(WebsocketMessageApi);
      expect(api.key).toBe(mockKey);
      expect(client.getListener(mockKey, 'message')).toBe(api);
    });

    it('should return existing message API when same key', () => {
      const api1 = createWebsocketMessageApi(client, mockKey, messageOptions);
      const api2 = createWebsocketMessageApi(client, mockKey, {
        ...messageOptions,
        responseTimeoutMs: 5000
      });

      expect(api1).toBe(api2);
    });
  });

  describe('removeWebsocketListenerFromConnection', () => {
    it('should remove subscription from connection and client', () => {
      const connection = client.addConnection(mockUrl, mockUrl);
      const subscription = createWebsocketSubscriptionApi(client, mockKey, {
        url: mockUrl,
        uri: mockUri,
        key: mockKey
      });
      connection.addListener(subscription);

      const removeListenerSpy = vi.spyOn(connection, 'removeListener');
      const clientRemoveSpy = vi.spyOn(client, 'removeListener');

      removeWebsocketListenerFromConnection(client, subscription);

      expect(removeListenerSpy).toHaveBeenCalledWith(subscription);
      expect(clientRemoveSpy).toHaveBeenCalledWith(subscription);
      expect(client.getListener(mockKey, 'subscription')).toBeUndefined();
    });

    it('should remove message API from connection and client', () => {
      const connection = client.addConnection(mockUrl, mockUrl);
      const messageApi = createWebsocketMessageApi(client, mockKey, {
        url: mockUrl,
        key: mockKey
      });
      connection.addListener(messageApi);

      removeWebsocketListenerFromConnection(client, messageApi);

      expect(client.getListener(mockKey, 'message')).toBeUndefined();
    });

    it('should not throw when connection does not exist for url', () => {
      const subscription = createWebsocketSubscriptionApi(client, mockKey, {
        url: mockUrl,
        uri: mockUri,
        key: mockKey
      });

      expect(() =>
        removeWebsocketListenerFromConnection(client, subscription)
      ).not.toThrow();
    });
  });
});
