# Spec — Consolidate Lifecycle Ownership

**Effort**: consolidate-lifecycle  
**Date**: 2026-07-24  
**Prototype**: `src/lib/lifecycle-prototype.ts` (branch `feature/code-review`)

## What this changes

Three targeted changes across two class files and one hook. No public API surface changes.

### 1. `WebsocketSubscriptionApi` — rename + slim `disconnect()`

**File**: `src/lib/WebsocketSubscriptionApi.ts`

#### 1a. Rename `_handleSubscriptionUpdates` → `_resubscribeIfConnected`

The `&& this._state.state.connected` guard is the invariant — the name should say so.

```diff
- private _handleSubscriptionUpdates(
+ /**
+  * Re-subscribes when body or enabled changes, but ONLY when already connected.
+  * When not connected, addListener→onOpen handles subscription once the socket opens,
+  * preventing the double-subscribe that would occur if we queued a subscribe here
+  * AND onOpen also subscribed on an already-open socket.
+  */
+ private _resubscribeIfConnected(
    previousOptions: WebsocketSubscriptionOptions<TData, TBody>,
    updatedOptions: WebsocketSubscriptionOptions<TData, TBody>
  ): void {
    const bodyChanged = !deepEqual(previousOptions.body, updatedOptions.body);
    const becameEnabled = !previousOptions.enabled && updatedOptions.enabled;

    if ((bodyChanged || becameEnabled) && this._state.state.connected) {
      this.subscribe(updatedOptions.body);
    }
  }
```

Update the call site in the `options` setter:

```diff
- this._handleSubscriptionUpdates(previousOptions, updatedOptions);
+ this._resubscribeIfConnected(previousOptions, updatedOptions);
```

#### 1b. Remove `unsubscribe()` from `disconnect()`

`_handleUnsubscribeOnDisable` fires (via the options setter) before `disconnect()` in every
`enabled=false` scenario. The `unsubscribe()` call inside `disconnect()` always hits the
`if (!this._state.state.subscribed) return` guard — it is dead code. Remove it.

```diff
  public disconnect = (onRemoveFromSocket: () => void): void => {
    this._clearPendingTimeouts();
-   this.unsubscribe();
    this._client.connectionEvent?.({
      type: "subscription:disconnect-attempt",
      uri: this.uri,
      key: this.key,
    });
    this._disconnectTimeout = setTimeout(() => {
```

**What stays the same**: `disconnect()`'s public signature, the delayed state cleanup, and the
`onRemoveFromSocket` callback. `_handleUnsubscribeOnDisable` is unchanged.

---

### 2. `WebsocketMessageApi` — add `options` setter

**File**: `src/lib/WebsocketMessageApi.ts`

Add `deepEqual` import from `fast-equals` (already a project dependency).

Add a public setter that updates all `WebsocketMessageOptions` fields. No lifecycle side effects —
the hook's `useWebsocketLifecycle` owns registry cleanup; the setter owns config state only.

```typescript
// Add import at top:
import { deepEqual } from "fast-equals";

// Add setter after the existing getters:
/**
 * Updates configuration options for this Message API.
 *
 * Uses deep equality to skip no-op updates. Does not trigger lifecycle
 * side effects (disconnect/reconnect is the hook's responsibility via
 * useWebsocketLifecycle).
 */
public set options(options: WebsocketMessageOptions): void {
  if (deepEqual(this._options, options)) return;
  this._options = { ...this._options, ...options };
}
```

**What stays the same**: `sendMessage`, `sendMessageNoWait`, `disconnect`, `reset`, `key`, `url`,
`isEnabled` — all unchanged. No removals.

---

### 3. `useWebsocketMessage` — add `stableOptions` sync

**File**: `src/lib/WebsocketHook.ts`

Mirror the pattern already used in `useWebsocketSubscription`. Add a `stableOptions` memo and a
layout effect that syncs options to the API after each render where options changed.

