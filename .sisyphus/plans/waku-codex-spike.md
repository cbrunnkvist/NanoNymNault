# Waku + Codex Tech Spike: NanoNym Notification System

## TL;DR

> **Quick Summary**: Tech spike proving Waku (Logos ecosystem) can replace Nostr for NanoNym payment notifications. Phase 1 validates Waku transport viability with 30-day Store retention and browser PWA support. Phase 2 (separate plan) adds Codex for long-term archival.
> 
> **Deliverables**:
> - Waku notification service (parallel to existing Nostr service)
> - nwaku Docker setup for local/testnet
> - Integration tests + Playwright browser tests
> - Go/No-Go decision document
> 
> **Estimated Effort**: Medium (1-2 weeks for Phase 1)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 (nwaku setup) → Task 3 (sender) → Task 4 (receiver) → Task 7 (tests)

---

## Context

### Original Request
Tech spike to evaluate Waku + Codex (Logos ecosystem) as replacement for Nostr-based payment notifications in NanoNymNault. User wants to explore the Logos/Vac ecosystem for better relay infrastructure, content topic bucketing, and eventual RLN spam protection.

### Interview Summary
**Key Discussions**:
- Waku Store has 24-hour query limit → must iterate day-by-day for 30-day recovery
- iOS PWA kills WebSocket on background → Store recovery on foreground resume (acceptable)
- RLN is complex → run own nwaku nodes without RLN enforcement for spike
- 256 buckets with daily partitioning for k-anonymity
- Reuse existing NIP-59 style gift-wrapping for encryption

**Research Findings**:
- `@waku/sdk` works in browsers (NOT React Native)
- Codex API: POST /data → CID, GET /data/{cid}/network/stream
- Codex has NO discovery primitive → Bridge index needed (Phase 2)
- Current Nostr payload: `{ R, tx_hash, amount?, memo? }` - only R is critical

### Metis Review
**Identified Gaps (addressed)**:
- 24h Store limit: Iterate day-by-day for recovery
- iOS background: Document as known limitation, Store recovery compensates
- Encryption strategy: Reuse NIP-59 style (proven approach)

---

## Work Objectives

### Core Objective
Prove Waku viability as Nostr replacement for NanoNym notifications in browser PWA (iOS, Android, desktop).

### Concrete Deliverables
- `/src/app/services/waku-notification.service.ts` - Parallel notification service
- `/docker/nwaku/` - Docker Compose for local nwaku node
- Integration tests in `/src/app/services/waku-notification.service.spec.ts`
- Playwright tests for browser PWA verification
- `docs/WAKU-SPIKE-RESULTS.md` - Go/No-Go decision document

### Definition of Done
- [ ] Send notification from browser via LightPush → nwaku node
- [ ] Receive real-time notification via Filter protocol
- [ ] Recover 7 days of notifications via Store (with pagination)
- [ ] All tests pass in Chrome, Firefox, Safari (webkit), Brave
- [ ] iOS foreground resume triggers Store recovery
- [ ] Decision document recommends Go or No-Go

### Must Have
- Browser-based sender (LightPush)
- Browser-based receiver (Filter + Store)
- 256-bucket content topic scheme with daily partitioning
- NIP-59 style encryption (reuse existing crypto)
- Day-by-day Store pagination for recovery
- Tests proving PWA viability

### Must NOT Have (Guardrails)
- **NO RLN integration** - defer to production
- **NO Codex integration** - defer to Phase 2
- **NO migration from Nostr** - parallel implementation only
- **NO UI changes** - backend service only
- **NO production deployment** - local/testnet only
- **DO NOT assume single Store query retrieves >24h data**
- **DO NOT rely on Filter surviving iOS background**

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: YES (existing Karma/Jasmine setup)
- **User wants tests**: YES (integration + Playwright)
- **Framework**: Karma (unit), Playwright (browser)

### Automated Verification

**By Deliverable Type:**

