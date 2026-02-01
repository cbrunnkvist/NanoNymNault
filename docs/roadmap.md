# NanoNymNault: Implementation Roadmap

**Current status as of 2026-01-31**

---

## Completed Phases

### ✅ Phase 1 – Crypto Core (Complete)
- Address encoding/decoding
- Key derivation paths
- ECDH shared secret computation
- Stealth address derivation
- Unit tests for all cryptographic primitives

### ✅ Phase 2 – Nostr Integration (Complete)
- NIP-17 gift-wrapped event encryption/decryption
- Multi-relay publish and subscribe
- Nostr relay connection management
- Auto-reconnect on failures
- Notification payload parsing

### ✅ Phase 3 – Send UI and Spend-from-NanoNyms (Complete)
- Detect `nnym_` addresses and perform stealth send + Nostr notification
- Stealth account selection algorithm + 15 passing unit tests
- Privacy warnings and multi-account sending
- Privacy impact display
- Balance persistence and spending fixes (Nov 18, 2025)

### ✅ Phase 4 – Accounts Page Integration (Complete)
- NanoNyms treated as aggregated accounts on Accounts page
- Reactive balance updates with automatic Nano node verification
- Grouped display: Regular Accounts + NanoNym Accounts sections
- Balance aggregation and stealth account management

### ✅ Phase 5 – Receive UI & Stealth Account Opening (Complete, Nov 28, 2025)
- Multi-NanoNym management (generation, listing, balances)
- Background Nostr monitoring and history reconstruction
- Migration to Accounts page
- **Stealth account opening workflow (three-phase defense-in-depth):**
  - Phase 1: Immediate opening on notification (`receiveStealthFunds()`)
  - Phase 2: Background retry mechanism (5-min interval, 12 retries max)
  - Phase 3: Just-in-time opening before spend (`ensureStealthAccountsOpened()`)
  - All phases implemented in `nanonym-manager.service.ts` and `send.component.ts`
  - Comprehensive test coverage in `send.component.spec.ts` (8 tests for Phase 3)
- Receive page cleanup (orphaned modal code removed)

### ✅ Phase 6 – Observability and Logging (Complete, Nov 18, 2025)
- Improved Nostr relay logging with appropriate log levels
- MAC-check match logging
- Relay connection/disconnection lifecycle logging
- Derivation path debug logging for both account types

---

## Planned Phases

### 🔜 Phase 7 – Privacy Mode and Advanced Spend Options
- Optional timing randomization between multi-account sends
- Privacy scoring and per-send impact summary
- Enhanced privacy warnings with detailed linkage analysis
- User-configurable privacy settings

**Acceptance criteria:**
- [ ] Privacy Mode toggle in settings
- [ ] Delay randomization working (10-30 seconds between sends)
- [ ] In-progress state visible during delayed sends
- [ ] Cancellation support during multi-account send

### 🔜 Phase 8 – Stealth Account Consolidation Tools
- Sweep multiple stealth accounts into single account
- Clear privacy warnings before consolidation
- User-configurable filters (e.g., "older than X days")
- Consolidation to standard `nano_` or deterministic consolidation account

**Acceptance criteria:**
- [ ] UI for selecting stealth accounts to consolidate
- [ ] Privacy impact warning showing which accounts will be linked
- [ ] Option to consolidate to standard account or new deterministic account
- [ ] Confirmation dialog with explicit user consent

### 🔜 Phase 9 – Tier 2 Backup Mechanisms
- Downloadable encrypted backup files
- Optional paid archival relay integration
- Custom relay configuration
- Backup verification and restore testing

**Acceptance criteria:**
- [ ] Export encrypted backup file (user saves to cloud storage)
- [ ] Import backup file and verify all NanoNyms recovered
- [ ] UI for configuring custom archival relays
- [ ] Documentation for backup best practices

### 🔜 Phase 10 – Automated E2E Tests
- Playwright-based E2E test suite
- Full flows on Nano testnet + real Nostr relays
- Automated regression testing
- CI/CD integration

