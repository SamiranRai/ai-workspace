# AI Workspace

AI Workspace is a WXT browser extension that searches conversations from ChatGPT,
Claude, Gemini, and Grok in one in-page workspace. It reads each provider's local
IndexedDB data, normalizes it into a shared model, stores a local searchable copy,
and mounts a React search panel inside supported AI sites.

## Stack

- WXT and Chrome MV3 (Firefox build is also configured)
- TypeScript
- React and React DOM
- Dexie over IndexedDB
- Vitest with happy-dom and fake IndexedDB

## Requirements

- Node.js and npm
- A Chromium-based browser for the primary manual smoke test
- A signed-in supported AI site for live synchronization checks

## Install

```bash
npm install
```

## Develop

```bash
npm run dev
```

Load the generated `.output/chrome-mv3-dev/` directory as an unpacked extension.
The development build enables verbose debug logging through the shared logger.

## Build and verify

```bash
npm run compile       # TypeScript check
npm run lint          # Existing TypeScript validation alias
npm test              # Vitest
npm run build         # Chrome MV3 production build
npm run verify        # compile, lint, test, and build
```

Firefox commands are available as `npm run dev:firefox` and
`npm run build:firefox`. Package commands are `npm run zip` and
`npm run zip:firefox`.

## Manual testing

Use [SMOKE_TEST.md](./SMOKE_TEST.md) before and after refactors. It covers
extension loading, popup and keyboard entry points, provider synchronization,
search/filter behavior, recent searches, and stale content-script recovery.

## Release

Run `npm run verify`, perform the full smoke checklist, then create the browser
package with `npm run zip` (or `npm run zip:firefox`). Inspect the generated
package before distribution.

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Debugging guide](./docs/DEBUGGING.md)
- [AI agent briefing](./AGENTS.md)
- [Cleanup questions](./QUESTIONS.md)

