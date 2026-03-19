import { describe, it, expect } from 'vitest';
import {
  createInitialWebsocketSubscriptionStore,
  WebsocketSubscriptionStore
} from './types';

describe('types', () => {
  describe('createInitialWebsocketSubscriptionStore', () => {
    it('should return store with default values', () => {
      const store = createInitialWebsocketSubscriptionStore();

      expect(store).toEqual<WebsocketSubscriptionStore>({
        message: undefined,
        subscribed: false,
        pendingSubscription: false,
        subscribedAt: undefined,
        receivedAt: undefined,
        connected: false,
        messageError: undefined,
        serverError: undefined
      });
    });

    it('should support generic type for message', () => {
      const store = createInitialWebsocketSubscriptionStore<{ id: number }>();

      expect(store.message).toBeUndefined();
    });
  });
});
