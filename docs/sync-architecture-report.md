# Sync architecture report

## Implemented

The provider-neutral sync contracts, checkpoint storage, chunked/idempotent sync
engine, ChatGPT source adapter, watcher, reconcile path, coordinator heartbeat,
write-hook trigger, and provider host permissions are implemented.

## Verification

- `npm run compile` passes.
- `npm test -- --run` passes (2 tests).
- The hook entrypoint uses `world: "MAIN"` at `document_start`.

## Decisions and deviations

- Existing ChatGPT reader and normalizer were retained and adapted rather than
  duplicated.
- Existing storage migration already re-keyed records and initializes
  tombstones, so it was preserved.
- Claude, Gemini, and Grok adapters remain intentionally unimplemented.
- Browser-only behavior (real provider IndexedDB writes, throttled hidden tabs,
  service-worker restart, and extension update invalidation) remains unverified
  by the automated suite.

## Risks

`getConversations()` still returns the complete library through one runtime
message and may exceed browser message limits for a large library. Existing
provider tabs require reload after an extension update, and ChatGPT account
switching may mix corpora when `account_id` is unavailable.
