# NanoNymNault Testing Guide

**Audience:** Developers and testers working on NanoNymNault
**Updated:** 2025-11-15

---

## Overview

NanoNymNault uses a pragmatic testing approach prioritizing working features over test coverage during active development. Automated end-to-end tests will be added once core functionality (especially spending) is stable.

---

## Current Testing Approach

### Unit Tests (Jasmine/Karma)

**Framework:** Jasmine + Karma
**Scope:** Cryptographic operations, services, pipes
**Status:** Passing for NanoNym-specific code

**Running tests:**

```bash
# Prerequisites
# - Node.js v16.20.2 (via nvm)
# - Chrome/Chromium or Brave Browser

# Switch to Node v16
source ~/.nvm/nvm.sh
nvm use 16

# Run unit tests (using Brave as Chrome substitute)
CHROME_BIN="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" npm test
```

**Note on legacy Nault tests:**
- Many inherited Nault tests fail due to missing DI providers
- See `docs/NAULT-TESTS.md` for detailed analysis
- NanoNymNault-specific tests (crypto, NanoNym services) are passing

**Test files:**
- `src/app/services/nanonym-crypto.service.spec.ts` - Cryptography unit tests
  - **CRITICAL PATH:** "Full sender-receiver cryptographic roundtrip" tests
    - Verifies sender and receiver derive identical stealth addresses
    - Verifies receiver's derived private key controls sender's public key
    - Verifies receiver can spend from stealth accounts
    - Tests multiple payments for unlinkability
- `src/app/services/nostr-notification.service.spec.ts` - Nostr integration tests
- Additional service and pipe tests inherited from Nault

---

### Manual Testing (Current Standard)

**Verified workflows:**

#### Send to NanoNym
1. Generate NanoNym in Wallet A (Receive tab)
2. Copy `nnym_` address
3. Send XNO from Wallet B to `nnym_` address
4. Verify Nostr notification sent (console logs)
5. Verify Nano transaction on testnet block explorer

#### Receive from NanoNym
1. Wallet A monitors Nostr relays (background)
2. Notification arrives and decrypts successfully
3. Stealth address derived automatically
4. Balance updates in UI
5. Verify stealth account funded on-chain (testnet block explorer)

**Test environment:**
- **Browsers:** Two tabs/windows (Chrome, Brave, Firefox)
- **Network:** Nano testnet (https://test.nano.org)
- **Nostr relays:** 3-5 public relays (relay.damus.io, nos.lol, etc.)

**Verified functionality:**
- ✅ NanoNym generation (multi-account from single seed)
- ✅ Send to `nnym_` addresses (stealth address derivation)
- ✅ Nostr notification encryption/decryption (NIP-59 gift-wrapping)
- ✅ Stealth account balance display
- ✅ Balance aggregation across multiple stealth accounts
- ✅ Archive/reactivate NanoNyms

**Known blockers:**
- ❌ Spending FROM stealth accounts (Phase 4D in progress)

---

## Future: End-to-End Test Suite (Playwright)

**Timeline:** After Phase 4D (spending) and Phase 5 (advanced features) are complete

**Strategy:**
- Full UI automation via Playwright
- Real testnet transactions (not mocked)
- Headless Chrome execution
- CI/CD integration

**Critical test paths:**
1. **Full payment cycle:**
   - Generate NanoNym
   - Send to `nnym_` from different wallet
   - Receive notification
   - Verify balance updated
   - Spend from stealth account
   - Verify funds sent on-chain

2. **Privacy features:**
   - Multi-account spending triggers privacy warning
   - Privacy warning displays correct account count
   - "Review Inputs" shows accurate stealth account list
   - Privacy Mode adds delays (optional)

3. **Backup & recovery:**
   - Generate NanoNym + receive payment
   - Export seed phrase
   - Clear wallet state
   - Import seed phrase
   - Verify NanoNyms and balances recovered

4. **Edge cases:**
   - Handle unopened stealth addresses (pending receives)
   - Multiple NanoNyms with same labels
   - Nostr relay failures (redundancy test)
   - Invalid `nnym_` address format

**Test environment setup:**
- Nano testnet faucet for funding test wallets
- Multiple Nostr relay connections
- Playwright browsers (Chromium, Firefox, WebKit)
- Docker containers for consistency (optional)

**Success criteria:**
- All tests pass without manual intervention
- Test suite completes in < 5 minutes
- No flaky tests (>99% pass rate)
- Can run in GitHub Actions CI

**See also:** CLAUDE.md Section 12 (Phase 6: Hardening & E2E Testing) for detailed implementation plan

---

## Test Data Management

**Test seeds:**
- Use deterministic test seeds (same seed = same NanoNyms = reproducible tests)
- Never use real mainnet funds for testing
- Document test seed indices for reference

**Test NanoNyms:**
```
# Example test NanoNym (testnet only)
Index 0: "Test Donations" - nnym_1test...
Index 1: "Test Store" - nnym_1test...
```

**Nostr test keys:**
- Derived from test seed (no manual key management)
- Testnet notifications only (don't spam production relays)

---

## Debugging Tests

### Unit test failures

```bash
# Run single test file
npm test -- --include='**/nanonym-crypto.service.spec.ts'

# Run with Chrome DevTools debugger
npm test -- --browsers=ChromeDebugging
```

### Manual test failures

**Check console logs:**
- `[Nostr]` - Nostr relay connections and events
- `[Manager]` - NanoNym manager processing
- `[Crypto]` - Cryptographic operations

**Common issues:**
- **No notification received:** Check Nostr relay connectivity (multiple relays should connect)
- **Balance not updating:** Verify stealth address derivation matches sender's calculation
- **Blockchain verification fails:** Check testnet node availability

---

## Contributing Tests

**Pull requests should include:**
- Unit tests for new services and crypto functions
- Manual test verification notes (which workflows were tested)
- Screenshots/console logs for UI changes

**Do NOT:**
- Add tests for legacy Nault code (shallow coverage, high maintenance)
- Add e2e tests until Phase 6 (premature - UI still evolving)

---

## Reference Documentation

- **Nault test infrastructure:** `docs/NAULT-TESTS.md`
- **Test planning:** `CLAUDE.md` Section 12 (Implementation Roadmap)
- **CI/CD workflows:** `.github/workflows/`

---

## Questions?

Open an issue: https://github.com/cbrunnkvist/NanoNymNault/issues
