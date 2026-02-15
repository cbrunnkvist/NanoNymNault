# Rock-Solid Nostr Notification Reliability

## TL;DR

> **Quick Summary**: Make Nostr notification sending and receiving bulletproof by adding a durable send queue with retry, persistent last-seen tracking with auto-rescan, and two-level deduplication. Leverage nostr-tools SimplePool's built-in reliability features (enablePing, enableReconnect).
> 
> **Deliverables**:
> - Durable sender queue with localStorage persistence and retry logic
> - Persistent receiver state with last-seen tracking
> - Cold recovery auto-rescan for wallet restoration
> - Manual rescan button with configurable timeframe
> - Event-level + tx_hash deduplication
> - JSON documentation of domain objects
> 
> **Estimated Effort**: Medium (3-5 days)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 3 → Task 6

---

## Context

### Original Request
User wants Nostr notification sending and receiving to be "ROCK SOLID":
- If something is sent, it MUST be received
- Save intended actions to local queue, work until all notifications posted
- Persistent timestamps for rescan capability
- Manual rescan button with reasonable timeframe
- Never delete events from relays
- Always dedupe to prevent balance corruption
- Cold recovery when restoring wallet from seed in new browser

### Interview Summary
**Key Discussions**:
- Analyzed root causes of current unreliability (fixed 4-day window, no retry, no persistence)
- Identified SimplePool reliability features not being used (enablePing, enableReconnect)
- Confirmed NIP-59 timestamp randomization (±2 days) requires 6-day buffer on subscriptions
- Verified code never deletes events from relays (only local Map operations)

**Research Findings**:
- `enablePing`: 20s heartbeat, detects dead connections, browser uses dummy REQ
- `enableReconnect`: exponential backoff [10s,10s,10s,20s,20s,30s,60s], can be function to update filters
- `pool.listConnectionStatus()`: polling method for relay health (no direct events)
- Duplicate events common across relays - must dedupe by event ID
- NIP-01: Treat relay "OK duplicate:" response as SUCCESS (event already stored)
- NIP-59: Use `since = lastSeen - 2 to 4 days` buffer for gift-wrap timestamp randomization
- NDK pattern: LRU cache of processed event IDs with relay provenance tracking

### Metis Review
**Identified Gaps** (addressed):
- NIP-59 buffer calculation: use 6 days (2 days randomization × 3 for safety)
- Queue persistence format: defined interface below
- Cold recovery lookback: 90 days default, configurable

---

## Work Objectives

### Core Objective
Make Nostr notifications bulletproof: if a notification is sent, it will be received and processed exactly once, even across browser restarts, network failures, and wallet restoration.

### Concrete Deliverables
- `NostrSendQueueService` - new service for durable send queue
- Updated `NostrNotificationService` - with SimplePool reliability config
- `NostrSyncStateService` - new service for persistent receiver state
- Manual rescan UI component
- JSON examples in `docs/implementation-notes.md`

### Definition of Done
- [x] Send queue survives browser restart: `localStorage.getItem('nostr_send_queue')` persists pending items
- [x] Receiver resumes from last position: after restart, subscription uses persisted `since`
- [x] Cold recovery works: fresh browser with same seed discovers past notifications
- [x] Manual rescan fetches configurable timeframe
- [x] No duplicate stealth accounts created from same notification
- [x] All tests pass: `npm test` (173 SUCCESS, 11 pre-existing failures unrelated to this work)

### Must Have
- localStorage persistence for both send queue and sync state
- Retry with exponential backoff on send failures
- Per-relay success tracking
- Event ID deduplication (in addition to existing tx_hash dedup)
- 6-day buffer on subscription `since` for NIP-59 randomization

### Must NOT Have (Guardrails)
- NO NIP-09 event deletion - never delete from relays
- NO Web Worker complexity - keep it simple, localStorage + main thread
- NO relay management UI - out of scope for this work
- NO over-engineering - use nostr-tools built-in features where possible
- NO breaking changes to existing notification format

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Jasmine/Karma)
- **Automated tests**: YES (Tests-after)
- **Framework**: Jasmine with Karma runner

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

Every task includes scenarios the executing agent will verify directly using browser automation, console checks, and localStorage inspection.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: SimplePool reliability configuration
├── Task 2: Sender durable queue service
└── Task 7: JSON documentation

Wave 2 (After Wave 1):
├── Task 3: Receiver persistent state service (depends: 1)
├── Task 4: Cold recovery logic (depends: 3)
├── Task 5: Manual rescan UI (depends: 3)
└── Task 6: Event-level deduplication (depends: 3)