| Type | Verification Tool | Automated Procedure |
|------|------------------|---------------------|
| **Waku Service** | Jest/Karma | Unit tests against mock/local nwaku |
| **Browser PWA** | Playwright | Real browser tests in Chrome, Firefox, webkit |
| **Docker Setup** | Bash | Container health checks |

**Evidence Requirements:**
- All test commands captured with exit codes
- Screenshots for Playwright tests saved to `.sisyphus/evidence/`
- nwaku logs captured for debugging

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Docker nwaku setup [no dependencies]
├── Task 2: Content topic scheme design [no dependencies]
└── Task 8: Decision document template [no dependencies]

Wave 2 (After Wave 1):
├── Task 3: WakuNotificationService - Sender [depends: 1, 2]
├── Task 4: WakuNotificationService - Receiver [depends: 1, 2]
└── Task 5: Store pagination [depends: 1]

Wave 3 (After Wave 2):
├── Task 6: iOS foreground recovery [depends: 4, 5]
└── Task 7: Integration + Playwright tests [depends: 3, 4, 5]

Wave 4 (Final):
└── Task 9: Go/No-Go decision + documentation [depends: all]
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3, 4, 5 | 2, 8 |
| 2 | None | 3, 4 | 1, 8 |
| 3 | 1, 2 | 7 | 4, 5 |
| 4 | 1, 2 | 6, 7 | 3, 5 |
| 5 | 1 | 6, 7 | 3, 4 |
| 6 | 4, 5 | 9 | 7 |
| 7 | 3, 4, 5 | 9 | 6 |
| 8 | None | 9 | 1, 2 |
| 9 | All | None | None (final) |

---

## TODOs

### Task 1: Docker nwaku Setup

**What to do**:
- Create Docker Compose configuration for local nwaku node
- Configure Store protocol with 30-day retention
- Configure LightPush and Filter protocols
- Expose REST API on port 8645
- Verify node starts and accepts connections

**Must NOT do**:
- Do NOT configure RLN (out of scope)
- Do NOT deploy to production infrastructure

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: Docker configuration is straightforward
- **Skills**: [`git-master`]
  - `git-master`: For committing configuration files

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 2, 8)
- **Blocks**: Tasks 3, 4, 5
- **Blocked By**: None

**References**:

**External References**:
- Waku Docker docs: https://docs.waku.org/run-node/run-docker-compose
- nwaku REST API: https://waku-org.github.io/nwaku/

**Acceptance Criteria**:

```bash
# Agent runs:
cd docker/nwaku && docker compose up -d
# Wait 10s for startup

# Health check
curl -s http://localhost:8645/debug/v1/info | jq '.protocols'
# Assert: Contains "lightpush", "filter", "store"

# Check Store retention config
docker compose logs nwaku | grep -i "retention"
# Assert: Shows 30-day retention configured
```

**Commit**: YES
- Message: `feat(spike): add nwaku Docker Compose setup for Waku spike`
- Files: `docker/nwaku/docker-compose.yml`, `docker/nwaku/.env.example`
- Pre-commit: `docker compose config` (validates YAML)

---

### Task 2: Content Topic Scheme Design

**What to do**:
- Define content topic format: `/nanoNym/1/{bucket}/{date}/proto`
- Implement bucket derivation: `bucket = H(nnym_pubkey)[0]` (first byte = 256 buckets)
- Implement date formatting for daily partitioning
- Create utility functions in shared module
- Document the scheme

**Must NOT do**:
- Do NOT implement complex epoch/slot system from handover report
- Do NOT add more than 256 buckets

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: Simple utility functions
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 1, 8)
- **Blocks**: Tasks 3, 4
- **Blocked By**: None

**References**:

**Pattern References**:
- `src/app/services/nanonym-crypto.service.ts` - Existing hash utilities (BLAKE2b)

**External References**:
- Waku content topics: https://docs.waku.org/learn/concepts/content-topics

**Acceptance Criteria**:

