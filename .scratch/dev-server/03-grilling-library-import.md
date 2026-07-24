---
label: wayfinder:grilling
status: closed
assigned: agent
---

# Grilling: Library import strategy in dev-server

## Question

How should `dev-server/` import the `@maxtroost/use-websocket` library source?

Options:
- **Path alias to `../src`** — Vite/TypeScript alias pointing at raw TypeScript; simpler, no build step, but the dev-server is not a realistic consumer (it bypasses the package export)
- **Local workspace linking** — `pnpm-workspace.yaml` + install as `"@maxtroost/use-websocket": "workspace:*"`; realistic consumer, but requires a build step or the library's Vite config to be composable
- **`file:` protocol dep** — `"@maxtroost/use-websocket": "file:.."`; installs a snapshot, no live reload on library changes

The right answer likely turns on whether TanStack Start's Vite config can be extended with the library's unbundled source.

**Blocked by:** ~~`01-research-ts-start-websocket`~~ ✔ resolved. Start uses plain `vite dev`; Vite path aliases work and `vite.config.ts` is fully extensible. **This ticket is now unblocked.**

## Resolution

**Decision: Vite path alias pointing at `../src/index.ts`.**

In `dev-server/vite.config.ts`:
```ts
resolve: {
  alias: {
    '@maxtroost/use-websocket': path.resolve(__dirname, '../src/index.ts'),
  },
}
```

Rationale: the dev-server is never published; it's a development tool for the library author. A path alias gives live HMR on library source changes — no separate build step. The `file:` protocol and workspace linking both require a build to see changes, which breaks the feedback loop.
