# Architecture

## What the system does

AI Workspace is a browser extension that mounts a search panel inside supported AI
chat sites. It reads conversations from each provider's origin IndexedDB database,
normalizes them into one shared conversation model, synchronizes them into the
extension's own Dexie database, and searches the combined local library. A popup
opens the in-page search panel in the active supported tab; the panel can search
conversation titles and messages across ChatGPT, Claude, Gemini, and Grok.

## Repository map

| Folder | Owns |
| --- | --- |
| `entrypoints/` | WXT extension entrypoints: background service worker, provider content scripts, ChatGPT's MAIN-world IndexedDB hook, generic content script, and popup. |
| `src/providers/` | Provider-specific origin database adapters, schema readers, raw-data normalizers, and the ChatGPT write hook support. |
| `src/sync/` | Provider-neutral source contract, delta synchronization engine, provider lifecycle watcher, background coordinator, and sync messages. |
| `src/storage/` | Extension-owned Dexie database, repository operations, runtime-message client/server types, and payload validation. |
| `src/search/` | Pure synchronous/asynchronous conversation search, filtering, matching, highlighting, snippets, and scoring. |
| `src/renderer/` | In-page React application, shadow-DOM mounting, search feature UI/hooks, shared components, icons, and design-system styles. The application shell is under `src/renderer/app/`. |
| `src/shared/models/` | Shared conversation/message and sync-checkpoint data types. |
| `src/shared/contracts/` | Runtime storage and synchronization message names, payloads, and response types. |
| `src/shared/logging/` | The single logger and development-only debug switch. |
| `test/` | Vitest setup for fake IndexedDB and Web Locks, plus storage and locking smoke tests. |
| `docs/` | Architecture and implementation reports. |
| `public/` | Static extension assets and icons. |
| `assets/` | Starter/template asset(s). |
| `scripts/` | Small repository verification scripts; `check-diff.sh` checks suspicious additions and test-file deletions. |
| `.wxt/`, `.output/` | Generated WXT type/build output; ignored and not source of truth. |

## Main flows

### Extension startup and in-page UI

1. WXT loads one provider content script on a matching provider origin:
   `entrypoints/chatgpt.content.ts`, `claude.content.ts`, `gemini.content.ts`, or
   `grok.content.ts`.
2. The content script calls `src/renderer/app/root-attach/observer.ts`, which resets
   any prior mount and registers runtime/keyboard listeners. `MountEl.ts`
   creates `#aiworkspace-root`, attaches an open shadow root, injects registered
   styles, and renders `src/renderer/app/App.tsx`.
3. `App.tsx` listens for the `OPEN_SEARCH` runtime message, the Cmd/Ctrl+X
   shortcut, and the `ai-workspace:open-search` DOM event. It opens
   `features/search/components/SearchPanel.tsx`.
4. `SearchPanel` uses `useSearchPanel`, `useConversationSearch`, and
   `useRecentSearches` to manage query/filter state, cancellation, debouncing,
   and recent searches. `SearchResults` renders loading, error, empty, or result
   states; conversation/message components render selectable matches.
5. On a selected message, `src/renderer/app/App.tsx` opens the normalized conversation
   URL in a new tab.

### Popup opens search

1. `entrypoints/popup/App.tsx` queries the active tab.
2. It maps the active hostname to the generated provider content-script path.
3. It sends `{ type: "OPEN_SEARCH" }` to that tab.
4. If the receiver is missing (for example after an extension reload), it removes
   the stale root, injects the provider content script using the `scripting`
   permission, retries up to three times, and closes the popup.

### Provider synchronization

1. Each provider content script creates its provider adapter and calls
   `startProviderWatcher` from `src/sync/provider-watcher.ts`.
2. The watcher schedules an initial sync, reacts to focus/page/visibility events,
   periodically probes the provider's newest cursor, retries pending/in-flight
   records, and performs an hourly rescan.
3. `src/sync/sync-engine.ts` acquires a Web Lock named
   `smart-folder:sync:<provider>`, opens the `ProviderSource`, reads the current
   head, then resumes from the provider checkpoint unless a rescan was requested.