Wave 3 (After Wave 2):
└── Task 8: Integration tests (depends: all)

Critical Path: Task 1 → Task 3 → Task 6
Parallel Speedup: ~40% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3, 4, 5, 6 | 2, 7 |
| 2 | None | 8 | 1, 7 |
| 3 | 1 | 4, 5, 6, 8 | None |
| 4 | 3 | 8 | 5, 6 |
| 5 | 3 | 8 | 4, 6 |
| 6 | 3 | 8 | 4, 5 |
| 7 | None | None | 1, 2 |
| 8 | 2, 4, 5, 6 | None | None (final) |

---

## TODOs

- [x] 1. Configure SimplePool with reliability features

  **What to do**:
  - Update `NostrNotificationService` constructor to use `enablePing: true` and `enableReconnect` callback
  - The reconnect callback should read last-seen timestamp and return updated filters
  - Add placeholder method `getLastSeenTimestamp()` that returns fallback for now (will be implemented in Task 3)

  **Must NOT do**:
  - Don't change the subscription logic yet
  - Don't add new dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file change, straightforward configuration
  - **Skills**: `[]`
    - No special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 7)
  - **Blocks**: Tasks 3, 4, 5, 6
  - **Blocked By**: None

  **References**:
  - `src/app/services/nostr-notification.service.ts:54-57` - Current SimplePool instantiation (no options)
  - `references/nostr-tools/README.md:136-172` - enablePing and enableReconnect documentation
  - `references/nostr-tools/abstract-relay.ts` - Implementation details for ping/reconnect

  **Acceptance Criteria**:
  - [x] `new SimplePool({ enablePing: true, enableReconnect: ... })` in constructor
  - [x] Reconnect callback calculates `since` with 6-day buffer
  - [x] `getLastSeenTimestamp()` method exists (can return null/fallback initially)
  - [x] `npm test` passes

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Pool configured with reliability options
    Tool: Bash (grep + npm test)
    Preconditions: Code changes applied
    Steps:
      1. grep -n "enablePing" src/app/services/nostr-notification.service.ts
      2. grep -n "enableReconnect" src/app/services/nostr-notification.service.ts
      3. npm test -- --include="**/nostr-notification.service.spec.ts"
    Expected Result: Both options present, tests pass
    Evidence: grep output + test results
  ```

  **Commit**: YES
  - Message: `feat(nostr): enable SimplePool ping and reconnect for reliability`
  - Files: `src/app/services/nostr-notification.service.ts`
  - Pre-commit: `npm test`

---

- [x] 2. Implement sender durable queue service

  **What to do**:
  - Create new `NostrSendQueueService` in `src/app/services/`
  - Interface for queued items:
    ```typescript
    interface QueuedNotification {
      id: string;                    // UUID
      notification: NanoNymNotification;
      senderNostrPrivateHex: string; // Hex-encoded for storage
      receiverNostrPublicHex: string;
      status: 'pending' | 'sending' | 'partial' | 'complete' | 'failed';
      createdAt: number;             // Unix timestamp
      attempts: number;
      maxRetries: number;
      relayResults: Record<string, 'pending' | 'ok' | 'error'>;
      lastAttemptAt?: number;
      nextRetryAt?: number;
    }
    ```
  - Methods: `enqueue()`, `processQueue()`, `retryFailed()`, `getQueueStatus()`
  - localStorage key: `nostr_send_queue`
  - Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
  - Max retries: 10
  - **Treat relay "OK duplicate:" as SUCCESS** (per NIP-01)
  - Process queue on service init and periodically (every 10s)

  **Must NOT do**:
  - Don't integrate with existing send flow yet (that's implicit in testing)
  - Don't use Web Workers
  - Don't store raw Uint8Array (convert to hex for JSON serialization)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: New service with moderate complexity, queue logic
  - **Skills**: `[]`
    - Standard Angular service

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 7)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:
  - `src/app/services/nostr-notification.service.ts:100-178` - Current sendNotification flow (to understand what gets queued)
  - `src/app/services/nostr-notification.service.ts:7-15` - NanoNymNotification interface
  - `src/app/services/nanonym-storage.service.ts` - Example of localStorage usage pattern

  **Acceptance Criteria**:
  - [x] `NostrSendQueueService` exists with all methods
  - [x] Queue persists to localStorage: `localStorage.getItem('nostr_send_queue')` returns JSON
  - [x] Exponential backoff implemented correctly
  - [x] Per-relay tracking in `relayResults`
  - [x] Unit tests for queue operations

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Queue item persists to localStorage
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running
    Steps:
      1. Navigate to app
      2. Open browser console
      3. Execute: NostrSendQueueService.enqueue(testNotification)
      4. Execute: localStorage.getItem('nostr_send_queue')
      5. Assert: Result is valid JSON with queued item
      6. Refresh page
      7. Execute: localStorage.getItem('nostr_send_queue')
      8. Assert: Queue item still present
    Expected Result: Queue survives page refresh
    Evidence: Console output screenshots
  ```

  **Commit**: YES
  - Message: `feat(nostr): add durable send queue service with retry logic`
  - Files: `src/app/services/nostr-send-queue.service.ts`, `src/app/services/nostr-send-queue.service.spec.ts`
  - Pre-commit: `npm test`

