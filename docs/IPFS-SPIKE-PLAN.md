# IPFS Notification Spike Plan

**Date**: January 10, 2026
**Branch**: `ipfs_as_notification_alternative`
**Duration**: 1-2 weeks
**Status**: Implementation (Phase 1 Complete)

---

## Objective

Prototype IPFS-based notification alternatives/hybrids for NanoNymNault's Nostr system. Targets: Decentralized, persistent alerts preserving NanoNyms' privacy (unlinkable txs, receiver-only decryption).

**Primary Goal**: Implement and evaluate 2-3 approaches; measure vs. Nostr on:
- Privacy: linkability simulations (<1% linkage)
- Performance: sync <5s, decryption <1s for 100 entries
- Reliability: 90%+ delivery

**Secondary Goals**:
- Integration stubs in JS (`nanonym-manager.service.ts`)
- Hybrid posting (Nostr + IPFS)

**Non-Goals**: Production rollout; scale >1k alerts/day; token dependencies.

---

## Background

NanoNymNault uses NanoNyms for static, reusable payment codes deriving unique stealth addresses via ECDH-like secrets.

- **On-chain**: Indistinguishable payments (stealth addresses)
- **Off-chain**: Encrypted Nostr alerts for discovery (multi-relay, AEAD encryption)

**Risks with Nostr**: Relay centralization/censorship, retention policies.

**IPFS Goal**: Pure p2p persistence via Helia/libp2p, global structures for deniability.

---

## Key Technical Constraints

- **Privacy**: Asymmetric encryption (libsodium/tweetnacl; ed25519-to-x25519). Global logs/DHT to prevent per-NanoNym linkage. Plaintext tags: `BLAKE2b(shared_secret)` for filter; trial-decrypt on mismatches.
- **No on-chain leaks**: Alerts include `block_hash`/`tweak` for RPC verify/claim.
- **IPFS Fit**: Content-addressed blobs; pubsub for deltas.
- **Spam mitigations**: Shard logs weekly (e.g., `/nano-alerts-2026-W02`); PoW (1-5s compute) or Nano-block sigs.
- **Persistence**: Auto-pin + web3.storage (free 5GB tier).

---

## Approaches (Priority Order)

### 1. OrbitDB with Global Shared Log (✅ Completed)

**Description**: Append-only log (`/orbitdb/QmGlobalNanoNymAlerts`) via `@orbitdb/core` + Helia.
- Payer: Encrypt alert JSON; append with tag
- Payee: Sync deltas (pubsub); trial-decrypt

**Architecture Decision**: Global over per-user for deniability; append-only DAG ensures immutability vs. Nostr's ephemeral notes.

**Implementation Status**:
- ✅ Helia + OrbitDB v3 integrated
- ✅ IndexedDB persistence (`blockstore-idb`, `datastore-idb`)
- ✅ Global log creation (`nano-nym-alerts-v1`)
- ✅ Send/Receive flow integrated with UI toggle
- ✅ Build system patched for Webpack 5 compatibility

**Pros**: Persistent replication; real-time via pubsub.
**Cons/Mitigations**: Bloat → shard by week; spam → custom controller (PoW threshold: 2^20 ops).
**Eval**: Delivery in offline sim; linkability (global entropy hides patterns).

---

### 2. Raw IPFS DHT (Second: 1 Day)

**Description**: Upload encrypted blob (CID); store under DHT key (e.g., `/nano-alerts/blake2b(shared_secret)`, TTL 24h + republish).

**Architecture Decision**: Private keys over global scan for zero leakage; ephemeral but pinnable vs. OrbitDB's always-on sync.

**Integration Stub**:
```typescript
const ipfs = await createHelia();
const cid = await ipfs.add(JSON.stringify({ encrypted: encrypt(alert, pubkey) }));
await ipfs.dht.put(`/nano-alerts/${blake2b(sharedSecret)}`, cid.bytes, { ttl: '24h' });

// Fetch:
const value = await ipfs.dht.get(key);
tryDecrypt(decode(value));
```

