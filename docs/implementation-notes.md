# NanoNymNault: Implementation Notes

This document contains **HOW** to implement the NanoNym protocol. For **WHAT** the protocol does, see [protocol-specification.md](protocol-specification.md).

---

## 1. Key Derivation

### Seed and Derivation Paths

- **Root:** BIP-39 seed
- **Standard Nano path:** `m/44'/165'/0'`
- **NanoNym master path:** `m/44'/165'/0'/1000'`
- **Per-NanoNym account:**
  - `m/44'/165'/0'/1000'/<account_index>'`
    - `/0` → spend keypair: `b_spend`, `B_spend`
    - `/1` → view keypair: `b_view`, `B_view`
    - `/2` → Nostr keypair: `nostr_private`, `nostr_public`

Where `account_index = 0, 1, 2, ...` (unbounded).

### Seed Format Detection (CRITICAL)

**NanoNymNault-specific implementation note:**

Wallet stores seeds as **64-character hex strings** (32 bytes), NOT BIP-39 mnemonics.

**Key derivation code MUST detect seed format:**
- Hex string (64 hex chars): convert via `hex.toUint8()` → 32 bytes
- BIP-39 mnemonic: convert via `bip39.mnemonicToSeedSync()` → 64 bytes

**Determinism is critical:** Same seed + same index → identical keys (always).

**Test with both hex seeds (production format) and mnemonics (user import).**

### Recovery

- Single seed recovers all NanoNyms and their keys
- Use BIP-44-style gap limit (e.g. 20 unused accounts) to find all active NanoNyms

### Wallet Birthday Optimization

- Store creation timestamp locally
- Use as lower bound for Nostr history and blockchain scans
- If unknown, default to conservative date (genesis or user-provided)
- **Birthday is an optimization, not required for correctness**

---

## 2. Cryptography

### Curves

- **Nano keys:** Ed25519 (as in Nano)
- **Nostr keys:** Secp256k1
- **Hashing:** BLAKE2b for tweaks and checksums
- **ECDH:** Standard implementations (Ed25519, Secp256k1)

**Use well-audited libraries; do NOT reimplement primitives.**

### Libraries

- Ed25519: Use `@noble/ed25519` or similar
- Secp256k1: Use `@noble/secp256k1` or similar
- BLAKE2b: Use `blakejs` or similar

---

## 3. Nostr Integration

### Client Library

- Use mature client library (e.g. `nostr-tools` for JS/TS)
- Support multiple relays by default (3–5 recommended)

### Behavior

- **Publish:** Send notifications to ALL configured relays
- **Subscribe:** Listen to ALL relays for recovery and real-time monitoring
- **Auto-reconnect:** Reconnect on failures (exponential backoff recommended)

### Performance Expectations (Rough Targets)

- **Stealth derivation:** < 100 ms per payment on typical hardware
- **Notification latency (Nostr):** median < 2 seconds
- **Background Nostr subscriptions:** low CPU/battery (idle WebSockets)

---

## 4. Stealth Account Opening Strategy

### Phase 1: Immediate Opening (Best Case)

**Trigger:** Upon receipt of Nostr notification (after validation).

**Workflow:**
1. Parse notification and create stealth account in memory
2. Immediately attempt to publish an open/receive block
3. If wallet is locked:
   - Queue in `pendingStealthBlocks` array
   - Subscribe to wallet unlock event
   - Process queue when wallet unlocks
4. If publishing succeeds: Update balance from on-chain, show success notification
5. If publishing fails: Add to retry queue, proceed to Phase 2

**Implementation details:**
- Located in `nanonym-manager.service.ts`: `receiveStealthFunds()` (called from `processNotification()`)
- Pending queue: `pendingStealthBlocks` array with unlock subscriber
- Error handling: Log failures and proceed without blocking notification flow

### Phase 2: Background Retry

**Trigger:** If immediate opening fails; runs periodically in background.

**Workflow:**
1. Every 5 minutes, check for unopened stealth accounts
2. For each unopened account, attempt to publish open block
3. Retry up to 12 times (1 hour total) before marking as "stuck"
4. Only retry if wallet is unlocked (skip if locked)

**Advantages:**
- Handles scenario: Nostr available but node temporarily unreachable
- Eventual consistency without user intervention
- Bounded retry attempts prevent infinite loops

### Phase 3: Just-in-Time Opening

**Trigger:** When user attempts to spend from NanoNym with unopened stealth accounts.