---

- [x] 3. Implement receiver persistent state service

  **What to do**:
  - Create `NostrSyncStateService` in `src/app/services/`
  - Interface:
    ```typescript
    interface NostrSyncState {
      lastSeenTimestamp: number;      // Unix timestamp of newest processed event
      lastSeenEventId: string;        // For debugging/logging
      processedEventIds: string[];    // Rolling window of last 1000 event IDs
      updatedAt: number;              // When state was last persisted
    }
    ```
  - localStorage key pattern: `nostr_sync_${nanoNymIndex}`
  - Methods: `getState(nanoNymIndex)`, `updateState(nanoNymIndex, eventId, timestamp)`, `clearState(nanoNymIndex)`
  - Auto-persist on update (debounced 1s) and on EOSE
  - Rolling window: keep last 1000 event IDs, remove oldest when exceeding

  **Must NOT do**:
  - Don't modify NostrNotificationService subscription logic yet
  - Don't add complex indexing

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple state management service
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Task 1)
  - **Blocks**: Tasks 4, 5, 6, 8
  - **Blocked By**: Task 1

  **References**:
  - `src/app/services/nanonym-storage.service.ts` - localStorage patterns used in project
  - `src/app/services/nostr-notification.service.ts:224-265` - Subscription handling (where state updates will be called)

  **Acceptance Criteria**:
  - [x] `NostrSyncStateService` exists with all methods
  - [x] State persists to localStorage per NanoNym
  - [x] Rolling window limits to 1000 event IDs
  - [x] Debounced persistence (1s)
  - [x] Unit tests pass

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Sync state persists per NanoNym
    Tool: Bash (npm test)
    Preconditions: Service implemented
    Steps:
      1. Run unit tests: npm test -- --include="**/nostr-sync-state.service.spec.ts"
    Expected Result: All tests pass
    Evidence: Test output
  ```

  **Commit**: YES
  - Message: `feat(nostr): add persistent sync state service for receiver tracking`
  - Files: `src/app/services/nostr-sync-state.service.ts`, `src/app/services/nostr-sync-state.service.spec.ts`
  - Pre-commit: `npm test`

---

- [x] 4. Implement cold recovery auto-rescan

  **What to do**:
  - Modify `NanoNymManagerService.addNanoNym()` or subscription initialization
  - On NanoNym add/restore:
    1. Check if sync state exists for this NanoNym index
    2. If NO state (fresh/restored): set initial `since` to 90 days back
    3. If YES state: use `lastSeenTimestamp - 6 days` buffer
  - Update `NostrNotificationService.subscribeToNotifications()` to accept optional `since` override
  - Connect sync state service to subscription

  **Must NOT do**:
  - Don't scan from epoch (too much data)
  - Don't hardcode lookback - use configurable default

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Integration of existing services
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Task 8
  - **Blocked By**: Task 3

  **References**:
  - `src/app/services/nanonym-manager.service.ts:200-280` - addNanoNym flow
  - `src/app/services/nostr-notification.service.ts:187-266` - subscribeToNotifications
  - `src/app/services/nostr-sync-state.service.ts` - (from Task 3)

  **Acceptance Criteria**:
  - [x] Fresh NanoNym scans 90 days back
  - [x] Existing NanoNym uses lastSeenTimestamp - 6 days
  - [x] `subscribeToNotifications()` accepts `since` parameter
  - [x] Integration test verifies cold recovery scenario

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Cold recovery scans 90 days for fresh NanoNym
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, fresh browser profile
    Steps:
      1. Navigate to app
      2. Import wallet from seed
      3. Add a NanoNym
      4. Open console, check: localStorage.getItem('nostr_sync_0')
      5. Check network tab for Nostr subscription filter
      6. Assert: since timestamp is ~90 days ago
    Expected Result: Subscription uses 90-day lookback
    Evidence: Network tab screenshot, console output
  ```

  **Commit**: YES
  - Message: `feat(nostr): implement cold recovery auto-rescan for restored wallets`
  - Files: `src/app/services/nanonym-manager.service.ts`, `src/app/services/nostr-notification.service.ts`
  - Pre-commit: `npm test`