```bash
# Agent runs:
bun -e "
import { deriveContentTopic, deriveBucket } from './src/app/services/waku-topics';
const pubkey = new Uint8Array(32).fill(0xAB);
const bucket = deriveBucket(pubkey);
const topic = deriveContentTopic(pubkey, new Date('2025-02-01'));
console.log('bucket:', bucket);
console.log('topic:', topic);
"
# Assert: bucket is number 0-255
# Assert: topic matches /nanoNym/1/\d+/2025-02-01/proto
```

**Commit**: YES
- Message: `feat(spike): add Waku content topic scheme (256 buckets + daily)`
- Files: `src/app/services/waku-topics.ts`

---

### Task 3: WakuNotificationService - Sender (LightPush)

**What to do**:
- Create `WakuNotificationService` class (parallel to `NostrNotificationService`)
- Implement `sendNotification()` using `@waku/sdk` LightPush
- Reuse existing NIP-59 style encryption (import from nostr-tools)
- Connect to local nwaku node
- Handle connection errors gracefully

**Must NOT do**:
- Do NOT modify existing `NostrNotificationService`
- Do NOT implement receiver logic (separate task)

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
  - Reason: New service implementation with external library
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Tasks 4, 5)
- **Blocks**: Task 7
- **Blocked By**: Tasks 1, 2

**References**:

**Pattern References**:
- `src/app/services/nostr-notification.service.ts:100-178` - Existing sendNotification pattern with NIP-59 wrapping
- `src/app/services/nanonym-crypto.service.ts` - Encryption utilities

**External References**:
- Waku LightPush: https://docs.waku.org/build/javascript/light-send-receive
- @waku/sdk npm: https://www.npmjs.com/package/@waku/sdk

**Acceptance Criteria**:

```bash
# Unit test (mock nwaku):
npm test -- --include="**/waku-notification.service.spec.ts" --grep="sendNotification"
# Assert: Test passes

# Integration test (requires nwaku running):
# Agent runs via Playwright:
1. Navigate to test harness page
2. Call WakuNotificationService.sendNotification() with test payload
3. Check nwaku REST API for message receipt
4. Assert: Message stored in nwaku
```

**Commit**: YES
- Message: `feat(spike): add WakuNotificationService sender (LightPush)`
- Files: `src/app/services/waku-notification.service.ts`

---

### Task 4: WakuNotificationService - Receiver (Filter)

**What to do**:
- Extend `WakuNotificationService` with `subscribeToNotifications()`
- Implement Filter protocol subscription for real-time messages
- Handle message decryption (trial-decrypt within bucket)
- Emit to `incomingNotifications$` Subject (same pattern as Nostr)
- Implement reconnection on disconnect

**Must NOT do**:
- Do NOT implement Store recovery (separate task)
- Do NOT assume Filter survives iOS background

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
  - Reason: Real-time subscription handling with reconnection logic
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Tasks 3, 5)
- **Blocks**: Tasks 6, 7
- **Blocked By**: Tasks 1, 2

**References**:

**Pattern References**:
- `src/app/services/nostr-notification.service.ts:187-266` - Existing subscription pattern
- `src/app/services/nostr-notification.service.ts:288-331` - Trial decryption handling

**External References**:
- Waku Filter: https://docs.waku.org/build/javascript/light-send-receive#receive-messages-using-filter

**Acceptance Criteria**:

```bash
# Unit test (mock):
npm test -- --include="**/waku-notification.service.spec.ts" --grep="subscribeToNotifications"
# Assert: Test passes

# Integration test (requires nwaku):
# Agent runs via Playwright:
1. Subscribe to notifications in browser
2. Send test notification via LightPush (from Task 3)
3. Assert: incomingNotifications$ emits within 5 seconds
```

**Commit**: YES
- Message: `feat(spike): add WakuNotificationService receiver (Filter)`
- Files: `src/app/services/waku-notification.service.ts`

