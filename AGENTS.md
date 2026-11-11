# AI agent briefing

## Purpose

AI Workspace is a WXT/React browser extension that synchronizes local
conversations from ChatGPT, Claude, Gemini, and Grok into a Dexie database and
searches them from an in-page shadow-DOM panel.

## Folder map

- `entrypoints/`: WXT background, provider content scripts, ChatGPT MAIN-world
  hook, generic content entrypoint, and popup.
- `src/providers/`: provider IndexedDB readers, adapters, and normalizers.
- `src/sync/`: provider-neutral synchronization, watcher, and coordinator.
- `src/storage/`: Dexie database, repository, validation, and storage client.
- `src/search/`: pure search engine and storage-backed search service.
- `src/shared/models/`: shared conversation and checkpoint models.
- `src/shared/contracts/`: runtime message contracts.
- `src/renderer/`: app shell, search UI, shadow styles, and design system.
- `test/`: Vitest setup and characterization/smoke tests.

## Commands

```bash
npm install
npm run dev
npm run compile
npm run lint
npm test
npm run build
npm run verify
```

Use [SMOKE_TEST.md](./SMOKE_TEST.md) for browser verification and
[docs/DEBUGGING.md](./docs/DEBUGGING.md) for failure triage.

## Conventions

- Make one small logical change per commit.
- Preserve existing provider behavior and source ordering.
- Keep provider-specific logic behind `ProviderSource`.
- Keep renderer code behind the search service boundary; do not read storage from
  UI components.
- Use the shared logger in `src/shared/logging/logger.ts`.
- Prefer explicit guards and typed contracts at browser/runtime boundaries.

## Do not change

- Runtime message names and payload shapes.
- DOM event names, host IDs, keyboard shortcuts, or provider match patterns.
- `AiWorkspaceDB`, provider database names, storage keys, indexes, or schemas.
- Manifest permissions and host permissions.
- Conversation key formats and normalized data fields.
- Provider source cursor semantics.

## Verification

Before reporting a change as complete, run `npm run verify`, inspect the generated
manifest, and run the relevant entries in `SMOKE_TEST.md`. Do not claim a live
browser check passed unless it was actually performed.
