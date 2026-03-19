import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebsocketSubscriptionApi } from "./WebsocketSubscriptionApi";
import { INITIATOR_REMOVAL_DELAY_MS } from "./constants";
import {
  WebsocketServerError,
  WebsocketSubscriptionOptions,
  WebsocketTransportError,
} from "./types";

describe("WebsocketSubscriptionApi", () => {
  const mockUrl = "wss://test.example.com";
  const mockUri = "/api/test";
  const mockKey = "test-key";
  // mockSocket removed — onOpen no longer takes a socket parameter

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should create a WebsocketSubscriptionApi instance with provided options", () => {
      const options: WebsocketSubscriptionOptions = {
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      };

      const api = new WebsocketSubscriptionApi(options);

      expect(api.key).toBe(mockKey);
      expect(api.uri).toBe(mockUri);
    });

    it("should merge provided options with defaults", () => {
      const options: WebsocketSubscriptionOptions = {
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      };

      const api = new WebsocketSubscriptionApi(options);

      expect(api.options.enabled).toBe(true);
    });
  });

  describe("isEnabled", () => {
    it("should return true by default", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      expect(api.isEnabled).toBe(true);
    });

    it("should return false when disabled", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        enabled: false,
      });

      expect(api.isEnabled).toBe(false);
    });

    it("should return true when explicitly enabled", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        enabled: true,
      });

      expect(api.isEnabled).toBe(true);
    });
  });

  describe("store", () => {
    it("should return a TanStack Store instance", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      expect(api.store).toBeDefined();
      expect(api.store.state).toBeDefined();
      expect(api.store.state.message).toBeUndefined();
      expect(api.store.state.connected).toBe(false);
      expect(api.store.state.subscribed).toBe(false);
    });

    it("should update store state when onMessage is called", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const testData = { id: 1, name: "test" };
      api.onMessage(testData);

      expect(api.store.state.message).toEqual(testData);
    });
  });

  describe("data", () => {
    it("should return undefined initially", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      expect(api.data).toBeUndefined();
    });

    it("should return current store state after onMessage", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const testData = { id: 1, name: "test" };
      api.onMessage(testData);

      expect(api.data).toEqual(testData);
    });

    it("should reflect the latest message data", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      api.onMessage({ version: 1 });
      expect(api.data).toEqual({ version: 1 });

      api.onMessage({ version: 2 });
      expect(api.data).toEqual({ version: 2 });
    });
  });

  describe("options setter", () => {
    it("should update options when set", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const newOptions: WebsocketSubscriptionOptions = {
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        enabled: false,
      };

      api.options = newOptions;

      expect(api.options.enabled).toBe(false);
    });

    it("should not trigger updates if options have not changed", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        enabled: true,
      });

      const subscribeSpy = vi.spyOn(api, "subscribe");

      api.options = {
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        enabled: true,
      };

      expect(subscribeSpy).not.toHaveBeenCalled();
    });

    it("should trigger subscription when body changes", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        body: { filter: "old" },
      });

      api.onOpen();

      const subscribeSpy = vi.spyOn(api, "subscribe");

      api.options = {
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        body: { filter: "new" },
      };

      expect(subscribeSpy).toHaveBeenCalledWith({ filter: "new" });
    });

    it("should trigger subscription when enabled becomes true", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        enabled: false,
      });

      api.onOpen();

      const subscribeSpy = vi.spyOn(api, "subscribe");

      api.options = {
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        enabled: true,
      };

      expect(subscribeSpy).toHaveBeenCalled();
    });

    it("should trigger unsubscribe when disabled", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        enabled: true,
      });

      api.onOpen();
      api.subscribe();

      const unsubscribeSpy = vi.spyOn(api, "unsubscribe");

      api.options = {
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        enabled: false,
      };

      expect(unsubscribeSpy).toHaveBeenCalled();
    });
  });

  describe("setSendToConnection", () => {
    it("should set the send callback", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const sendSpy = vi.fn();
      api.setSendToConnection(sendSpy);

      api.sendMessage({ method: "test" });

      expect(sendSpy).toHaveBeenCalled();
    });

    it("should allow clearing the send callback with null", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const sendSpy = vi.fn();
      api.setSendToConnection(sendSpy);
      api.setSendToConnection(null);

      api.sendMessage({ method: "test" });

      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe("registerHook", () => {
    it("should add a hook ID", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      api.registerHook("hook-1");

      // Verify by checking that unregisterHook triggers cleanup after delay
      const onRemoveSpy = vi.fn();
      api.unregisterHook("hook-1", onRemoveSpy);

      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS - 1);
      expect(onRemoveSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onRemoveSpy).toHaveBeenCalled();
    });

    it("should clear pending removal timeout when registering a hook", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      api.registerHook("hook-1");
      const onRemoveSpy = vi.fn();
      api.unregisterHook("hook-1", onRemoveSpy);

      // Register hook again before timeout expires
      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS - 50);
      api.registerHook("hook-1");

      // Advance past original timeout
      vi.advanceTimersByTime(100);
      expect(onRemoveSpy).not.toHaveBeenCalled();
    });

    it("should warn when multiple hooks are registered", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      api.registerHook("hook-1");
      api.registerHook("hook-2");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("has more than one initiator")
      );

      consoleSpy.mockRestore();
    });

    it("should clear pending disconnect timeout when registering a hook", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const onRemoveSpy = vi.fn();
      api.disconnect(onRemoveSpy);

      // Register hook before disconnect timeout expires
      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS - 50);
      api.registerHook("hook-1");

      // Advance past original disconnect timeout
      vi.advanceTimersByTime(100);
      expect(onRemoveSpy).not.toHaveBeenCalled();
    });
  });

  describe("unregisterHook", () => {
    it("should remove hook and trigger cleanup after delay when last one", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      api.registerHook("hook-1");
      api.subscribe();

      const onRemoveSpy = vi.fn();
      const unsubscribeSpy = vi.spyOn(api, "unsubscribe");

      api.unregisterHook("hook-1", onRemoveSpy);

      expect(onRemoveSpy).not.toHaveBeenCalled();
      expect(unsubscribeSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS);

      expect(unsubscribeSpy).toHaveBeenCalled();
      expect(onRemoveSpy).toHaveBeenCalled();
    });

    it("should not trigger cleanup if other hooks remain", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      api.registerHook("hook-1");
      api.registerHook("hook-2");

      const onRemoveSpy = vi.fn();
      const unsubscribeSpy = vi.spyOn(api, "unsubscribe");

      api.unregisterHook("hook-1", onRemoveSpy);

      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS);

      expect(unsubscribeSpy).not.toHaveBeenCalled();
      expect(onRemoveSpy).not.toHaveBeenCalled();
    });

    it("should clear timeout when removing multiple hooks sequentially", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      api.registerHook("hook-1");
      api.registerHook("hook-2");

      const onRemoveSpy = vi.fn();

      // Remove first hook - starts timeout
      api.unregisterHook("hook-1", onRemoveSpy);
      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS - 50);

      // Remove second hook before first timeout expires - clears first timeout, starts new one
      api.unregisterHook("hook-2", onRemoveSpy);

      // Advance past the new timeout
      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS);

      // Should be called once after second timeout expires
      expect(onRemoveSpy).toHaveBeenCalledTimes(1);
    });

    it("should set _connected to false when last hook is removed", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      api.onOpen();
      api.registerHook("hook-1");

      const onRemoveSpy = vi.fn();
      api.unregisterHook("hook-1", onRemoveSpy);

      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS);

      // After removal, onOpen should mount connection again since _connected was reset
      const subscribeSpy = vi.spyOn(api, "subscribe");
      api.onOpen();
      expect(subscribeSpy).toHaveBeenCalled();
    });
  });

  describe("disconnect", () => {
    it("should unsubscribe immediately when called", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const sendSpy = vi.fn();
      api.setSendToConnection(sendSpy);
      api.subscribe();
      sendSpy.mockClear();

      api.disconnect(vi.fn());

      // unsubscribe should have been called synchronously
      expect(sendSpy).toHaveBeenCalledWith({
        method: "unsubscribe",
        uri: mockUri,
      });
    });

    it("should call onRemoveFromSocket callback after delay", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const onRemoveSpy = vi.fn();
      api.disconnect(onRemoveSpy);

      expect(onRemoveSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS);

      expect(onRemoveSpy).toHaveBeenCalled();
    });

    it("should reset _connected after delay", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      api.onOpen();

      api.disconnect(vi.fn());
      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS);

      // After disconnect, onOpen should mount connection again since _connected was reset
      const subscribeSpy = vi.spyOn(api, "subscribe");
      api.onOpen();
      expect(subscribeSpy).toHaveBeenCalled();
    });

    it("should clear previous disconnect timeout if called again", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const firstCallback = vi.fn();
      const secondCallback = vi.fn();

      api.disconnect(firstCallback);
      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS - 50);

      api.disconnect(secondCallback);
      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS);

      // Only second callback should fire
      expect(firstCallback).not.toHaveBeenCalled();
      expect(secondCallback).toHaveBeenCalled();
    });
  });

  describe("sendMessage", () => {
    it("should call sendToConnection callback with URI when enabled", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const sendSpy = vi.fn();
      api.setSendToConnection(sendSpy);

      api.sendMessage({ method: "test", body: { data: "value" } });

      expect(sendSpy).toHaveBeenCalledWith({
        method: "test",
        body: { data: "value" },
        uri: mockUri,
      });
    });

    it("should not call sendToConnection when disabled", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        enabled: false,
      });

      const sendSpy = vi.fn();
      api.setSendToConnection(sendSpy);

      api.sendMessage({ method: "test" });

      expect(sendSpy).not.toHaveBeenCalled();
    });

    it("should cancel pending disconnect timeout", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      api.setSendToConnection(vi.fn());

      const disconnectCallback = vi.fn();
      api.disconnect(disconnectCallback);

      // Send message before disconnect timeout fires
      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS - 50);
      api.sendMessage({ method: "test" });

      // Advance past original timeout
      vi.advanceTimersByTime(100);
      expect(disconnectCallback).not.toHaveBeenCalled();
    });

    it("should cancel pending hook removal timeout", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      api.setSendToConnection(vi.fn());
      api.registerHook("hook-1");

      const onRemoveSpy = vi.fn();
      api.unregisterHook("hook-1", onRemoveSpy);

      // Send message before removal timeout fires
      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS - 50);
      api.sendMessage({ method: "test" });

      // Advance past original timeout
      vi.advanceTimersByTime(100);
      expect(onRemoveSpy).not.toHaveBeenCalled();
    });

    it("should not send when sendToConnection is null", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      // No sendToConnection set - should not throw
      expect(() => api.sendMessage({ method: "test" })).not.toThrow();
    });
  });

  describe("subscribe", () => {
    it("should call sendToConnection with subscribe method when enabled", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const sendSpy = vi.fn();
      api.setSendToConnection(sendSpy);

      api.subscribe({ filter: "active" });

      expect(sendSpy).toHaveBeenCalledWith({
        method: "subscribe",
        uri: mockUri,
        body: { filter: "active" },
      });
    });

    it("should set subscription state to open", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const sendSpy = vi.fn();
      api.setSendToConnection(sendSpy);

      api.subscribe();

      // Verify subscription is open by checking that unsubscribe sends a message
      sendSpy.mockClear();
      api.unsubscribe();
      expect(sendSpy).toHaveBeenCalledWith({
        method: "unsubscribe",
        uri: mockUri,
      });
    });

    it("should call onSubscribe callback with correct shape", () => {
      const onSubscribeSpy = vi.fn();
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        onSubscribe: onSubscribeSpy,
        body: { filter: "test" },
      });

      api.subscribe({ filter: "test" });

      expect(onSubscribeSpy).toHaveBeenCalledWith({
        uri: mockUri,
        body: { filter: "test" },
        uriApi: api,
      });
    });

    it("should not subscribe when disabled", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        enabled: false,
      });

      const sendSpy = vi.fn();
      api.setSendToConnection(sendSpy);

      api.subscribe();

      expect(sendSpy).not.toHaveBeenCalled();
    });

    it("should cancel pending disconnect timeout", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      api.setSendToConnection(vi.fn());

      const disconnectCallback = vi.fn();
      api.disconnect(disconnectCallback);

      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS - 50);
      api.subscribe();

      vi.advanceTimersByTime(100);
      expect(disconnectCallback).not.toHaveBeenCalled();
    });
  });

  describe("unsubscribe", () => {
    it("should call sendToConnection with unsubscribe method", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const sendSpy = vi.fn();
      api.setSendToConnection(sendSpy);

      api.subscribe();
      sendSpy.mockClear();

      api.unsubscribe();

      expect(sendSpy).toHaveBeenCalledWith({
        method: "unsubscribe",
        uri: mockUri,
      });
    });

    it("should not unsubscribe if not subscribed", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const sendSpy = vi.fn();
      api.setSendToConnection(sendSpy);

      api.unsubscribe();

      expect(sendSpy).not.toHaveBeenCalled();
    });

    it("should reset subscription state so subsequent unsubscribe is a no-op", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const sendSpy = vi.fn();
      api.setSendToConnection(sendSpy);

      api.subscribe();
      api.unsubscribe();
      sendSpy.mockClear();

      // Second unsubscribe should be a no-op
      api.unsubscribe();
      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe("onOpen", () => {
    it("should mount connection when socket opens", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const subscribeSpy = vi.spyOn(api, "subscribe");

      api.onOpen();

      expect(subscribeSpy).toHaveBeenCalled();
    });

    it("should only mount once even if onOpen is called multiple times", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const subscribeSpy = vi.spyOn(api, "subscribe");

      api.onOpen();
      api.onOpen();

      expect(subscribeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("onMessage", () => {
    it("should update store state", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const testData = { id: 1, name: "test" };
      api.onMessage(testData);

      expect(api.store.state.message).toEqual(testData);
    });

    it("should call onMessage callback with data and uriApi", () => {
      const onMessageSpy = vi.fn();
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        onMessage: onMessageSpy,
      });

      const testData = { id: 1, name: "test" };
      api.onMessage(testData);

      expect(onMessageSpy).toHaveBeenCalledWith({
        data: testData,
        uriApi: api,
      });
    });

    it("should not throw if onMessage callback is not provided", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      expect(() => api.onMessage({ id: 1 })).not.toThrow();
    });

    it("should overwrite previous store state", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      api.onMessage({ version: 1 });
      api.onMessage({ version: 2 });

      expect(api.store.state.message).toEqual({ version: 2 });
    });
  });

  describe("onError", () => {
    it("should call onError callback if provided", () => {
      const onErrorSpy = vi.fn();
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        onError: onErrorSpy,
      });

      const errorEvent = new Event("error");
      const transportError: WebsocketTransportError = {
        type: "transport",
        event: errorEvent,
      };
      api.onError(transportError);

      expect(onErrorSpy).toHaveBeenCalledWith(transportError);
    });

    it("should not throw if onError callback is not provided", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const errorEvent = new Event("error");
      const transportError: WebsocketTransportError = {
        type: "transport",
        event: errorEvent,
      };

      expect(() => api.onError(transportError)).not.toThrow();
    });
  });

  describe("onMessageError", () => {
    it("should call onMessageError callback if provided", () => {
      const onMessageErrorSpy = vi.fn();
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        onMessageError: onMessageErrorSpy,
      });

      const serverError: WebsocketServerError = {
        type: "server",
        message: { uri: mockUri, method: "error", body: { code: "CONFLICT" } },
      };
      api.onMessageError(serverError);

      expect(onMessageErrorSpy).toHaveBeenCalledWith(serverError);
    });

    it("should reset pendingSubscription when server error received", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      api.onOpen();
      api.subscribe();
      expect(api.store.state.pendingSubscription).toBe(true);

      api.onMessageError({
        type: "server",
        message: { uri: mockUri, method: "error", body: {} },
      });

      expect(api.store.state.pendingSubscription).toBe(false);
    });

    it("should not throw if onMessageError callback is not provided", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const serverError: WebsocketServerError = {
        type: "server",
        message: { uri: mockUri, method: "error", body: {} },
      };

      expect(() => api.onMessageError(serverError)).not.toThrow();
    });
  });

  describe("onClose", () => {
    it("should reset subscription state", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const sendSpy = vi.fn();
      api.setSendToConnection(sendSpy);

      api.subscribe();

      const closeEvent = new CloseEvent("close");
      api.onClose(closeEvent);

      // Verify by checking unsubscribe doesn't call sendToConnection
      sendSpy.mockClear();
      api.unsubscribe();

      expect(sendSpy).not.toHaveBeenCalled();
    });

    it("should call onClose callback if provided", () => {
      const onCloseSpy = vi.fn();
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        onClose: onCloseSpy,
      });

      const closeEvent = new CloseEvent("close", {
        code: 1000,
        reason: "Normal closure",
      });
      api.onClose(closeEvent);

      expect(onCloseSpy).toHaveBeenCalledWith(closeEvent);
    });

    it("should not throw if onClose callback is not provided", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const closeEvent = new CloseEvent("close");

      expect(() => api.onClose(closeEvent)).not.toThrow();
    });
  });

  describe("reset", () => {
    it("should reset state when connected", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      // Establish connection and get some data
      api.onOpen();
      api.onMessage({ id: 1 });

      expect(api.data).toEqual({ id: 1 });

      api.reset();

      expect(api.data).toBeUndefined();
    });

    it("should allow re-connection after reset", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      api.onOpen();
      api.reset();

      // After reset, onOpen should mount connection again
      const subscribeSpy = vi.spyOn(api, "subscribe");
      api.onOpen();
      expect(subscribeSpy).toHaveBeenCalled();
    });

    it("should do nothing if not connected", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      api.onMessage({ id: 1 });

      // Reset should not clear store since _connected is false
      api.reset();
      expect(api.data).toEqual({ id: 1 });
    });

    it("should clear pending timeouts", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      api.onOpen();
      api.registerHook("hook-1");

      const onRemoveSpy = vi.fn();
      api.unregisterHook("hook-1", onRemoveSpy);

      // Reset before timeout fires
      api.reset();
      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS);

      // The timeout callback should still fire but _registeredHooks check may pass
      // However reset clears the timeout, so callback should not fire
      // Note: reset only clears timeouts when _connected is true, which it is here
      expect(onRemoveSpy).not.toHaveBeenCalled();
    });

    it("should reset subscription state", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const sendSpy = vi.fn();
      api.setSendToConnection(sendSpy);

      api.onOpen();
      api.subscribe();

      api.reset();

      // After reset, unsubscribe should be a no-op since _subscriptionOpen is false
      sendSpy.mockClear();
      api.unsubscribe();
      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe("integration scenarios", () => {
    it("should handle full lifecycle: open -> subscribe -> message -> close", () => {
      const onMessageSpy = vi.fn();
      const onSubscribeSpy = vi.fn();
      const onCloseSpy = vi.fn();

      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        body: { filter: "active" },
        onMessage: onMessageSpy,
        onSubscribe: onSubscribeSpy,
        onClose: onCloseSpy,
      });

      // Open connection
      api.onOpen();
      expect(onSubscribeSpy).toHaveBeenCalledWith({
        uri: mockUri,
        body: { filter: "active" },
        uriApi: api,
      });

      // Receive message
      const testData = { id: 1, data: "test" };
      api.onMessage(testData);
      expect(api.store.state.message).toEqual(testData);
      expect(api.data).toEqual(testData);
      expect(onMessageSpy).toHaveBeenCalledWith({
        data: testData,
        uriApi: api,
      });

      // Close connection
      const closeEvent = new CloseEvent("close");
      api.onClose(closeEvent);
      expect(onCloseSpy).toHaveBeenCalledWith(closeEvent);
    });

    it("should handle multiple hooks correctly", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      api.registerHook("hook-1");
      api.registerHook("hook-2");
      api.subscribe();

      const onRemove1Spy = vi.fn();
      const onRemove2Spy = vi.fn();
      const unsubscribeSpy = vi.spyOn(api, "unsubscribe");

      // Remove first hook
      api.unregisterHook("hook-1", onRemove1Spy);
      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS);
      expect(unsubscribeSpy).not.toHaveBeenCalled();
      expect(onRemove1Spy).not.toHaveBeenCalled();

      // Remove second hook
      api.unregisterHook("hook-2", onRemove2Spy);
      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS);
      expect(unsubscribeSpy).toHaveBeenCalled();
      expect(onRemove2Spy).toHaveBeenCalled();
    });

    it("should handle re-enabling after disabling", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        enabled: false,
      });

      api.onOpen();

      const subscribeSpy = vi.spyOn(api, "subscribe");

      // Enable
      api.options = {
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        enabled: true,
      };

      expect(subscribeSpy).toHaveBeenCalled();
    });

    it("should handle disconnect then reconnect cycle", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
        body: { filter: "active" },
      });

      const sendSpy = vi.fn();
      api.setSendToConnection(sendSpy);

      // First connection
      api.onOpen();
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({ method: "subscribe" })
      );

      // Disconnect
      const onRemoveSpy = vi.fn();
      api.disconnect(onRemoveSpy);
      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS);
      expect(onRemoveSpy).toHaveBeenCalled();

      sendSpy.mockClear();

      // Reconnect
      api.onOpen();
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "subscribe",
          body: { filter: "active" },
        })
      );
    });

    it("should handle reset then reconnect cycle", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const sendSpy = vi.fn();
      api.setSendToConnection(sendSpy);

      // First connection
      api.onOpen();
      api.onMessage({ id: 1 });
      expect(api.data).toEqual({ id: 1 });

      // Reset
      api.reset();
      expect(api.data).toBeUndefined();

      sendSpy.mockClear();

      // Reconnect - should mount again
      api.onOpen();
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({ method: "subscribe" })
      );
    });

    it("should handle sendMessage cancelling pending disconnect", () => {
      const api = new WebsocketSubscriptionApi({
        url: mockUrl,
        uri: mockUri,
        key: mockKey,
      });

      const sendSpy = vi.fn();
      api.setSendToConnection(sendSpy);

      const disconnectCallback = vi.fn();
      api.disconnect(disconnectCallback);

      // Send a message before disconnect fires
      api.sendMessage({ method: "keep-alive" });

      vi.advanceTimersByTime(INITIATOR_REMOVAL_DELAY_MS);

      // Disconnect should have been cancelled
      expect(disconnectCallback).not.toHaveBeenCalled();
    });
  });
});
