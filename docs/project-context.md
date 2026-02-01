# NanoNymNault: Architectural Context & Design Decisions

This document captures **WHY** we built NanoNymNault the way we did. It preserves the reasoning behind key architectural decisions so future changes don't accidentally break core design principles.

---

## Problem Statement

**Problem:** Standard `nano_` addresses link all incoming transactions and history on-chain, breaking receiver privacy.

**Solution:** NanoNyms are reusable payment codes (`nnym_` prefix) that encode keys for stealth-address receiving and off-chain notifications. Each inbound payment creates a unique stealth Nano account that cannot be linked on-chain.

---

## Design Positioning

### Why Not Use Existing Protocols?

**Rejected approaches:**
- **BIP-47 (PayNyms):** Needs on-chain `OP_RETURN`-style notifications (not available on Nano)
- **BIP-78 PayJoin v1:** Needs shared transactions with multiple inputs/outputs (incompatible with Nano account-chains)

**Adapted ideas:**
- **CamoNano:** ECDH-based stealth addresses (KEEP cryptography, DROP on-chain notifications due to cost and timing leaks)
- **BIP-352 Silent Payments:** ECDH-based stealth design (simplified by Nano's account model)
- **BIP-77 Async Payjoin v2:** Concept of off-chain directory/coordination
- **Nostr NIP-17:** Encrypted "gift-wrapped" messages (used as off-chain notification channel)

**Final architecture:**
- Stealth address cryptography (CamoNano/BIP-352 style)
- Off-chain notifications via Nostr NIP-17 gift-wrapped events
- Multi-account derivation for unlimited NanoNyms from one seed

**Why this matters:** We chose off-chain notifications to avoid CamoNano's timing correlation vulnerability while eliminating notification transaction costs.

---

## Privacy Model: Plausible Deniability

### Core Privacy Goals

NanoNyms is **NOT** about full transaction-graph anonymity (like Monero). The primary goals are:

1. **Reusable payment codes** - Main UX improvement over static Nano addresses
2. **Recipient privacy from on-chain observers** - Third parties cannot link stealth accounts
3. **Plausible deniability** - Recipient can deny ownership of individual stealth accounts until consolidation/spending

### What NanoNyms Protects Against

**On-chain observers (blockchain analysts, explorers, passive surveillance):**
- ✅ Cannot link multiple stealth accounts to the same NanoNym recipient
- ✅ Cannot determine which NanoNym received a payment
- ✅ Cannot connect stealth accounts to recipient's main Nano accounts
- ✅ No visible on-chain markers (stealth payments look like standard Nano sends)

**Nostr relay operators:**
- ✅ Cannot read notification payloads (NIP-17 gift-wrapped encryption)
- ✅ Cannot see real timestamps (randomized ±2 days)
- ✅ Cannot link notifications to specific Nano accounts

### What NanoNyms Does NOT Protect Against

**The receiver can always see:**
- ❌ Sender's Nano account (visible via tx_hash lookup on-chain)
- ❌ Sender's account balance and transaction history (public blockchain data)
- ❌ Multiple payments from the same sender account (linkable to sender)

**Privacy breaks when recipient consolidates/spends:**
- ❌ Sending from multiple stealth accounts to same destination links those accounts on-chain
- ❌ Timing patterns may correlate stealth accounts
- ⚠️ Mitigated by: account selection algorithm, privacy warnings, optional timing randomization

**Explicit non-goals:**
- ❌ Full transaction-graph anonymity
- ❌ Sender anonymity from receiver
- ❌ Protection against sophisticated long-term chain analysis after consolidation

**Why this matters:** The protocol is designed to be **explicit about these trade-offs** through UI warnings, account selection strategies, and clear documentation. We don't promise more privacy than we can deliver.

---

## Recovery Strategy Rationale

### Why Multi-Tier Recovery?

**Goal:** All funds must be recoverable from seed alone, even if all Nostr relays are unreliable or pruned.

**Tier 1 (Implemented): Nostr Multi-Relay Recovery**
- Expected success: ≳99% with relay redundancy
- Latency: typically under 30 seconds
- **Why:** Fast, free, works for 99% of users

**Tier 2 (Status: TBD): Additional Backup Mechanisms**
- **Why not Arweave?** Economic model not feasible (requires funded accounts, links all NanoNym backups)
- **Why not Nostr self-backups?** Public relays purge after 7-30 days (no improvement over Tier 1)
- **Current plan:** Likely downloadable encrypted backups (user manually saves to their cloud storage)

**Tier 3 (Not Feasible): Blockchain-Based Fallback**
- **Why not?** Without ephemeral key `R` from notifications, it's cryptographically infeasible to derive stealth addresses from on-chain data alone

**Design reality:** Recovery fundamentally depends on Nostr notification availability. We prioritize this by using 3-5 diverse relays and allowing user-configured relay lists.

---

## Stealth Account Opening Strategy

### Why Three-Phase Defense-in-Depth?

**Problem:** Stealth addresses are computed from Nostr notifications, but on-chain accounts remain unopened until an explicit receive/open block is published.

**Phase 1: Immediate Opening (Best Case)**
- **Why:** Funds are spendable immediately in the happy path
- **Trade-off:** May fail if node unavailable or wallet locked

**Phase 2: Background Retry (Recovery from Transient Failures)**
- **Why:** Handles "Nostr available but node temporarily unreachable" scenario
- **Trade-off:** Eventual consistency (up to 1 hour delay)

**Phase 3: Just-in-Time Opening (Failsafe Before Spend)**
- **Why:** Prevents cryptic node errors, ensures all accounts ready before send
- **Trade-off:** Synchronous delay at spend time (up to 30 seconds per account)

**Design philosophy:** Maximize robustness against transient failures while minimizing user friction.

---

## Spending Constraints

### Why Can't We Merge Stealth Accounts?

**Constraint:** Nano uses an account model where each stealth payment creates its own Nano account. Cannot merge multiple accounts into a single on-chain "input".

**Implication:** Any time multiple stealth accounts send to the same recipient, those accounts become publicly linked on-chain.

**Why this matters:** The protocol cannot fix this without Nano protocol changes. Instead, we:
- Maximize privacy at receive time
- Minimize necessary linkages when spending (greedy algorithm + single-account preference)
- Warn users when multi-account sends will reduce privacy
- Offer optional timing randomization (Privacy Mode)

---

## Known Limitations & Why They Exist

1. **Sender compatibility** - Only NanoNymNault-compatible wallets can send to `nnym_` addresses (inherent to custom address format)
2. **Nostr reliance for fast recovery** - Recovery depends on at least one relay retaining notification history (cryptographic constraint: need ephemeral key `R`)
3. **Account proliferation** - Each payment creates a new Nano account (inherent to stealth address design)
4. **Spend-side privacy** - Multi-account sends link accounts on-chain (fundamental limit of Nano account model)
5. **Post-quantum** - Same as Nano: not PQ-safe yet (will track Nano's evolution)

---

## Comparison with Other Protocols

| Protocol | Primary Goal | Receiver Privacy | Sender→Receiver Privacy | Chain Changes |
|----------|--------------|------------------|-------------------------|---------------|
| Monero | Full anonymity | Very High | High | Yes (own chain) |
| Zcash (shielded) | Optional anonymity | Very High | High (in-pool) | Yes (own chain) |
| BIP-352 Silent Payments | Reusable addresses | High | Low (receiver sees sender) | No (Bitcoin-native) |
| BIP-47 PayNyms | Reusable codes | Medium | Low (on-chain notify) | No (OP_RETURN) |
| CamoNano | Stealth addresses | High | Low (on-chain notify) | No (Nano-native) |
| **NanoNymNault** | **Reusable + recipient privacy** | **High** | **Low (receiver sees sender)** | **No (wallet-level)** |

**Key differentiator:** By moving notifications off-chain (via Nostr), we solve CamoNano's timing correlation vulnerability while eliminating notification transaction costs.
