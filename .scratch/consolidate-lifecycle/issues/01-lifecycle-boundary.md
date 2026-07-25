Status: resolved
Type: grilling

## Question

What exactly constitutes "the API owns lifecycle"? Specifically:

1. For `WebsocketSubscriptionApi`: the `options` setter currently handles subscribe (body change, `enabled` false→true when connected) and unsubscribe (`enabled` true→false). The hook's `useWebsocketLifecycle` also calls `listener.disconnect()` when `enabled=false`. What is the intended split after the refactor — what does the hook *keep*, and what moves entirely into the API?

2. The `disconnect()` method on the API currently needs a callback (`onRemoveFromSocket`) to remove itself from the connection registry. If the API is to own the full disconnect flow, does it call `removeWebsocketListenerFromConnection` itself (it already holds `this._client`), or does the hook always supply the callback?

3. Is `useWebsocketLifecycle`'s job after the refactor just: `addListener` (when enabled) and `unregisterHook` (on unmount)? Or does the hook keep any lifecycle decision logic?

Resolve by grilling — one question at a time.

## Answer

The boundary locks in four decisions:

**1. API owns server protocol; hook owns registry lifetime.**
`WebsocketSubscriptionApi`'s options setter is responsible for subscribe/unsubscribe server messages. `useWebsocketLifecycle` keeps `addListener` (when enabled) and `disconnect(callback)` (when disabled). These are different concerns: server protocol vs connection registry.

**2. `disconnect()` removes its redundant `unsubscribe()` call.**
The options setter's `_handleUnsubscribeOnDisable` fires before the hook's `disconnect()` call in every scenario where `enabled` changes. The `unsubscribe()` inside `disconnect()` therefore always hits the `if (!subscribed) return` guard — it is dead code. The spec removes it. `disconnect()` becomes: clear timers + schedule state cleanup + invoke registry-removal callback.

**3. `_handleSubscriptionUpdates` is renamed to express the invariant.**
The `&& this._state.state.connected` guard stays — it is correct. The rename (e.g. `_resubscribeIfConnected`) makes the invariant ("only act via this path when already connected; `onOpen` handles the not-connected case") readable without a comment.

**4. `WebsocketMessageApi` gets a full `options` setter; `useWebsocketMessage` syncs options.**
The message API currently has no options setter — options are frozen at construction. The spec adds a setter covering all `WebsocketMessageOptions` fields (`enabled`, `responseTimeoutMs`, `onError`, `onMessageError`, `onClose`). `useWebsocketMessage` gains a `stableOptions` sync layout effect mirroring `useWebsocketSubscription`. The setter has no subscribe/unsubscribe logic — it updates config fields only, so the dual-path risk does not apply.
