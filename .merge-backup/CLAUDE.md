# CLAUDE.md: NanoNymNault Protocol Specification

**Target Agent:** Claude Code  
**Project Name:** NanoNymNault  
**Goal:** Implement a privacy-preserving payment protocol for Nano using reusable pseudonyms (NanoNyms)  
**Primary Constraint:** This implementation **must not require any changes to the Nano base protocol or node software**. It must be an entirely wallet-level (off-chain) coordination protocol.

---

## 1. Project Objective

The goal is to implement **NanoNyms** - reusable pseudonyms that enable privacy-preserving payments on Nano. A user (e.g., merchant, streamer, or donation recipient) can share a **single, static NanoNym** (`nnym_` address) while receiving multiple, un-linkable payments.

**Problem Statement:** A standard `nano_` address publicly links all incoming transactions, balances, and history, which is a major privacy leak.

**Solution:** NanoNyms use stealth addresses (CamoNano-inspired cryptography) with off-chain notifications (Nostr NIP-17) to provide receiver unlinkability without the traceability issues of on-chain notifications.

---

## 2. What is a NanoNym?

**NanoNym** = **Nano** + **onym** (Ancient Greek ὄνυμα "name")

A NanoNym is a **reusable pseudonym** for receiving payments:
- Encoded as `nnym_` addresses (~160 characters)
- Contains three public keys (spend, view, Nostr notification)
- All NanoNyms are structurally identical and infinitely reusable
- Multiple NanoNyms can be derived from a single seed
- Users decide how to deploy them (long-term public, per-transaction, per-department, etc.)

---

## 3. Incompatible Protocols (Rejected)

Analysis confirmed that several common privacy protocols are fundamentally incompatible with Nano's block lattice:

* **BIP-47 (PayNyms):** Requires on-chain `OP_RETURN` notification field. Nano has no equivalent.
* **BIP-78 (PayJoin v1):** Requires multiple parties to contribute inputs/outputs to a single shared transaction. Nano's architecture uses separate `send` and `receive` blocks on individual account-chains.

---

## 4. Compatible & Adapted Protocols

After deep analysis of Bitcoin improvement proposals and existing Nano implementations:

* **CamoNano:** ✅ Proven cryptography for stealth addresses, adapted from Monero
  - Problem: Uses on-chain notifications (XNO 0.00049 cost + timing correlation leaks)
  - Solution: Keep cryptography, replace notifications

* **BIP-352 (Silent Payments):** ✅ ECDH-based stealth generation (actually simpler for Nano)
  - Nano's account model simplifies the input aggregation complexity
  - Insight: Don't need network-wide scanning with proper notification system

* **BIP-77 (Async Payjoin v2):** ✅ Off-chain directory server with OHTTP privacy
  - Insight: Use existing infrastructure (Nostr) instead of custom directory

* **Nostr NIP-17:** ✅ Gift-wrapped encrypted messages with metadata privacy
  - Perfect for off-chain payment notifications
  - 1000+ relays already operational
  - Free, censorship-resistant, privacy-preserving

---

## 5. Final Protocol Design: CamoNano + Nostr

**Architecture:** Hybrid approach combining proven technologies

```
CamoNano Cryptography (stealth addresses)
  + Nostr NIP-17 (off-chain notifications)
  + Multi-account support (unlimited NanoNyms from one seed)
  = NanoNymNault
```

### 5.1. The NanoNym Address Format: `nnym_`

**Format:**
```
nnym_<base32_encoded_data>

Data Structure (99 bytes):
  Byte 0:       Version (0x01 for version 1)
  Bytes 1-32:   B_spend (Ed25519 public key, 32 bytes)
  Bytes 33-64:  B_view (Ed25519 public key, 32 bytes)
  Bytes 65-96:  nostr_public (Schnorr public key, 32 bytes)
  Bytes 97-98:  Checksum (first 2 bytes of BLAKE2b-5 hash)

Base32 Encoding: Use Nano's standard alphabet
Result length: ~160 characters
```

**Why include Nostr pubkey:**
- Receiver's Nostr identity is the notification destination
- No separate address resolution needed
- Enables "scan for notifications" without additional lookup
- Each NanoNym can have unique Nostr key (better privacy) or shared key (simpler UX)

**Safety:** Non-compliant wallets will reject `nnym_` addresses, preventing accidental non-private sends.