**Acceptance criteria:**
- [ ] E2E tests for full send/receive workflow
- [ ] E2E tests for recovery from seed
- [ ] E2E tests for multi-payment aggregation
- [ ] E2E tests for balance persistence
- [ ] All tests passing in CI/CD pipeline

### 🔜 Phase 11 – Community Beta and Hardening
- Security audit (if budget permits)
- Community beta testing program
- Bug fixes and UX improvements based on feedback
- Performance optimization
- Documentation improvements

**Acceptance criteria:**
- [ ] Beta program launched with 10+ testers
- [ ] All critical bugs fixed
- [ ] Security audit completed (or findings documented)
- [ ] User documentation complete
- [ ] Performance benchmarks established

---

## Test Coverage Status

### Unit Tests
- ✅ Address encoding/decoding
- ✅ Key derivation paths (both hex seeds and BIP-39 mnemonics)
- ✅ Account selection algorithm (15 passing tests)
- ✅ Stealth account opening (8 tests for Phase 3)
- ⏳ Privacy Mode timing randomization (planned)
- ⏳ Consolidation algorithm (planned)

### Integration Tests
- ✅ Nostr send/receive with mocked relays
- ⏳ Multi-relay redundancy testing (planned)
- ⏳ Wallet unlock/lock scenarios (planned)

### E2E Tests
- ⏳ Full send/receive flow on Nano testnet (planned)
- ⏳ Recovery from seed (planned)
- ⏳ Multi-payment aggregation (planned)
- ⏳ Balance persistence across restarts (planned)

### Manual Tests
- ✅ Send to NanoNym workflow
- ✅ Receive from NanoNym workflow
- ✅ Multi-account spending
- ✅ Balance aggregation
- ✅ Stealth account opening (all three phases)
- ⏳ Privacy Mode (planned)
- ⏳ Consolidation (planned)

---

## Known Issues

See [../KNOWN_ISSUES.md](../KNOWN_ISSUES.md) for tracked bugs and issues.

**High Priority:**
- None currently

**Medium Priority:**
- Representative initialization for new wallets (UX improvement planned)

**Low Priority:**
- None currently

---

## Future Enhancements (Backlog)

### Protocol v2 Ideas
- Notification ACKs (sender confirmation)
- Nostr key rotation and updated NanoNym address version
- Cross-currency / cross-chain standardization
- Light-client view key delegation
- Compact filters or partial indexes to improve recovery efficiency

### Advanced Features
- More sophisticated spend selection strategies (knapsack solver)
- Scheduled or rules-based consolidation (opt-in automation)
- Multi-sig support for NanoNyms
- Hardware wallet integration for NanoNym key derivation

### UX Improvements
- QR code scanning improvements
- Better privacy impact visualization
- Spending history analytics
- Representative management for stealth accounts

---

## Metrics & Success Criteria

### Current Metrics
- **Core functionality:** ✅ Working
- **Test coverage:** ~60% (unit tests)
- **E2E coverage:** 0% (manual testing only)
- **Known bugs:** 0 critical, 1 medium, 0 low

### Target Metrics (Phase 11 Completion)
- **Test coverage:** ≥80% (unit + integration)
- **E2E coverage:** ≥90% (critical paths)
- **Known bugs:** 0 critical, ≤2 medium, ≤5 low
- **Beta testers:** 10+ active users
- **Security audit:** Complete (or findings documented)

---

## Release Plan

### Alpha (Current)
- Developer preview only
- Core functionality working
- Limited testing
- **Status:** Live at https://cbrunnkvist.github.io/NanoNymNault/

### Beta (Target: Q2 2026)
- Community beta program
- E2E tests complete
- Security audit initiated
- **Prerequisites:** Phases 7-10 complete

### v1.0 (Target: Q3 2026)
- Production release
- Security audit complete
- All critical bugs fixed
- Comprehensive documentation
- **Prerequisites:** Phase 11 complete
