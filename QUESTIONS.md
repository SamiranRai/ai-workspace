# Questions for cleanup

These items were not removed because their current repository references do not
prove that they are safe to delete.

1. **`entrypoints/content.ts`**: Should the generic `*://*.google.com/*`
   content entrypoint remain? WXT discovers it as an entrypoint and includes it
   in the manifest. Its current runtime behavior is only a startup log; the
   mount call is commented out. Removing it would change the generated manifest
   and which Google pages receive a content script.
2. **`web-ext` dev dependency**: Is this package used by an undocumented manual
   Firefox workflow? It has no reference in `package.json` scripts, WXT config,
   source, or tests, but removing it could break a developer command that is
   outside this repository.
3. **ChatGPT IDB hook channel**: `idb-write-hook.ts` produces
   `smart-folder:chatgpt-idb-write` page messages, but no current source file
   listens for that channel. Is a consumer planned or supplied externally?
   Removing the hook would change the ChatGPT document-start instrumentation, so
   it was preserved.
4. **Storage counts message**: The background handler still supports
   `storage:get-counts`, but no current client calls it. Is this intended as a
   diagnostic contract? The message type and handler were preserved.
