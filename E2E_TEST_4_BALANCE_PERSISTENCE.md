# E2E Test 4: Balance Persistence Across Wallet Reload

## Objective
Verify that stealth account balances, metadata, and aggregation survive wallet reload (page refresh, browser restart, or new device with same seed).

## Test Scope
- Client-side localStorage persistence
- Seed-based recovery of stealth accounts
- Balance re-sync from Nano node after reload
- Nostr history reconstruction
- NanoNym metadata preservation

## Prerequisites
- Completed E2E Test 3 (multi-payment scenario)
- WalletB with 3 stealth accounts totaling 3.5 XNO
- All 3 stealth accounts must have valid on-chain balances
- Browser developer tools access (for localStorage inspection)

## Test Scenario Setup

### Baseline State (After E2E Test 3)
**WalletB should have:**
- 1 Active NanoNym labeled "Test Multi-Payment NanoNym"
- 3 Stealth accounts with balances:
  - Account A: 1.0 XNO
  - Account B: 0.5 XNO
  - Account C: 2.0 XNO
- Aggregated balance: 3.5 XNO
- Payment count: 3 payments
- All accounts with "OPENED" status (frontier confirmed on-chain)

## Execution

### Test 4A: Page Reload (Soft Reload)

**Step 1: Record Baseline State**
1. Open WalletB Accounts page
2. Screenshot or note:
   - NanoNym account row with balance `3.5 XNO` and `3 payments`
   - All 3 stealth accounts in details modal
3. Open browser DevTools → Application → LocalStorage
4. **Record**: `nano_nymnym_accounts_...` key value (size and checksum)

**Step 2: Hard Reload**
1. Press `Cmd+Shift+R` (macOS) or `Ctrl+Shift+R` (Linux/Windows) for hard reload
2. Wait for page to fully load
3. Monitor console for recovery logs:
   - Should see `[NanoNym] Reconstructing stealth accounts from storage`
   - Should see `[NanoNym] ✅ Stealth account restored: nano_1...`

**Step 3: Verify State Recovery**
1. Wait for Nostr subscriptions to reconnect (5-10 seconds)
2. Open Accounts page > NanoNym section
3. **Verify**:
   - [ ] NanoNym still shows `3.5 XNO` balance
   - [ ] Payment count still shows `3 payments`
   - [ ] All 3 stealth accounts visible in details modal
   - [ ] Each account shows correct balance (1.0, 0.5, 2.0)

**Expected Console Output**:
```
[NanoNym] Reconstructing stealth accounts from storage
[NanoNym] ✅ Stealth account restored: nano_1aaaa... (1.0 XNO)
[NanoNym] ✅ Stealth account restored: nano_1bbbb... (0.5 XNO)
[NanoNym] ✅ Stealth account restored: nano_1cccc... (2.0 XNO)
[NanoNym] Aggregated balance: 3.5 XNO
```

### Test 4B: Browser Storage Inspection

**Step 1: Inspect localStorage**
1. Open DevTools → Application → LocalStorage
2. Find keys starting with `nano_`
3. Expand and verify:
   - `nano_nymnym_index_...` keys exist for each stealth account
   - Each entry contains:
     - `address`: stealth account address
     - `privateKey`: encrypted or stored securely
     - `balance`: current balance
     - `R`: ephemeral public key from Nostr notification
4. **Record**: Structure and completeness of stored data

**Step 2: Cross-Check Balances**
1. For each stored stealth account:
   - Cross-reference address with Nano node balance
   - Verify stored balance matches on-chain balance
   - Ensure balance is not stale

### Test 4C: Wallet Lock/Unlock Cycle

**Step 1: Lock Wallet**
1. Click Settings (if available) or use Wallet Lock feature
2. Monitor UI: should show "Wallet Locked" indicator
3. Verify:
   - [ ] Stealth accounts remain visible (no sensitive data exposed)
   - [ ] Balances still display (public information)
   - [ ] Cannot view/copy private keys

**Step 2: Unlock Wallet**
1. Click "Unlock Wallet"
2. Enter password
3. Verify:
   - [ ] Stealth accounts remain unchanged
   - [ ] Balances unchanged
   - [ ] Can now copy/view addresses

### Test 4D: Seed Recovery (Optional Advanced Test)

**Prerequisites**: Must have backed up WalletB's seed

**Step 1: Export Seed**
1. Open WalletB Settings
2. Export seed or write down mnemonic/hex
3. **Record**: Seed value (securely)

**Step 2: Clear localStorage (Simulate New Device)**
1. Open DevTools → Application → LocalStorage
2. Select all `nano_*` keys related to NanoNyms
3. Delete all entries
4. Force refresh: `Cmd+Shift+R`

