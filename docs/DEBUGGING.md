# Debugging guide

## First checks

1. Run `npm run verify`; compile failures usually identify stale imports or
   unsupported browser globals.
2. Load the unpacked build from `.output/chrome-mv3/`, not the source directory.
3. Inspect the provider page console and the extension service-worker console.
4. In development, debug messages are enabled. Production builds retain
   info/warn/error messages but suppress debug-level output.

## Common failures

| Symptom | Where to look | What to check |
| --- | --- | --- |
| Extension will not load | `.output/chrome-mv3/manifest.json`, `wxt.config.ts` | Rebuild, then check manifest generation and permissions. |
| Popup button does nothing | `entrypoints/popup/App.tsx` | Confirm the active tab hostname is supported and inspect popup/service-worker errors. |
| Search panel does not open with Cmd/Ctrl+X | `entrypoints/<provider>.content.ts`, `src/renderer/app/root-attach/observer.ts` | Confirm the matching content script is present and the page is not owned by a stale extension instance. |
| Popup says no message receiver | `entrypoints/popup/App.tsx` | Reload the page or extension; the recovery path removes `#aiworkspace-root`, injects the provider script, and retries. |
| Panel appears but has no results | `src/search/search-service.ts`, `src/storage/storage-client.ts` | Check the background service-worker console for storage response errors and verify the provider sync ran. |
| Provider sync never saves data | `src/providers/<provider>/source-reader.ts`, `<provider>-source.ts` | Check the provider database name, store/index names, schema validation, and provider-page console. |
| Existing conversations are missing | `src/sync/sync-engine.ts`, `src/storage/database.ts` | Inspect the provider checkpoint and confirm the provider tab has permission and an open source database. |
| New messages are delayed | `src/sync/provider-watcher.ts`, `src/sync/sync-coordinator.ts` | Check focus/visibility events, probe timers, retry delays, and the one-minute heartbeat. |
| Search results are unexpectedly filtered | `src/renderer/features/search/hooks/useSearchPanel.ts`, `src/search/search.ts` | Clear provider, role, date, and titles-only filters; verify the query terms. |
| Search shows an error or stale results | `src/renderer/features/search/hooks/useConversationSearch.ts` | Check abort/retry behavior and whether the background `get-conversations` request completed. |
| Data does not survive reload | `src/storage/database.ts`, `src/storage/conversation-repository.ts` | Inspect the `AiWorkspaceDB` `records` and `syncState` tables and check IndexedDB errors. |

## Storage and contract inspection

The extension database is `AiWorkspaceDB`; provider databases are documented in
[ARCHITECTURE.md](./ARCHITECTURE.md). Runtime message definitions live under
`src/shared/contracts/`. Do not change message strings, storage keys, database
names, or IndexedDB schemas while debugging.