---

### Task 5: Store Protocol - Paginated Recovery

**What to do**:
- Implement `recoverNotifications(startDate, endDate)` method
- Handle 24-hour time range limit with day-by-day iteration
- Query Store for each 24-hour chunk sequentially
- Merge and deduplicate results
- Track progress for UI feedback

**Must NOT do**:
- Do NOT assume single query works for >24 hours
- Do NOT block UI during long recovery (use async iteration)

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
  - Reason: Pagination logic with time constraints
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Tasks 3, 4)
- **Blocks**: Tasks 6, 7
- **Blocked By**: Task 1

**References**:

**Pattern References**:
- `src/app/services/nostr-notification.service.ts:207-211` - Existing time-based filtering (`since` parameter)

**External References**:
- Waku Store: https://docs.waku.org/build/javascript/store-retrieve-messages

**Acceptance Criteria**:

```bash
# Agent runs via Playwright:
1. Seed nwaku with test messages spanning 7 days
2. Call recoverNotifications(7_days_ago, now)
3. Assert: All 7 days of messages recovered
4. Assert: Progress callback called 7 times (once per day)
5. Assert: No duplicates in results
```

**Commit**: YES
- Message: `feat(spike): add Store protocol paginated recovery (24h chunks)`
- Files: `src/app/services/waku-notification.service.ts`

---

### Task 6: iOS Foreground Recovery Handler

**What to do**:
- Detect app foreground resume (Page Visibility API)
- Trigger Store recovery when app comes to foreground
- Track last known timestamp to avoid re-fetching
- Handle gracefully if Store query fails

**Must NOT do**:
- Do NOT rely on Filter subscription surviving background
- Do NOT try to "fix" iOS WebSocket behavior

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: Simple event handler
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 3 (with Task 7)
- **Blocks**: Task 9
- **Blocked By**: Tasks 4, 5

**References**:

**API References**:
- Page Visibility API: https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API

**Acceptance Criteria**:

```bash
# Agent runs via Playwright:
1. Navigate to test page
2. Subscribe to notifications
3. Simulate page visibility change (hidden → visible)
4. Assert: recoverNotifications() called automatically
5. Assert: No duplicate messages from previous session
```

**Commit**: YES
- Message: `feat(spike): add iOS foreground recovery handler`
- Files: `src/app/services/waku-notification.service.ts`

---

### Task 7: Integration Tests + Playwright Browser Tests

**What to do**:
- Write Karma unit tests for WakuNotificationService
- Write Playwright tests for:
  - Send notification (Chrome, Firefox, webkit)
  - Receive notification real-time
  - 7-day recovery with pagination
  - iOS foreground resume (webkit)
- Test in Brave browser explicitly

**Must NOT do**:
- Do NOT test RLN (out of scope)
- Do NOT test against production Waku network

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
  - Reason: Multiple test frameworks and browser targets
- **Skills**: [`playwright`]
  - `playwright`: For browser automation tests

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 3 (with Task 6)
- **Blocks**: Task 9
- **Blocked By**: Tasks 3, 4, 5

**References**:

**Test References**:
- `src/app/services/nostr-notification.service.spec.ts` - Existing test patterns
- `docs/E2E-TEST-IDS.md` - E2E test ID reference

**Acceptance Criteria**:

```bash
# Unit tests:
npm test -- --include="**/waku-notification.service.spec.ts"
# Assert: All tests pass

# Playwright tests (requires nwaku running):
npx playwright test waku-spike.spec.ts --project=chromium
npx playwright test waku-spike.spec.ts --project=firefox  
npx playwright test waku-spike.spec.ts --project=webkit
# Assert: All browsers pass

# Brave test:
npx playwright test waku-spike.spec.ts --project=chromium --channel=brave
# Assert: Tests pass in Brave
```

**Commit**: YES
- Message: `test(spike): add Waku notification integration and Playwright tests`
- Files: `src/app/services/waku-notification.service.spec.ts`, `e2e/waku-spike.spec.ts`

