# NanoNym Manual Test Plans

## Full-Circle Test: NanoNym Generation → Send → Receive → Spend

### Test Objective
Verify end-to-end NanoNym functionality: generation → sending → receiving → spending

---

## Environment Setup

### Required
- **Network**: Nano Testnet
- **Relays**: Nostr test relays (e.g., `nostr.wine`, `relay.damus.io`, `nos.lol`)
- **Funding**: Pre-fund both wallets with testnet Nano (e.g., 1 XNO each via faucet)

### Wallets
- **WalletA**: NanoNymNault instance (local or testnet)
- **WalletB**: Any Nano wallet capable of parsing `nnym_` addresses
  - Options: Nault, Nano CLI, or other testnet-enabled wallet

### Preconditions
- [ ] WalletA: NanoNymNault running and synced with testnet
- [ ] WalletB: Testnet wallet running
- [ ] Testnet faucet access or pre-funded accounts
- [ ] Record WalletA seed (for recovery verification if needed):
  - Format: ☐ Hex (64 chars) or ☐ BIP-39 mnemonic
  - Seed: `_______________________________________________`
- [ ] WalletB account created and funded:
  - Account: `nano_...`
  - Initial balance: ≥ 0.2 XNO (for test + fees)

---

## Test Steps

### Phase 1: Generate NanoNym on WalletA

**Checkpoint**: NanoNym Creation & Persistence

#### Action 1.1 – Create NanoNym
- [ ] Open WalletA → **Accounts** page
- [ ] Scroll to **NanoNym Accounts** section
- [ ] Click **"Generate NanoNym"** button
- [ ] Enter label: `Test Nnym Full-Circle`
- [ ] Click **Confirm/Submit**

#### Verification 1.1 – NanoNym Appears
- [ ] NanoNym appears in **NanoNym Accounts** list
- [ ] Status shows: **"active"** (listening to Nostr)
- [ ] Label displays: `Test Nnym Full-Circle`
- [ ] Address field shows `nnym_` prefix
- [ ] Fallback `nano_` address is visible below

#### Verification 1.2 – Address Format
- [ ] NanoNym address length: ~160 characters (base32 encoded)
- [ ] Starts with: `nnym_`
- [ ] Fallback address starts with: `nano_`
- [ ] Fallback address ≠ any of WalletA's standard accounts

#### Verification 1.3 – QR Code
- [ ] Click **"Show QR"** or similar
- [ ] QR code generates without error
- [ ] QR code encodes the NanoNym address

#### Record for This Phase
```
NanoNym Address:     nnym_...
Fallback Address:    nano_...
Label:               Test Nnym Full-Circle
Status:              active
Created Timestamp:   ___:___ (TZ: ___)
```

---

### Phase 2: WalletB Sends to NanoNym

**Checkpoint**: Off-Chain Notification + Stealth Address Derivation

#### Action 2.1 – Send from WalletB
- [ ] Open WalletB → **Send** page
- [ ] Paste NanoNym address from Phase 1 into destination
- [ ] Enter amount: **0.123 XNO** (distinctive for tracking)
- [ ] Memo (optional): `Full-circle test` or leave blank
- [ ] Review transaction details
- [ ] Confirm and send

#### Verification 2.1 – On-Chain Confirmation
- [ ] WalletB shows pending transaction
- [ ] Within 30 seconds: transaction confirmed (block count shows)
- [ ] Transaction status: **Confirmed**

**Record**:
```
TxA Hash:            ___________
Amount Sent:         0.123 XNO
WalletB Balance:     ___ XNO (verify deducted)
Send Timestamp:      ___:___ (TZ: ___)
Confirmation Time:   ___:___ (TZ: ___)
```

#### Verification 2.2 – Nostr Notification Delivery
**Timeline**: Should occur within **10 seconds** of on-chain confirmation

- [ ] Check WalletA → **Accounts** page
- [ ] Look for updated balance or notification indicator on NanoNym
- [ ] If UI shows notification history, verify entry with:
  - Source: Nostr NIP-17 gift-wrapped event
  - Amount: 0.123 XNO
  - Status: **Decrypted and parsed**

**Alternative** (Manual check):
- Open browser console on WalletA (F12)
- Check logs for `[Nostr]` messages
- Should see: `✅ Subscription active` and `🔔 Event received` entries

