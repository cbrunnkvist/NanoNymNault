# Session Handoff: Phase 2 - Event Relay Implementation

**Date**: January 18, 2026
**Branch**: `ipfs_as_notification_alternative`

---

## Current Status

### Phase 1: ✅ COMPLETE
- OrbitDB integration validated in browser
- Parallel Nostr + OrbitDB architecture works
- Graceful fallback when OrbitDB unavailable

### Phase 2A: ✅ COMPLETE - Deterministic Database Address
- Relay creates database and exposes address via `/health` endpoint
- Wallet fetches address from relay before opening database
- Both use same address → OrbitDB sync works

### Phase 2B: ✅ COMPLETE - Wallet-to-Relay Connectivity
- Wallet's `orbitdb-notification.service.ts` updated to:
  1. Fetch database address from relay's HTTP health endpoint
  2. Connect to relay via WebSocket (libp2p dial)
  3. Open database using relay's address
- CORS enabled on relay for browser fetch
- Falls back to standalone mode if relay unavailable

### Phase 2C: ✅ COMPLETE - Seed Recovery Test
- Verified via automated test scripts (`test-connectivity.mjs`, `test-seed-recovery.mjs`)
- Sender adds notification → disconnects → Receiver discovers historical payment
- OrbitDB sync to relay persists data across client sessions

---

## Address Discovery Flow

```
1. Relay starts, creates OrbitDB database
   → Database address: /orbitdb/zdpu...

2. Relay exposes address via HTTP
   → GET /health returns { dbAddress: "/orbitdb/zdpu..." }

3. Wallet initializes, fetches relay info
   → HTTP GET http://localhost:3000/health

4. Wallet dials relay via WebSocket
   → libp2p.dial("/ip4/127.0.0.1/tcp/8081/ws/p2p/12D3KooW...")

5. Wallet opens database by address (not by name)
   → orbitdb.open("/orbitdb/zdpu...")  // Same DB as relay!

6. OrbitDB sync protocol handles replication
   → Wallet and relay now share the same database
```

**Key insight:** OrbitDB addresses are content-addressed. You cannot regenerate the same address independently - you must copy it from the creating node.

---

## Architecture Clarification (Jan 18 Discussion)

### Tier Model (Corrected)

| Tier | Channel | Purpose | Status |
|------|---------|---------|--------|
| T0 | Browser-to-Browser | Real-time interactive (20% case) | Future/Optional |
| T1 | Nostr | Fast notifications, 7-30 day retention | ✅ Working |
| T2 | IPFS Relay | Permanent storage, seed recovery | Phase 2 |

### Key Insight: NOT Browser-to-Browser

**Wrong model (discarded):**
```
Browser A ←→ WebRTC ←→ Browser B (ephemeral)
```

**Correct model:**
```
Sender Wallet (Browser)
    ↓ WebSocket (wss://)
Event Relay (always-on daemon)
    ↓ persistent storage
OrbitDB Log (permanent)
    ↑ WebSocket (wss://)
Receiver Wallet (comes online LATER)
```

**Why:** NanoNyms are static payment codes. Sender and receiver are rarely online simultaneously. T2's purpose is **seed recovery** - discovering historical payments when restoring a wallet.

---

## Phase 2 Implementation Plan

### Running the Relay (Development)

```bash
cd nanonyms-relay
npm install
npm run dev
```

This starts:
- libp2p TCP: `tcp://0.0.0.0:4001` (relay-to-relay)
- libp2p WebSocket: `ws://0.0.0.0:8081` (browser-to-relay)
- Health HTTP: `http://0.0.0.0:3000/health`

**Health endpoint response:**
```json
{
  "status": "ok",
  "peerId": "12D3KooW...",
  "dbAddress": "/orbitdb/zdpu...",
  "peers": 0,
  "entries": 0,
  "addresses": [
    "/ip4/127.0.0.1/tcp/8081/ws/p2p/12D3KooW..."
  ]
}
```