```diff
  export const useWebsocketMessage = (
    options: WebsocketMessageOptions
  ): WebsocketMessageApiPublic => {
    const client = useWebsocketClient();
    const [messageApi] = useState<WebsocketMessageApi>(() =>
      createWebsocketMessageApi(client, options.key, options)
    );

+   const stableOptions = useDeepCompareMemoize(options);
+
+   useIsomorphicLayoutEffect(() => {
+     messageApi.options = stableOptions;
+   }, [stableOptions, messageApi]);

    useWebsocketLifecycle(messageApi, options.url, options.enabled);

    return messageApi;
  };
```

**What stays the same**: hook signature, return type (`WebsocketMessageApiPublic`), `useWebsocketLifecycle`
call — all unchanged. `useDeepCompareMemoize` and `useIsomorphicLayoutEffect` are already imported
in this file.

---

## What does NOT change

- Public interface of `WebsocketSubscriptionApi` (exported methods, getters, store shape)
- Public interface of `WebsocketMessageApi` (exported methods, getters)
- `useWebsocketSubscription` hook — already has `stableOptions` sync
- `useWebsocketLifecycle` — unchanged
- `WebsocketConnection.addListener` → `onOpen` flow — unchanged
- `_handleUnsubscribeOnDisable` — unchanged
- All `WebsocketSubscriptionApi` subscribe/unsubscribe logic — unchanged beyond rename

---

## TDD commit sequence

Each commit: write the test first (red), then implement (green). Tests pass after every step.

### Commit 1 — Pin the "disconnect sends no unsubscribe" invariant

**Test file**: `src/lib/WebsocketSubscriptionApi.test.ts`

Add to the `disconnect` describe block:

```typescript
it('does not send an unsubscribe message when disconnect is called after disabling', () => {
  const mockSendToConnection = vi.fn<SendToConnectionFn>();
  const api = new WebsocketSubscriptionApi({ url: mockUrl, uri: '/test', key: 'k', enabled: true }, createMockClient());
  api.setSendToConnection(mockSendToConnection);

  // Simulate: socket open → subscribed
  api.onOpen();

  // Simulate: enabled=false via options setter (sends unsubscribe)
  api.options = { url: mockUrl, uri: '/test', key: 'k', enabled: false };

  const callsAfterDisable = mockSendToConnection.mock.calls.length;

  // Simulate: hook calls disconnect()
  api.disconnect(() => {});

  // disconnect() must not have sent an additional message
  expect(mockSendToConnection.mock.calls.length).toBe(callsAfterDisable);
});
```

> **Red**: currently fails if `disconnect()` sends an unsubscribe — verify with `pnpm test:run`.
> If it passes already (the guard catches it), the test still earns its place as a regression pin.

### Commit 2 — Rename + remove dead code

- Rename `_handleSubscriptionUpdates` → `_resubscribeIfConnected` with updated JSDoc
- Update call site in options setter
- Remove `this.unsubscribe()` from `disconnect()`

Run `pnpm test:run` — all tests green.

### Commit 3 — Test `WebsocketMessageApi` options setter

**Test file**: `src/lib/WebsocketMessageApi.test.ts`

```typescript
describe('options setter', () => {
  it('updates enabled and affects isEnabled', () => {
    const api = new WebsocketMessageApi({ url: mockUrl, key: mockKey, enabled: true }, createMockClient());
    api.options = { url: mockUrl, key: mockKey, enabled: false };
    expect(api.isEnabled).toBe(false);
  });

  it('updates responseTimeoutMs and uses new timeout on next sendMessage', () => {
    const api = new WebsocketMessageApi({ url: mockUrl, key: mockKey, responseTimeoutMs: 10000 }, createMockClient());
    api.setSendToConnection(vi.fn<SendToConnectionFn>());
    api.options = { url: mockUrl, key: mockKey, responseTimeoutMs: 100 };

    const promise = api.sendMessage('/test', 'post');
    vi.advanceTimersByTime(100);
    return expect(promise).rejects.toThrow('WebSocket response timeout');
  });

  it('is a no-op when options are deep-equal', () => {
    const onError = vi.fn();
    const api = new WebsocketMessageApi({ url: mockUrl, key: mockKey, onError }, createMockClient());
    api.options = { url: mockUrl, key: mockKey, onError }; // same reference
    // Internal _options should be unchanged — no side effects
    expect(api.isEnabled).toBe(true);
  });

  it('updates onError callback so new errors invoke the new handler', () => {
    const oldHandler = vi.fn();
    const newHandler = vi.fn();
    const api = new WebsocketMessageApi({ url: mockUrl, key: mockKey, onError: oldHandler }, createMockClient());
    api.options = { url: mockUrl, key: mockKey, onError: newHandler };
    api.onError({ type: 'transport', event: new Event('error') });
    expect(newHandler).toHaveBeenCalledTimes(1);
    expect(oldHandler).not.toHaveBeenCalled();
  });
});
```