**Record**:
```
Notification Received:  yes / no / delayed
Time to Notification:   ___ seconds
Nostr Payload Valid:    yes / no
```

---

### Phase 3: WalletA Receives & Verifies Funds

**Checkpoint**: Stealth Account Creation & Balance Aggregation

#### Action 3.1 – View NanoNym Details
- [ ] WalletA → **Accounts** page
- [ ] Locate **"Test Nnym Full-Circle"** in NanoNym Accounts
- [ ] Click on it to expand/view details

#### Verification 3.1 – Aggregated Balance
- [ ] NanoNym balance displays: **≥ 0.123 XNO**
- [ ] Balance is in **XNO** (not raw, not local currency)
- [ ] Payment count incremented (if UI shows: 1+)
- [ ] Status still shows: **"active"**

#### Verification 3.2 – Stealth Accounts List
If UI supports expanding the NanoNym to show underlying stealth accounts:

- [ ] Show **1 stealth account**
- [ ] Stealth account address: `nano_...` (starts with `nano_`, not `nnym_`)
- [ ] Stealth address ≠ Fallback address (from Phase 1)
- [ ] Stealth address ≠ any WalletA standard account
- [ ] Balance: **0.123 XNO** (matches send amount)
- [ ] Received timestamp: matches notification time

#### Verification 3.3 – Private Key Presence
- [ ] Wallet can load the stealth account (no "not found" error)
- [ ] Private key is accessible (will be verified in Phase 4 when spending)
- [ ] Private key derivation: `p_masked = b_spend + t` (internal verification)

#### Record
```
NanoNym Balance:         0.123 XNO
Stealth Account Address: nano_...
Stealth Account Balance: 0.123 XNO
Payment Count:           1
Stealth Created Time:    ___:___ (TZ: ___)
```

---

### Phase 4: WalletA Spends from Stealth Account Back to WalletB

**Checkpoint**: Multi-Account Spend + Return on-chain Confirmation

