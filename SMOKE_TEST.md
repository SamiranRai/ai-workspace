# Manual smoke test

Run this checklist with the unpacked Chrome build from `.output/chrome-mv3/`.
Use an account that has at least one conversation on each supported provider.
Record any failure with the provider, URL, and browser-console error.

- [ ] Load the unpacked extension in `chrome://extensions` with Developer mode enabled.
- [ ] Confirm the extension loads without a manifest or service-worker error.
- [ ] Open a ChatGPT tab at `https://chatgpt.com/` and confirm the page remains usable.
- [ ] Press Cmd/Ctrl+X and confirm the AI Workspace search panel opens in the page.
- [ ] Close the panel with Escape, then open it again with Cmd/Ctrl+X.
- [ ] Enter a distinctive word from a ChatGPT conversation and confirm a result appears.
- [ ] Select a result/message and confirm its conversation opens in a new tab.
- [ ] Open the extension popup on the ChatGPT tab and click **Open Search**.
- [ ] Confirm the popup action opens the in-page panel and the popup closes.
- [ ] Reload the extension, leave the existing provider tab open, and use the popup
      action again to verify stale content-script recovery.
- [ ] Open Claude, Gemini, and Grok tabs and confirm the search panel can open on each.
- [ ] On each provider, confirm a known local conversation is eventually searchable
      after the page loads and synchronization runs.
- [ ] Search using multiple terms and confirm only conversations containing all terms
      are returned.
- [ ] Open filters, select a provider/role/date range, and confirm the result set changes.
- [ ] Enable **Titles only** and confirm message-only matches are excluded.
- [ ] Clear the query, select a recent search, and confirm it runs again.
- [ ] Close the panel with its close button and confirm the host overlay disappears.
- [ ] Switch away from and back to a provider tab, then verify a newly created or
      updated conversation becomes searchable without manually importing data.