**Workflow:**
1. In `confirmNanoNymSpend()`, before executing send transactions:
   - Check if any selected stealth accounts are unopened (no frontier on node)
   - If unopened accounts exist, attempt to open them synchronously
   - Show progress notification: "Opening stealth accounts..."
   - Wait for confirmations (timeout: 30 seconds per account)
2. If opening succeeds: Proceed with send transactions, show transparent notification
3. If opening fails: Display specific error, do NOT attempt send (would fail with no frontier)

**Implementation details:**
- New method: `ensureStealthAccountsOpened(stealthAccounts)` in `send.component.ts`
- Called before send loop in `confirmNanoNymSpend()`
- Uses existing `nanoBlock.generateReceive()` infrastructure
- Shows progress toast with account count

### Unopened Account Handling Rules

**Rules applied throughout the wallet:**

1. **During balance display:** Always fetch current balance from node (accounts are spendable if they have a frontier, even if unconfirmed)
2. **During account selection:** Include unopened accounts in selection (they may open by the time send is ready)
3. **During spend preparation:**
   - Fetch current account info from node
   - If account has no frontier: attempt just-in-time opening
   - If opening fails: skip account and warn user
4. **During background sync:** Periodically attempt to open any unopened accounts

**Why this design:**
- Maximizes robustness against transient node/network failures
- Minimizes user friction (opening is automatic and transparent)
- Handles both happy path (Nostr + node both available) and recovery paths (one or both temporarily unavailable)
- Ensures seed-only recovery: even if opening failed, user can wait and retry

---

## 5. Security and Privacy Considerations

### View Key Sharing

- `b_view` alone is sufficient for watch-only wallets (can reconstruct incoming stealth addresses but cannot spend)
- Useful for auditing or monitoring without spending capability

### Nostr Key Compromise

- Attacker can read future notifications but cannot spend (no access to `b_spend`)
- Attacker cannot derive past notifications (forward secrecy via ephemeral keys)

### Relays

- All notification payloads are encrypted (NIP-17 gift-wrapped)
- Relays cannot read or link contents
- Relays cannot correlate notifications to on-chain transactions

### Timing

- Notification timestamps are randomized (±2 days) to prevent timing correlation
- Privacy Mode can randomize on-chain spend timing (optional 10-30 second delays)

---

## 6. Known Implementation Issues

### Representative initialization for new wallets

- When a wallet is created, `defaultRepresentative` is initialized to `null`
- Stealth accounts that open before Account #0 receives a transaction will get a random representative
- Account #0 shows "Representative: NONE" until it receives, then gets a representative (possibly different)
- **Not a protocol issue** - each account can have independent representatives on-chain
- **UX improvement (planned):** Initialize `defaultRepresentative` at NanoNym account creation time if wallet default is `null`, ensuring consistent representatives across all accounts (stealth and standard)

---

## 7. Testing Requirements

### Unit Tests (MUST HAVE)

**Deterministic key derivation:**
```typescript
it('should derive identical keys from same seed + index', () => {
  const seed1 = hexToUint8('ABC123...');
  const seed2 = hexToUint8('ABC123...'); // Same seed
  
  const keys1 = deriveNanoNymKeys(seed1, 0);
  const keys2 = deriveNanoNymKeys(seed2, 0);
  
  expect(keys1.spend).toEqual(keys2.spend);
  expect(keys1.view).toEqual(keys2.view);
  expect(keys1.nostr).toEqual(keys2.nostr);
});
```

**Test both hex seeds and BIP-39 mnemonics:**
```typescript
it('should derive keys from hex seed', () => {
  const hexSeed = '0'.repeat(64); // 64-char hex
  const keys = deriveNanoNymKeys(hexToUint8(hexSeed), 0);
  expect(keys.spend).toBeDefined();
});

it('should derive keys from BIP-39 mnemonic', () => {
  const mnemonic = 'abandon abandon abandon ... art';
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const keys = deriveNanoNymKeys(seed, 0);
  expect(keys.spend).toBeDefined();
});
```

### Integration Tests (SHOULD HAVE)

- Nostr send/receive with mocked or test relays
- Multi-relay redundancy testing
- Stealth account opening workflow (all three phases)

### E2E Tests (PLANNED)

- Full send/receive flow on Nano testnet + real Nostr relays
- Recovery from seed (gap limit discovery)
- Multi-payment aggregation
- Balance persistence across wallet restarts