**Pros**: Minimal; strong isolation.
**Cons/Mitigations**: Key guessing inefficient → bound to time ranges (query last 7 days' possibles); pin via web3.storage API.
**Eval**: Query hit rate; compute for 50 keys (<100ms target).

---

### 3. libp2p Pubsub Alone (Third: 1 Day)

**Description**: Pub to topic (`/nano-nym-alerts`); sub and decrypt.

**Architecture Decision**: Ephemeral for low-latency; hybrid with DHT pinning if misses exceed 10%.

**Integration Stub**:
```typescript
const ipfs = await createHelia();
await ipfs.libp2p.services.pubsub.publish('/nano-nym-alerts', encode({ tag, encrypted }));
ipfs.libp2p.services.pubsub.addEventListener('message', evt => tryDecrypt(evt.detail.data));
```

**Pros**: Instant delivery.
**Cons/Mitigations**: Offline loss → store as DHT fallback.
**Eval**: Latency (<2s); recovery sim.

---

### 4. Quiet (IPFS + Tor) (Fourth: If Needed, 1-2 Days)

**Description**: Adapt p2p notifications (Tor-routed).

**Architecture Decision**: Tor overlay for anti-observer if IPFS bitswap leaks metadata (rare).

**Pros**: Enhanced routing privacy.
**Cons/Mitigations**: Setup overhead → eval only if privacy sims fail in prior approaches.
**Eval**: Tor performance impact.

---

### 5. BTFS or Peergos (Last: If Incentives Needed, 2 Days)

**Description**:
- BTFS: TRON incentives, stable but token-tied
- Peergos: Encrypted FS, 2026 iOS focus

**Architecture Decision**: Incentives secondary; deprioritize unless persistence <90% in tests.

**Pros**: Rewards/longevity.
**Cons/Mitigations**: Dependencies bloat → optional module.
**Eval**: Storage availability over 48h.

---

## Evaluation Criteria

| Criterion | Target | Method |
|-----------|--------|--------|
| Privacy | <1% linkage | Simulate observer attacks; decrypt attempts fail without key |
| Performance | Sync <5s, decrypt <1s | Browser CPU/mem <10% overhead |
| Reliability | 90%+ delivery | Offline recovery sim; availability after 24h |
| Usability | <50 LoC per integration | Nostr compatibility maintained |

**Success Criteria**: At least 1 approach beats Nostr on reliability with equivalent privacy/performance.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Browser memory overhead | Helia >50MB | Lightweight config (no full DHT) |
| Spam | >500 entries/day | PoW min 2^18; sig verify threshold |
| Low replication | Peers unavailable | web3.storage pin (free 5GB); monitor >95% avail |
| Crypto lib mismatches | Key derivation fails | Fix to tweetnacl; test ed25519 conversions |
| Scrutiny | Pattern analysis | Document deniability; invariants in code |

---

## Technology Validation (Jan 2026)

- **OrbitDB**: v3 feature-complete (mid-2025); actively maintained; integrates with Helia/libp2p
- **Helia**: Stable; recommended for browser/node IPFS
- **web3.storage**: Free "Mild" tier active ($0/mo, 5GB storage/egress)
- **BTFS**: Stable but limited 2025-2026 updates; deprioritize
- **Peergos**: Active; 2026 plans include iOS, FOSDEM talk
- **Quiet**: Viable but less momentum; Tor+IPFS for p2p

---

## Timeline

**Week 1**:
- Day 1-2: OrbitDB Global Log implementation (✅ Done)
- Day 3: Raw IPFS DHT approach
- Day 4: libp2p Pubsub approach
- Day 5: Metrics collection, comparison

**Week 2**:
- Quiet/BTFS/Peergos (if needed)
- Hybrid integration (Nostr + best IPFS approach)
- Documentation and learnings

---

## Next Steps

1. **Test**: Run automated tests for `OrbitdbNotificationService`.
2. **Measure**: Compare OrbitDB propagation speed vs Nostr relays.
3. **Refine**: Implement pinning/replication strategy for the global log.

---

## References

- [OrbitDB v3 Documentation](https://github.com/orbitdb/orbitdb)
- [Helia IPFS](https://github.com/ipfs/helia)
- [web3.storage](https://web3.storage/)
- [NanoNymNault CLAUDE.md](../CLAUDE.md) - Protocol specification
- [Ceramic Spike Learnings](./CERAMIC-SPIKE-LEARNINGS.md) - Previous spike reference
