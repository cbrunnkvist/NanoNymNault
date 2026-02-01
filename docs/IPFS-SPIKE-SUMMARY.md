# IPFS Spike - Phase 1 Summary

**Date**: January 15, 2026
**Branch**: `ipfs_as_notification_alternative`
**Status**: ✅ COMPLETE

---

## Executive Summary

We successfully integrated OrbitDB (IPFS-based database) into NanoNymNault to evaluate it as an alternative/complement to Nostr for payment notifications. While the technology integration succeeded, we discovered that **OrbitDB requires custom infrastructure** (relay nodes, bootstrap nodes) comparable in effort to running your own Nostr relays.

**Bottom Line**: OrbitDB works but is the wrong tool for real-time notifications. Recommend keeping Nostr for notifications and exploring IPFS for long-term backup storage instead.

---

## What We Built

### Technical Integration ✅
- **Helia (IPFS v2)** with IndexedDB persistence
- **OrbitDB v3** with global shared log architecture
- **libp2p + Gossipsub** for P2P messaging
- **NIP-59 encryption** matching Nostr's privacy model
- **Parallel notifications** (Nostr + OrbitDB simultaneously)
- **Independent UI toggles** for each notification system

### Test Results ✅
- Local notification posting: **WORKS**
- IndexedDB persistence across reloads: **WORKS**
- Parallel Nostr + OrbitDB: **WORKS**
- Cross-instance replication: **DOES NOT WORK** (requires infrastructure)

---

## Key Discovery: Replication Requires Infrastructure

Each browser instance creates an **isolated OrbitDB database** with no peer-to-peer connectivity:

### What's Missing
| Component | Purpose | Status |
|-----------|---------|--------|
| Relay nodes | Browser-to-browser connectivity | ❌ Not implemented |
| Bootstrap nodes | Peer discovery | ❌ Not implemented |
| Deterministic DB address | Shared global log | ❌ Random per-instance |
| Signaling servers | WebRTC coordination | ❌ Not implemented |

### Infrastructure Cost Estimate
- **3-5 VPS relay nodes**: ~$50/month
- **Bootstrap configuration**: Dev time
- **Community deployment**: Ongoing maintenance

### Comparison to Nostr
| Aspect | OrbitDB | Nostr |
|--------|---------|-------|
| Infrastructure needed | Custom relay nodes | Existing public relays |
| Setup cost | ~$50/mo + dev time | $0 (use public relays) |
| Works out of the box | ❌ No | ✅ Yes |
| Persistent local storage | ✅ IndexedDB | ❌ Relay-dependent |

---

## Assessment

### What OrbitDB is Good For ✅
- **Local persistent storage** (IndexedDB)
- **Archival/backup** of notification history
- **Offline-first** data management
- **Known peer networks** (organizational databases)

### What OrbitDB is NOT Good For ❌
- **Ad-hoc P2P discovery** across random internet users
- **Drop-in Nostr replacement** without infrastructure
- **Real-time browser-to-browser messaging** without relay nodes

---

## Recommendation

### For Real-Time Notifications: Keep Nostr
- ✅ Already works with public relays
- ✅ No infrastructure required
- ✅ 100+ existing relays with retention
- ✅ Proven reliable for messaging

### For Long-Term Backup: Use IPFS (Different Approach)
- Focus on **seed-recoverable archival storage**
- Not real-time notifications
- Lower infrastructure requirements
- Can be user-optional feature
- See `IPFS-BACKUP-SPECIFICATION.md` for design

---

## What's Next: Three Options

### Option A: Continue IPFS Spike (Phases 2/3)
**Time**: 2 more days (1 day per phase)
**Goal**: Test raw IPFS DHT and libp2p Pubsub
**Reality**: Both still require relay/bootstrap infrastructure
**Value**: Academic exploration, but same infrastructure problem

### Option B: Pivot to Tier-2 Backup Implementation (RECOMMENDED)
**Time**: 1-2 weeks
**Goal**: Use IPFS for long-term notification backup/archival
**Benefit**: Complements Nostr, provides seed-only recovery guarantee
**Infrastructure**: Optional (can use public IPFS gateways, or users run own nodes)
**Reference**: `docs/IPFS-BACKUP-SPECIFICATION.md`