4. It reads changed entries in batches of 50, loads full records, normalizes them,
   skips incomplete/missing bodies as appropriate, chunks large writes, and saves
   records plus the covered checkpoint through the storage client.
5. It re-reads the newest provider entries on every run to repair metadata-before-
   body writes, tracks fingerprints to avoid resending unchanged records, and
   reports saved/pending/failure counts to the watcher.
6. `src/sync/sync-coordinator.ts` runs in the background context. It creates a
   one-minute heartbeat alarm and sends follow-up sync pokes to provider tabs after
   tab activation, window focus changes, or an explicit sync request.

### Provider data read

1. A provider adapter in `src/providers/<provider>/<provider>-source.ts` opens a
   short-lived, read-only source reader.
2. The reader validates the expected origin IndexedDB schema, scans the provider's
   update-time index using an opaque cursor, and loads full records in source order.
3. The adapter maps raw records to `ProviderSource` entries and calls the provider
   normalizer to produce `ConversationRecord` values.
4. ChatGPT uses separate metadata and conversation stores in `ChatHistoryDB`.
   `entrypoints/chatgpt-idb-hook.content.ts` installs a MAIN-world hook at
   `document_start`; writes/deletes post a page message channel, while
   `chatgpt.content.ts` currently relies on the watcher/probe path.
5. Claude, Gemini, and Grok read their provider-specific conversation stores.
   Their adapter files are wired into the common watcher; their older
   `*-sync.ts` full-sync implementations remain separate and are not referenced
   by the provider content entrypoints.

### Storage and search

1. A provider tab or the renderer calls a function in
   `src/storage/storage-client.ts`.
2. The client sends a typed `browser.runtime.sendMessage` request.
3. `entrypoints/background.ts` accepts only recognized storage message types and
   only from supported provider origins or the extension origin.
4. The background repository validates payloads, then uses
   `src/storage/conversation-repository.ts` and `src/storage/database.ts` to
   atomically write changed conversations and optional sync checkpoints.
5. The renderer requests all records through `getConversations()`, caches the
   result for 10 seconds, and calls `src/search/search.ts`. Search parses terms,
   folds case/diacritics/whitespace, applies provider/role/date/deleted filters,
   builds title/message matches and bounded snippets, and returns ranked results.

## Data locations and ownership

### Extension IndexedDB: `AiWorkspaceDB`

Defined in `src/storage/database.ts`:

- `records` (Dexie v2): primary key `&key`; indexes `platform`,
  `[platform+accountScope]`, and `updatedAt`. Values are `ConversationRecord`
  objects.
- `syncState` (Dexie v2): primary key `&key`; values are `SyncCheckpoint`
  objects keyed by provider.
- Version 2 migrates existing records to the `platform:id` key format and adds
  `syncState`.
- `ConversationRepository` is the writer and reader. The background entrypoint is
  the only runtime-message server for this database.

### Provider origin IndexedDB databases

Provider source readers open these databases read-only and never own or migrate
them:

| Provider | Database | Stores/indexes used |
| --- | --- | --- |
| ChatGPT | `ChatHistoryDB` | `conversationMeta` via `updateTimeIndex`; `conversations` by ID |
| Claude | `ClaudeHistoryDB` | `conversations` via `updateTimeIndex` |
| Gemini | `GeminiToolboxDB` | `conversations` via `updateTimeIndex` |
| Grok | `GrokToolboxDB` | `conversations` via `updateTimeIndex` |

### Browser local storage

`src/renderer/features/search/hooks/useRecentSearches.ts` stores up to eight
case-insensitively deduplicated recent queries under
`smart-folder:recent-searches`. Failures are intentionally ignored because this
is non-critical UI state.

### In-memory state

- `sync-engine.ts` keeps per-tab/provider saved fingerprints.
- `provider-watcher.ts` keeps active watcher state, timers, retry state, and the
  latest observed head.
- `renderer/App.tsx` caches all search records for 10 seconds and coalesces an
  in-flight read.
- React hooks keep current panel, filter, result, and recent-search state.

