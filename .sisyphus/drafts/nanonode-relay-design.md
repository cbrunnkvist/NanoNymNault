# NanoNym Relay Network - Design Sketch

**Date**: February 3, 2026  
**Status**: Brainstorming Session  
**Goal**: Permissionless, spam-resistant, P2P payment notification infrastructure

---

## The Core Problem Statement

> "We need public NanoNym nodes alongside public Nano nodes - permissionless, spam-resistant via PoW, with magical P2P discovery like BitTorrent/IPFS"

**Requirements**:
1. ✅ Permissionless (anyone can run a node)
2. ✅ Spam-resistant (PoW-based rate limiting like Nano)
3. ✅ Privacy-preserving (encrypted notifications)
4. ✅ P2P discovery (no central coordination)
5. ✅ Reliable (funds must be recoverable even after long absence)
6. ✅ Simple (can package with Nano node)

---

## Research Findings

### BitTorrent DHT (Kademlia)
- **What it does**: Distributed peer discovery without trackers
- **How it works**: 
  - Content addressed by InfoHash (torrent identifier)
  - DHT nodes store peer lists for specific hashes
  - Nodes discover each other via bootstrap nodes, then gossip
  - 160-bit address space, XOR metric for "closeness"
- **Limitations**: 
  - Only stores peer lists, not content
  - Ephemeral (peers come and go)
  - Not designed for message storage/retrieval
- **Key insight**: The discovery mechanism is the magic - peers find each other without central registry

### libp2p (What IPFS uses)
- **What it does**: Modular P2P networking stack
- **Discovery mechanisms**:
  - **Bootstrap**: Connect to known nodes (like BitTorrent routers)
  - **mDNS**: Local network discovery
  - **DHT**: Global Kademlia-based discovery
  - **Rendezvous**: Register/discover by "namespace" (topics)
- **For browsers**: WebRTC transport with signaling servers
- **Complexity**: High - lots of moving parts

### Nano PoW
- **Algorithm**: Blake2b-based proof-of-work
- **Purpose**: Rate limiting, not consensus
- **Difficulty**: Tuned to ~1-5 seconds on consumer hardware
- **Property**: Authentication-free rate limiting
  - Anyone can generate work
- **Cost**: High enough to deter spam, low enough for legitimate use

---

## Proposed Design: "NanoNym Relay Protocol" (NNRP)

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Tier 1: NanoNym Relay Network (NNRP)                          │
│  - Permissionless P2P network for payment notifications       │
│  - PoW-based rate limiting                                     │
│  - Encrypted notification storage and retrieval               │
│  - Similar philosophy to Nano: minimal, focused, reliable     │
├─────────────────────────────────────────────────────────────┤
│  Transport: WebRTC for browsers, TCP/QUIC for servers        │
│  Discovery: Hybrid DHT + Bootstrap (like BitTorrent)         │
│  Storage: Node-local with gossip for redundancy               │
│  Consensus: None (eventual consistency via gossip)            │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. Identity and Addressing

**NanoNym Relay Address**:
```
nr_<base32_encoded_notification_hash>
```

**Address derivation**:
- Hash of: `encrypted_notification_payload + timestamp + nonce`
- Similar to BitTorrent InfoHash - content-addressed
- Deterministic from payload (no central registry needed)

**Node Identity**:
- Ed25519 keypair (Nano-compatible)
- NodeID = public key
- No blockchain required

#### 2. PoW-Based Rate Limiting

**Work Target Calculation** (Nano-style):
```
work_threshold = f(network_load, time_since_last_notification)

Base difficulty: ~1-2 seconds on modern CPU
Dynamic adjustment: Increase if network congested
Per-recipient rate limit: Max X notifications per hour per recipient
```

**Work Generation**:
```
work = blake2b_hash(relay_address + nonce)
while work > threshold:
    nonce += 1
    work = blake2b_hash(relay_address + nonce)
```

**Why this works**:
- Spammers must spend compute per notification
- Legitimate users pay occasionally (1-2s acceptable for real payment)
- Dynamic difficulty prevents network saturation

#### 3. Notification Structure

**Sealed Notification** (what gets stored/relayed):
```json
{
  "version": 1,
  "hash": "<content_hash>",
  "timestamp": 1234567890,
  "ttl": 7776000,  // 90 days in seconds
  "recipient_pubkey": "<32_bytes_ed25519>",  // To identify which notifications to fetch
  "encrypted_payload": "<encrypted_blob>",
  "work": "<blake2b_pow_proof>",
  "signature": "<node_signature>"  // Storing node signs to prevent tampering
}
```

