# NanoNym Protocol Specification

This document defines **WHAT** the NanoNym protocol does and how components interact. For **WHY** we designed it this way, see [project-context.md](project-context.md).

---

## 1. Terminology

- **NanoNym**: A reusable payment code (the `nnym_...` address string)
- **Aggregated account**: Each NanoNym is treated as an aggregated account that sums the balances of its underlying stealth accounts
- **Stealth accounts**: Individual `nano_` addresses created for each payment received to a NanoNym
- **Standard accounts**: Regular Nano accounts managed by the wallet's standard account manager

---

## 2. NanoNym Address Format (`nnym_`)

### Binary Layout (99 bytes before base32 encoding)

- Byte 0: version = `0x01` (v1)
- Bytes 1–32: `B_spend` (Ed25519 public key)
- Bytes 33–64: `B_view` (Ed25519 public key)
- Bytes 65–96: `nostr_public` (Secp256k1 public key, 32 bytes)
- Bytes 97–98: checksum (first 2 bytes of BLAKE2b-5 hash over previous bytes)

### Encoding

- Use Nano-style base32 alphabet
- Final human-readable format: `nnym_<base32>` (~160 characters)

### Properties

- All NanoNyms are structurally identical, infinitely reusable
- Multiple NanoNyms derived from a single seed
- User chooses usage model (public, per-customer, per-department, etc.)
- Compatibility: Non-supporting wallets will reject `nnym_` addresses

---

## 3. Send Workflow (Sender → NanoNym)

When the sender inputs a `nnym_` address:

1. **Parse `nnym_`:** Extract `B_spend`, `B_view`, `nostr_public`

2. **Generate ephemeral keypair:**
   - `r = random_scalar()`
   - `R = r * G` (ephemeral public key)

3. **ECDH shared secret:**
   - `shared_secret = r * B_view`

4. **Compute tweak scalar:**
   - `t = BLAKE2b(shared_secret_x || R || B_spend)`

5. **Derive one-time stealth address:**
   - `P_masked = B_spend + (t * G)`
   - `masked_nano_address = nano_encode(P_masked)`

6. **On-chain payment:**
   - Send XNO to `masked_nano_address`
   - (Looks like standard Nano payment, no special markers)

7. **Off-chain Nostr notification payload:**
   ```json
   {
     "version": 1,
     "protocol": "nanoNymNault",
     "R": "hex(R)",
     "tx_hash": "nano_tx_hash",
     "amount": "optional_display_amount_xno",
     "amount_raw": "optional_raw_amount",
     "memo": "optional_encrypted_memo"
   }
   ```

8. **NIP-17 gift-wrapping:**
   - Inner encryption: payload to recipient's `nostr_public`
   - Outer gift-wrap: sent via ephemeral Nostr keypair
   - Randomize visible timestamp ±2 days
   - Publish to 3–5 Nostr relays

**Result:** Receiver is notified off-chain and can compute the stealth account and private key.

---

## 4. Receive Workflow (NanoNym Wallet)

For each active NanoNym:

1. **Nostr relay monitoring:**
   - Connect to multiple relays via WebSocket
   - Subscribe to NIP-17 gift-wrapped events (kind 1059) targeting `nostr_public`

2. **For each received notification:**
   - Unwrap outer gift-wrap (ephemeral Nostr keys)
   - Decrypt inner payload using `nostr_private`
   - Extract `R` and `tx_hash`

3. **Recompute expected stealth address:**
   - `shared_secret = b_view * R`
   - `t = BLAKE2b(shared_secret_x || R || B_spend)`
   - `P_test = B_spend + (t * G)`
   - `expected_address = nano_encode(P_test)`

4. **Validate against chain:**
   - Query Nano node for `tx_hash`
   - Confirm destination equals `expected_address`
   - Confirm amount (if present)

5. **Derive private spend key:**
   - `p_masked = b_spend + t`

6. **Wallet bookkeeping:**
   - Store `(p_masked, expected_address, R, tx_hash, metadata)`
   - Aggregate into NanoNym's balance and transaction history

**Offline operation:**
- On startup, request historical NIP-17 events since last seen timestamp (or wallet birthday) from all relays
- Merge and deduplicate by `tx_hash`

---

## 5. Stealth Account Selection Algorithm

**Goal:** Choose which stealth accounts fund a given send amount.

**Objectives:**
1. Use minimum number of accounts possible
2. Add randomness to avoid deterministic patterns
3. Only use stealth accounts from relevant NanoNym(s)

**Reference implementation:**