> **Red**: all four fail — setter doesn't exist.

### Commit 4 — Add `options` setter to `WebsocketMessageApi`

- Add `deepEqual` import from `fast-equals`
- Add the `options` setter as specified above

Run `pnpm test:run` — green.

### Commit 5 — Test `useWebsocketMessage` options sync

**Test file**: `src/lib/WebsocketHook.ts` tests (or `WebsocketProvider.test.tsx` pattern)

```typescript
it('propagates responseTimeoutMs change to the message api after re-render', async () => {
  const client = new WebsocketClient({});
  const { rerender } = renderHook(
    ({ timeout }) =>
      useWebsocketMessage({ url: 'wss://test', key: 'msg-key', responseTimeoutMs: timeout }),
    {
      wrapper: ({ children }) => (
        <WebsocketClientProvider client={client}>{children}</WebsocketClientProvider>
      ),
      initialProps: { timeout: 10000 },
    }
  );

  const api = client.getListener('msg-key', 'message')!;
  expect(api.isEnabled).toBe(true);

  rerender({ timeout: 500 });

  // After re-render, the api should reflect the new timeout
  // (tested indirectly: a sendMessage now times out at 500ms)
  const mockSend = vi.fn();
  api.setSendToConnection(mockSend);
  const promise = (api as any).sendMessage('/test', 'post');
  vi.advanceTimersByTime(500);
  await expect(promise).rejects.toThrow('WebSocket response timeout');
});
```

> **Red**: fails — `useWebsocketMessage` doesn't sync options, so `responseTimeoutMs` stays at 10000.

### Commit 6 — Add `stableOptions` sync to `useWebsocketMessage`

- Add `stableOptions` memo and layout effect as specified above

Run `pnpm test:run` — green.

### Commit 7 — Delete the prototype

Remove `src/lib/lifecycle-prototype.ts` and the `prototype` script from `package.json`.

---

## Edge cases covered by the commit sequence

| Scenario | Covered by |
|---|---|
| `disconnect()` sends no unsubscribe after options-setter already did | Commit 1 test |
| Body change re-subscribe only when connected | Existing test from `62e624b` |
| `enabled` false→true re-subscribe only when connected | Existing test from `62e624b` |
| `enabled` false→true when not connected → `onOpen` handles it | Existing test from `62e624b` |
| MessageApi `enabled` change reflected in `isEnabled` | Commit 3 test |
| MessageApi timeout change takes effect on next send | Commit 3 + 5 test |
| MessageApi callback update routes to new handler | Commit 3 test |
| `useWebsocketMessage` propagates option changes after re-render | Commit 5 test |

---

## Files touched

| File | Change |
|---|---|
| `src/lib/WebsocketSubscriptionApi.ts` | rename method, remove dead call |
| `src/lib/WebsocketMessageApi.ts` | add import + `options` setter |
| `src/lib/WebsocketHook.ts` | add `stableOptions` + sync effect to `useWebsocketMessage` |
| `src/lib/WebsocketSubscriptionApi.test.ts` | add disconnect invariant test |
| `src/lib/WebsocketMessageApi.test.ts` | add options setter tests |
| `src/lib/WebsocketHook.ts` test file | add options sync test |
| `src/lib/lifecycle-prototype.ts` | delete (commit 7) |
| `package.json` | remove `prototype` script (commit 7) |
