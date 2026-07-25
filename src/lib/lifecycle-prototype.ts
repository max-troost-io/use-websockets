// PROTOTYPE — throwaway. Answers: "Does the new WebsocketSubscriptionApi lifecycle
// logic handle all edge cases correctly after the consolidate-lifecycle refactor?"
//
// Run: pnpm prototype
//
// Question being answered:
//   After the refactor (ticket 01 boundary decisions):
//   1. _handleSubscriptionUpdates → renamed _resubscribeIfConnected
//   2. unsubscribe() removed from disconnect()
//   3. disconnect() = clear timers + state cleanup + registry callback only
//   Does this handle all edge cases without double-subscribing or missing unsubscribes?
//
// Logic module is ISOLATED below (──── LOGIC ────) and can be lifted into the real
// WebsocketSubscriptionApi once validated. TUI shell is below (──── TUI ────).

// ─────────────────────────────────────────────────────────────────────────────
// ──── LOGIC MODULE ────
// Portable: no I/O, no terminal code.
// ─────────────────────────────────────────────────────────────────────────────

export interface LifecycleState {
  connected: boolean;
  subscribed: boolean;
  pendingSubscription: boolean;
  enabled: boolean;
  body: string; // simplified as string label ("none" | "body-A" | "body-B")
}

export interface ServerMessage {
  method: "subscribe" | "unsubscribe";
  source: string; // which method sent it — key observable
}

export interface Transition {
  state: LifecycleState;
  messages: ServerMessage[];
  notes: string[];
}

export const INITIAL_STATE: LifecycleState = {
  connected: false,
  subscribed: false,
  pendingSubscription: false,
  enabled: true,
  body: "none",
};

// ── Options setter path ──────────────────────────────────────────────────────

/**
 * _resubscribeIfConnected (renamed from _handleSubscriptionUpdates)
 * Invariant: only acts when already connected. When not connected,
 * addListener→onOpen handles subscription once the socket opens.
 */
function _resubscribeIfConnected(
  prev: LifecycleState,
  next: { enabled: boolean; body: string },
  state: LifecycleState
): { state: LifecycleState; messages: ServerMessage[] } {
  const bodyChanged = prev.body !== next.body;
  const becameEnabled = !prev.enabled && next.enabled;

  if ((bodyChanged || becameEnabled) && state.connected) {
    return {
      state: { ...state, subscribed: true, pendingSubscription: true },
      messages: [{ method: "subscribe", source: "_resubscribeIfConnected" }],
    };
  }
  return { state, messages: [] };
}

/**
 * _handleUnsubscribeOnDisable — unchanged name, same logic.
 * Sends unsubscribe when disabled while subscribed.
 */
function _handleUnsubscribeOnDisable(
  prev: LifecycleState,
  next: { enabled: boolean },
  state: LifecycleState
): { state: LifecycleState; messages: ServerMessage[] } {
  const isDisabled = !next.enabled;
  const wasEnabled = prev.enabled;

  if (isDisabled && wasEnabled && state.subscribed) {
    return {
      state: { ...state, subscribed: false, pendingSubscription: false },
      messages: [{ method: "unsubscribe", source: "_handleUnsubscribeOnDisable" }],
    };
  }
  return { state, messages: [] };
}

/**
 * The options setter — calls both helpers in order.
 */
export function applyOptions(
  current: LifecycleState,
  newOptions: { enabled: boolean; body: string }
): Transition {
  // Deep-equal guard (simplified: check fields directly)
  if (current.enabled === newOptions.enabled && current.body === newOptions.body) {
    return { state: current, messages: [], notes: ["options: no change (deep-equal guard)"] };
  }

  const messages: ServerMessage[] = [];
  let state = current;
  const notes: string[] = [];

  // Step 1: _resubscribeIfConnected
  const r = _resubscribeIfConnected(current, newOptions, state);
  state = r.state;
  messages.push(...r.messages);
  if (r.messages.length) notes.push("_resubscribeIfConnected fired");

  // Step 2: _handleUnsubscribeOnDisable
  const u = _handleUnsubscribeOnDisable(current, newOptions, state);
  state = u.state;
  messages.push(...u.messages);
  if (u.messages.length) notes.push("_handleUnsubscribeOnDisable fired");

  // Apply new options
  state = { ...state, enabled: newOptions.enabled, body: newOptions.body };

  if (!messages.length) notes.push("options: changed but no lifecycle action");
  return { state, messages, notes };
}

