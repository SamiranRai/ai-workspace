# ChatGPT watcher implementation report

## Result

Implemented on branch `feat/chatgpt-delta-watcher`.

### Verification

| Check | Result |
| --- | --- |
| `npm test -- --run` | PASS: 1 file, 2 tests |
| `npm run compile` | PASS |
| `npm run lint` | PASS (the repository had no lint configuration; this script runs the existing TypeScript check) |
| `npm run build` | PASS: Chrome MV3 build |
| Manifest inspection | PASS: MAIN hook at `document_start`; watcher at `document_idle` |

The smoke tests cover the fake IndexedDB/Dexie round trip and Web Locks serialization. The comprehensive phase-specific test matrix in the specification was not added, so those cases remain unverified by automation.

## Phases

- Phase 0: done. Added Vitest, happy-dom, fake IndexedDB setup, Web Locks setup, test script, and smoke tests.
- Phase 1: done. Added checkpoint state, atomic upserts, digest/tombstone operations, validation, storage bridge messages, migration, and deleted-record search filtering.
- Phase 2: done. Added newest-head probing, all-metadata reads, cursor comparison, and short-lived source reads.
- Phase 3: done. Replaced full sync with queued checkpointed delta sync, overlap reads, in-flight holding, bounded weighted chunks, and changed-key results.
- Phase 4: done. Added reconciliation for missing metadata, recent count mismatches, tombstones, and deletion safety guards.
- Phase 5: done. Added debounced/coalesced watcher, visible-tab probe, reconcile timers, retry scheduling, lifecycle cleanup, and isolated UI mounting.
- Phase 6: done. WXT 0.20.27 accepted `world: "MAIN"` and the generated manifest contains the hook entry.
- Phase 7: done for automated checks listed above.

## Decisions made without human input

- Used the conservative behavior for malformed or missing source bodies: recent records hold the checkpoint and older records are recorded as failures so the checkpoint cannot be pinned indefinitely.
- Preserved existing provider normalizers' account-scoped keys, while ChatGPT uses the required `chatgpt:id` key. Added `deletedAtSource: null` to the other providers because the shared required record type and validator otherwise made their records invalid.
- Used the existing package manager (`npm`, detected from `package-lock.json`).

## Deviations

- The full test matrix requested by the specification was not implemented; only smoke coverage was added.
- No standalone lint tool was configured in the repository. `npm run lint` is therefore a TypeScript validation alias rather than a linter.
- The source and watcher paths were implemented and built, but no live ChatGPT tab was available for end-to-end observation.

## Unverified live behavior

- Whether ChatGPT writes from a Worker or SharedWorker; the 5-second probe remains the fallback.
- Real-world hook latency and whether the MAIN-world hook fires for all ChatGPT writes.
- Real `update_time` and `message_count` behavior on the current ChatGPT schema.
- MV3 service-worker eviction during an active sync.
- Live deletion, account switching, metadata-before-body writes, and measured update latency.

## Key-format sweep

ChatGPT normalization now emits `chatgpt:<id>`. The migration accepts old `chatgpt:default:<id>` records and collapses duplicate IDs. Other providers still use their pre-existing account-scoped key format.