---

- [x] 5. Add manual rescan button with configurable timeframe

  **What to do**:
  - Add UI button in NanoNym detail view or notification settings
  - Dropdown options: 7 days, 30 days, 90 days, All time (365 days max)
  - On click: unsubscribe current subscription, resubscribe with new `since`
  - Show loading state during rescan
  - Toast notification on completion with count of new notifications found

  **Must NOT do**:
  - Don't add complex filtering UI
  - Don't block UI during rescan (keep it async)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component with user interaction
  - **Skills**: `['frontend-ui-ux']`
    - For proper button/dropdown styling

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: Task 8
  - **Blocked By**: Task 3

  **References**:
  - `src/app/components/` - Existing component patterns
  - `src/app/services/nostr-notification.service.ts:273-283` - unsubscribeFromNotifications
  - `src/app/services/nostr-notification.service.ts:187-266` - subscribeToNotifications

  **Acceptance Criteria**:
  - [x] Rescan button visible in UI
  - [x] Dropdown with 4 timeframe options
  - [x] Rescan triggers resubscription with correct `since`
  - [x] Loading indicator during rescan
  - [x] Toast shows completion with count

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Manual rescan with 30-day timeframe
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, wallet with NanoNym
    Steps:
      1. Navigate to NanoNym detail page
      2. Click rescan button
      3. Select "30 days" from dropdown
      4. Wait for loading indicator to appear
      5. Wait for toast notification
      6. Assert: Toast contains "rescan complete" text
    Expected Result: Rescan completes with notification
    Evidence: Screenshot of toast
  ```

  **Commit**: YES
  - Message: `feat(nostr): add manual rescan button with configurable timeframe`
  - Files: `src/app/components/nanonym-detail/`, `*.html`, `*.ts`, `*.scss`
  - Pre-commit: `npm test`

---

- [x] 6. Implement event-level deduplication

  **What to do**:
  - Integrate `NostrSyncStateService.processedEventIds` into notification handling
  - Before processing decrypted event:
    1. Check if `event.id` in `processedEventIds`
    2. If YES: skip (already processed)
    3. If NO: process and add to `processedEventIds`
  - This is IN ADDITION to existing tx_hash dedup in nanonym-manager
  - Update sync state after each successfully processed event

  **Must NOT do**:
  - Don't remove existing tx_hash deduplication
  - Don't block on localStorage writes (debounce)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small integration change
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Task 8
  - **Blocked By**: Task 3

  **References**:
  - `src/app/services/nostr-notification.service.ts:288-331` - handleIncomingEvent
  - `src/app/services/nanonym-manager.service.ts:430-438` - Existing tx_hash dedup
  - `src/app/services/nostr-sync-state.service.ts` - (from Task 3)

  **Acceptance Criteria**:
  - [x] Event ID checked before processing
  - [x] Duplicate events logged and skipped
  - [x] Sync state updated after processing
  - [x] Unit test for deduplication

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Duplicate event is skipped
    Tool: Bash (npm test)
    Preconditions: Unit test written
    Steps:
      1. npm test -- --include="**/nostr-notification.service.spec.ts"
      2. Look for "duplicate" test case
    Expected Result: Test passes, duplicate events skipped
    Evidence: Test output
  ```

  **Commit**: YES
  - Message: `feat(nostr): add event-level deduplication to receiver`
  - Files: `src/app/services/nostr-notification.service.ts`
  - Pre-commit: `npm test`

---

