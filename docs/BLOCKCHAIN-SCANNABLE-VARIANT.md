# Blockchain-Scannable NanoNym Variant

**Status:** Proposed Alternative Protocol Extension
**Requires:** CLAUDE.md (read first)
**Date:** 2025-11-29

---

## Overview

This document specifies an alternative NanoNym protocol variant inspired by Bitcoin Silent Payments (BIP-352) that enables **blockchain-only recovery** without relying on Nostr notifications.

The core difference: instead of ephemeral keypairs, the sender uses their own Nano account keys for ECDH, making all necessary information for stealth address derivation available on-chain.

### Privacy Goals Reminder

Before comparing variants, recall NanoNym's core privacy goals (from CLAUDE.md Section 11):

1. **Reusable payment codes** - Main UX value
2. **Recipient privacy from on-chain observers** - Third parties cannot link stealth accounts
3. **Plausible deniability** - Recipient can deny ownership until consolidation/spending

**NOT a goal**: Hiding sender identity from receiver (receiver can always see sender account in both variants)

### Key Insight

Both ephemeral and scannable modes provide **identical privacy properties**. The receiver can always see the sender's Nano account by looking up the transaction on-chain. The choice between modes is about **recovery guarantees**, not privacy.

---

## Comparison: Current vs Blockchain-Scannable

| Property | Current (Ephemeral) | Blockchain-Scannable |
|----------|---------------------|----------------------|
| Shared secret derivation | `r * B_view` (ephemeral) | `a_sender * B_view` (sender account) |
| Recovery method | Nostr notifications | Blockchain scanning |
| Sender account visible to receiver | Yes (via tx_hash lookup) | Yes (via tx_hash lookup) |
| Recovery guarantee | Depends on relay retention | Blockchain + seed only |
| Communication channel | Nostr (NIP-17) required | Optional (metadata only) |

---

## Protocol Specification: Blockchain-Scannable Mode

### Address Format

**No changes** to `nnym_` address format. The variant is determined by sender behavior, not receiver encoding.

### Send Workflow (Sender → NanoNym)

When the sender inputs a `nnym_` address and chooses blockchain-scannable mode:

1. **Parse `nnym_`**:
   - Extract `B_spend`, `B_view`, `nostr_public`

2. **Use sender's account key** (no ephemeral generation):
   - `a_sender` = private key of sender's Nano account
   - `A_sender` = public key of sender's Nano account (visible on-chain)

3. **ECDH shared secret**:
   ```
   shared_secret = a_sender * B_view
   ```

4. **Compute tweak scalar**:
   ```
   t = BLAKE2b(shared_secret_x || A_sender || B_spend)
   ```
   Note: `A_sender` replaces ephemeral `R` in the hash

5. **Derive one-time stealth address**:
   ```
   P_masked = B_spend + (t * G)
   masked_nano_address = nano_encode(P_masked)
   ```