### Phase 2C: Seed Recovery Test (COMPLETE)
**Validated via test scripts:**
```bash
cd nanonyms-relay
node test-connectivity.mjs   # Tests basic relay connectivity
node test-seed-recovery.mjs  # Tests seed recovery scenario
```

**Test results:**
1. Sender connects to relay, adds NIP-59 encrypted notification
2. Sender disconnects
3. Receiver (new client) connects to relay, opens same database
4. Receiver discovers historical notification from T2 storage
5. ✅ Seed recovery successful!

---

## libp2p Module Mapping

Like Nano/Bitcoin peer discovery, but browser-compatible:

| Nano/Bitcoin | libp2p Equivalent |
|--------------|-------------------|
| `preconfigured_peers.json` | `@libp2p/bootstrap` |
| Peer exchange protocol | `@libp2p/kad-dht` |
| Vote/block gossip | `@chainsafe/libp2p-gossipsub` |
| TCP connections | `@libp2p/tcp` (relay) |
| (N/A) | `@libp2p/websockets` (browser) |

---

## Next Steps (Phase 3)

### Integration Testing
1. **Browser-based test** - Test wallet's OrbitDB service in actual browser
2. **End-to-end flow** - Send payment with T2 enabled, verify relay receives notification
3. **Full seed recovery** - Test with real NanoNym, not just simulated data

### Production Readiness
1. **Relay deployment** - Deploy to cloud (Docker Compose ready)
2. **SSL/TLS** - Add wss:// support for production
3. **Relay discovery** - Hardcode initial relay URLs in wallet
4. **Relay redundancy** - Multiple relays with bootstrap peers

---

## Dev Servers

**Wallet:**
```bash
cd /Users/conny/Developer/NanoNymNault
source ~/.nvm/nvm.sh && nvm exec npm start
# http://localhost:4200/
```

**Relay (once created):**
```bash
cd nanonyms-relay
npm run dev
# WebSocket: ws://localhost:8081
# Health: http://localhost:3000/health
```

---

## ARCHIVED: OrbitDB/Helia Approach (February 2026)

### Status: **ARCHIVED**

The IPFS-based Tier2 implementation has been archived due to fundamental browser compatibility issues.

### What Worked
- ✅ Helia initialization with IndexedDB persistence
- ✅ Basic NIP-59 encryption/decryption
- ✅ Standalone OrbitDB (local-only, no relay)
- ✅ HTTP health endpoint and relay discovery

### What Didn't Work
- ❌ **CBOR decode errors** when opening remote database via libp2p bitswap
- ❌ **Cross-realm Uint8Array** `instanceof` checks failing in browser P2P contexts
- ❌ **Node.js to browser serialization** mismatches in IPFS block transfer
- ❌ **Complexity** - IPFS/OrbitDB is overkill for simple notification relay

### Root Cause
The CBOR library (`cborg`) uses strict `instanceof Uint8Array` checks. When data crosses JavaScript realms (WebSocket → libp2p → bitswap → browser), the Uint8Array prototype chain differs, causing decode failures. This is a fundamental browser P2P edge case that's hard to patch around without modifying core IPFS libraries.

### Lessons Learned
1. **IPFS is complex** for simple notification relay use cases
2. **Browser P2P has sharp edges** that don't exist in Node.js
3. **Distributed consensus** (OrbitDB's CRDT) is unnecessary for our use case
4. **Simple HTTP relay** with polling may be more appropriate

### What We Preserved
- ✅ Node v22 upgrade
- ✅ Documentation progressive disclosure structure
- ✅ Dev environment automation scripts
- ✅ Service interface patterns (as archived stubs)
- ✅ nanonyms-relay (simplified to HTTP-only)

### Next Steps
Evaluate simpler Tier2 alternatives:
1. **Waku** - Status.im messaging protocol (lightweight, browser-native)
2. **Gun.js** - Graph-based P2P with excellent browser support
3. **Simple HTTP relay** - REST API with long-polling
4. **WebRTC signaling** - For direct browser-to-browser (T0)

The service interface in `orbitdb-notification.service.ts` is preserved as an archived stub - new Tier2 will be a drop-in replacement.