### Option C: Close Spike
**Action**: Archive branch, keep learnings documented
**Next**: Focus on other NanoNymNault features
**Value**: Clear answer that Nostr is the right tool for notifications

---

## Artifacts Created

### Documentation
- `docs/IPFS-SPIKE-PLAN.md` - Original 5-phase plan
- `docs/IPFS-SPIKE-LEARNINGS.md` - Detailed technical solutions (16KB)
- `docs/SESSION-HANDOFF.md` - Session-by-session progress
- `docs/IPFS-SPIKE-SUMMARY.md` - This document

### Code
- `src/app/services/orbitdb-notification.service.ts` - Full OrbitDB integration (~500 lines)
- `src/app/services/orbitdb-notification.service.spec.ts` - Integration tests
- `extra-webpack.config.js` - Webpack Node.js polyfills for IPFS stack
- Updated send/receive flows with OrbitDB parallel posting

### Commits (18 total)
```
ae30bfa - docs: Finalize Phase 1 session handoff with cleanup summary
396c269 - test: Add OrbitDB notification service integration tests
fff5958 - docs: Document Phase 1 OrbitDB findings and replication limitations
890e351 - test: Update test configuration for custom webpack and longer timeout
a3f0047 - debug: Add console logging for notifications and fix OnDestroy import
6adbb07 - feat: Add reactive UI feedback during multi-account NanoNym spending
64f8811 - feat: Add independent toggles for Nostr and OrbitDB notifications
2c8d918 - fix: Add ellipsis truncation to NanoNym addresses on Accounts page
... (10 more commits from original integration work)
```

---

## Technical Learnings (Highlights)

### 1. Webpack 5 Node.js Polyfills
**Problem**: `node:stream` imports fail in browser
**Solution**: `stream-browserify` + custom webpack config + NormalModuleReplacementPlugin

### 2. IndexedDB Persistence
**Problem**: In-memory IPFS PeerID changes on reload
**Solution**: `blockstore-idb` + `datastore-idb` for persistent storage

### 3. Gossipsub Private Key Issue
**Problem**: `gossipsub` v13 expects `PeerID.privateKey` but `@libp2p/peer-id` v6 removed it
**Solution**: Manual Ed25519 key generation + protobuf patching + factory wrapper

### 4. OrbitDB Database Opening
**Problem**: `pubsub.addEventListener` undefined error
**Solution**: Add `@chainsafe/libp2p-gossipsub@13` to Helia's libp2p config

### 5. Security: Wallet Lock Bypass
**Problem**: NanoNym spends worked without unlocking wallet
**Solution**: Added lock check in `confirmNanoNymSpend()`

All solutions documented in detail in `IPFS-SPIKE-LEARNINGS.md`.

---

## Decision Criteria

### If You Want to Use OrbitDB for Notifications
**Required investments:**
- Deploy 3-5 relay VPS nodes
- Configure bootstrap peer list
- Implement deterministic DB addressing
- Set up WebRTC signaling
- Maintain infrastructure long-term
- **Total effort**: Similar to running own Nostr relay cluster

### If You Want to Use IPFS for Backup
**Required investments:**
- Implement Tier-2 recovery mechanism
- Integrate with existing seed derivation
- Optional: Community can run archival nodes
- **Total effort**: Lower, more aligned with IPFS strengths

---

## Conclusion

Phase 1 successfully proved that:
1. ✅ OrbitDB can be integrated into a browser-based wallet
2. ✅ Local notification storage works perfectly
3. ❌ Global replication requires significant infrastructure
4. 💡 IPFS better suited for backup/archival than real-time messaging

**Recommendation**: Keep Nostr for notifications, explore IPFS for Tier-2 backup storage to strengthen seed-only recovery guarantees.

---

## References

- **IPFS-SPIKE-PLAN.md** - Full 5-phase spike plan
- **IPFS-SPIKE-LEARNINGS.md** - Detailed technical implementation notes
- **IPFS-BACKUP-SPECIFICATION.md** - Alternative IPFS use case (Tier-2 backup)
- **SESSION-HANDOFF.md** - Complete session history
- **CLAUDE.md** - NanoNym protocol specification (Section 7: Recovery Strategy)