### 5.2. Multi-Account Key Derivation

**Unlimited NanoNyms from single seed:**

```
Master Seed (BIP-39)
  ↓
m/44'/165'/0'  (Nano standard path)
  ↓
m/44'/165'/0'/1000'  (NanoNym master)
  ↓
m/44'/165'/0'/1000'/<account_index>'  (Multiple NanoNyms!)
  ↓
  ├─ m/44'/165'/0'/1000'/<account_index>'/0  → b_spend, B_spend
  ├─ m/44'/165'/0'/1000'/<account_index>'/1  → b_view, B_view
  └─ m/44'/165'/0'/1000'/<account_index>'/2  → nostr_private, nostr_public

Where account_index = 0, 1, 2, 3, ... N (unlimited)
```

**Examples:**
- Account 0: Default/General NanoNym
- Account 1: Donations Q1 2025
- Account 2: Per-customer checkout
- Account N: Any purpose user chooses

**Recovery:** Single seed backs up all NanoNyms. Wallet uses gap limit (20 consecutive unused accounts) like BIP-44.

### 5.3. Fallback Mechanism (Safety)

The wallet's "Receive" UI must display **both**:
1. The NanoNym (`nnym_` address) for compliant wallets
2. A standard `nano_` **fallback address** (derived from `B_spend`)

**Warning to user:** Payments to fallback address are **not private** (all transactions publicly linked).

This prevents fund loss when someone tries to send from a non-compliant wallet.

---

## 6. Sender's Workflow

**When user sends to `nnym_` address:**

1. Parse `nnym_` address → extract B_spend, B_view, nostr_public

2. Generate ephemeral key for this payment:
   ```
   r = random_scalar()  (or deterministic from sender keys)
   R = r * G  (ephemeral public key)
   ```

3. Derive shared secret via ECDH:
   ```
   shared_secret = r * B_view
   ```

4. Compute tweak scalar:
   ```
   t = BLAKE2b(shared_secret_x || R || B_spend)
   ```

5. Derive one-time stealth address:
   ```
   P_masked = B_spend + (t * G)
   masked_nano_address = nano_encode(P_masked)
   ```

6. Send XNO to `masked_nano_address` on Nano blockchain
   - Looks like any other Nano transaction
   - No special markers or metadata

7. Create Nostr notification message:
   ```json
   {
     "version": 1,
     "protocol": "nanoNymNault",
     "R": "hex(R)",                 // Ephemeral public key
     "tx_hash": "...",               // Nano transaction hash
     "amount": "1.234567",           // Optional: XNO amount
     "amount_raw": "1234567000...",  // Optional: raw amount
     "memo": "..."                   // Optional: encrypted memo
   }
   ```

8. Encrypt with NIP-17 gift-wrapping:
   - Inner seal: Encrypt payload with recipient's nostr_public
   - Outer gift-wrap: Encrypt seal with ephemeral Nostr keypair
   - Randomized timestamp (±2 days) for timing privacy
   - Publish to 3-5 Nostr relays

9. Done! Payment sent privately.

---

## 7. Receiver's Workflow

**NanoNym account continuously monitors Nostr relays:**

1. Connect to Nostr relays via WebSocket

2. Subscribe to gift-wrapped events (kind:1059) for own nostr_public

3. For each notification received:
   a. Unwrap outer gift-wrap layer → get seal
   b. Unwrap inner seal → get notification payload
   c. Extract ephemeral key R and tx_hash

4. Derive expected stealth address:
   ```
   shared_secret = b_view * R
   t = BLAKE2b(shared_secret_x || R || B_spend)
   P_test = B_spend + (t * G)
   expected_address = nano_encode(P_test)
   ```

5. Query Nano node for transaction:
   - Use tx_hash to fetch details
   - Verify destination matches expected_address
   - Verify amount (if provided)

6. Derive private key for spending:
   ```
   p_masked = b_spend + t
   ```

7. Import into wallet:
   - Store (p_masked, masked_address, R, tx_hash, metadata)
   - Add to aggregated NanoNym balance
   - Display in unified transaction history

**Background sync:** If wallet was offline, request historical events since last check using Nostr REQ filters.

---

## 8. Multi-Account Management

### 8.1. Use Cases (All Structurally Identical)

**No "ephemeral" vs "reusable" types** - all NanoNyms work the same way. Users choose how to use them:

**Long-term public NanoNym:**
- Generate once, print on business cards
- Share on website footer
- Use for years

**Per-transaction NanoNym:**
- Generate fresh for each customer checkout
- Display temporarily on POS screen
- Archive after payment received

**Per-department NanoNyms:**
- Sales, Consulting, Returns, etc.
- Accounting categorization
- Revenue tracking

### 8.2. Wallet UI

**Generate New NanoNym:**
```
┌─────────────────────────────────────┐
│ Generate New NanoNym                │
├─────────────────────────────────────┤
│ Label (optional):                   │
│ [Donations 2025 Q1____________]     │
│                                     │
│         [Generate]  [Cancel]        │
└─────────────────────────────────────┘
```

**List NanoNyms:**
- Show all generated NanoNyms with labels
- Display balance and payment count
- Status: Active (monitoring) or Archived (not monitoring)
- Options: View details, Archive/Reactivate, Copy address, Show QR

**Unified Balance:**
- Aggregate all stealth account balances per NanoNym
- Show total across all NanoNyms
- Per-NanoNym transaction history

### 8.3. Archive Feature (UX Optimization)

**Active:** Wallet monitors Nostr notifications for this NanoNym  
**Archived:** Stop monitoring (reduces background processing)  
**Note:** Funds always accessible, can reactivate anytime

This is a UX optimization, not a protocol feature.

---

## 9. Technical Implementation Notes

### 9.1. Cryptographic Libraries

Use well-audited libraries:
- **Ed25519:** Nano's standard curve (for spend/view keys)
- **Secp256k1:** Nostr's curve (for Nostr keys)
- **BLAKE2b:** Hashing (Nano standard)
- **ECDH:** Standard implementation
- **NIP-17 encryption:** Use nostr-tools or nostr-sdk libraries

### 9.2. Nostr Integration

**Client library:** nostr-tools (JavaScript/TypeScript)  
**Default relays:** 3-5 public relays (relay.damus.io, nos.lol, etc.)  
**Connection:** WebSocket-based, lightweight  
**Redundancy:** Publish to all, subscribe from all  
**Failover:** Auto-reconnect on failure

### 9.3. Performance Considerations

**Notification latency:** < 2 seconds (median)  
**Derivation speed:** < 100ms per stealth address  
**Background monitoring:** Minimal battery impact (WebSocket idle)  
**Multi-account:** Each active NanoNym requires one Nostr subscription

### 9.4. Security Considerations

**View key separation:** Can share b_view for watch-only wallet (cannot spend)  
**Nostr key compromise:** Attacker can read future notifications but cannot steal funds (needs b_spend)  
**Relay trust:** Relays cannot decrypt notifications (NIP-17 encryption)  
**Timing analysis:** NIP-17 randomizes timestamps (±2 days)

---

## 10. Privacy Analysis

### Against Blockchain Observers:
✅ Cannot link payments to receiver (unique stealth addresses)  
✅ Cannot link multiple payments to same NanoNym  
✅ No notification transactions visible on-chain  
✅ Cannot distinguish NanoNym payments from regular Nano transactions

### Against Nostr Relay Operators:
✅ Cannot read notification contents (NIP-17 encryption)  
✅ Cannot link sender to receiver (ephemeral keys in gift-wrap)  
✅ Cannot see true timestamp (randomized)  
✅ Cannot perform timing analysis

### Against Network Observers:
⚠️ Can see user connecting to Nostr relays (mitigate: Tor/VPN)  
✅ Cannot correlate Nostr activity with Nano transactions (encrypted, randomized timing)

### Compared to CamoNano:
✅ No on-chain notification cost (XNO 0.00049 saved per payment)  
✅ No timing correlation (randomized timestamps vs observable on-chain timing)  
✅ Better sender anonymity (ephemeral Nostr keys vs Nano account visible)  
✅ No recipient enumeration (encrypted Nostr vs public spend address monitoring)

---

## 11. Implementation Roadmap

**Priority:** Working user-verifiable PoC > Tests > Documentation

### Phase 1: Core Cryptography
**Deliverable:** Functional crypto library with manual verification capability