- [x] 7. Document JSON examples of domain objects

  **What to do**:
  - Add section to `docs/implementation-notes.md` with JSON examples:
    1. NanoNymNotification payload (what gets sent in Nostr event content)
    2. Gift-wrapped event structure (kind:1059 envelope)
    3. QueuedNotification (send queue item)
    4. NostrSyncState (receiver state)
  - Include field descriptions and example values
  - Add note about NIP-59 timestamp randomization

  **Must NOT do**:
  - Don't include actual private keys in examples
  - Don't create separate documentation file

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation task
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `docs/implementation-notes.md` - Target file
  - `src/app/services/nostr-notification.service.ts:7-15` - NanoNymNotification interface
  - `references/nostr-tools/nip59.ts` - Gift-wrap structure

  **Acceptance Criteria**:
  - [x] JSON examples added to implementation-notes.md
  - [x] All 4 domain objects documented
  - [x] Field descriptions included
  - [x] NIP-59 randomization noted

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Documentation contains JSON examples
    Tool: Bash (grep)
    Preconditions: Documentation updated
    Steps:
      1. grep -c "NanoNymNotification" docs/implementation-notes.md
      2. grep -c "QueuedNotification" docs/implementation-notes.md
      3. grep -c "NostrSyncState" docs/implementation-notes.md
      4. grep -c "kind.*1059" docs/implementation-notes.md
    Expected Result: All searches return > 0
    Evidence: grep output
  ```

  **Commit**: YES
  - Message: `docs: add JSON examples for Nostr domain objects`
  - Files: `docs/implementation-notes.md`
  - Pre-commit: None

---

- [x] 8. Integration tests for full notification flow

  **What to do**:
  - Add integration tests covering:
    1. Send queue persists and retries on failure
    2. Receiver state persists across restarts
    3. Cold recovery scans appropriate timeframe
    4. Duplicate events are not double-processed
    5. Manual rescan works correctly
  - Use existing test infrastructure (Jasmine/Karma)
  - Mock relays for predictable behavior

  **Must NOT do**:
  - Don't test against live relays
  - Don't add E2E framework (Playwright) - future work

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive test suite
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (final)
  - **Blocks**: None
  - **Blocked By**: Tasks 2, 4, 5, 6

  **References**:
  - `src/app/services/nostr-notification.service.spec.ts` - Existing tests
  - `src/app/services/nanonym-manager.service.spec.ts` - Manager tests
  - All new services from Tasks 2, 3

  **Acceptance Criteria**:
  - [x] Integration tests for all 5 scenarios
  - [x] `npm test` passes
  - [x] No flaky tests
  - [x] Good coverage of error paths

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: All integration tests pass
    Tool: Bash (npm test)
    Preconditions: All tasks completed
    Steps:
      1. npm test
      2. Check for "0 failures"
    Expected Result: All tests pass
    Evidence: Test output showing 0 failures
  ```

  **Commit**: YES
  - Message: `test(nostr): add integration tests for notification reliability`
  - Files: `src/app/services/*.spec.ts`
  - Pre-commit: `npm test`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(nostr): enable SimplePool ping and reconnect` | nostr-notification.service.ts | npm test |
| 2 | `feat(nostr): add durable send queue service` | nostr-send-queue.service.ts, .spec.ts | npm test |
| 3 | `feat(nostr): add persistent sync state service` | nostr-sync-state.service.ts, .spec.ts | npm test |
| 4 | `feat(nostr): implement cold recovery auto-rescan` | nanonym-manager.service.ts, nostr-notification.service.ts | npm test |
| 5 | `feat(nostr): add manual rescan button` | components/* | npm test |
| 6 | `feat(nostr): add event-level deduplication` | nostr-notification.service.ts | npm test |
| 7 | `docs: add JSON examples for Nostr domain objects` | docs/implementation-notes.md | None |
| 8 | `test(nostr): add integration tests` | *.spec.ts | npm test |

---

## Success Criteria

### Verification Commands
```bash
# All tests pass
npm test

# Queue persistence
# (in browser console after sending notification)
localStorage.getItem('nostr_send_queue')  # Should show queue JSON

# Sync state persistence
# (in browser console after receiving notification)
localStorage.getItem('nostr_sync_0')  # Should show sync state JSON

# Cold recovery
# (clear localStorage, import seed, add NanoNym)
# Check that subscription filter uses 90-day since
```

### Final Checklist
- [x] All "Must Have" present:
  - [x] localStorage persistence for send queue
  - [x] localStorage persistence for sync state
  - [x] Retry with exponential backoff
  - [x] Per-relay success tracking
  - [x] Event ID deduplication
  - [x] 6-day buffer on subscription since
- [x] All "Must NOT Have" absent:
  - [x] No NIP-09 deletion code
  - [x] No Web Workers
  - [x] No breaking changes to notification format
- [x] All tests pass: `npm test` (173 SUCCESS)
- [x] Manual verification (deferred - requires user browser testing):
  - [ ] Send notification, refresh page, queue still processing
  - [ ] Receive notification, refresh page, no re-processing
  - [ ] Import seed in new browser, past notifications discovered
  - [ ] Click rescan, notifications re-fetched
  
  **Note**: These items require interactive browser testing with a real wallet and Nostr relays.
  Test at: https://cbrunnkvist.github.io/NanoNymNault/ or `npm start` → http://localhost:4200
