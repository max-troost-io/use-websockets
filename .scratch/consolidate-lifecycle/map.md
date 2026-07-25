## Destination

A spec — with a TDD commit sequence — that consolidates subscription lifecycle ownership into `WebsocketSubscriptionApi` and `WebsocketMessageApi`. Both APIs decide when to subscribe/unsubscribe/disconnect; `useWebsocketLifecycle` becomes a thin registration layer. No breaking changes to public API surface.

## Notes

- Domain: `src/lib/` — `WebsocketSubscriptionApi.ts`, `WebsocketMessageApi.ts`, `WebsocketHook.ts`
- Skills per session: `/codebase-design` vocabulary (module, seam, depth, locality); `/grilling`; `/domain-modeling`; `/tdd`
- Public constraint: `WebsocketSubscriptionApi` and `WebsocketMessageApi` are exported; no interface removals or signature changes
- Active bug context: commit `62e624b` patched a double-subscribe with `&& connected` — the root cause (split lifecycle) is what this effort eliminates
- Scope: both `WebsocketSubscriptionApi` and `WebsocketMessageApi`

## Decisions so far

- [Assess WebsocketMessageApi lifecycle split](./issues/03-message-api-assessment.md) — No lifecycle split exists; the analogous change is an option-sync gap in `useWebsocketMessage` (not a subscribe/unsubscribe dual-path). Spec covers `WebsocketSubscriptionApi` as the main structural change; message API gets a targeted options-sync addition.
- [Define the lifecycle boundary](./issues/01-lifecycle-boundary.md) — API owns server protocol (subscribe/unsubscribe messages); hook owns registry lifetime (add/remove from connection). `disconnect()` drops its redundant `unsubscribe()`. `_handleSubscriptionUpdates` renamed to express the `&& connected` invariant. `WebsocketMessageApi` gets a full options setter; `useWebsocketMessage` gains a `stableOptions` sync effect.
- [Design the WebsocketSubscriptionApi lifecycle interface](./issues/02-subscription-api-design.md) — Prototype validated: `_resubscribeIfConnected` (renamed) + `_handleUnsubscribeOnDisable` + slimmed `disconnect()` handle all edge cases correctly. No double-subscribe in any scenario. `onClose` correctly sends no cleanup messages.
- [Write the spec](./issues/04-write-spec.md) — Spec at `.scratch/consolidate-lifecycle/spec.md`: 3 file changes, 7 TDD commits, 8 edge cases. Map complete.
- [Is passing raw options.url/enabled to useWebsocketLifecycle safe?](./issues/05-lifecycle-stable-options-scope.md) — Safe. Both are primitives; React's `Object.is` dep comparison extracts scalar values before comparing, so a new `options` object with the same url/enabled is already stable. Code-review finding was a false alarm.

## Not yet specified

_Nothing. All decisions resolved. Map complete._

## Out of scope

- `WebsocketConnection.helpers.ts` collapse (Candidate A — separate effort)
- `WebsocketClient` internal stores (Candidate C — separate effort)
- Any changes to the hook public API (`useWebsocketSubscription`, `useWebsocketMessage` signatures)
- `WebsocketConnection.ts` internals