**Encrypted Payload** (inner content):
```json
{
  "R": "<ephemeral_pubkey_hex>",
  "tx_hash": "<nano_transaction_hash>",
  "amount_raw": "<raw_amount>",
  "nonce": "<random_32_bytes>"  // Prevents replay attacks
}
```

#### 4. Discovery Mechanism (The Magic)

**Hybrid approach** (combining best of BitTorrent + IPFS):

**Phase 1: Bootstrap**
- Nodes start with 3-5 bootstrap addresses (community-run, like BitTorrent routers)
- Bootstrap nodes are just regular nodes that are well-known
- Can be packaged with Nano node installation

**Phase 2: DHT Discovery**
- Each node has a NodeID (160-bit like BitTorrent)
- DHT maps: `recipient_pubkey_hash → list_of_nodes_storing_notifications`
- Nodes store "provider records" (who has data for which recipients)
- Kademlia XOR distance metric for routing

**Phase 3: Gossip**
- Nodes gossip with peers they discover
- Exchange: "I have notifications for recipients X, Y, Z"
- Redundancy through replication factor (default: 3 nodes per notification)

**For browsers**:
- WebRTC transport with signaling via bootstrap nodes
- STUN/TURN for NAT traversal (can use public STUN servers)
- LocalStorage/IndexedDB for notification persistence

#### 5. Storage and Retrieval

**Storage Policy**:
- Nodes store notifications until TTL expires (default: 90 days)
- Max storage per recipient: Configurable (default: 1000 notifications)
- Eviction: LRU when storage full
- Replication: Store on 3 closest nodes in DHT (by XOR distance)

**Retrieval Flow**:
```
1. Wallet derives recipient_pubkey from NanoNym seed
2. Queries DHT: "Which nodes have notifications for recipient_pubkey?"
3. Connects to closest 3 nodes
4. Requests: "Give me notifications for recipient_pubkey since timestamp X"
5. Nodes return matching notifications
6. Wallet decrypts and validates
```

**Why this is reliable**:
- Multiple nodes store each notification (redundancy)
- DHT ensures nodes can always be found (as long as network exists)
- 90-day TTL gives plenty of time for wallet to sync
- No single point of failure

#### 6. Node Incentives (Optional)

**The Problem**: Why would anyone run a node?

**Option A: Altruism (like Nano, BitTorrent)**
- Community members run nodes to support the network
- Low resource requirements (can run alongside Nano node)
- No financial incentive needed for protocol to work

**Option B: Nano-pow-based priority** (experimental)
- Nodes can optionally accept "tips" in Nano for faster propagation
- Base service is free, premium service is paid
- Similar to how Nano prioritizes transactions with higher PoW

**Option C: Reputation system**
- Nodes build reputation based on uptime, storage provided
- Wallet clients prefer high-reputation nodes
- Purely social incentive (like seeding in BitTorrent)

---

## Comparison to Existing Solutions

| Aspect | Nostr | XMTP | IPFS/OrbitDB | **NanoNym Relay (Proposed)** |
|--------|-------|------|--------------|------------------------------|
| **Permissionless** | ✅ Yes | ❌ No (curated) | ✅ Yes | ✅ Yes |
| **Spam resistance** | ❌ No | ✅ Built-in | ❌ No | ✅ PoW-based |
| **Storage duration** | 7-30 days | 60d→6mo | Permanent | 90 days (configurable) |
| **P2P discovery** | ❌ Relay list | ❌ Centralized | ✅ DHT | ✅ DHT |
| **Packaging** | ❌ Separate infra | ❌ Separate infra | ❌ Complex | ✅ Simple node |
| **Privacy** | ✅ Encrypted | ✅ Encrypted | ✅ Encrypted | ✅ Encrypted |
| **Reliability** | ⚠️ Relay-dependent | ✅ Good | ✅ Permanent | ✅ Redundant nodes |

---

## Open Design Questions

### 1. Work Algorithm Details
- Use exact Nano PoW (blake2b) or simplified version?
- How to tune difficulty? (Dynamic based on network load?)
- Should work be per-notification or per-batch?

### 2. DHT Implementation
- Use existing libp2p-kad-dht or custom lightweight implementation?
- 160-bit address space (BitTorrent style) or 256-bit (more modern)?
- Bootstrap node discovery (hardcoded list vs. DNS-based?)