**Step 3: Import Same Seed**
1. Create new wallet session with same seed
2. Navigate to Accounts page
3. Monitor console for recovery:
   ```
   [NanoNym] Deriving NanoNyms from seed...
   [NanoNym] ✅ NanoNym index 0 recovered
   [NanoNym] Fetching Nostr history for recovery...
   [NanoNym] ✅ Stealth account recovered: nano_1...
   ```

**Step 4: Verify Full Recovery**
1. Wait 15-30 seconds for Nostr relay reconnection and history fetch
2. Open NanoNym details
3. **Verify**:
   - [ ] All 3 stealth accounts appear with correct balances
   - [ ] Aggregated balance: 3.5 XNO
   - [ ] Payment count: 3 payments
   - [ ] No "Bad signature" errors in console

**Expected Behavior**:
- Stealth accounts recovered from **Nostr notifications** (Tier 1 recovery)
- If relays unavailable, fall back to **encrypted backup notes** (Tier 2)
- Balances fetched fresh from Nano node (up-to-date)

## Verification Checklist

### localStorage Persistence
- [ ] All `nano_nymnym_*` keys present after reload
- [ ] No data corruption or missing fields
- [ ] Timestamps reflect last sync time

### Balance Accuracy
- [ ] 3.5 XNO aggregate balance persists after reload
- [ ] Individual stealth account balances unchanged
- [ ] Payment metadata (amount, timestamp) preserved
- [ ] No balance drift or rounding errors

### UI State Recovery
- [ ] Active/Archived NanoNym status preserved
- [ ] NanoNym label preserved
- [ ] Transaction history visible and complete
- [ ] Account ordering unchanged

### Spend Functionality Post-Reload
- [ ] Can send from stealth accounts without re-opening
- [ ] Frontier block information cached/re-fetched correctly
- [ ] No "account not found" or "no frontier" errors

### Seed Recovery
- [ ] Same seed recovers identical NanoNyms (same addresses)
- [ ] Same seed recovers identical stealth accounts
- [ ] Recovery completes without user intervention
- [ ] Recovery works even with cleared localStorage

## Edge Cases to Test

### Scenario A: Partial localStorage Corruption
1. Delete one stealth account entry from localStorage
2. Reload page
3. **Expected**: Nostr recovery reconstructs missing entry

### Scenario B: Node Sync Lag
1. Reload while Nano node is slower than usual
2. **Expected**: UI shows "syncing..." and updates when node responds

### Scenario C: Relay Unavailability
1. Reload with all Nostr relays temporarily blocked
2. **Expected**: Falls back to encrypted backup or cached data
3. Recovery completes when relays available again

## Success Criteria

✅ **Test Passes If:**
1. Page reload restores all 3 stealth accounts and their balances
2. Aggregated balance remains 3.5 XNO across reload
3. localStorage contains all necessary persistent data
4. Seed recovery reconstructs identical NanoNyms and stealth accounts
5. No "Bad signature" or "Account not found" errors
6. Balances re-sync from on-chain after reload
7. All accounts remain spendable

❌ **Test Fails If:**
- Any stealth account balance lost after reload
- Aggregated balance incorrect after reload
- localStorage data corrupted or missing
- Seed recovery produces different accounts (determinism broken)
- Old balance cached when on-chain balance changed
- Cannot spend from accounts after reload

## Post-Test Analysis

### Data Retention Strategy
Document what data is:
- **Stored in localStorage**:
- **Fetched from Nano node**:
- **Fetched from Nostr relays**:
- **Derived from seed**:

### Performance Metrics
Record timing:
- **Page reload time**: ___ ms
- **Stealth account recovery time**: ___ ms
- **Nostr history fetch time**: ___ ms
- **Balance sync time**: ___ ms
- **Total "ready to spend" time**: ___ ms

### Storage Efficiency
- **localStorage size for 3 accounts**: ___ KB
- **localStorage size per additional account**: ___ KB
- **Estimated max localStorage usage** (100 accounts): ___ KB

## Next Steps

Upon successful completion of E2E Test 4:
- [ ] All core workflow tests passing (E2E Tests 1-4)
- [ ] Ready for beta testing with real users
- [ ] Consider implementing automated E2E tests (Playwright/Cypress)
- [ ] Proceed to Phase 6: Enhanced observability and logging
- [ ] Schedule security audit of cryptographic implementation

## Notes

```
Date: _______________
Device: _______________
Browser/Version: _______________
Notable observations:
-
-
-
```
