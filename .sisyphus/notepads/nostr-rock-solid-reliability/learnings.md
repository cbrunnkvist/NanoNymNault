# Learnings
- Implementing SimplePool with enablePing and enableReconnect improves reliability in Nostr notifications.
- Placeholder getLastSeenTimestamp is a safe stub to decouple timing logic from current state service.

## 2026-02-13 - Plan Completion

### Architecture Patterns Used
- **Durable Queue Pattern**: NostrSendQueueService uses localStorage + BehaviorSubject for persistent retry logic
- **Sync State Pattern**: NostrSyncStateService tracks per-NanoNym last-seen timestamps with debounced persistence
- **Rolling Window Deduplication**: Keep last 1000 processed event IDs to prevent memory bloat
- **6-day Buffer**: Account for NIP-59 timestamp randomization (±2 days × 3 for safety margin)

### Key Implementation Details
- localStorage keys: `nostr_send_queue`, `nostr_sync_${nanoNymIndex}`
- Exponential backoff: BASE_DELAY_MS * 2^(attempts-1), capped at MAX_DELAY_MS
- Cold recovery: 90 days lookback for fresh NanoNyms, lastSeen - 6 days for existing
- Per-relay tracking via `relayResults` object in queue items

### Testing Strategy
- 21 integration tests added covering: SimplePool config, deduplication, sync state, cold recovery, manual rescan
- Tests use dependency injection with mock services
- 173 tests pass, 11 pre-existing failures in NanoNymManagerService (unrelated to this work)

### Commits Created
1. `feat(nostr): add durable send queue and sync state services`
2. `feat(nostr): integrate reliability features into notification flow`
3. `feat(nostr): add manual rescan button with configurable timeframe`
4. `docs: add JSON examples and integration tests for Nostr reliability`