### 3. Browser Support
- WebRTC signaling: How to bootstrap without central server?
- Can use WebTorrent's approach: bootstrap via well-known WebSocket servers
- Fallback: HTTP API on bootstrap nodes for initial discovery

### 4. NAT Traversal
- WebRTC handles most cases via STUN
- TURN relays for difficult cases (can use public TURN servers)
- Server nodes (packaged with Nano) can act as "super peers" with public IPs

### 5. Storage Economics
- 90 days × 1000 notifications × 1KB = ~90MB per recipient (max)
- For 10,000 active recipients: ~900GB per node (if storing everything)
- More realistic: Each node stores subset (DHT sharding)
- Storage costs: ~$15/month for 1TB VPS (comparable to Nano node costs)

### 6. Gossip Protocol
- Epidemic broadcast (simple, robust)
- Pull-based: "What notifications do you have that I don't?"
- Periodic sync every X minutes
- Bandwidth optimization: Only sync hashes first, then fetch missing

---

## Implementation Path

### Phase 1: Minimal Viable Relay
1. Simple TCP-based relay with HTTP API
2. PoW validation
3. Local storage (SQLite)
4. Single bootstrap node
5. Client: Direct connection to known node

### Phase 2: P2P Discovery
1. Add DHT (Kademlia) for node discovery
2. Bootstrap node list
3. Gossip for notification propagation
4. Client: DHT-based node discovery

### Phase 3: Production Network
1. Browser support (WebRTC)
2. Multiple bootstrap nodes
3. Dynamic difficulty adjustment
4. Reputation/monitoring system
5. Package with Nano node software

---

## Advantages of This Approach

1. **True to Nano Philosophy**: Simple, focused, permissionless
2. **Spam-Resistant**: PoW makes abuse expensive
3. **Reliable**: 90-day retention + redundancy = funds recoverable
4. **Packaging**: Can bundle with Nano node (same audience)
5. **Privacy**: Encrypted end-to-end, no metadata leakage
6. **No Token**: No new cryptocurrency needed (unlike XMTP)
7. **Familiar**: BitTorrent-like P2P discovery feels "magic"

---

## Risks and Challenges

1. **DHT Security**: Sybil attacks (fake nodes), eclipse attacks
   - Mitigation: PoW for node registration, reputation system

2. **Storage Growth**: Unbounded storage requirements
   - Mitigation: TTL, per-recipient limits, LRU eviction

3. **Network Partition**: What if DHT fragments?
   - Mitigation: Bootstrap nodes maintain "backbone", gossip heals partitions

4. **Browser Limitations**: WebRTC requires signaling
   - Mitigation: Well-known bootstrap servers (small, cheap to run)

5. **Development Effort**: Custom protocol = lots of work
   - Mitigation: Use existing libraries (libp2p components), focus on integration

---

## Next Steps / Research Needed

1. **PoW Tuning**: What's the right difficulty? (1s? 5s? dynamic?)
2. **DHT Library**: Evaluate js-libp2p-kad-dht vs custom implementation
3. **Storage Backend**: SQLite vs LevelDB vs custom?
4. **Bootstrap Strategy**: How to maintain bootstrap node list?
5. **Browser Bundle Size**: How big is libp2p + WebRTC in browser?
6. **Test Network**: Deploy 5-10 nodes, test gossip, measure reliability

---

## Conclusion

This design combines:
- **BitTorrent's magic**: P2P discovery via DHT
- **Nano's wisdom**: PoW for spam resistance
- **Nostr's simplicity**: Focused on one job (payment notifications)
- **IPFS's reliability**: Content-addressed storage

**The result**: A permissionless, spam-resistant, P2P notification network that can be packaged with Nano nodes and run by the same community.

**The question**: Is the development effort worth it compared to improving Nostr integration?

Trade-off:
- **Custom NNRP**: Perfect fit, but requires building and maintaining new infrastructure
- **Improved Nostr**: Less ideal, but infrastructure already exists

---

**References**:
- BitTorrent DHT: https://github.com/webtorrent/bittorrent-dht
- libp2p: https://libp2p.io/
- Nano PoW: https://blog.nano.org/nano-pow-the-details-ba22a9092d6f
- Kademlia Paper: https://pdos.csail.mit.edu/~petar/papers/maymounkov-kademlia-lncs.pdf