## Contracts between parts

### Runtime messages

| Sender/receiver | Message | Payload/meaning |
| --- | --- | --- |
| Popup -> provider content script | `{ type: "OPEN_SEARCH" }` | Open the in-page search panel. |
| Background coordinator -> provider content script | `{ type: "smart-folder:sync-now", platform? }` | Ask a provider watcher to sync immediately; omitted platform means the receiving provider. |
| Any context -> background coordinator | `{ type: "smart-folder:request-sync-now" }` | Ask the coordinator to poke provider tabs. |
| Provider/renderer -> background storage | `storage:upsert-conversations` | `{ conversations, checkpoint? }`; atomically upsert changed records and checkpoint. |
| Renderer/provider -> background storage | `storage:get-sync-checkpoint` | `{ key }`; return the provider checkpoint or `null`. |
| Renderer -> background storage | `storage:get-counts` | Return conversation and nested message counts. |
| Renderer -> background storage | `storage:get-conversations` | Return all stored conversations. |

Storage responses are discriminated by `ok`; failures contain an `error` string.
The background validates provider, conversation, message, and checkpoint shapes
before repository operations. Sender validation allows the four provider origins
and the extension origin only.

### Page/DOM contracts

- ChatGPT's MAIN-world hook uses `window.postMessage` with channel
  `smart-folder:chatgpt-idb-write` and operation `write` or `delete`, targeted at
  `location.origin`.
- The renderer root uses the DOM event `ai-workspace:open-search`.
- The mount host ID is `aiworkspace-root`; ownership is coordinated with the
  `data-ai-workspace-owner` document attribute.
- Keyboard contracts are Cmd/Ctrl+X to open, Escape to close the popup/search,
  and Cmd/Ctrl+C to close an open search panel.

### Provider-source interface

`src/providers/provider-source.ts` is the internal adapter contract. Every provider
must expose `platform`, `open`, `close`, `head`, `changedSince`, `newest`, `load`,
`normalize`, and `isIncomplete`. Cursors are opaque to the sync engine; source
entries are oldest-first pages, and loaded IDs must preserve request order.

## Confusing, duplicated, or risky areas found

- The repository is a WXT React starter but the README still contains only the
  starter heading; product commands and architecture are not documented there.
- `entrypoints/content.ts` matches `*://*.google.com/*`, logs startup, and has its
  mount call commented out. It is separate from the provider-specific content
  scripts and its intended role is unclear.
- The popup displays “command + x”, while the implementation accepts either
  Command+X or Ctrl+X and the in-page panel also supports Cmd/Ctrl+C to close.
- `src/providers/claude/claude-sync.ts`, `gemini-sync.ts`, and `grok-sync.ts`
  duplicate older full-history synchronization logic, while the active provider
  entrypoints use the common `sync-engine.ts` path.
- Provider source readers and normalizers repeat substantial cursor, schema,
  timestamp, signature, and raw-record handling patterns across four providers.
- `src/renderer/app/App.tsx` still coordinates provider detection and UI mapping,
  while `src/search/search-service.ts` owns storage access, caching, and the
  search-engine call.
- `getConversations()` transfers the complete local library in one runtime
  message and the renderer searches it in memory. This is simple but may become a
  size/performance constraint as the library grows.
- The extension uses several literal contract strings (`OPEN_SEARCH`, storage
  message names, sync message names, DOM event names, host IDs, and storage keys)
  across independent contexts. They are currently stable but are easy to drift.
- Error handling/logging is spread between `console.error`, `console.warn`,
  `console.info`, and `console.debug`; the shared logger now centralizes these
  calls and suppresses debug output in production builds.
- Provider data and extension data are intentionally coupled to undocumented
  provider IndexedDB schemas. Schema validation protects reads, but provider
  upgrades can stop synchronization.
- The worktree was already dirty when this phase began: legacy `public/icon/*.png`
  files are deleted and `src/providers/chatgpt/chatgpt-source.ts` is modified.
  Those changes were not made during this phase and must be preserved or
  explicitly resolved before later commits.
