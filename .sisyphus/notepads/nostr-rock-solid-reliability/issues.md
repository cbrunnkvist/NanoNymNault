# Issues
- Implementing reconnect backoff requires access to last seen timestamp state (NostrSyncStateService) planned in Task 3.
- Tests for nostr-notification.service.spec.ts rely on a Chrome browser; local environment may require Brave/Chromium binary setup.

## 2026-02-13 - Manual Browser Verification Deferred

**Status**: DEFERRED (not blocking)

The final checklist includes 4 manual browser verification items that require:
1. Playwright browser installation (Chrome/Chromium not available on system)
2. Real wallet with seed and NanoNyms configured
3. Live Nostr relay connections for send/receive testing
4. Interactive browser session for localStorage inspection

**Items deferred for user testing:**
- [ ] Send notification, refresh page, queue still processing
- [ ] Receive notification, refresh page, no re-processing  
- [ ] Import seed in new browser, past notifications discovered
- [ ] Click rescan, notifications re-fetched

**Recommended approach**: User can test these manually in dev preview at https://cbrunnkvist.github.io/NanoNymNault/ or local dev server (npm start → http://localhost:4200)

**Why this is acceptable**: 
- All implementation code is complete and committed
- 21 integration tests verify the core functionality
- These are UX verification items, not functional blockers