---

### Task 8: Decision Document Template

**What to do**:
- Create `docs/WAKU-SPIKE-RESULTS.md` template
- Define Go/No-Go criteria
- Placeholder sections for findings
- Comparison matrix: Waku vs Nostr

**Must NOT do**:
- Do NOT fill in results (that's Task 9)

**Recommended Agent Profile**:
- **Category**: `writing`
  - Reason: Documentation task
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 1, 2)
- **Blocks**: Task 9
- **Blocked By**: None

**References**:

**Documentation References**:
- `docs/IPFS-SPIKE-LEARNINGS.md` - Previous spike document pattern

**Acceptance Criteria**:

```bash
# Agent runs:
cat docs/WAKU-SPIKE-RESULTS.md | head -50
# Assert: Contains "Go/No-Go Criteria" section
# Assert: Contains "Comparison Matrix" section
# Assert: Contains placeholder for test results
```

**Commit**: YES
- Message: `docs(spike): add Waku spike results document template`
- Files: `docs/WAKU-SPIKE-RESULTS.md`

---

### Task 9: Go/No-Go Decision and Documentation

**What to do**:
- Run all tests and capture results
- Fill in `docs/WAKU-SPIKE-RESULTS.md` with findings
- Document any issues encountered
- Make explicit Go/No-Go recommendation
- If GO: outline Phase 2 requirements (Codex/Bridge)
- If NO-GO: document reasons and alternatives

**Must NOT do**:
- Do NOT proceed with Phase 2 implementation (separate plan)
- Do NOT make unilateral decisions - present findings

**Recommended Agent Profile**:
- **Category**: `writing`
  - Reason: Documentation and analysis
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 4 (sequential, final)
- **Blocks**: None (final task)
- **Blocked By**: All previous tasks

**References**:

**All Previous Tasks**

**Acceptance Criteria**:

```bash
# Agent runs:
cat docs/WAKU-SPIKE-RESULTS.md | grep -E "(GO|NO-GO)"
# Assert: Contains clear recommendation

# Verify all test results documented:
cat docs/WAKU-SPIKE-RESULTS.md | grep -E "PASS|FAIL"
# Assert: All test sections have results
```

**Commit**: YES
- Message: `docs(spike): complete Waku spike with Go/No-Go decision`
- Files: `docs/WAKU-SPIKE-RESULTS.md`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(spike): add nwaku Docker Compose setup` | docker/nwaku/* | docker compose up |
| 2 | `feat(spike): add Waku content topic scheme` | src/.../waku-topics.ts | unit test |
| 3 | `feat(spike): add WakuNotificationService sender` | src/.../waku-notification.service.ts | unit test |
| 4 | `feat(spike): add WakuNotificationService receiver` | (same file) | unit test |
| 5 | `feat(spike): add Store paginated recovery` | (same file) | unit test |
| 6 | `feat(spike): add iOS foreground recovery` | (same file) | Playwright |
| 7 | `test(spike): add Waku integration tests` | *.spec.ts | npm test |
| 8 | `docs(spike): add results template` | docs/WAKU-SPIKE-RESULTS.md | - |
| 9 | `docs(spike): complete with Go/No-Go decision` | (same file) | - |

---

## Success Criteria

### Verification Commands
```bash
# All unit tests pass
npm test -- --include="**/waku-*.spec.ts"

# All Playwright tests pass
npx playwright test waku-spike.spec.ts

# nwaku health check
curl -s http://localhost:8645/debug/v1/info | jq '.protocols'
```

### Final Checklist
- [ ] Send notification works in browser (LightPush)
- [ ] Receive notification works in real-time (Filter)
- [ ] 7-day recovery works with pagination (Store)
- [ ] Tests pass in Chrome, Firefox, webkit, Brave
- [ ] iOS foreground resume triggers recovery
- [ ] Go/No-Go decision documented
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
