Status: resolved
Blocked by: 02

Type: task

## Question

Write the full spec for the lifecycle consolidation refactor.

The spec must cover:
1. **What changes** — for each API and the hook, a precise description of the structural change
2. **What stays the same** — public interface unchanged (no breaking changes)
3. **TDD commit sequence** — ordered list of commits, each: test first (red), then implementation (green). Each commit must be independently safe (tests pass after each step).
4. **Edge cases to test** — the scenarios that must have test coverage: double-subscribe prevention, `enabled` false→true when connected, `enabled` false→true when not connected, body change re-subscribe, disconnect on unmount, `replaceUrl` + options-change race

The spec is a markdown file at `.scratch/consolidate-lifecycle/spec.md`.

Resolve by writing the spec.

## Answer

Spec written at [`.scratch/consolidate-lifecycle/spec.md`](../spec.md).

Covers: 3 file changes (SubscriptionApi rename+slim, MessageApi options setter, hook sync), 7 TDD commits, 8 edge-case scenarios, files-touched table.