#### Action 4.1 – Initiate Send from NanoNym
- [ ] WalletA → **Send** page
- [ ] **Source Account**: Select **"Test Nnym Full-Circle"**
  - (Or auto-selects if it's the only available option)
- [ ] Amount: **0.12 XNO** (leaving ~0.003 for fees)
- [ ] Destination: WalletB's regular `nano_...` account
- [ ] Memo (optional): `Full-circle return` or leave blank
- [ ] Click **Review**

#### Verification 4.1 – Privacy Warnings
- [ ] If stealth account selector is shown, confirm it shows the correct stealth address
- [ ] No warning about "multiple accounts linked"
  - (Only 1 stealth account involved, so privacy impact is minimal)
- [ ] Fee calculation shows: **≤ 0.003 XNO**

#### Action 4.2 – Confirm & Send
- [ ] Review transaction details
- [ ] Verify destination is WalletB's account (copy-paste exact address if needed)
- [ ] Click **Confirm/Send**

#### Verification 4.2 – On-Chain Send Pending
- [ ] WalletA shows **pending transaction** (TxB)
- [ ] Within 30 seconds: transaction **confirmed**
- [ ] Source shown: stealth account `nano_...` (NOT fallback, NOT standard account)

**Record**:
```
TxB Hash:                ___________
Amount Spent:            0.12 XNO
Fee Deducted:            ___ XNO
Source Account:          nano_... (stealth)
Destination:             nano_... (WalletB)
Send Timestamp:          ___:___ (TZ: ___)
Confirmation Timestamp:  ___:___ (TZ: ___)
```

#### Verification 4.3 – WalletB Receives Return Funds
- [ ] Open WalletB → Account history / Receive page
- [ ] Find incoming transaction (TxB hash matches)
- [ ] Amount received: **0.12 XNO** (or within ±0.0001 for rounding)
- [ ] Source address: **stealth address** `nano_...`
  - (NOT the NanoNym address)
  - (NOT WalletA's fallback address)
  - (NOT WalletA's standard account)
- [ ] Status: **Confirmed**
- [ ] Memo (if available): matches what was entered, or is empty

**Record**:
```
WalletB Received:        yes / no
Amount Received:         0.12 XNO
From Address:            nano_... (stealth, verified)
WalletB Balance After:   ___ XNO
Receive Timestamp:       ___:___ (TZ: ___)
```

---

## Overall Verification Checklist

### Privacy Properties ✓
- [ ] **Stealth Address Uniqueness**: Each payment to NanoNym generates a unique `nano_` address
  - Stealth ≠ Fallback ✓
  - Stealth ≠ WalletA standard accounts ✓
  - Stealth is ephemeral to this payment ✓

- [ ] **Ephemeral Keypair**: WalletB used random ephemeral key for ECDH
  - Cannot be replayed ✓
  - Cannot be linked to other WalletB transactions ✓

- [ ] **Off-Chain Notification**: Nostr NIP-17 gift-wrapping used
  - Payload encrypted ✓
  - Sender/receiver identity obscured ✓
  - Timestamp randomized (±2 days) ✓

- [ ] **Return Send**: Originates from stealth address
  - Not from fallback ✓
  - Not from standard account ✓
  - Visible on-chain as separate account ✓

### Wallet State Consistency ✓
- [ ] **Balance Aggregation**: NanoNym balance = sum of underlying stealth accounts
  - If multiple stealth accounts: 0.123 + 0.456 + ... ✓
  - Balance updates immediately after notification ✓

- [ ] **Account Hierarchy**: Stealth accounts grouped under NanoNym
  - UI shows stealth accounts as children of NanoNym ✓
  - Can expand/collapse to see stealth list ✓

- [ ] **Key Derivation**: All keys derived deterministically from seed
  - Same seed → same NanoNym ✓
  - Same NanoNym index → same keys ✓
  - Stealth accounts re-derivable from notification payload ✓

- [ ] **Private Key Availability**: Spend possible from all stealth accounts
  - No "private key missing" errors ✓
  - Signing works without manual intervention ✓

### Network & Nostr ✓
- [ ] **Notification Delivery**: Received within acceptable time
  - Target: < 10 seconds ✓
  - Acceptable: < 30 seconds ⚠ (may indicate slow relay)

- [ ] **Relay Connectivity**: No connection errors in logs
  - Subscribed to relays successfully ✓
  - Received events from at least one relay ✓

- [ ] **NIP-17 Compliance**: Gift-wrapping and encryption working
  - Event kind 1059 received ✓
  - Payload decrypts without error ✓
  - Timestamp field present ✓

- [ ] **Payload Format**: Matches NanoNym spec
  - `version: 1` ✓
  - `protocol: "nanoNymNault"` ✓
  - `R` (ephemeral public key) present ✓
  - `tx_hash` (Nano transaction hash) present ✓
  - Optional fields (amount, memo) handled correctly ✓

---

## Success Criteria

| Criterion | Required | Status | Notes |
|-----------|----------|--------|-------|
| NanoNym created and persists | ✓ | ☐ | Should appear on next login |
| WalletB send on-chain confirmed | ✓ | ☐ | TxA: ___ |
| WalletA receives Nostr notification | ✓ | ☐ | Within 30 seconds |
| Stealth address derived correctly | ✓ | ☐ | Matches Nostr payload; ≠ fallback |
| WalletA balance updates | ✓ | ☐ | 0.123 XNO aggregated |
| Private key accessible | ✓ | ☐ | No key missing errors |
| WalletA can spend from stealth | ✓ | ☐ | TxB created and confirmed |
| Return send from stealth address | ✓ | ☐ | Source ≠ fallback, ≠ standard account |
| WalletB receives return funds | ✓ | ☐ | 0.12 XNO received; TxB confirmed |
| All keys deterministic from seed | ✓ | ☐ | Re-derive and verify consistency |
| **OVERALL: PASS / FAIL** | — | **☐** | |

---

## Troubleshooting

| Symptom | Likely Cause | Diagnosis | Action |
|---------|--------------|-----------|--------|
| NanoNym not created | UI crash or form validation | Check browser console (F12) for errors | Refresh page; try again |
| NanoNym created but not persistent | Storage issue | Reload page; check if NanoNym still there | Clear cache; restart wallet |
| WalletB can't parse `nnym_` | Sender doesn't recognize format | WalletB treats as invalid address | Switch to Nault or CLI; manually paste raw address |
| WalletB send fails | Network issue or invalid destination | Check testnet connectivity; verify address format | Retry with different relay or network |
| Nostr notification delayed (>30s) | Relay network latency or offline | Check relay connection logs in WalletA | Try different relay; increase timeout |
| Nostr notification never arrives | Relay offline or subscription failed | Check WalletA Nostr logs for errors | Restart wallet; add more relays; check firewall |
| Stealth address not derived | Notification payload corrupted or missing | Check decrypted payload in WalletA logs | Verify Nostr event on relay; resend |
| Balance doesn't update | Block confirmation pending | Wait 30-60 seconds; check block count | Force refresh; check testnet faucet status |
| Stealth account private key missing | Recovery or storage failure | Try to export keys; check seed | Verify seed is correct; re-import if needed |
| Spend fails: "insufficient balance" | Fee calculation or wrong account selected | Check exact balance; verify source account | Reduce spend amount; check fee estimation |
| Spend fails: "account not found" | Stealth account not synced with testnet node | Check if stealth address has pending opens | Wait for pending block; refresh node state |
| WalletB doesn't receive return send | On-chain confirmation slow | Check TxB block height on testnet explorer | Wait longer; check testnet network status |
| WalletB balance doesn't update | Testnet node sync lag | Check WalletB node connectivity | Refresh; check if block is confirmed |

---

## Automation Mapping (for Playwright)

This manual test plan maps to the following Playwright E2E flow:

```
1. Setup
   - Create two test wallets (or use pre-created)
   - Fund both via testnet faucet

2. Phase 1: Generate
   - Navigate to accounts-page-root
   - Click element [data-testid="nanonym-generate-button"]
   - Fill form [data-testid="nanonym-label-input"]
   - Submit and verify [data-testid="nanonym-address-value"] appears

3. Phase 2: Send
   - Switch to WalletB browser context
   - Navigate to send page
   - Paste NanoNym address from Phase 1
   - Enter amount 0.123
   - Confirm transaction
   - Poll testnet node until TxA confirmed

4. Phase 3: Receive
   - Switch back to WalletA
   - Poll Nostr relays until notification received
   - Verify [data-testid="nanonym-balance-value"] shows ≥ 0.123
   - If UI supports expansion, verify stealth account appears

5. Phase 4: Spend
   - Select source account (stealth)
   - Send 0.12 to WalletB
   - Poll until TxB confirmed
   - Switch to WalletB; verify balance updated
```

See `docs/E2E-TEST-IDS.md` for test ID naming conventions.

---

## Notes for Testers

### Timing Expectations
- **Nano block confirmation**: 20–60 seconds (testnet)
- **Nostr notification delivery**: < 10 seconds typical, < 30 seconds acceptable
- **Wallet refresh cycle**: 5–10 seconds (may need manual refresh)

### Test Isolation
- Use unique NanoNym labels per test run (e.g., `Full-Circle Test Run #1`)
- Keep test wallets separate from personal wallets
- Clean up after: archive test NanoNyms, return testnet funds

### Verification Tools
- **Testnet Explorer**: Check TxA and TxB hashes
  - Example: `https://testnet-explorer.nanocrawler.cc/`
- **Nostr Client**: View raw events (if relay supports it)
  - Example: `https://nostrmyth.com/`
- **Browser Console**: Check wallet logs (F12)
  - Filter by: `[Nostr]`, `[Derivation]`, `Stealth`

### Common Pitfalls
1. **Forgetting testnet prefix**: Ensure accounts are created on testnet, not mainnet
2. **Stale NanoNym**: If deleting and recreating, wait 30s for relays to drop old subscription
3. **Memo confusion**: Optional field; may show as empty or not at all in some wallets
4. **Fee variability**: Testnet fees are minimal; don't use for mainnet fee estimation

---

## Cleanup

After test completion:

- [ ] Archive or delete test NanoNym (optional, but good practice)
- [ ] Transfer remaining testnet funds to faucet return address or keep for future tests
- [ ] Clear WalletB send history (if sensitive)
- [ ] Note test outcome and any issues found

---

## Test Variations (Future)

Once basic full-circle passes, consider these variations:

- **Multiple Payments**: Send to same NanoNym twice; verify balance aggregation
- **Multi-Relay**: Use 3+ Nostr relays; verify notification consistency
- **Offline Recovery**: Restart WalletA without local state; verify recovery from Nostr history
- **Fee Stress**: Send tiny amounts (< 1 µXNO); verify fee handling
- **Concurrent Sends**: WalletB sends to same NanoNym from different accounts; verify no collision

