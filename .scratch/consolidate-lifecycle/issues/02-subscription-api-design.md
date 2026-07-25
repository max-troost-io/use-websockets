Status: resolved
Blocked by: 01

Type: prototype

## Question

Given the boundary defined in [Define the lifecycle boundary](./01-lifecycle-boundary.md), what does the new internal structure of `WebsocketSubscriptionApi` look like in code?

Specifically:
- Does `_handleSubscriptionUpdates` change, or is it replaced with a cleaner private method?
- Does `_handleUnsubscribeOnDisable` merge into the options setter or become its own clear path?
- How is the `&& connected` guard replaced — what is the positive statement of the invariant it was protecting?
- Does the `options` setter body become a 3–5 line delegation to renamed private methods that each have a single clear responsibility?

Resolve by writing a prototype of the new `WebsocketSubscriptionApi` internal structure — just the lifecycle-related methods, not the full class. Use `/prototype` skill. Link the prototype as an asset from this ticket.

## Answer

**Verdict: logic is correct — all scenarios behaved as expected.**

Prototype: `src/lib/lifecycle-prototype.ts` (branch `feature/code-review`). Logic module is the isolated pure reducer at the top of the file; TUI shell below.

**Validated transitions:**

| Scenario | Result |
|---|---|
| `onOpen` | 1 subscribe, from `onOpen` |
| Connected + body change | 1 re-subscribe, from `_resubscribeIfConnected` |
| Connected + disable | 1 unsubscribe, from `_handleUnsubscribeOnDisable`; `disconnect()` sends nothing |
| Connected + disable + re-enable | 1 subscribe, from `_resubscribeIfConnected` (guard: `connected=true`) |
| Not connected + re-enable + `onOpen` | 1 subscribe, from `onOpen` only (guard: `connected=false` blocked options setter path) |
| Close + `onOpen` (reconnect) | 1 subscribe from `onOpen` — no double |

**New method names that felt right in the prototype:**
- `_resubscribeIfConnected` — self-documenting; the invariant (`connected` guard) is the name
- `_handleUnsubscribeOnDisable` — unchanged; already clear
- `disconnect()` — body shrinks; note "no unsubscribe" is the key change

**`onClose` correctly sends no cleanup** — it only resets state flags. Registry cleanup is `WebsocketConnection`'s responsibility on final teardown, not the listener's on each close event.
