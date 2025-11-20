# E2E Test 3: Multi-Payment Scenario - Aggregation Verification

## Objective
Verify that multiple payments sent to the same NanoNym create separate stealth accounts and aggregate correctly.

## Test Scope
- Multiple payments to same NanoNym
- Balance aggregation across stealth accounts
- Transaction history accuracy
- Account metadata (payment count, status)

## Prerequisites
- Two separate browser instances or wallets:
  - **WalletA**: Standard wallet with sufficient balance (suggest 5+ XNO)
  - **WalletB**: NanoNymNault with at least one NanoNym created
- Access to browser developer console for monitoring logs
- Access to Nostr relay monitoring (optional, for verification)

## Test Scenario Setup

### Step 0: Create NanoNym in WalletB
1. Open WalletB in Accounts page
2. Click "Add New NanoNym" button
3. Enter label: `"Test Multi-Payment NanoNym"` (or similar)
4. Unlock wallet if prompted
5. Copy the generated NanoNym address (format: `nnym_...`)
6. **Note**: Record the exact address for later verification

### Step 1: Configure Payment Amounts
Define three payment amounts to send from WalletA to the NanoNym:
- **Payment 1**: 1.0 XNO
- **Payment 2**: 0.5 XNO
- **Payment 3**: 2.0 XNO
- **Expected Total**: 3.5 XNO

## Execution

### Payment 1: Send 1.0 XNO
**WalletA (Sender):**
1. Open Send page
2. Paste NanoNym address into "To" field
3. Enter amount: `1.0`
4. Review transaction details
5. Click "Confirm & Send"
6. Confirm privacy warning if shown
7. Wait for "✅ Transaction sent" confirmation
8. **Record**: Transaction hash from console log `[Send-NanoNym] ✅ Transaction X sent:`

**WalletB (Receiver):**
1. Monitor browser console for Nostr notification:
   ```
   [NanoNym] ✅ Stealth account opened for NanoNym
   ```
2. Verify in Accounts page > NanoNym section:
   - Balance shows `1.0 XNO`
   - Payment count shows `1 payment`
3. Click on NanoNym row to view details
4. Verify one stealth account is listed with `1.0 XNO` balance

### Payment 2: Send 0.5 XNO
**WalletA (Sender):**
1. Repeat Send flow with amount `0.5`
2. Confirm and send
3. **Record**: Transaction hash

**WalletB (Receiver):**
1. Monitor console for second Nostr notification and stealth account opening
2. Verify in Accounts page > NanoNym details:
   - Aggregated balance now shows `1.5 XNO` (1.0 + 0.5)
   - Payment count shows `2 payments`
3. Verify TWO stealth accounts listed, with balances:
   - Stealth Account 1: `1.0 XNO`
   - Stealth Account 2: `0.5 XNO`

### Payment 3: Send 2.0 XNO
**WalletA (Sender):**
1. Repeat Send flow with amount `2.0`
2. Confirm and send
3. **Record**: Transaction hash

**WalletB (Receiver):**
1. Monitor console for third Nostr notification and stealth account opening
2. Verify in Accounts page > NanoNym details:
   - Aggregated balance now shows `3.5 XNO` (1.0 + 0.5 + 2.0)
   - Payment count shows `3 payments`
3. Verify THREE stealth accounts listed, with balances:
   - Stealth Account 1: `1.0 XNO`
   - Stealth Account 2: `0.5 XNO`
   - Stealth Account 3: `2.0 XNO`

## Verification Checklist

### Balance Aggregation
- [ ] After Payment 1: Balance = `1.0 XNO`, count = `1 payment`
- [ ] After Payment 2: Balance = `1.5 XNO`, count = `2 payments`
- [ ] After Payment 3: Balance = `3.5 XNO`, count = `3 payments`

### Stealth Account Isolation
- [ ] Each payment creates a separate stealth account (different address)
- [ ] Each account has independent balance tracking
- [ ] No balance is merged or consolidated on-chain

### Transaction History
- [ ] NanoNym details modal shows all 3 payments
- [ ] Each payment has correct amount and timestamp
- [ ] Each payment has associated Nostr `R` value visible in advanced view

### Crypto Verification (Advanced)
- [ ] Console logs show successful Schnorr signature verification for each receive block
- [ ] No "Bad signature" errors in console
- [ ] Each stealth account has unique private key derived correctly
- [ ] Each account can verify its associated Nostr notification payload

## Expected Console Output Pattern

```
[NanoNym] Processing Nostr notification for NanoNym index 0
[NanoNym] Notification payload: {...}
[NanoNym] Computed stealth address: nano_1...
[NanoNym] ✅ Stealth account opened for NanoNym: nano_1...
[NanoNym] Balance update: 1.0 XNO (1 payment)
...
[NanoNym] ✅ Stealth account opened for NanoNym: nano_1... (different address)
[NanoNym] Balance update: 1.5 XNO (2 payments)
...
[NanoNym] ✅ Stealth account opened for NanoNym: nano_1... (different address)
[NanoNym] Balance update: 3.5 XNO (3 payments)
```

## Success Criteria

✅ **Test Passes If:**
1. All 3 payments successfully open unique stealth accounts
2. Aggregated balance correctly equals sum of all stealth accounts (3.5 XNO)
3. Payment count matches number of stealth accounts created (3)
4. No "Bad signature" errors occur during any receive block publishing
5. All stealth accounts remain spendable (can send from NanoNym)
6. Balances persist in UI across page refresh

❌ **Test Fails If:**
- Any payment fails to open stealth account (still shows "Bad signature")
- Aggregated balance is incorrect (less than 3.5 XNO)
- Any stealth account shows duplicate address
- Stealth accounts cannot be spent (would fail in E2E Test 2 scenario)
- Balance disappears on page refresh

## Additional Observations

- **Privacy**: Each stealth account has a unique on-chain address; outside observer cannot link the 3 payments together
- **Spend Limitation**: If WalletB spends from all 3 stealth accounts to same destination, they become linked on-chain (documented privacy trade-off)
- **Recovery**: Single seed recovers all 3 stealth accounts and their balances on new device

## Post-Test Notes

Record any deviations, errors, or edge cases encountered:

```
Date: _______________
Environment: [testnet/custom relay]
Browser: _______________
Notable observations:
-
-
-
```

## Next Step

Once E2E Test 3 passes, proceed to **E2E Test 4: Balance Persistence** which will verify that reloading the wallet restores all stealth accounts and balances correctly.
