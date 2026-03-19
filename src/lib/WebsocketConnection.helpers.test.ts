import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  reconnectWaitTime,
  getPingTime,
  getSubscriptionUris,
  isValidIncomingMessage,
  isErrorMethod,
  isBrowserOnline,
  isReconnectableCloseCode,
  isSocketOnline,
  createPingMessage,
  isConnectionReady,
} from "./WebsocketConnection.helpers";
import { RECONNECTION_CONFIG, WEBSOCKET_CLOSE_CODES } from "./constants";
import { IncomingWebsocketMessage, ReconnectionConfig } from "./types";

describe("WebsocketConnection.helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("reconnectWaitTime", () => {
    it("should return first phase delay for attempts 0-4", () => {
      expect(
        reconnectWaitTime(
          0,
          { firstPhase: RECONNECTION_CONFIG.DELAYS.FIRST_PHASE, secondPhase: RECONNECTION_CONFIG.DELAYS.SECOND_PHASE, thirdPhase: RECONNECTION_CONFIG.DELAYS.THIRD_PHASE },
          { first: RECONNECTION_CONFIG.PHASE_THRESHOLDS.FIRST, second: RECONNECTION_CONFIG.PHASE_THRESHOLDS.SECOND }
        )
      ).toBe(RECONNECTION_CONFIG.DELAYS.FIRST_PHASE);
      expect(
        reconnectWaitTime(
          1,
          { firstPhase: RECONNECTION_CONFIG.DELAYS.FIRST_PHASE, secondPhase: RECONNECTION_CONFIG.DELAYS.SECOND_PHASE, thirdPhase: RECONNECTION_CONFIG.DELAYS.THIRD_PHASE },
          { first: RECONNECTION_CONFIG.PHASE_THRESHOLDS.FIRST, second: RECONNECTION_CONFIG.PHASE_THRESHOLDS.SECOND }
        )
      ).toBe(RECONNECTION_CONFIG.DELAYS.FIRST_PHASE);
      expect(
        reconnectWaitTime(
          2,
          { firstPhase: RECONNECTION_CONFIG.DELAYS.FIRST_PHASE, secondPhase: RECONNECTION_CONFIG.DELAYS.SECOND_PHASE, thirdPhase: RECONNECTION_CONFIG.DELAYS.THIRD_PHASE },
          { first: RECONNECTION_CONFIG.PHASE_THRESHOLDS.FIRST, second: RECONNECTION_CONFIG.PHASE_THRESHOLDS.SECOND }
        )
      ).toBe(RECONNECTION_CONFIG.DELAYS.FIRST_PHASE);
      expect(
        reconnectWaitTime(
          3,
          { firstPhase: RECONNECTION_CONFIG.DELAYS.FIRST_PHASE, secondPhase: RECONNECTION_CONFIG.DELAYS.SECOND_PHASE, thirdPhase: RECONNECTION_CONFIG.DELAYS.THIRD_PHASE },
          { first: RECONNECTION_CONFIG.PHASE_THRESHOLDS.FIRST, second: RECONNECTION_CONFIG.PHASE_THRESHOLDS.SECOND }
        )
      ).toBe(RECONNECTION_CONFIG.DELAYS.FIRST_PHASE);
      expect(
        reconnectWaitTime(
          4,
          { firstPhase: RECONNECTION_CONFIG.DELAYS.FIRST_PHASE, secondPhase: RECONNECTION_CONFIG.DELAYS.SECOND_PHASE, thirdPhase: RECONNECTION_CONFIG.DELAYS.THIRD_PHASE },
          { first: RECONNECTION_CONFIG.PHASE_THRESHOLDS.FIRST, second: RECONNECTION_CONFIG.PHASE_THRESHOLDS.SECOND }
        )
      ).toBe(RECONNECTION_CONFIG.DELAYS.FIRST_PHASE);
    });

    it("should return second phase delay for attempts 5-9", () => {
      expect(
        reconnectWaitTime(
          5,
          { firstPhase: RECONNECTION_CONFIG.DELAYS.FIRST_PHASE, secondPhase: RECONNECTION_CONFIG.DELAYS.SECOND_PHASE, thirdPhase: RECONNECTION_CONFIG.DELAYS.THIRD_PHASE },
          { first: RECONNECTION_CONFIG.PHASE_THRESHOLDS.FIRST, second: RECONNECTION_CONFIG.PHASE_THRESHOLDS.SECOND }
        )
      ).toBe(RECONNECTION_CONFIG.DELAYS.SECOND_PHASE);
      expect(
        reconnectWaitTime(
          6,
          { firstPhase: RECONNECTION_CONFIG.DELAYS.FIRST_PHASE, secondPhase: RECONNECTION_CONFIG.DELAYS.SECOND_PHASE, thirdPhase: RECONNECTION_CONFIG.DELAYS.THIRD_PHASE },
          { first: RECONNECTION_CONFIG.PHASE_THRESHOLDS.FIRST, second: RECONNECTION_CONFIG.PHASE_THRESHOLDS.SECOND }
        )
      ).toBe(RECONNECTION_CONFIG.DELAYS.SECOND_PHASE);
      expect(
        reconnectWaitTime(
          7,
          { firstPhase: RECONNECTION_CONFIG.DELAYS.FIRST_PHASE, secondPhase: RECONNECTION_CONFIG.DELAYS.SECOND_PHASE, thirdPhase: RECONNECTION_CONFIG.DELAYS.THIRD_PHASE },
          { first: RECONNECTION_CONFIG.PHASE_THRESHOLDS.FIRST, second: RECONNECTION_CONFIG.PHASE_THRESHOLDS.SECOND }      
        )
      ).toBe(RECONNECTION_CONFIG.DELAYS.SECOND_PHASE);
      expect(
        reconnectWaitTime(
          8,
          { firstPhase: RECONNECTION_CONFIG.DELAYS.FIRST_PHASE, secondPhase: RECONNECTION_CONFIG.DELAYS.SECOND_PHASE, thirdPhase: RECONNECTION_CONFIG.DELAYS.THIRD_PHASE },
          { first: RECONNECTION_CONFIG.PHASE_THRESHOLDS.FIRST, second: RECONNECTION_CONFIG.PHASE_THRESHOLDS.SECOND }
        )
      ).toBe(RECONNECTION_CONFIG.DELAYS.SECOND_PHASE);
      expect(
        reconnectWaitTime(
          9,
          { firstPhase: RECONNECTION_CONFIG.DELAYS.FIRST_PHASE, secondPhase: RECONNECTION_CONFIG.DELAYS.SECOND_PHASE, thirdPhase: RECONNECTION_CONFIG.DELAYS.THIRD_PHASE },
          { first: RECONNECTION_CONFIG.PHASE_THRESHOLDS.FIRST, second: RECONNECTION_CONFIG.PHASE_THRESHOLDS.SECOND }
        )
      ).toBe(RECONNECTION_CONFIG.DELAYS.SECOND_PHASE);
    });

    it("should return third phase delay for attempts 10+", () => {
      expect(reconnectWaitTime(10, { firstPhase: RECONNECTION_CONFIG.DELAYS.FIRST_PHASE, secondPhase: RECONNECTION_CONFIG.DELAYS.SECOND_PHASE, thirdPhase: RECONNECTION_CONFIG.DELAYS.THIRD_PHASE }, { first: RECONNECTION_CONFIG.PHASE_THRESHOLDS.FIRST, second: RECONNECTION_CONFIG.PHASE_THRESHOLDS.SECOND })).toBe(
        RECONNECTION_CONFIG.DELAYS.THIRD_PHASE
      );
      expect(reconnectWaitTime(15, { firstPhase: RECONNECTION_CONFIG.DELAYS.FIRST_PHASE, secondPhase: RECONNECTION_CONFIG.DELAYS.SECOND_PHASE, thirdPhase: RECONNECTION_CONFIG.DELAYS.THIRD_PHASE }, { first: RECONNECTION_CONFIG.PHASE_THRESHOLDS.FIRST, second: RECONNECTION_CONFIG.PHASE_THRESHOLDS.SECOND })).toBe(
        RECONNECTION_CONFIG.DELAYS.THIRD_PHASE
      );
      expect(reconnectWaitTime(20, { firstPhase: RECONNECTION_CONFIG.DELAYS.FIRST_PHASE, secondPhase: RECONNECTION_CONFIG.DELAYS.SECOND_PHASE, thirdPhase: RECONNECTION_CONFIG.DELAYS.THIRD_PHASE }, { first: RECONNECTION_CONFIG.PHASE_THRESHOLDS.FIRST, second: RECONNECTION_CONFIG.PHASE_THRESHOLDS.SECOND })).toBe(
        RECONNECTION_CONFIG.DELAYS.THIRD_PHASE
      );
      expect(reconnectWaitTime(100, { firstPhase: RECONNECTION_CONFIG.DELAYS.FIRST_PHASE, secondPhase: RECONNECTION_CONFIG.DELAYS.SECOND_PHASE, thirdPhase: RECONNECTION_CONFIG.DELAYS.THIRD_PHASE }, { first: RECONNECTION_CONFIG.PHASE_THRESHOLDS.FIRST, second: RECONNECTION_CONFIG.PHASE_THRESHOLDS.SECOND })).toBe(
        RECONNECTION_CONFIG.DELAYS.THIRD_PHASE
      );
    });

    it("should use custom reconnection config when provided", () => {
      const customConfig = {
        ...RECONNECTION_CONFIG,
        DELAYS: {
          FIRST_PHASE: 1000,
          SECOND_PHASE: 5000,
          THIRD_PHASE: 15000,
        },
        PHASE_THRESHOLDS: {
          FIRST: 3,
          SECOND: 8,
        },
      } as unknown as ReconnectionConfig;

      expect(
        reconnectWaitTime(0, { firstPhase: customConfig.DELAYS.FIRST_PHASE, secondPhase: customConfig.DELAYS.SECOND_PHASE, thirdPhase: customConfig.DELAYS.THIRD_PHASE }, { first: customConfig.PHASE_THRESHOLDS.FIRST, second: customConfig.PHASE_THRESHOLDS.SECOND })
      ).toBe(1000);
      expect(
        reconnectWaitTime(5, { firstPhase: customConfig.DELAYS.FIRST_PHASE, secondPhase: customConfig.DELAYS.SECOND_PHASE, thirdPhase: customConfig.DELAYS.THIRD_PHASE }, { first: customConfig.PHASE_THRESHOLDS.FIRST, second: customConfig.PHASE_THRESHOLDS.SECOND })
      ).toBe(5000);
      expect(
        reconnectWaitTime(10, { firstPhase: customConfig.DELAYS.FIRST_PHASE, secondPhase: customConfig.DELAYS.SECOND_PHASE, thirdPhase: customConfig.DELAYS.THIRD_PHASE }, { first: customConfig.PHASE_THRESHOLDS.FIRST, second: customConfig.PHASE_THRESHOLDS.SECOND })
      ).toBe(15000);
    });
  });

  describe("getPingTime", () => {
    it("should return 40 seconds in milliseconds", () => {
      expect(getPingTime()).toBe(40 * 1000);
    });
  });

  describe("isValidIncomingMessage", () => {
    it("should return true for valid IncomingWebsocketMessage with uri", () => {
      const validMessage: IncomingWebsocketMessage = {
        uri: "/api/test",
      };
      expect(isValidIncomingMessage(validMessage)).toBe(true);
    });

    it("should return true for valid IncomingWebsocketMessage with uri and body", () => {
      const validMessage: IncomingWebsocketMessage = {
        uri: "/api/test",
        body: { data: "test" },
      };
      expect(isValidIncomingMessage(validMessage)).toBe(true);
    });

    it("should return false for null", () => {
      expect(isValidIncomingMessage(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isValidIncomingMessage(undefined)).toBe(false);
    });

    it("should return false for non-object types", () => {
      expect(isValidIncomingMessage("string")).toBe(false);
      expect(isValidIncomingMessage(123)).toBe(false);
      expect(isValidIncomingMessage(true)).toBe(false);
      expect(isValidIncomingMessage([])).toBe(false);
    });

    it("should return false for object without uri property", () => {
      expect(isValidIncomingMessage({})).toBe(false);
      expect(isValidIncomingMessage({ body: "test" })).toBe(false);
      expect(isValidIncomingMessage({ other: "property" })).toBe(false);
    });

    it("should return false for object with non-string uri", () => {
      expect(isValidIncomingMessage({ uri: 123 })).toBe(false);
      expect(isValidIncomingMessage({ uri: null })).toBe(false);
      expect(isValidIncomingMessage({ uri: undefined })).toBe(false);
      expect(isValidIncomingMessage({ uri: {} })).toBe(false);
    });
  });

  describe("isErrorMethod", () => {
    it("should return true for error method", () => {
      expect(isErrorMethod("error")).toBe(true);
    });

    it("should return true for conflict method", () => {
      expect(isErrorMethod("conflict")).toBe(true);
    });

    it("should return true for exception method", () => {
      expect(isErrorMethod("exception")).toBe(true);
    });

    it("should return false for undefined", () => {
      expect(isErrorMethod(undefined)).toBe(false);
    });

    it("should return false for non-error methods", () => {
      expect(isErrorMethod("post")).toBe(false);
      expect(isErrorMethod("get")).toBe(false);
      expect(isErrorMethod("subscribe")).toBe(false);
    });
  });

  describe("isBrowserOnline", () => {
    const originalWindow = globalThis.window;

    beforeEach(() => {
      // Reset window
      delete (globalThis as { window?: unknown }).window;
    });

    afterEach(() => {
      (globalThis as { window?: unknown }).window = originalWindow;
    });

    it("should return false when window is undefined", () => {
      expect(isBrowserOnline()).toBe(false);
    });

    it("should return true when window exists and navigator.onLine is true", () => {
      Object.defineProperty(globalThis, "window", {
        value: {
          navigator: {
            onLine: true,
          },
        },
        writable: true,
        configurable: true,
      });
      expect(isBrowserOnline()).toBe(true);
    });

    it("should return false when window exists but navigator.onLine is false", () => {
      Object.defineProperty(globalThis, "window", {
        value: {
          navigator: {
            onLine: false,
          },
        },
        writable: true,
        configurable: true,
      });
      expect(isBrowserOnline()).toBe(false);
    });
  });

  describe("isSocketOnline", () => {
    const originalWindow = globalThis.window;

    beforeEach(() => {
      // Reset window
      delete (globalThis as { window?: unknown }).window;
    });

    afterEach(() => {
      (globalThis as { window?: unknown }).window = originalWindow;
    });

    it("should return false when window is undefined", () => {
      const mockSocket = { readyState: WebSocket.OPEN } as WebSocket;
      expect(isSocketOnline(mockSocket)).toBe(false);
    });

    it("should return false when socket is undefined", () => {
      Object.defineProperty(globalThis, "window", {
        value: {
          navigator: {
            onLine: true,
          },
        },
        writable: true,
        configurable: true,
      });
      expect(isSocketOnline(undefined)).toBe(false);
    });

    it("should return false when browser is offline", () => {
      Object.defineProperty(globalThis, "window", {
        value: {
          navigator: {
            onLine: false,
          },
        },
        writable: true,
        configurable: true,
      });
      const mockSocket = { readyState: WebSocket.OPEN } as WebSocket;
      expect(isSocketOnline(mockSocket)).toBe(false);
    });

    it("should return false when socket is not in OPEN state", () => {
      Object.defineProperty(globalThis, "window", {
        value: {
          navigator: {
            onLine: true,
          },
        },
        writable: true,
        configurable: true,
      });
      const mockSocketConnecting = {
        readyState: WebSocket.CONNECTING,
      } as WebSocket;
      const mockSocketClosing = { readyState: WebSocket.CLOSING } as WebSocket;
      const mockSocketClosed = { readyState: WebSocket.CLOSED } as WebSocket;

      expect(isSocketOnline(mockSocketConnecting)).toBe(false);
      expect(isSocketOnline(mockSocketClosing)).toBe(false);
      expect(isSocketOnline(mockSocketClosed)).toBe(false);
    });

    it("should return true when browser is online and socket is OPEN", () => {
      Object.defineProperty(globalThis, "window", {
        value: {
          navigator: {
            onLine: true,
          },
        },
        writable: true,
        configurable: true,
      });
      const mockSocket = { readyState: WebSocket.OPEN } as WebSocket;
      expect(isSocketOnline(mockSocket)).toBe(true);
    });
  });

  describe("getSubscriptionUris", () => {
    it("should return URIs from subscription listeners only", () => {
      const listeners = new Map([
        [
          "sub1",
          { key: "sub1", uri: "/api/voyages", type: "subscription" } as any,
        ],
        [
          "sub2",
          {
            key: "sub2",
            uri: "/api/notifications",
            type: "subscription",
          } as any,
        ],
        [
          "msg1",
          { key: "msg1", type: "message", hasWaitingUri: () => false } as any,
        ],
      ]);
      expect(getSubscriptionUris(listeners)).toEqual([
        "/api/voyages",
        "/api/notifications",
      ]);
    });

    it("should return empty array when no subscription listeners", () => {
      const listeners = new Map([
        [
          "msg1",
          { key: "msg1", type: "message", hasWaitingUri: () => false } as any,
        ],
      ]);
      expect(getSubscriptionUris(listeners)).toEqual([]);
    });

    it("should return empty array for empty map", () => {
      expect(getSubscriptionUris(new Map())).toEqual([]);
    });
  });

  describe("createPingMessage", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should create a valid ping message with correct structure", () => {
      const message = createPingMessage();

      expect(message).toMatchObject({
        method: "post",
        uri: "ping",
        body: expect.any(Number),
      });
    });

    it("should include current timestamp in body", () => {
      const now = Date.now();
      const message = createPingMessage();

      expect(message.body).toBe(now);
    });

    it("should return an object that can be serialized to JSON", () => {
      const message = createPingMessage();
      expect(() => JSON.stringify(message)).not.toThrow();
      expect(JSON.parse(JSON.stringify(message))).toEqual(message);
    });
  });

  describe("isConnectionReady", () => {
    it("should return false when socket is undefined", () => {
      expect(isConnectionReady(undefined)).toBe(false);
    });

    it("should return true when socket is in OPEN state", () => {
      const mockSocket = { readyState: WebSocket.OPEN } as WebSocket;
      expect(isConnectionReady(mockSocket)).toBe(true);
    });

    it("should return true when socket is in CONNECTING state", () => {
      const mockSocket = { readyState: WebSocket.CONNECTING } as WebSocket;
      expect(isConnectionReady(mockSocket)).toBe(true);
    });

    it("should return false when socket is in CLOSING state", () => {
      const mockSocket = { readyState: WebSocket.CLOSING } as WebSocket;
      expect(isConnectionReady(mockSocket)).toBe(false);
    });

    it("should return false when socket is in CLOSED state", () => {
      const mockSocket = { readyState: WebSocket.CLOSED } as WebSocket;
      expect(isConnectionReady(mockSocket)).toBe(false);
    });
  });

  describe("isReconnectableCloseCode", () => {
    it("should return false for Normal Closure (1000)", () => {
      expect(
        isReconnectableCloseCode(WEBSOCKET_CLOSE_CODES.NORMAL_CLOSURE)
      ).toBe(false);
    });

    it("should return true for Going Away (1001)", () => {
      expect(isReconnectableCloseCode(WEBSOCKET_CLOSE_CODES.GOING_AWAY)).toBe(
        true
      );
    });

    it("should return true for Internal Error (1011)", () => {
      expect(
        isReconnectableCloseCode(WEBSOCKET_CLOSE_CODES.INTERNAL_ERROR)
      ).toBe(true);
    });

    it("should return true for Service Restart (1012)", () => {
      expect(
        isReconnectableCloseCode(WEBSOCKET_CLOSE_CODES.SERVICE_RESTART)
      ).toBe(true);
    });

    it("should return true for Try Again Later (1013)", () => {
      expect(
        isReconnectableCloseCode(WEBSOCKET_CLOSE_CODES.TRY_AGAIN_LATER)
      ).toBe(true);
    });

    it("should return true for Abnormal Closure (1006)", () => {
      expect(
        isReconnectableCloseCode(WEBSOCKET_CLOSE_CODES.ABNORMAL_CLOSURE)
      ).toBe(true);
    });

    it("should return true for any code other than 1000", () => {
      expect(isReconnectableCloseCode(1002)).toBe(true);
      expect(isReconnectableCloseCode(1014)).toBe(true);
    });
  });
});