- Multi-account key derivation (BIP-32 style)
- ECDH shared secret generation
- Stealth address derivation
- `nnym_` address encoding/decoding
- **Testing approach:** Unit tests for address encoding, key derivation paths
  - Focus: Data correctness (addresses decode to correct keys)
  - Do NOT test: Library internals (bip39, tweetnacl already tested)
  - Manual verification: Generate test addresses, verify round-trip encoding

### Phase 2: Nostr Integration
**Deliverable:** Send/receive notifications between two wallet instances

- Integrate nostr-tools library
- NIP-17 encryption/decryption
- Relay connection management
- Notification handling
- Multi-relay redundancy
- **Testing approach:** Integration tests with mocked Nostr relay
  - Focus: Message format, encryption correctness
  - Manual verification: Two browser tabs, send notification from A→B, verify receipt

### Phase 3: Wallet UI - Send
**Deliverable:** Complete send flow functional in dev mode

- Detect `nnym_` addresses
- Send flow with Nostr notification
- Relay status display
- Error handling
- **Testing approach:** Manual QA with test NanoNyms
  - Focus: User workflow works end-to-end
  - No automated UI tests yet (add Cypress/Playwright later)

### Phase 4: Wallet UI - Receive
**Deliverable:** Complete receive flow functional in dev mode

- Generate multiple NanoNyms
- Background Nostr monitoring
- Unified balance display
- Transaction history
- Per-NanoNym views
- **Testing approach:** Manual QA with real test transactions
  - Focus: Balance calculations correct, no missed notifications
  - Integration tests for balance aggregation logic

### Phase 5: Polish & User Testing
**Deliverable:** Beta-ready wallet for community testing

- Account management (labels, archive/active)
- Error handling improvements
- User documentation (in-wallet help)
- **Testing approach:** Community beta testing
  - Focus: Real-world usage patterns, edge cases
  - Collect feedback on UX/privacy comprehension

### Phase 6: Hardening
**Deliverable:** Production-ready wallet

- Fix bugs found in beta
- Add unit tests for critical bug fixes
- Performance optimization
- **Testing approach:** Targeted tests for fixed bugs
  - Focus: Regression prevention for reported issues

### Phase 7: Launch
**Deliverable:** Public release

- Security review (if budget permits)
- Final documentation
- Community launch
- **Testing approach:** Consider adding Cypress/Playwright for smoke tests
  - Focus: Critical paths (send, receive, backup/restore)
  - Ongoing: Monitor for issues in production

---

## 12. Success Metrics

**Technical:**
- Notification delivery: > 99.9% (with 5 relays)
- Notification latency: < 2 seconds (median)
- Privacy: Zero correlation detectable
- Derivation speed: < 100ms

**User Experience:**
- Time to send: < 10 seconds
- Time to receive: < 5 seconds (wallet running)
- User comprehension: > 80% understand privacy benefits

**Adoption:**
- 100 users in first month
- 1000 users in first 6 months
- At least one merchant using for donations

---

## 13. Known Limitations

1. **Sender must use compliant wallet:** Non-compliant wallets cannot send to `nnym_` addresses
2. **Nostr infrastructure dependency:** Requires Nostr relays (can self-host for guaranteed service)
3. **Backup complexity:** Recovery requires re-scanning Nostr notifications (automated but takes time)
4. **Account proliferation:** Each payment creates new stealth account (handled via unified balance UI)
5. **No post-quantum security:** Same as Nano itself (will upgrade when Nano does)

---

## 14. Future Enhancements

**Protocol v2 considerations:**
- ACK messages (notification delivery confirmation)
- Nostr key rotation (address format v2)
- Cross-currency standardization (propose as NIP)
- Light client view key delegation
- Compact filters for efficient scanning

---

## 15. Conclusion

NanoNymNault provides **practical privacy** for Nano users who want to share reusable payment addresses without revealing their transaction history.

**Key innovations:**
- Combines proven CamoNano cryptography with modern Nostr messaging
- Solves on-chain notification problems (cost, timing correlation, sender linkability)
- Supports unlimited NanoNyms from single seed
- All NanoNyms are identical and reusable (users decide how to deploy)
- No Nano protocol changes required

**This is achievable, scalable, and ready to implement.** 🚀

---

**Document Version:** 2.0 (Updated after BIP analysis and NanoNym terminology)  
**Date:** 2025-11-10  
**Currency:** XNO  
**Address Prefix:** nnym_  
**Status:** Specification Complete - Ready for Implementation