6. **On-chain payment**:
   - Send XNO from sender's account to `masked_nano_address`
   - Transaction naturally contains `A_sender` (the sending account's public key)

7. **Off-chain notification (OPTIONAL)**:
   - For immediate notification, can still send Nostr message
   - Payload simplified (no `R` needed):
   ```json
   {
     "version": 1,
     "protocol": "nanoNymNault-scannable",
     "sender_account": "nano_1sender...",
     "tx_hash": "nano_tx_hash",
     "amount": "optional_amount",
     "memo": "optional_encrypted_memo"
   }
   ```
   - If notification is not sent, receiver discovers via blockchain scanning

### Receive Workflow: Real-Time Monitoring

Unchanged if using optional Nostr notifications. Extract `sender_account`, derive stealth address, validate.

### Receive Workflow: Blockchain Scanning (Recovery)

**Input**: Wallet birthday timestamp or block height

**Process**:

1. **Enumerate transactions** since wallet birthday:
   - Use Nano RPC `confirmation_history` with count/offset
   - OR query blocks by timestamp range (if node supports)
   - OR enumerate all accounts and check their histories

2. **For each confirmed block**:
   - Extract sender account's public key `A_sender`
   - Extract destination address `dest_address`

3. **Test against all active NanoNyms**:
   ```typescript
   for each nanoNym in activeNanoNyms:
     shared_secret = b_view * A_sender  // ECDH
     t = BLAKE2b(shared_secret_x || A_sender || B_spend)
     P_test = B_spend + (t * G)
     expected_address = nano_encode(P_test)

     if expected_address == dest_address:
       // This is our stealth account!
       p_masked = b_spend + t
       recordStealthAccount(nanoNym, {
         address: dest_address,
         publicKey: P_test,
         privateKey: p_masked,
         senderPublicKey: A_sender,
         txHash: block.hash,
         amountRaw: block.amount,
         receivedAt: block.timestamp
       })
       break
   ```

4. **Optimize with bloom filters** (optional):
   - Pre-compute `B_spend` values for all NanoNyms
   - Skip testing if `dest_address` doesn't match expected pattern

### Modified StealthAccount Type

```typescript
export interface StealthAccountScannable extends StealthAccount {
  /** Sender's account public key (replaces ephemeralPublicKey) */
  senderPublicKey: Uint8Array;

  /** Sender's nano_ address (for display/linking analysis) */
  senderAddress: string;

  // ephemeralPublicKey field not used in scannable mode
}
```

---

## Implementation Considerations

### Performance Analysis

**Blockchain scanning complexity**:
- Must enumerate all transactions on the network since wallet birthday
- For each transaction: 1 ECDH operation × N active NanoNyms
- Nano processes ~1-2 tx/sec average (2023-2025 data)
- Scanning 1 year ≈ 31M-63M seconds ≈ 1M-2M transactions
- At 10 NanoNyms × 1 ECDH per tx ≈ 10M-20M ECDH operations

**Optimization strategies**:

1. **Parallel processing**: Test multiple transactions concurrently
2. **Early termination**: Stop testing NanoNyms once match found for a transaction
3. **Chunked scanning**: Process in date ranges, cache results
4. **Light client mode**: Query pre-indexed scanning service (requires trust)

**Estimated times** (rough):
- Modern laptop (single-threaded): 2-6 hours for 1 year
- Web worker parallelization: 30-90 minutes for 1 year
- Optimized service: seconds to minutes

### RPC Requirements

**Standard Nano RPC methods** (sufficient):
- `confirmation_history` - enumerate recent confirmed blocks
- `account_history` - get transactions for specific accounts
- `block_info` - get block details (sender, amount, destination)

**No custom node required** - all data is public blockchain state.

**Potential enhancements** (optional):
- Custom RPC endpoint: `blocks_since(timestamp)` for efficient enumeration
- Bloom filter support: `test_stealth_candidates(pubkey_list)`

### Privacy Trade-offs

**Important**: In BOTH modes, the receiver can see the sender account by looking up the `tx_hash` on-chain. The ephemeral `R` value prevents on-chain observers from linking stealth addresses, but does NOT hide the sender from the receiver.

**Actual differences**:

| Property | Ephemeral Mode | Scannable Mode |
|----------|----------------|----------------|
| Sender account visible to receiver | ✅ Yes (via tx lookup) | ✅ Yes (via tx lookup) |
| On-chain observer linkability | ❌ Cannot link stealth addresses | ❌ Cannot link stealth addresses |
| Recovery mechanism | Requires Nostr notifications | Blockchain scanning sufficient |
| Derivation requirements | Needs `R` from notification | Needs `A_sender` from tx (already on-chain) |

**Key insight**: The choice between modes is about **recovery guarantees**, not sender privacy from receiver.

**Use cases for scannable mode**:
- Users prioritizing guaranteed recovery over Nostr availability
- Scenarios where receiver already knows sender identity
- Long-term archival (don't want to rely on relay retention)

**Use cases for ephemeral mode**:
- Users with reliable Nostr relay access
- Prefer faster recovery (seconds vs minutes for blockchain scan)
- Current default (no implementation changes needed)

---

## User Experience Design

### Mode Selection

**Option A: Sender chooses** (preferred):
- Send UI shows toggle: "Standard (Nostr)" vs "Scannable (Blockchain recovery)"
- Default: Standard (ephemeral keys + Nostr)
- Tooltip: "Both modes provide same privacy. Scannable mode ensures recovery even if Nostr relays fail, at the cost of slower blockchain scanning."

**Option B: Receiver specifies** (future):
- New address format: `nnym2_...` for scannable variant
- `nnym_` = ephemeral mode (current)
- Note: Receiver sees sender account in both modes

### UX Flow: Blockchain Scanning Recovery

1. **Trigger**: User restores from seed on new device

2. **Prompt**:
   ```
   [!] No Nostr notification history found

   Scan blockchain for payments?

   Estimated time: 45 minutes (1 year of history)

   [Scan Now]  [Skip - try Nostr first]
   ```

3. **Progress UI**:
   ```
   Scanning blockchain...

   Progress: [=========>        ] 62%
   Checked: 1,240,000 / 2,000,000 transactions
   Found: 12 stealth accounts

   NanoNym #0 "Donations": 8 payments
   NanoNym #1 "Personal":  4 payments

   Estimated time remaining: 17 minutes

   [Run in background]  [Cancel]
   ```

4. **Web Worker implementation**:
   - Don't block UI during scan
   - Persist intermediate results (resume if interrupted)
   - Show notifications when new accounts found

### Settings Configuration

```typescript
interface RecoverySettings {
  preferredMethod: 'nostr' | 'blockchain' | 'both';
  blockchainScanBirthday: number; // Unix timestamp
  scanChunkSize: number; // Transactions per batch
  maxConcurrentScans: number; // Parallel workers
  enableScanningService: boolean; // Use third-party indexer
}
```

---

## Migration Strategy

### Coexistence Model

Both protocols can coexist in the same wallet:

**NanoNym-level setting**:
```typescript
export interface NanoNym {
  // ... existing fields ...

  /** Accepted receive modes */
  acceptedModes: ('ephemeral' | 'scannable' | 'both')[];

  /** Default mode for spending (if receiver supports both) */
  defaultSendMode: 'ephemeral' | 'scannable';
}
```

**Stealth account discriminator**:
```typescript
export interface StealthAccount {
  // ... existing fields ...

  /** How this account was derived */
  derivationMode: 'ephemeral' | 'scannable';

  /** Ephemeral R (if mode=ephemeral) or sender key (if mode=scannable) */
  derivationKey: Uint8Array;
}
```

### Backward Compatibility

**Receiving**:
- NanoNyms can accept both modes simultaneously
- Storage differentiate via `derivationMode` field
- Balance aggregation works across both types

**Sending**:
- UI shows mode selector only if wallet supports scannable variant
- Older wallet versions continue using ephemeral mode
- Both arrive as valid stealth payments to receiver

### Gradual Rollout

**Phase 1**: Implement blockchain scanning for **recovery only**
- All sends still use ephemeral mode
- Recovery tries Nostr first, falls back to blockchain scan
- Tests recovery path without changing send protocol

**Phase 2**: Optional scannable send mode
- Add UI toggle for advanced users
- Default remains ephemeral
- Document trade-offs clearly

**Phase 3**: Receiver preferences
- NanoNyms can advertise preferred mode (off-chain metadata)
- Senders respect receiver preference when known
- Falls back to ephemeral if unknown

---

## Security Considerations

### Sender Account Visibility to Receiver

**Reality (applies to BOTH modes)**: Receiver can always analyze sender's account
- In ephemeral mode: Receiver gets `tx_hash` in Nostr notification → queries blockchain → sees sender account
- In scannable mode: Receiver scans blockchain → sees sender account directly
- Result: Identical information available to receiver in both cases

**What receiver can do (in BOTH modes)**:
- Query `A_sender` account on explorers
- See sender's balance, transaction patterns
- Link multiple payments from same sender account
- Potentially identify sender if account is KYC'd

**Mitigations (apply to BOTH modes)**:
1. Warn users in send UI: "Receiver will be able to see your account"
2. Recommend using dedicated "sending accounts" with minimal balance
3. Optional: Generate intermediate forwarding accounts (adds on-chain hop)
4. Privacy model: NanoNym protects against on-chain observers, not against the receiver

### Chain Analysis Resistance

**Against blockchain observers** (unchanged):
- Stealth addresses still unlinkable to each other on-chain
- No visible markers that payment is to NanoNym
- Observer cannot tell if payment is ephemeral or scannable mode

**Against statistical analysis**:
- Both modes: Sender account → stealth address correlation visible on-chain (one send tx per stealth account)
- Both modes: Multiple payments from same sender create timing patterns
- No difference in resistance to graph analysis between modes

### Comparison with Bitcoin Silent Payments

**Why Bitcoin Silent Payments work well**:
- Bitcoin transactions naturally have multiple inputs (UTXO model)
- Sender can mix UTXOs from different sources in one transaction
- Stealth payment input keys can be fresh/isolated
- Receiver must scan to know which outputs are theirs

**Why Nano's account model differs**:
- Each send is from a single account (persistent identity)
- No native input mixing or multi-input transactions
- **Both ephemeral and scannable modes**: Sender account visible to receiver
- **Key difference from Bitcoin**: Receiver can ALWAYS see sender account (via tx lookup in ephemeral mode, or scanning in scannable mode)

**Bottom line**: Nano's account model means receiver visibility of sender is unavoidable regardless of protocol variant choice.

---

## Testing Strategy

### Unit Tests

```typescript
describe('Blockchain-Scannable Variant', () => {
  it('should derive same stealth address using sender account key', () => {
    const senderPrivate = crypto.deriveNanoKeys(seed, 0).privateKey;
    const senderPublic = crypto.deriveNanoKeys(seed, 0).publicKey;
    const receiverKeys = crypto.deriveNanoNymKeys(seed, 0);

    // Sender derives
    const shared = crypto.ecdh(senderPrivate, receiverKeys.viewPublic);
    const t = crypto.computeTweak(shared, senderPublic, receiverKeys.spendPublic);
    const stealthAddress1 = crypto.deriveStealthAddress(receiverKeys.spendPublic, t);

    // Receiver scans
    const sharedRecv = crypto.ecdh(receiverKeys.viewPrivate, senderPublic);
    const tRecv = crypto.computeTweak(sharedRecv, senderPublic, receiverKeys.spendPublic);
    const stealthAddress2 = crypto.deriveStealthAddress(receiverKeys.spendPublic, tRecv);

    expect(stealthAddress1).toEqual(stealthAddress2);
  });

  it('should derive correct private key for spending', () => {
    // ... test p_masked = b_spend + t
  });

  it('should link multiple payments from same sender', () => {
    // ... verify receiver can identify sender_account across payments
  });

  it('should not link payments from different senders', () => {
    // ... verify different senders create unlinkable stealth addresses
  });
});
```

### Integration Tests

**Blockchain scanning simulation**:
1. Create test wallet with multiple NanoNyms
2. Simulate receiving 50 scannable payments (various senders)
3. Clear Nostr history
4. Perform blockchain scan with mock RPC responses
5. Verify all 50 stealth accounts recovered correctly

**Performance benchmarks**:
- Measure ECDH operations per second (target: >10,000/sec)
- Test scanning 100K transactions with 5 NanoNyms
- Optimize to < 60 seconds for 1 year scan

### E2E Test Scenarios

1. **Mixed-mode recovery**: Wallet with both ephemeral and scannable stealth accounts
2. **Partial Nostr availability**: Some notifications available, some require scanning
3. **Interrupted scan**: Resume blockchain scan after browser close
4. **Concurrent scans**: Multiple NanoNyms scanning simultaneously

---

## Open Questions

1. **Scan service architecture**: Should we provide centralized scanning API for performance? Trade-offs with decentralization?

2. **Block enumeration optimization**: Work with Nano node devs to add efficient RPC methods for scanning use case?

3. **Hybrid notifications**: Send lightweight Nostr ping ("you have payment") without full details, receiver scans blockchain to find it?

4. **Account isolation**: Should wallet auto-generate "burner" sending accounts for scannable sends to avoid main account exposure?

5. **Version negotiation**: How should sender discover if receiver prefers scannable vs ephemeral mode?

---

## References

- **BIP-352**: Silent Payments specification
  https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki

- **Nano RPC Protocol**:
  https://docs.nano.org/commands/rpc-protocol/

- **CLAUDE.md Section 7**: Current NanoNym recovery architecture

- **Bitcoin Silent Payments Scanning**:
  https://github.com/setavenger/BIP0352-light-client-specification

---

## Implementation Checklist

- [ ] Add `blockchainScanService` with transaction enumeration
- [ ] Implement sender-key-based ECDH in `nanonym-crypto.service.ts`
- [ ] Add `derivationMode` field to `StealthAccount` type
- [ ] Create UI toggle for send mode selection
- [ ] Implement Web Worker for background scanning
- [ ] Add recovery wizard with progress UI
- [ ] Write 15+ unit tests for scannable variant
- [ ] Performance optimization (target: <60s for 1 year)
- [ ] Document privacy trade-offs in user-facing help
- [ ] Optional: Build lightweight scanning indexer service
