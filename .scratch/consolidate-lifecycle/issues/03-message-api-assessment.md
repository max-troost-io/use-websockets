Status: resolved

Type: research

## Question

Does `WebsocketMessageApi` have the same lifecycle split as `WebsocketSubscriptionApi`?

Investigate:
1. Does the message API's `options` setter (if any) contain subscribe/disconnect logic that duplicates what `useWebsocketLifecycle` does?
2. Does `disconnect()` on `WebsocketMessageApi` have the same dual-path structure (hook calls disconnect + something internal also fires)?
3. Is the `enabled=false` flow in `WebsocketMessageApi` handled in one place, or split?
4. What is the analogous deepening for `WebsocketMessageApi`? Is it smaller or larger than the subscription API change?

Resolve by reading `WebsocketMessageApi.ts` and `WebsocketHook.ts`'s `useWebsocketMessage` thoroughly. No external research needed — answer from the codebase.

## Answer

**`WebsocketMessageApi` does NOT have the same lifecycle split.**

1. **No `options` setter.** `WebsocketMessageApi` has no `options` setter. `useWebsocketMessage` creates the API once via `useState` initializer and never syncs options back to it after construction. There is no `useIsomorphicLayoutEffect(() => { api.options = stableOptions })` in `useWebsocketMessage`. This means the dual-path trigger (options setter + addListener→onOpen) simply doesn't exist.

2. **`disconnect()` is single-path.** The `disconnect()` method just schedules `onRemoveFromSocket()` after `INITIATOR_REMOVAL_DELAY_MS`. No parallel unsubscribe path.

3. **`enabled=false` is handled in one place** — `useWebsocketLifecycle` calls `listener.disconnect()`. No options setter fires alongside it.

4. **The analogous deepening is different in nature.** The message API's gap is that `useWebsocketMessage` doesn't sync options changes at all (if `responseTimeoutMs` or `enabled` changes after mount, it's silently ignored). This is an option-sync gap, not a lifecycle split. Bringing it into scope means the spec should address: should `useWebsocketMessage` get a `stableOptions` sync like `useWebsocketSubscription`? The answer likely touches `enabled` only (since `responseTimeoutMs` has a separate `setResponseTimeoutMs` flow via `WebsocketClient.setMessageResponseTimeoutMs`).

**Implication for the spec**: The bulk of the structural change is in `WebsocketSubscriptionApi`. For `WebsocketMessageApi`, the spec should address the options-sync gap as a targeted, smaller addition — not the same refactor.
