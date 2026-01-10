## CLAUDE.md: NanoNym Protocol & NanoNymNault Wallet Specification

Target agent: Claude Code
Project name: NanoNyms
Goal: Implement a wallet-level protocol that provides reusable, privacy-preserving payment identifiers (NanoNyms) for Nano.
Primary constraint: No changes to the Nano base protocol or node software (pure wallet/off-chain coordination).
Live preview: [NanoNymNault Developer Preview](https://cbrunnkvist.github.io/NanoNymNault/)

---

## 1. Objective and Core Concept

Problem: A standard`nano_` address links all incoming transactions and history on-chain, breaking receiver privacy.

Solution: NanoNyms are reusable payment codes (prefix`nnym_`) that encode keys for stealth-address receiving and off-chain notifications. Each inbound payment creates a unique stealth Nano account that cannot be linked on-chain to other payments or to the NanoNym.

### Terminology

- **NanoNym**: A reusable payment code (the`nnym_...` address string). Conceptually represents an account; saying "NanoNym account" is acceptable but not required.
- **Aggregated account**: From the wallet implementation's perspective, each NanoNym is treated as an aggregated account that sums the balances of its underlying stealth accounts.
- **Stealth accounts**: The individual`nano_` addresses created for each payment received to a NanoNym. These are regular Nano accounts, but managed separately from standard accounts to maintain the aggregated account abstraction.
- **Standard accounts**: Regular Nano accounts managed by the wallet's standard account manager (not part of NanoNym aggregation).

### NanoNym Properties

- String format:`nnym_...` (≈160 chars, Nano-style base32).
- Encodes three public keys:
    - Spend public key`B_spend` (Ed25519).
    - View public key`B_view` (Ed25519).
    - Nostr notification public key`nostr_public` (Secp256k1).
- All NanoNyms are structurally identical, infinitely reusable.
- Multiple NanoNyms derived from a single seed; user chooses usage model (public, per-customer, per-department, etc.).
- No on-chain protocol changes; all privacy is provided by stealth addresses + Nostr notifications.

---

## 2. Design Positioning

Incompatible approaches (rejected for Nano):
- BIP-47 (PayNyms): needs on-chain`OP_RETURN`-style notifications (not available on Nano).
- BIP-78 PayJoin v1: needs shared transactions with multiple inputs/outputs (incompatible with Nano account-chains).

Compatible / adapted ideas:
- CamoNano: ECDH-based stealth addresses on Nano.
    - Keep: cryptography.
    - Drop: on-chain notifications (cost and timing leaks).
- nanopyrs: Reference Python implementation of CamoNano-style crypto (useful for tools).
- BIP-352 Silent Payments: ECDH-based stealth design, simplified by Nano’s account model.
- BIP-77 Async Payjoin v2: concept of off-chain directory/coordination.
- Nostr NIP-17: encrypted “gift-wrapped” messages; used as off-chain notification channel.

Final architecture:
- Stealth address cryptography (CamoNano/BIP-352 style)
- Off-chain notifications via Nostr NIP-17 gift-wrapped events
- Multi-account derivation for unlimited NanoNyms from one seed

---

## 3. NanoNym Address Format (`nnym_`)

Binary layout (99 bytes before base32 encoding):

- Byte 0: version =`0x01` (v1).
- Bytes 1–32:`B_spend` (Ed25519 public key).
- Bytes 33–64:`B_view` (Ed25519 public key).
- Bytes 65–96:`nostr_public` (Secp256k1 public key, 32 bytes).
- Bytes 97–98: checksum (first 2 bytes of BLAKE2b-5 hash over previous bytes).

Encoding:
- Use Nano-style base32 alphabet.
- Final human-readable format:`nnym_<base32>`.

Rationale for embedding`nostr_public`:
- Defines the notification destination directly.
- No extra lookup for Nostr identity.
- Each NanoNym can use:
    - Unique Nostr key for better privacy, or
    - Shared Nostr key for simpler UX.

Compatibility:
- Non-supporting wallets will reject`nnym_` addresses; users should use standard wallet accounts for non-private payments.

---

## 4. Key Derivation and Account Model

Seed and derivation:
- Root: BIP-39 seed.
- Standard Nano path:`m/44'/165'/0'`.
- NanoNym master path:`m/44'/165'/0'/1000'`.
- Per-NanoNym account:
    -`m/44'/165'/0'/1000'/<account_index>'`
        -`/0` → spend keypair:`b_spend`,`B_spend`
        -`/1` → view keypair:`b_view`,`B_view`
        -`/2` → Nostr keypair:`nostr_private`,`nostr_public`

Where`account_index = 0, 1, 2, ...` (unbounded).

**Implementation note (NanoNymNault-specific):**
- Wallet stores seeds as **64-character hex strings** (32 bytes), not BIP-39 mnemonics.
- Key derivation code MUST detect seed format:
  - Hex string (64 hex chars): convert via `hex.toUint8()` → 32 bytes
  - BIP-39 mnemonic: convert via `bip39.mnemonicToSeedSync()` → 64 bytes
- **Determinism is critical**: same seed + same index → identical keys (always).
- Test with both hex seeds (production format) and mnemonics (user import).

Recovery:
- Single seed recovers all NanoNyms and their keys.
- Use BIP-44-style gap limit (e.g. 20 unused accounts) to find all active NanoNyms.

Wallet birthday optimization:
- Store a creation timestamp locally.
- Use it as a lower bound for Nostr history and (optionally) blockchain scans.
- If unknown, default to a conservative date (genesis or user-provided).
- Birthday is an optimization, not required for correctness.

---

## 5. Send Workflow (Sender → NanoNym)

When the sender inputs a`nnym_` address:

1. Parse`nnym_`:
    - Extract`B_spend`,`B_view`,`nostr_public`.

2. Generate an ephemeral keypair for this payment:
    -`r = random_scalar()` (or deterministic from sender keys).
    -`R = r * G` (ephemeral public key).

3. ECDH shared secret:
    -`shared_secret = r * B_view`.

4. Compute tweak scalar:
    -`t = BLAKE2b(shared_secret_x || R || B_spend)`.

5. Derive one-time stealth address:
    -`P_masked = B_spend + (t * G)`.
    -`masked_nano_address = nano_encode(P_masked)`.

6. On-chain payment:
    - Send XNO to`masked_nano_address`.
    - On-chain, this looks like a standard Nano payment with no special markers.

7. Off-chain Nostr notification payload (logical structure):

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

8. NIP-17 gift-wrapping:
    - Inner encryption: payload to recipient’s`nostr_public`.
    - Outer gift-wrap: sent via ephemeral Nostr keypair.
    - Randomize visible timestamp ±2 days to reduce timing correlation.
    - Publish to 3–5 Nostr relays.

Result: Receiver is notified off-chain and can compute the stealth account and private key.

---

## 6. Receive Workflow (NanoNym Wallet)

For each active NanoNym:

1. Nostr relay monitoring:
    - Connect to multiple relays via WebSocket.
    - Subscribe to NIP-17 gift-wrapped events (kind 1059) targeting`nostr_public`.

2. For each received notification:
    - Unwrap outer gift-wrap (ephemeral Nostr keys).
    - Decrypt inner payload using`nostr_private`.
    - Extract`R` and`tx_hash`.

3. Recompute expected stealth address:
    -`shared_secret = b_view * R`.
    -`t = BLAKE2b(shared_secret_x || R || B_spend)`.
    -`P_test = B_spend + (t * G)`.
    -`expected_address = nano_encode(P_test)`.

4. Validate against chain:
    - Query Nano node for`tx_hash`.
    - Confirm destination equals`expected_address`.
    - Confirm amount (if present).

5. Derive private spend key:
    -`p_masked = b_spend + t`.

6. Wallet bookkeeping:
    - Store`(p_masked, expected_address, R, tx_hash, metadata)`.
    - Aggregate into NanoNym’s balance and transaction history.

Offline operation:
- On startup, request historical NIP-17 events since last seen timestamp (or wallet birthday) from all relays; merge and deduplicate by`tx_hash`.

### 6.1 Stealth Account Opening Strategy (On-Chain Account Initialization)

**Problem:** Stealth addresses are computed from Nostr notifications, but the corresponding on-chain accounts remain unopened (no confirmed blocks) until an explicit receive/open block is published.

**Design Decision:** Hybrid two-phase approach to ensure funds can be spent while handling edge cases where the node is unreachable.

#### Phase 1: Immediate Opening (Best Case)
**Trigger:** Upon receipt of Nostr notification (after validation).

**Workflow:**
1. Parse notification and create stealth account in memory.
2. Immediately attempt to publish an open/receive block for the stealth address.
3. If wallet is locked:
   - Queue the stealth account in `pendingStealthBlocks` array.
   - Subscribe to wallet unlock event.
   - Process queue when wallet unlocks.
4. If publishing succeeds:
   - Update balance from on-chain.
   - Show success notification.
5. If publishing fails (node unavailable):
   - Add to retry queue.
   - Proceed to Phase 2 (background retry).

**Advantages:**
- Funds are spendable immediately in the happy path.
- No extra user action required.
- Handles wallet-locked scenario gracefully via queue.

**Implementation details:**
- Located in `nanonym-manager.service.ts`: `receiveStealthFunds()` (called from `processNotification()`).
- Pending queue: `pendingStealthBlocks` array with unlock subscriber.
- Error handling: Log failures and proceed without blocking notification flow.

#### Phase 2: Background Retry (Recovery from Transient Failures)
**Trigger:** If immediate opening fails; runs periodically in background.

**Workflow:**
1. Every 5 minutes, check for unopened stealth accounts.
2. For each unopened account, attempt to publish open block.
3. Retry up to 12 times (1 hour total) before marking as "stuck."
4. Only retry if wallet is unlocked (skip if locked).

**Advantages:**
- Handles scenario: Nostr available but node temporarily unreachable.
- Eventual consistency without user intervention.
- Bounded retry attempts prevent infinite loops.

#### Phase 3: Just-in-Time Opening (Failsafe Before Spend)
**Trigger:** When user attempts to spend from NanoNym with unopened stealth accounts.

**Workflow:**
1. In `confirmNanoNymSpend()`, before executing send transactions:
   - Check if any selected stealth accounts are unopened (no frontier on node).
   - If unopened accounts exist, attempt to open them synchronously.
   - Show progress notification: "Opening stealth accounts..."
   - Wait for confirmations (timeout: 30 seconds per account).
2. If opening succeeds:
   - Proceed with send transactions.
   - Show transparent notification of what happened.
3. If opening fails:
   - Display specific error: "Cannot open stealth account X. Please wait and try again."
   - Do NOT attempt send (would fail with no frontier).

**Advantages:**
- Handles edge case: Wallet in state with unopened accounts (e.g., Nostr notification received but immediate opening failed and background retry hasn't run).
- Provides UX transparency ("I'm opening your stealth accounts...").
- Prevents cryptic node errors by ensuring all accounts are ready before send.

**Implementation details:**
- New method: `ensureStealthAccountsOpened(stealthAccounts)` in `send.component.ts`.
- Called before the send loop in `confirmNanoNymSpend()`.
- Uses existing `nanoBlock.generateReceive()` infrastructure.
- Shows progress toast with account count.

#### 6.2 Unopened Account Handling Rules

**Rules applied throughout the wallet:**

1. **During balance display:** Always fetch current balance from node (accounts are spendable if they have a frontier, even if unconfirmed).
2. **During account selection:** Include unopened accounts in selection (they may open by the time send is ready).
3. **During spend preparation:**
   - Fetch current account info from node.
   - If account has no frontier: attempt just-in-time opening.
   - If opening fails: skip account and warn user.
4. **During background sync:** Periodically attempt to open any unopened accounts.

**Why this design:**
- Maximizes robustness against transient node/network failures.
- Minimizes user friction (opening is automatic and transparent).
- Handles both happy path (Nostr + node both available) and recovery paths (one or both temporarily unavailable).
- Ensures seed-only recovery: even if opening failed, user can wait and retry.

---

## 7. Recovery Strategy (Multi-Tier, Seed-Only Guarantee)

Goal: All funds must be recoverable from seed alone, even if all Nostr relays are unreliable or pruned.

### 7.1 Tier 1 – Nostr Multi-Relay Recovery (Fast, Primary)

Characteristics:
- Expected success: ≳99% with relay redundancy.
- Latency: typically under 30 seconds.

Process:
1. User enters seed on a new device.
2. Wallet derives NanoNyms using the derivation path and gap limit.
3. For each NanoNym:
    - Connect to 3–5 Nostr relays (plus user-configured relays).
    - Send REQ for:
```json
      {
        "kinds": [1059],
        "#p": ["<nostr_public_hex>"],
        "since": <wallet_birthday_or_default>
      }
      ```
4. For each event:
    - Decrypt payload, extract`R` and`tx_hash`.
    - Recompute stealth address and derive`p_masked`.
    - Import account and attach on-chain data.

Notes:
- Parallel queries across all relays; merge results.
- Relay set should include at least some long-lived, reliable relays; allow user configuration.

### 7.2 Tier 2 – Additional Backup Mechanisms (Status: Implemented)

**Current Status: ✅ Implemented (Jan 2026)**

We implemented an Arweave-based backup using the Irys bundler infrastructure.

**Architecture:**
- **Storage**: Arweave Permaweb (permanent, decentralized storage).
- **Upload**: Via Irys devnet bundler (currently free for small payloads < 100KB).
- **Privacy Model**: "Scan-All" Private Broadcast.
  - No recipient-identifying tags are stored on-chain.
  - Uploads are tagged only with `Protocol: NanoNym-Signal`.
  - Recovery requires scanning the global stream of events since wallet birthday and attempting to decrypt each one.
  - Observers see only global activity volume, not per-user payment patterns.
- **Implementation**: Custom ANS-104 data item signing (bypassing SDKs) using browser-compatible crypto libraries.

**Recovery Process:**
1. User provides seed + wallet birthday.
2. Wallet queries Arweave GraphQL for all `NanoNym-Signal` events since birthday.
3. Wallet attempts to decrypt each event with the derived View Key.
4. Successful decryptions reveal the stealth address info (`R`, `tx_hash`).

**Limitations:**
- **Upload Centralization**: Currently relies on Irys gateway for uploads (single point of failure for *new* backups, but not existing ones).
- **Recovery Speed**: Slower than Nostr (O(n) decryption attempts), but optimized via time-based pagination.
- **Cost**: Currently using free devnet tier. Mainnet would require funding Irys node with crypto.

### 7.3 Tier 3 – Blockchain-Based Fallback (Status: TBD)

**Current Status: Not Implemented**

Without knowledge of the ephemeral public key `R`, it is cryptographically infeasible to derive stealth addresses from on-chain data alone. The `R` value must come from Nostr notifications (Tier 1) or backups (Tier 2).

**Theoretical Approaches (All Impractical):**
1. Brute-force `R` values - computationally infeasible
2. Heuristic chain scanning - can identify candidate accounts but cannot derive private keys
3. Community archival infrastructure - still relies on Nostr retention

**Current Reality:**
Recovery fundamentally depends on Nostr notification availability. The protocol prioritizes this by:
- Using 3-5 diverse public relays
- Allowing user-configured relay lists
- Encouraging inclusion of reliable, long-lived relays

### 7.4 Recovery Strategy Summary (Current Implementation)

| Tier | Method | Status | Expected Success | Dependencies |
|------|--------|--------|------------------|--------------|
| 1 | Nostr multi-relay replay | ✅ Implemented | High (with relay redundancy) | 3-5 diverse relays |
| 2 | Additional backup mechanisms | ✅ Implemented | High (Permanent) | Irys (upload), Arweave (read) |
| 3 | Blockchain-based fallback | ❌ Not feasible | - | Requires `R` from notifications |

**Design Reality:**
- **Primary recovery mechanism:** Nostr multi-relay redundancy (Tier 1)
- **Seed-only recovery:** Depends on at least one relay retaining notification history OR Arweave availability.
- **User responsibility:** Configure reliable relay set (including potential archival relays)
- **Future work:** Monitor Irys free tier viability; consider direct Arweave upload if needed.

---

## 8. Spending from Stealth Accounts

### 8.1 Constraint

Nano uses an account model:
- Each stealth payment creates its own Nano account.
- Cannot merge multiple accounts into a single on-chain “input”.
- Any time multiple stealth accounts send to the same recipient, those accounts become publicly linked.

The protocol cannot fix this without Nano protocol changes. Instead, it:
- Maximizes privacy at receive time.
- Minimizes necessary linkages when spending.
- Warns users when multi-account sends will reduce privacy.
- Offers optional timing randomization (Privacy Mode).

### 8.2 Stealth Account Selection Algorithm

Goal: Choose which stealth accounts fund a given send amount.

Objectives:
1. Use the minimum number of accounts possible.
2. Add randomness to avoid deterministic patterns.
3. Only use stealth accounts from the relevant NanoNym(s) unless user explicitly opts otherwise.

Reference implementation:

```typescript
function selectStealthAccountsForSend(
  amount: BigNumber,
  availableStealthAccounts: StealthAccount[]
): StealthAccount[] {
  const funded = availableStealthAccounts.filter(a => a.balance.gt(0));

  // Prefer single-account sends for maximal privacy.
  const single = funded.find(a => a.balance.gte(amount));
  if (single) return [single];

  // Otherwise, use a simple greedy strategy (largest first).
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

  // Randomize order to reduce timing correlation.
  return shuffleArray(selected);
}
```
`shuffleArray` uses Fisher–Yates shuffle with crypto-secure randomness if possible.

Future enhancement:
- For multiple equally minimal subsets (knapsack variant), randomly choose one rather than always using greedy.

### 8.3 Privacy Warning UX (Functional Requirements)

When to warn:
- Send requires multiple stealth accounts.
- Configurable threshold:
    - Default: warn when using ≥ 2 accounts.
    - Hard minimum: always warn when using ≥ 5 accounts, even if user disabled standard warnings.

Behavior:
- Before sending, show:
    - Number of stealth accounts that will be linked.
    - Reminder that these accounts will be publicly linkable on-chain.
- Provide:
    - Primary action: “I understand – send”.
    - Secondary action: “Review inputs” for advanced users.
- “Don’t show this again” option:
    - Stored in local settings.
    - Overridden for very large linkage (e.g. ≥ 5 accounts).

Configuration model:

```typescript
interface PrivacyWarningSettings {
  enabled: boolean;              // default true
  multiAccountThreshold: number; // default 2
  alwaysShowAboveCount: number;  // default 5
  showDetailedImpact: boolean;   // default true
}
```

### 8.4 Privacy Mode (Optional Timing Randomization)

Purpose: Reduce timing correlation when multiple stealth accounts send to the same destination.

Behavior:
- If enabled:
    - After each transaction (except last), delay next send by a random interval.
    - Example: 10–30 seconds per delay.

Reference implementation:

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

User settings:
- Toggle: “Enable Privacy Mode (delay between multi-account sends)” – default off.

Trade-offs:
- Higher privacy vs slower UX.
- Partial sends possible if user quits mid-process; UI must clearly show in-progress state and allow cancellation.

---

## 9. NanoNym and Multi-Account Management

### Aggregated Account Model

From the wallet implementation perspective, each NanoNym functions as an **aggregated account**:
- **Conceptual representation**: A NanoNym is a single account with one balance.
- **Implementation**: That balance is the sum of multiple underlying stealth accounts.
- **Stealth accounts**: Individual`nano_` addresses (regular Nano accounts) created per payment.
- **Differentiation**: Stealth accounts are managed separately from standard accounts to maintain the aggregated account abstraction.
- **User experience**: User sees one account per NanoNym with aggregated balance; stealth accounts are implementation details (though visible in advanced views).

### Usage Patterns

All NanoNyms are structurally identical; "usage style" is purely convention.

Typical use patterns:
- Long-term public NanoNym:
    - Shared in website footers, business cards.
- Per-transaction NanoNym:
    - Generated per checkout, used once or short-term.
- Per-department NanoNyms:
    - For accounting separation (Sales, Donations, Support, etc.).

### UI Requirements

- Ability to:
    - Generate new NanoNym with label.
    - List NanoNyms with:
        - Label.
        - Aggregated balance (sum of all stealth accounts).
        - Payment count (number of stealth accounts).
        - Status: Active (listening to Nostr) vs Archived (not listening).
    - View per-NanoNym history (optionally showing individual stealth accounts).
    - Copy address / show QR.
    - Archive/reactivate NanoNyms:
        - Archiving stops Nostr monitoring but does not affect recoverability or spending.

### Wallet-Level Integration

- **Accounts page**: NanoNyms appear alongside standard accounts as "NanoNym Accounts" section.
- **Total wallet balance**: Includes both standard accounts and NanoNym aggregated balances.
- **Stealth accounts**: Grouped under their parent NanoNym in the UI; not shown as separate top-level accounts.

---

## 10. Technical Implementation Notes

Cryptography:
- Curve for Nano keys: Ed25519 (as in Nano).
- Curve for Nostr keys: Secp256k1.
- Hashing: BLAKE2b for tweaks and checksums.
- ECDH: Standard implementations (Ed25519, Secp256k1).
- Use well-audited libs; do not reimplement primitives.

Nostr integration:
- Use a mature client library (e.g.`nostr-tools` for JS/TS).
- Support multiple relays by default (3–5 recommended).
- Behavior:
    - Publish notifications to all configured relays.
    - Subscribe to all for recovery and real-time monitoring.
    - Auto-reconnect on failures.

Performance expectations (rough targets):
- Stealth derivation: < 100 ms per payment on typical hardware.
- Notification latency (Nostr): median < 2 seconds.
- Background Nostr subscriptions: low CPU/battery (idle WebSockets).

Security and privacy considerations:
- View key sharing:
    -`b_view` alone is sufficient for watch-only wallets (can reconstruct incoming stealth addresses but cannot spend).
- Nostr key compromise:
    - Attacker can read future notifications but cannot spend (no access to`b_spend`).
- Relays:
    - All notification payloads are encrypted (NIP-17).
    - Relays cannot read or link contents.
- Timing:
    - Notification timestamps are randomized.
    - Privacy Mode can randomize on-chain spend timing.

---

## 11. Privacy Analysis

### Core Privacy Goals

NanoNyms is NOT about achieving full transaction-graph anonymity (like Monero). The primary goals are:

1. **Reusable payment codes** - Main UX improvement over static Nano addresses
2. **Recipient privacy from on-chain observers** - Third parties cannot link stealth accounts
3. **Plausible deniability** - Recipient can deny ownership of individual stealth accounts until consolidation/spending

### What NanoNyms Protects Against

**On-chain observers (blockchain analysts, explorers, passive surveillance):**
- ✅ Cannot link multiple stealth accounts to the same NanoNym recipient
- ✅ Cannot determine which NanoNym received a payment
- ✅ Cannot connect stealth accounts to recipient's main Nano accounts
- ✅ No visible on-chain markers (stealth payments look like standard Nano sends)
- ✅ Stealth addresses appear as independent, unrelated accounts

**Nostr relay operators:**
- ✅ Cannot read notification payloads (NIP-17 gift-wrapped encryption)
- ✅ Cannot see real timestamps (randomized ±2 days)
- ✅ Cannot link notifications to specific Nano accounts
- ✅ Sender/receiver identity obscured by ephemeral keys

**Network-level observers:**
- ⚠️ Can see Nostr and Nano traffic (mitigate with VPN/Tor)
- ✅ Cannot trivially correlate encrypted Nostr events with on-chain transactions

### What NanoNyms Does NOT Protect Against

**The receiver (payment recipient) can always see:**
- ❌ Sender's Nano account (visible via tx_hash lookup on-chain)
- ❌ Sender's account balance and transaction history (public blockchain data)
- ❌ Multiple payments from the same sender account (linkable to sender)
- ❌ Transaction metadata (amount, timestamp)

**Privacy breaks when recipient consolidates/spends:**
- ❌ Sending from multiple stealth accounts to same destination links those accounts on-chain
- ❌ Timing patterns may correlate stealth accounts
- ⚠️ Mitigated by: account selection algorithm, privacy warnings, optional timing randomization

**Not designed for:**
- ❌ Hiding sender identity from receiver
- ❌ Unlinkability after spending from multiple stealth accounts
- ❌ Protection against sophisticated long-term chain analysis after consolidation

### Privacy Model: Plausible Deniability

Until the recipient spends or consolidates funds:
- Stealth accounts appear as random, independent addresses on-chain
- No cryptographic proof linking stealth accounts to each other
- Recipient can plausibly deny ownership of individual stealth accounts
- Only the recipient's seed can derive the private keys

After spending/consolidation:
- On-chain linkage becomes visible (multiple inputs → same destination)
- Deniability for linked accounts is lost
- Other unspent stealth accounts remain unlinkable

### Comparison with Other Protocols

| Protocol | Primary Goal | Receiver Privacy | Sender→Receiver Privacy | Chain Changes |
|----------|--------------|------------------|-------------------------|---------------|
| Monero | Full anonymity | Very High | High | Yes (own chain) |
| Zcash (shielded) | Optional anonymity | Very High | High (in-pool) | Yes (own chain) |
| BIP-352 Silent Payments | Reusable addresses | High | Low (receiver sees sender) | No (Bitcoin-native) |
| BIP-47 PayNyms | Reusable codes | Medium | Low (on-chain notify) | No (OP_RETURN) |
| CamoNano | Stealth addresses | High | Low (on-chain notify) | No (Nano-native) |
| **NanoNymNault** | **Reusable + recipient privacy** | **High** | **Low (receiver sees sender)** | **No (wallet-level)** |

### Design Stance

**Primary value propositions:**
1. **Reusability** - Publish one `nnym_` address, receive unlimited unlinkable payments
2. **Recipient unlinkability** - On-chain observers cannot connect stealth accounts
3. **No protocol changes** - Works with standard Nano nodes

**Acknowledged limitations:**
- Sender visibility to receiver (inherent to Nano's account model)
- Linkage upon consolidation (inherent to account-based blockchains)
- Timing correlation risks (mitigated by optional Privacy Mode)

**Explicit non-goals:**
- Full transaction-graph anonymity
- Sender anonymity from receiver
- Protection against all chain analysis (only pre-consolidation)

The protocol is designed to be **explicit about these trade-offs** through UI warnings, account selection strategies, and clear documentation.

---

## 12. Implementation Roadmap (Status-Oriented)

Current status (as of 2025-11-18):
- Phase 1 – Crypto core: ✅ complete.
- Phase 2 – Nostr integration: ✅ complete.
- Phase 3 – Send UI and spend-from-NanoNyms: ✅ complete.
    - Detect`nnym_` addresses and perform stealth send + Nostr notification.
    - Implement stealth account selection algorithm + 15 passing unit tests.
    - Implement privacy warnings and multi-account sending.
    - Show privacy impact.
    - Balance persistence and spending fixes (Nov 18, 2025).
- Phase 4 – Accounts page integration: ✅ complete.
    - NanoNyms treated as aggregated accounts on Accounts page.
    - Reactive balance updates with automatic Nano node verification.
    - Grouped display: Regular Accounts + NanoNym Accounts sections.
    - Balance aggregation and stealth account management.
- Phase 5 – Receive UI & Stealth Account Opening: ✅ complete (Nov 28, 2025).
    - Multi-NanoNym management (generation, listing, balances) - ✅ complete.
    - Background Nostr monitoring and history reconstruction - ✅ complete.
    - Migration to Accounts page - ✅ complete.
    - Stealth account opening workflow (three-phase defense-in-depth):
        - ✅ Phase 1: Immediate opening on notification (`receiveStealthFunds()`).
        - ✅ Phase 2: Background retry mechanism (5-min interval, 12 retries max).
        - ✅ Phase 3: Just-in-time opening before spend (`ensureStealthAccountsOpened()`).
        - All phases implemented in `nanonym-manager.service.ts` and `send.component.ts`.
        - Comprehensive test coverage in `send.component.spec.ts` (8 tests for Phase 3).
    - Receive page cleanup - ✅ complete (orphaned modal code removed).
- Phase 6 – Observability and logging: ✅ complete (Nov 18, 2025).
    - Improved Nostr relay logging with appropriate log levels.
    - MAC-check match logging.
    - Relay connection/disconnection lifecycle logging.
    - Derivation path debug logging for both account types.
- Later phases:
    - Enhanced stealth account opening diagnostics.
    - Privacy Mode and advanced spend options.
    - Automated E2E tests (Playwright or similar).
    - Community beta and hardening.

Manual and automated tests:
- Unit tests around:
    - Address encoding/decoding.
    - Key derivation paths.
    - Account selection algorithm (already has multiple passing tests).
- Integration tests:
    - Nostr send/receive with mocked or test relays.
- Planned E2E:
    - Full flows on Nano testnet + real Nostr relays.

---

## 13. Known Limitations

1. Sender compatibility:
    - Only wallets that understand`nnym_` can use full privacy features.
    - Users needing to receive from non-supporting wallets should use standard wallet accounts.
2. Nostr reliance for fast recovery:
    - Tiers 1 and 2 depend on relays; Tier 3 and seed-only guarantees rely on archival infra plus heuristics.
3. Trade-off between speed and guaranteed recovery:
    - Fast (seconds) recovery via Nostr vs slower, more complex fallback strategies.
4. Account proliferation:
    - Each payment creates a new Nano account.
    - UI and potential consolidation tools must handle many small accounts.
5. Spend-side privacy:
    - Multi-account sends link accounts on-chain.
    - This is a fundamental limit of Nano; mitigated via warnings, selection, and timing options.
6. Post-quantum:
    - Same as Nano: not PQ-safe yet; will track Nano’s evolution.
7. Encrypted backup data:
    - Tier 2 uses Nostr as encrypted storage.
    - Users can add self-hosted relays for stronger guarantees.
8. Representative initialization for new wallets:
    - When a wallet is created, `defaultRepresentative` is initialized to `null`.
    - Stealth accounts that open before Account #0 receives a transaction will get a random representative.
    - Account #0 shows "Representative: NONE" until it receives, then gets a representative (possibly different).
    - **Not a protocol issue** - each account can have independent representatives on-chain.
    - **UX improvement** (planned): Initialize `defaultRepresentative` at NanoNym account creation time if wallet default is `null`, ensuring consistent representatives across all accounts (stealth and standard).

---

## 14. Future Enhancements (Key Ideas)

Stealth account consolidation (sweep):
- Use case: reduce many small stealth accounts into one or a few accounts for easier management.
- Trade-off: consolidation links these accounts publicly.
- Options:
    - Consolidate into:
        - A standard`nano_` account.
        - A deterministic “consolidation” account (e.g. dedicated derivation range).
- Requirements:
    - Clear privacy warnings before consolidation.
    - User must explicitly choose destination and set filters (e.g. “older than X days”).

Advanced features:
- Privacy scoring and per-send impact summary.
- More sophisticated spend selection strategies.
- Scheduled or rules-based consolidation (opt-in).
- Protocol v2 ideas:
    - Notification ACKs.
    - Nostr key rotation and updated NanoNym address version.
    - Cross-currency / cross-chain standardization.
    - Light-client view key delegation.
    - Compact filters or partial indexes to improve recovery efficiency.

---

## 15. Summary and Guardrails

NanoNymNault:
- Provides reusable, privacy-preserving Nano payment identifiers (`nnym_`).
- Uses CamoNano-style stealth addresses + Nostr NIP-17 notifications.
- Requires no changes to Nano nodes or protocol.
- Guarantees seed-based recovery via multi-tier strategies.
- Is explicit about spend-side privacy limitations and mitigations.

Critical invariant:
The core path
“Send to NanoNym → Receive via Nostr → Stealth funds spendable and recoverable from seed alone”
must remain correct, test-covered, and never be broken by future changes.
- When writing commit messages, clearly articulate WHAT you intend to change and WHY these changes matter—the purpose or problem being solved—not which files were modified. Begin with a concise subject line that captures the essential change, followed by a brief explanation of the reasoning behind the change if additional context is needed. Reference tickets in the subject line when applicable, but focus the body on the specific intent and value of this particular code change.
- (EXCEPT FOR WHEN IN CI) Always use 'nvm exec npm [args]' (and you might need to source the nvm script if the alias isn't present) when you need to npm something