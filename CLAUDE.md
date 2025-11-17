## CLAUDE.md: NanoNym Protocol & NanoNymNault Wallet Specification

Target agent: Claude Code
Project name: NanoNyms
Goal: Implement a wallet-level protocol that provides reusable, privacy-preserving payment identifiers (NanoNyms) for Nano.
Primary constraint: No changes to the Nano base protocol or node software (pure wallet/off-chain coordination).
Live preview: [NanoNymNault Developer Preview](https://cbrunnkvist.github.io/NanoNymNault/)

---

## 1. Objective and Core Concept

Problem: A standard`nano_` address links all incoming transactions and history on-chain, breaking receiver privacy.

Solution: NanoNyms are reusable pseudonyms (prefix`nnym_`) that encode keys for stealth-address receiving and off-chain notifications. Each inbound payment creates a unique stealth Nano account that cannot be linked on-chain to other payments or to the NanoNym.

NanoNym properties:
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
- Non-supporting wallets will reject`nnym_` addresses; the UI must expose a standard`nano_` fallback address to prevent fund loss.

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

Recovery:
- Single seed recovers all NanoNyms and their keys.
- Use BIP-44-style gap limit (e.g. 20 unused accounts) to find all active NanoNyms.

Wallet birthday optimization:
- Store a creation timestamp locally.
- Use it as a lower bound for Nostr history and (optionally) blockchain scans.
- If unknown, default to a conservative date (genesis or user-provided).
- Birthday is an optimization, not required for correctness.

Fallback address:
- For each NanoNym, derive a standard`nano_` fallback address from`B_spend`.
- Receive UI must show both:
    - NanoNym address (`nnym_...`): private, preferred.
    -`nano_` fallback: non-private, for incompatible wallets.
- UI clearly warns that fallback payments are linkable on-chain.

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

### 7.2 Tier 2 – Encrypted Backup Notes on Nostr (Fast, Redundant)

Purpose: More compact, redundant recovery channel using encrypted “snapshot” backups.

Backup behavior:
- Trigger: after each new payment (throttled, e.g. max once per hour).
- Data (conceptual):

```json
{
  "version": 1,
  "protocol": "nanoNymNault-backup",
  "wallet_birthday": 1704067200,
  "nanoNym_index": 0,
  "stealth_accounts": [
    {
      "address": "nano_1masked...",
      "R": "hex_R",
      "tx_hash": "hash",
      "amount_raw": "raw_amount",
      "received_timestamp": 1704070800,
      "label": "optional_memo"
    }
  ]
}
```

- Encryption:
    - Derive`recovery_key = BLAKE2b(seed || "nanoNymNault-recovery")`.
    - Encrypt entire backup payload with`recovery_key`.
    - Publish as NIP-17 gift-wrapped event to self (sender and receiver =`nostr_public`).

Recovery:
1. Derive`recovery_key` from seed.
2. Fetch backup events (kinds 1059 where sender=receiver=self).
3. Decrypt backup payloads.
4. For each stealth address, recompute`p_masked` and sync balances from Nano node.

Benefits:
- Faster than replaying all notifications.
- Single or few messages contain complete address list.

### 7.3 Tier 3 – Blockchain-Based Fallback (Guarantee, Slow)

Goal: Absolute guarantee of recoverability from seed only, even without Nostr.

Current approach:
- Not practical to brute-force`R` values; full cryptanalytic search is infeasible.
- Current practical strategy is heuristic and community-architecture-based:

1. Encourage community archival relays with long-term retention.
2. In worst case, perform heuristics on the Nano chain:
    - Enumerate candidate accounts that look like stealth outputs (e.g., unopened accounts with pending funds, accounts with single receive).
    - Use date and amount heuristics; user manually verifies candidates.
    - This is a last resort; design intent is that Tier 1 and Tier 2 cover almost all real cases.

Implementation priority:
- Phase 1: Tier 1 + Tier 2 (core, must be robust).
- Phase 2: Integrate community archival relays as a standard fallback.
- Phase 3: Heuristic chain scanning if needed (expert/advanced mode).

### 7.4 Recovery Tiers Summary

| | Tier | Method | Expected speed | Expected success | Dependencies | |
|------|-------------------------|----------------|------------------|------------------------|
| | 1 | Nostr notification replay | < 30 s | ≥ 99% | 3–5 normal relays | |
| | 2 | Encrypted backup notes | < 10 s | ≥ 95% | Nostr relays | |
| | 3 | Chain-based heuristics | minutes | 100% target | Seed + Nano network | |

Design principle:
- Normal operation: no blockchain scanning.
- Fast recovery via Nostr (Tiers 1/2).
- Seed-only guarantee via combination of Nostr + optional chain-based heuristics + archival infrastructure.

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

All NanoNyms are structurally identical; “usage style” is purely convention.

Typical use patterns:
- Long-term public NanoNym:
    - Shared in website footers, business cards.
- Per-transaction NanoNym:
    - Generated per checkout, used once or short-term.
- Per-department NanoNyms:
    - For accounting separation (Sales, Donations, Support, etc.).

UI requirements:
- Ability to:
    - Generate new NanoNym with label.
    - List NanoNyms with:
        - Label.
        - Aggregated balance.
        - Payment count.
        - Status: Active (listening to Nostr) vs Archived (not listening).
    - View per-NanoNym history.
    - Copy address / show QR.
    - Archive/reactivate NanoNyms:
        - Archiving stops Nostr monitoring but does not affect recoverability or spending.

Aggregated view:
- Show total wallet balance and per-NanoNym balances.
- Stealth accounts are grouped under their parent NanoNym.

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

## 11. Privacy Analysis (Condensed)

Against blockchain observers:
- Cannot link disparate receive payments to same NanoNym:
    - Each payment uses a unique stealth account.
- No explicit on-chain markers; NanoNym payments look like standard Nano sends.
- Spending:
    - Multi-account sends to same destination create visible linkages between those accounts.
    - Timing correlation possible unless Privacy Mode is used.

Against Nostr relays:
- Events are NIP-17 gift-wrapped:
    - Relays cannot see payload or real timestamp.
    - Sender/receiver identity obscured by ephemeral keys.
- Relay cannot link notifications to specific Nano accounts.

Against network observers:
- Can see Nostr and Nano traffic; users can mitigate with VPN/Tor.
- Cannot trivially correlate Nostr events with specific on-chain transactions due to encryption and timestamp randomization.

Comparison snapshot:

| | Protocol | Receive privacy | Spend privacy | Requires chain changes | |
|-------------------|-----------------|-------------------|------------------------|
| | Monero | High | High | Yes (own chain) | |
| | BIP-352 | High | Medium | Assumes Bitcoin | |
| | Zcash shielded | Very high | High (in-pool) | Yes (own chain) | |
| | CamoNano | High | Unspecified | No (on-chain notify) | |
| | NanoNymNault | High | Medium (warned) | No (wallet-level) | |

Design stance:
- Receive-side privacy is strong and protocol-enforced.
- Spend-side privacy is constrained by Nano’s account model; the wallet mitigates via warnings, selection strategies, and optional timing randomization, and is explicit about these limits.

---

## 12. Implementation Roadmap (Status-Oriented)

Current status (as of 2025-11-15):
- Phase 1 – Crypto core: complete.
- Phase 2 – Nostr integration: complete.
- Phase 3 – Send UI and spend-from-NanoNyms:
    - Detect`nnym_` addresses and perform stealth send + Nostr notification.
    - Implement stealth account selection algorithm + unit tests.
    - Implement privacy warnings and multi-account sending.
    - Show privacy impact.
- Phase 4 – Receive UI: in progress.
    - Multi-NanoNym management (generation, listing, balances).
    - Background Nostr monitoring and history reconstruction.
- Later phases:
    - UX polish and documentation.
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
    - Fallback`nano_` address remains non-private.
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