// ── Connection events ────────────────────────────────────────────────────────

/**
 * onOpen — called by WebsocketConnection when socket opens.
 * Guard: returns early if already connected (prevents double-subscribe).
 */
export function onOpen(current: LifecycleState): Transition {
  if (current.connected) {
    return { state: current, messages: [], notes: ["onOpen: already connected — skipped"] };
  }
  if (!current.enabled) {
    return { state: current, messages: [], notes: ["onOpen: disabled — skipped"] };
  }
  return {
    state: { ...current, connected: true, subscribed: true, pendingSubscription: true },
    messages: [{ method: "subscribe", source: "onOpen" }],
    notes: ["onOpen: connected=true, subscribed"],
  };
}

/**
 * onClose — called by WebsocketConnection when socket closes.
 */
export function onClose(current: LifecycleState): Transition {
  return {
    state: { ...current, connected: false, subscribed: false, pendingSubscription: false, body: current.body },
    messages: [],
    notes: ["onClose: connected=false, subscribed=false"],
  };
}

/**
 * disconnect() — NEW: no unsubscribe() call.
 * Was: clear timers + unsubscribe() + schedule state cleanup + registry callback
 * Now: clear timers + schedule state cleanup + registry callback
 * The options setter (_handleUnsubscribeOnDisable) already sent the unsubscribe.
 */
export function disconnect(current: LifecycleState): Transition {
  // Simulates the delayed state reset (INITIATOR_REMOVAL_DELAY_MS)
  return {
    state: { ...current, connected: false, subscribed: false, pendingSubscription: false },
    messages: [], // KEY CHANGE: no unsubscribe message here
    notes: ["disconnect(): state cleared, registry removal scheduled — NO unsubscribe sent (options setter handles it)"],
  };
}

/**
 * reset() — called by WebsocketConnection on URL change / reconnect.
 */