```typescript
function selectStealthAccountsForSend(
  amount: BigNumber,
  availableStealthAccounts: StealthAccount[]
): StealthAccount[] {
  const funded = availableStealthAccounts.filter(a => a.balance.gt(0));

  // Prefer single-account sends for maximal privacy
  const single = funded.find(a => a.balance.gte(amount));
  if (single) return [single];

  // Otherwise, use greedy strategy (largest first)
  const sorted = [...funded].sort((a, b) =>
    b.balance.comparedTo(a.balance)
  );

  const selected: StealthAccount[] = [];
  let remaining = amount;

  for (const account of sorted) {
    if (remaining.lte(0)) break;
    selected.push(account);
    remaining = remaining.minus(account.balance);
  }

  // Randomize order to reduce timing correlation
  return shuffleArray(selected);
}
```

**Note:** `shuffleArray` uses Fisher–Yates shuffle with crypto-secure randomness if possible.

**Future enhancement:** For multiple equally minimal subsets (knapsack variant), randomly choose one rather than always using greedy.

---

## 6. NanoNym and Multi-Account Management

### Aggregated Account Model

From the wallet implementation perspective, each NanoNym functions as an **aggregated account:**
- **Conceptual representation**: A NanoNym is a single account with one balance
- **Implementation**: That balance is the sum of multiple underlying stealth accounts
- **Stealth accounts**: Individual `nano_` addresses (regular Nano accounts) created per payment
- **Differentiation**: Stealth accounts are managed separately from standard accounts to maintain the aggregated account abstraction
- **User experience**: User sees one account per NanoNym with aggregated balance; stealth accounts are implementation details (though visible in advanced views)

### Usage Patterns

All NanoNyms are structurally identical; "usage style" is purely convention.

Typical use patterns:
- **Long-term public NanoNym**: Shared in website footers, business cards
- **Per-transaction NanoNym**: Generated per checkout, used once or short-term
- **Per-department NanoNyms**: For accounting separation (Sales, Donations, Support, etc.)

### UI Requirements

Ability to:
- Generate new NanoNym with label
- List NanoNyms with:
  - Label
  - Aggregated balance (sum of all stealth accounts)
  - Payment count (number of stealth accounts)
  - Status: Active (listening to Nostr) vs Archived (not listening)
- View per-NanoNym history (optionally showing individual stealth accounts)
- Copy address / show QR
- Archive/reactivate NanoNyms (archiving stops Nostr monitoring but does not affect recoverability or spending)

### Wallet-Level Integration

- **Accounts page**: NanoNyms appear alongside standard accounts as "NanoNym Accounts" section
- **Total wallet balance**: Includes both standard accounts and NanoNym aggregated balances
- **Stealth accounts**: Grouped under their parent NanoNym in the UI; not shown as separate top-level accounts

---

## 7. Privacy Warning UX

### When to Warn

- Send requires multiple stealth accounts
- Configurable threshold:
  - Default: warn when using ≥ 2 accounts
  - Hard minimum: always warn when using ≥ 5 accounts (even if user disabled standard warnings)

### Behavior

Before sending, show:
- Number of stealth accounts that will be linked
- Reminder that these accounts will be publicly linkable on-chain
- Primary action: "I understand – send"
- Secondary action: "Review inputs" (for advanced users)
- "Don't show this again" option (stored in local settings, overridden for very large linkage)

### Configuration Model

```typescript
interface PrivacyWarningSettings {
  enabled: boolean;              // default true
  multiAccountThreshold: number; // default 2
  alwaysShowAboveCount: number;  // default 5
  showDetailedImpact: boolean;   // default true
}
```

---

## 8. Privacy Mode (Optional Timing Randomization)

**Purpose:** Reduce timing correlation when multiple stealth accounts send to same destination.

**Behavior:**
- If enabled: After each transaction (except last), delay next send by random interval (10–30 seconds)
- User setting: "Enable Privacy Mode (delay between multi-account sends)" – default off

**Trade-offs:**
- Higher privacy vs slower UX
- Partial sends possible if user quits mid-process; UI must clearly show in-progress state and allow cancellation

**Reference implementation:**

```typescript
async function sendFromMultipleStealthAccounts(
  accounts: StealthAccount[],
  destination: string,
  usePrivacyMode: boolean
): Promise<SendResult[]> {
  const results: SendResult[] = [];

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const result = await sendTransaction(account, destination, account.amount);
    results.push(result);

    if (usePrivacyMode && i < accounts.length - 1) {
      const delayMs = 10000 + Math.random() * 20000;
      await sleep(delayMs);
      showProgress({
        current: i + 1,
        total: accounts.length,
        nextSendIn: delayMs
      });
    }
  }

  return results;
}
```
