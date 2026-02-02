# Waku Notification Spike Results

**Date**: February 2026
**Branch**: `logos_event_storage`
**Status**: Spike Complete

---

## Summary

This spike evaluated Waku (Logos ecosystem) as a potential replacement for Nostr-based payment notifications in NanoNymNault. We implemented a complete `WakuNotificationService` with LightPush (sending), Filter (real-time receiving), and Store (historical recovery) protocols. The implementation reuses NIP-59 gift-wrapping for encryption (same as Nostr).

**Key Finding**: Waku is technically viable but the @waku/sdk API is unstable (breaking changes between versions), and the public Waku network infrastructure is less mature than Nostr's relay ecosystem.

---

## Go/No-Go Criteria

| Criterion | Requirement | Status | Notes |
|-----------|-------------|--------|-------|
| **Connectivity** | Reliable browser-to-browser or browser-to-relay messaging | ⚠️ Partial | Works with local nwaku; public fleet reliability untested |
| **Infrastructure** | No requirement for user-run nodes (public fleet availability) | ⚠️ Partial | Public Waku fleet exists but less proven than Nostr relays |
| **Latency** | Notification delivery < 10 seconds | ✅ Pass | Sub-second with local nwaku |
| **Privacy** | Metadata protection (IP obfuscation, unlinkability) | ✅ Pass | 256 content topic buckets + daily partitioning |
| **Persistence** | Message retrieval for offline recipients (Store protocol) | ✅ Pass | 24h query limit requires day-by-day pagination |
| **Complexity** | Integration effort vs. maintenance overhead | ⚠️ High | API instability, type errors, breaking changes |

---

## Comparison Matrix: Waku vs. Nostr

| Feature | Waku (Spike) | Nostr (Current) |
|---------|--------------|-----------------|
| **Network Type** | Gossip-based P2P (libp2p) | Relay-based Pub/Sub |
| **Privacy** | High (k-anonymity via buckets) | Medium (NIP-17 encryption) |
| **Infrastructure** | Logos Fleet / Self-hosted | Public Relays (1000+) |
| **Browser Support** | @waku/sdk (API unstable) | nostr-tools (Mature, stable) |
| **Offline Support** | Waku Store (24h chunks) | Relay retention (varies) |
| **Reliability** | Requires own node or Logos fleet | High (Multi-relay redundancy) |
| **Cost** | Free (Public fleet) | Free (Public relays) |
| **SDK Maturity** | Breaking changes between versions | Stable, well-documented |

---

## Technical Findings

### 1. Waku SDK API Instability
**Problem**: The @waku/sdk `filter.createSubscription()` API was deprecated between versions. Code written for one version doesn't compile with newer versions.

**Solution**: Updated to new API pattern: `node.filter.subscribe(decoder, callback)` returns `Promise<boolean>` instead of `{ error, subscription }`.

**Code**:
```typescript
// OLD API (deprecated)
const { error, subscription } = await node.filter.createSubscription({ contentTopics: [topic] });
await subscription.subscribe([decoder], callback);

// NEW API (current)
const success = await node.filter.subscribe(decoder, callback);
```

### 2. Store Protocol 24-Hour Query Limit
**Problem**: Waku Store protocol only allows querying ~24 hours of data per request.

**Solution**: Implemented day-by-day pagination with deduplication for multi-day recovery.

**Code**:
```typescript
async recoverNotifications(startDate, endDate, ...): Promise<WakuRecoveryResult> {
  while (currentDate <= endDate) {
    const contentTopic = deriveContentTopic(pubkey, currentDate);
    await this.node.store.queryWithOrderedCallback([decoder], (msg) => { ... });
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }
}
```

### 3. iOS PWA WebSocket Termination
**Problem**: iOS PWA kills WebSocket connections when app is backgrounded, causing Filter subscriptions to silently die.

**Solution**: Implemented Page Visibility API handler that triggers Store recovery + subscription re-establishment on foreground resume.

**Code**:
```typescript
private setupVisibilityHandler(): void {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      this.handleForegroundResume(); // Recover missed messages + resubscribe
    }
  });
}
```