export function reset(current: LifecycleState): Transition {
  if (!current.connected) {
    return { state: current, messages: [], notes: ["reset: not connected — no-op"] };
  }
  return {
    state: { ...current, connected: false, subscribed: false, pendingSubscription: false },
    messages: [],
    notes: ["reset: cleared for reconnect"],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ──── TUI SHELL ────
// Imports the logic module above. No logic lives here.
// ─────────────────────────────────────────────────────────────────────────────

import * as readline from "node:readline";

const B = "\x1b[1m"; // bold
const D = "\x1b[2m"; // dim
const R = "\x1b[0m"; // reset
const G = "\x1b[32m"; // green
const Y = "\x1b[33m"; // yellow
const RE = "\x1b[31m"; // red
const C = "\x1b[36m"; // cyan

let state: LifecycleState = { ...INITIAL_STATE };
let history: Array<{ event: string; messages: ServerMessage[]; notes: string[] }> = [];
let totalSubscribes = 0;
let totalUnsubscribes = 0;
let bodyOptions = ["none", "body-A", "body-B"];
let bodyIndex = 0;

function applyTransition(eventLabel: string, t: Transition) {
  state = t.state;
  totalSubscribes += t.messages.filter((m) => m.method === "subscribe").length;
  totalUnsubscribes += t.messages.filter((m) => m.method === "unsubscribe").length;
  history.unshift({ event: eventLabel, messages: t.messages, notes: t.notes });
  if (history.length > 8) history.pop();
  render();
}

function bool(v: boolean) {
  return v ? `${G}true${R}` : `${RE}false${R}`;
}

function render() {
  console.clear();
  console.log(`${B}╔══════════════════════════════════════════════════════════╗${R}`);
  console.log(`${B}║  PROTOTYPE — WebsocketSubscriptionApi lifecycle model    ║${R}`);
  console.log(`${B}╚══════════════════════════════════════════════════════════╝${R}`);
  console.log();

  // State
  console.log(`${B}State${R}`);
  console.log(`  connected         ${bool(state.connected)}`);
  console.log(`  subscribed        ${bool(state.subscribed)}`);
  console.log(`  pendingSubscription ${bool(state.pendingSubscription)}`);
  console.log(`  enabled           ${bool(state.enabled)}`);
  console.log(`  body              ${C}${state.body}${R}`);
  console.log();

  // Counters
  const doubleFlag = totalSubscribes > Math.max(1, history.filter(h => h.event === 'onOpen').length + history.filter(h => h.event.includes('SET_OPTIONS')).length);
  console.log(`${B}Message counters${R}   ${D}(since start)${R}`);
  console.log(`  subscribes   ${G}${totalSubscribes}${R}   unsubscribes ${Y}${totalUnsubscribes}${R}`);
  console.log();

  // History
  console.log(`${B}Recent events${R}  ${D}(newest first)${R}`);
  for (const h of history) {
    const msgs = h.messages.map(m =>
      m.method === "subscribe"
        ? `${G}↑ ${m.method}${R} ${D}(${m.source})${R}`
        : `${Y}↓ ${m.method}${R} ${D}(${m.source})${R}`
    ).join("  ");
    console.log(`  ${B}${h.event.padEnd(22)}${R} ${msgs || D + "no messages" + R}`);
    for (const n of h.notes) {
      console.log(`  ${D}                       ${n}${R}`);
    }
  }
  console.log();

  // Keyboard shortcuts
  console.log(`${B}Controls${R}`);
  console.log(`  ${B}[o]${R} ${D}onOpen (socket opened)${R}     ${B}[c]${R} ${D}onClose (socket closed)${R}`);
  console.log(`  ${B}[e]${R} ${D}toggle enabled${R}              ${B}[b]${R} ${D}cycle body${R}`);
  console.log(`  ${B}[d]${R} ${D}disconnect()${R}                ${B}[r]${R} ${D}reset()${R}`);
  console.log(`  ${B}[x]${R} ${D}clear counters + history${R}    ${B}[q]${R} ${D}quit${R}`);
  console.log();
  console.log(`${D}Scenarios to try:${R}`);
  console.log(`  ${D}1. [o] → [b] → expect 1 re-subscribe${R}`);
  console.log(`  ${D}2. [o] → [e] → expect 1 unsubscribe (options setter), then [d] → no extra unsubscribe${R}`);
  console.log(`  ${D}3. [o] → [e] → [e] → expect 1 subscribe (already connected)${R}`);
  console.log(`  ${D}4. [o] → [c] → [e] → [e] → [o] → expect 1 subscribe from onOpen only${R}`);
}

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

render();

process.stdin.on("keypress", (_str, key) => {
  if (!key) return;

  switch (key.name) {
    case "q":
      process.stdout.write("\x1b[0m\n");
      process.exit(0);
      break;

    case "c":
      if (key.ctrl) {
        process.stdout.write("\x1b[0m\n");
        process.exit(0);
      }
      applyTransition("onClose", onClose(state));
      break;

    case "o":
      applyTransition("onOpen", onOpen(state));
      break;

    case "e": {
      const next = { enabled: !state.enabled, body: state.body };
      applyTransition(`SET_OPTIONS enabled=${next.enabled}`, applyOptions(state, next));
      break;
    }

    case "b": {
      bodyIndex = (bodyIndex + 1) % bodyOptions.length;
      const next = { enabled: state.enabled, body: bodyOptions[bodyIndex] };
      applyTransition(`SET_OPTIONS body=${next.body}`, applyOptions(state, next));
      break;
    }

    case "d":
      applyTransition("disconnect()", disconnect(state));
      break;

    case "r":
      applyTransition("reset()", reset(state));
      break;

    case "x":
      history = [];
      totalSubscribes = 0;
      totalUnsubscribes = 0;
      render();
      break;
  }
});
