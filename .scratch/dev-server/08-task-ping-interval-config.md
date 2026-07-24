---
label: wayfinder:task
status: closed
assigned: agent
---

# Task: Add `pingIntervalMs` to `HeartbeatConfig`

## Question

The heartbeat ping interval is hardcoded at 40s in `getPingTime()` in `WebsocketConnection.helpers.ts`. It cannot be overridden by consumers. The heartbeat scenario in the dev-server needs a short interval (≈ 5s) to be demonstrable in real time.

Add `pingIntervalMs` as an optional field to `HeartbeatConfig` and `WebsocketClientOverrides.heartbeat`:

```ts
// types.ts
export interface HeartbeatConfig {
  enabled: boolean;
  pongTimeoutMs: number;
  pingIntervalMs?: number; // defaults to 40_000 if not set
}
```

And update `getPingTime()` (or wherever the interval is consumed) to read from the config rather than returning a hardcoded value.

This is a non-breaking additive change — existing callers receive the same 40s default.

**Blocked by:** none — pure library change, can be done independently.

## Resolution

**Done.** Added `pingIntervalMs?: number` to `HeartbeatConfig` in `src/lib/types.ts`. Updated `schedulePing()` in `WebsocketConnection.ts` to use `this._client.heartbeat.pingIntervalMs ?? getPingTime()`. `getPingTime()` and its test are unchanged. All 169 tests pass.