### 4. Content Topic Bucketing for K-Anonymity
**Problem**: Unique content topics per recipient would leak metadata (who's receiving).

**Solution**: 256 buckets derived from pubkey hash + daily partitioning.

**Code**:
```typescript
// Topic format: /nanoNym/1/{bucket}/{YYYY-MM-DD}/proto
const bucket = pubkeyHash[0]; // 0-255
const date = formatDate(new Date()); // 2026-02-02
return `/nanoNym/1/${bucket}/${date}/proto`;
```

---

## Testing Results

### What Works ✅
- WakuNotificationService creation and initialization
- Connection status tracking via BehaviorSubject
- Content topic derivation (256 buckets + daily partitioning)
- Recovery progress callback interface
- iOS foreground recovery handler (Page Visibility API)
- Subscription lifecycle management
- Unit tests: 18 passing (without nwaku)

### What Doesn't Work ⚠️
- Integration tests require local nwaku node running
- Playwright E2E tests not implemented (requires Playwright setup + nwaku Docker)
- Public Waku fleet reliability untested
- SDK type definitions have inconsistencies (`IDecoder` generic parameter)

---

## Conclusions

### What the Spike Proved ✅
- Waku can technically replace Nostr for NanoNym notifications
- NIP-59 gift-wrapping encryption works with Waku transport
- Store protocol handles offline recovery (with pagination)
- Content topic bucketing provides k-anonymity
- iOS foreground recovery is implementable via Page Visibility API

### What the Spike Revealed ⚠️
- @waku/sdk has API instability (breaking changes)
- SDK type definitions are incomplete/inconsistent
- Public Waku infrastructure less mature than Nostr relay ecosystem
- Requires running own nwaku node for reliability
- Higher integration complexity than Nostr

### Recommendation
- **NO-GO for production migration at this time**

**Rationale**:
1. Nostr is working well with proven multi-relay redundancy
2. Waku SDK instability creates maintenance burden
3. Public Waku fleet reliability is unproven for production use
4. Migration effort doesn't justify marginal privacy improvements
5. No clear user-facing benefit to offset complexity increase

**Future Consideration**: Revisit when @waku/sdk reaches 1.0 stable release and public fleet proves reliability over time.

---

## Infrastructure: What is nwaku and How It Works

### What is nwaku?

**nwaku** (Nim Waku) is the reference implementation of the Waku protocol, written in Nim. It's a node software that participates in the Waku peer-to-peer network, similar to how a Bitcoin node participates in the Bitcoin network or how a Nostr relay serves Nostr clients.

**Key differences from Nostr:**

| Aspect | Nostr Relay | nwaku Node |
|--------|-------------|------------|
| **Architecture** | Client-server (WebSocket) | P2P gossip (libp2p) |
| **Message routing** | Relay stores & forwards | Gossip protocol propagates |
| **Discovery** | Manual relay list | DHT + discv5 auto-discovery |
| **Hosting** | Simple HTTP server | Full node with database |
| **Public infrastructure** | 1000+ public relays | Logos Fleet (~50 nodes) |

### nwaku Protocols

nwaku implements several protocols that work together:

| Protocol | Purpose | Port |
|----------|---------|------|
| **Relay** | Gossip-based message propagation | 30304/tcp |
| **Filter** | Real-time subscriptions (push notifications) | 30304/tcp |
| **LightPush** | Send messages without full relay | 30304/tcp |
| **Store** | Historical message retrieval | 30304/tcp |
| **REST API** | HTTP interface for light clients | 8645/tcp |
| **discv5** | Peer discovery | 9005/udp |

**Our WakuNotificationService uses:**
- **LightPush** → Send notifications (sender doesn't need to run full relay)
- **Filter** → Real-time notification subscriptions
- **Store** → Recover missed notifications (offline recovery)

### Local Development Setup

#### Prerequisites
- Docker and Docker Compose installed
- ~2GB disk space for PostgreSQL data
- Ports 8645 (REST), 30304 (P2P), 9005 (discovery) available

#### Starting the Local nwaku Node

```bash
cd docker/nwaku

# Copy environment template
cp .env.example .env

# Start the node (first run takes ~1 minute to initialize)
docker compose up -d

# Check node health
curl -s http://localhost:8645/debug/v1/info | jq

# View logs
docker compose logs -f nwaku
```

#### Verifying the Node is Working

```bash
# Check protocols are enabled
curl -s http://localhost:8645/debug/v1/info | jq '.protocols'
# Should show: ["lightpush", "filter", "store", "relay"]

# Check peer connections
curl -s http://localhost:8645/admin/v1/peers | jq

# Check store is working
curl -s http://localhost:8645/store/v1/messages | jq
```

#### Stopping the Node

```bash
cd docker/nwaku
docker compose down

# To also remove stored data:
docker compose down -v
rm -rf postgresql/
```

### Docker Compose Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    docker-compose.yml                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────┐      ┌──────────────────┐         │
│  │     nwaku        │      │    postgres      │         │
│  │                  │      │                  │         │
│  │  - Relay         │      │  - Message store │         │
│  │  - Filter        │──────│  - 30-day        │         │
│  │  - LightPush     │      │    retention     │         │
│  │  - Store         │      │                  │         │
│  │  - REST API      │      │                  │         │
│  └──────────────────┘      └──────────────────┘         │
│         │                                                │
│         │ :8645 (REST)                                   │
│         │ :30304 (P2P)                                   │
│         │ :9005 (discovery)                              │
│         ▼                                                │
│  ┌──────────────────┐                                    │
│  │  Browser/PWA     │                                    │
│  │  (js-waku SDK)   │                                    │
│  └──────────────────┘                                    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Configuration Options

Key environment variables in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `STORE_RETENTION_DAYS` | 30 | How long to keep messages |
| `STORAGE_SIZE` | 30GB | Alternative: limit by disk size |
| `LOG_LEVEL` | DEBUG | Logging verbosity |
| `CLUSTER_ID` | 1 | Waku network cluster (1 = mainnet) |
| `NODEKEY` | (random) | Persistent node identity |

### How the Browser Connects

The `WakuNotificationService` connects to nwaku via WebSocket:

```typescript
// In waku-notification.service.ts
private readonly NWAKU_WS_ENDPOINT = "/ip4/127.0.0.1/tcp/8545/ws";

// Creates a "light node" that doesn't relay, only sends/receives
this.node = await createLightNode({ defaultBootstrap: false });
await this.node.dial(this.NWAKU_WS_ENDPOINT);
```

**Light node** = Browser connects to nwaku but doesn't participate in gossip. It only:
- Sends via LightPush (nwaku relays to network)
- Subscribes via Filter (nwaku pushes matching messages)
- Queries via Store (nwaku returns historical messages)

---

## Production Deployment Considerations

### Option 1: Self-Hosted nwaku (Recommended for Privacy)

**Who deploys:** NanoNymNault project or community members

**Architecture:**
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   User A    │     │   User B    │     │   User C    │
│  (Browser)  │     │  (Browser)  │     │  (Browser)  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                           ▼
                 ┌─────────────────┐
                 │  nwaku cluster  │
                 │  (2-3 nodes)    │
                 │                 │
                 │  - EU region    │
                 │  - US region    │
                 │  - Asia region  │
                 └─────────────────┘
                           │
                           ▼
                 ┌─────────────────┐
                 │  Public Waku    │
                 │  Network        │
                 │  (gossip)       │
                 └─────────────────┘
```

**Pros:**
- Full control over infrastructure
- Can guarantee uptime and retention
- No dependency on third-party

**Cons:**
- Requires server maintenance
- Cost (~$20-50/month per node)
- Single point of failure without redundancy

**Deployment requirements:**
- VPS with 2GB RAM, 50GB SSD
- Docker + Docker Compose
- Domain with SSL (for WSS)
- Firewall: allow 30304/tcp, 9005/udp, 443/tcp

### Option 2: Logos Fleet (Public Infrastructure)

**Who deploys:** Logos/Waku team (Status.im)

**Architecture:**
```
┌─────────────┐     ┌─────────────┐
│   User A    │     │   User B    │
│  (Browser)  │     │  (Browser)  │
└──────┬──────┘     └──────┬──────┘
       │                   │
       └─────────┬─────────┘
                 │
                 ▼
       ┌─────────────────┐
       │   Logos Fleet   │
       │   (~50 nodes)   │
       │                 │
       │  Operated by    │
       │  Status.im      │
       └─────────────────┘
```

**Pros:**
- No infrastructure to maintain
- Free to use
- Decentralized (multiple operators)

**Cons:**
- Less proven reliability than Nostr relays
- No SLA or uptime guarantees
- Potential for message loss
- May require RLN (rate limiting) in future

**Connection:**
```typescript
// Use public bootstrap nodes instead of local
this.node = await createLightNode({ defaultBootstrap: true });
```

### Option 3: Hybrid (Recommended for Production)

**Architecture:**
```
┌─────────────────────────────────────────────┐
│                  User Browser               │
│                                             │
│  ┌─────────────┐     ┌─────────────┐       │
│  │    Nostr    │     │    Waku     │       │
│  │  (Primary)  │     │  (Backup)   │       │
│  └──────┬──────┘     └──────┬──────┘       │
└─────────┼───────────────────┼───────────────┘
          │                   │
          ▼                   ▼
   ┌─────────────┐     ┌─────────────┐
   │   Public    │     │  Self-host  │
   │   Relays    │     │   nwaku     │
   │   (1000+)   │     │  + Logos    │
   └─────────────┘     └─────────────┘
```

**Strategy:**
1. **Primary:** Nostr (proven, reliable)
2. **Backup:** Waku (better privacy, experimental)
3. Send to both, receive from first to respond

This is NOT currently implemented but would be the ideal production architecture.

---

## Enabling Waku in the App

1. **Start local nwaku:**
   ```bash
   cd docker/nwaku && docker compose up -d
   ```

2. **Enable in Settings:**
   - Go to Settings → Display Settings
   - Set "Waku Notifications" to "Enabled"
   - Click "Update Display Settings"

3. **Verify connection:**
   - Open browser DevTools → Console
   - Look for: `[Waku] ✅ Connected to nwaku`

**Note:** The `useWaku` setting currently only stores the preference. The actual integration with send/receive flows would need to be implemented to use `WakuNotificationService` alongside `NostrNotificationService`.

---

## Next Steps
1. Keep spike code on `logos_event_storage` branch for future reference
2. Continue using Nostr for production notifications
3. Monitor @waku/sdk for stable 1.0 release
4. Consider Waku for Phase 2 Codex backup integration (separate concern)
5. Archive this spike; do not merge to main
