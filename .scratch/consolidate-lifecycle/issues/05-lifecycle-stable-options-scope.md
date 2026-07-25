Type: grilling
Status: resolved

## Question

The spec added a `stableOptions` deep-memoize sync for `useWebsocketMessage`, but `useWebsocketLifecycle` still receives raw `options.url` / `options.enabled` in both hooks:

```ts
// useWebsocketSubscription — unchanged, pre-existing pattern
useWebsocketLifecycle(subscriptionApi, options.url, options.enabled);

// useWebsocketMessage — the flagged code
useWebsocketLifecycle(messageApi, options.url, options.enabled);
```

The code review flagged the message hook line as "looks right, but wrong": a referentially-new-but-value-equal URL could trigger a spurious lifecycle reconnect even though `stableOptions` was unchanged.

The counter-argument (from investigation): `url` is `string` and `enabled` is `boolean | undefined` — both primitives. React compares hook dependencies with `===`, so primitive value equality is already stable. `useDeepCompareMemoize` adds value for object fields (`body`, `onError`, etc.); it buys nothing for these two fields.

The pattern is symmetric: `useWebsocketSubscription` does the identical thing and was not flagged.

**Decide**: Is passing raw `options.url` / `options.enabled` to `useWebsocketLifecycle` safe as-is, or does the deep-memoize guard need to extend to the lifecycle call? If safe, close the finding. If not, what breaks, in what scenario, and what is the fix?

## Answer

Safe as-is. `url` is `string` and `enabled` is `boolean | undefined` — both primitives. React's dependency comparison uses `Object.is` on each slot individually; it never sees the `options` object wrapper, only the extracted scalar values. A new `options` reference with the same `url` and `enabled` values produces identical dep-slot comparisons, so the lifecycle effects never re-run. The `stableOptions` + setter pattern is needed for object-typed fields (`onError`, `body`, etc.) but buys nothing here. The code-review finding is a false alarm. The symmetric pattern in `useWebsocketSubscription` is correct for the same reason.
