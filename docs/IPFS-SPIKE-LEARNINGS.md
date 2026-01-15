# IPFS Notification Spike Learnings

**Date**: January 10-13, 2026
**Branch**: `ipfs_as_notification_alternative`
**Status**: Core Integration Complete (OrbitDB + Helia + Persistence + Gossipsub)

---

## Summary

Successfully integrated Helia (IPFS) and OrbitDB v3 into the Angular 17 NanoNymNault application. Solved significant build system challenges related to Node.js polyfills in Webpack 5 and ensured persistent data storage using IndexedDB.

The system now supports parallel notifications: sending via both Nostr (existing) and OrbitDB (new), with a UI toggle to control the feature.

---

## Migration Path Completed

| Step | From → To | Key Changes |
|------|-----------|-------------|
| 1 | Angular 13 → 14 | TypeScript 4.5 → 4.8, RxJS 7.4+ |
| 2 | Angular 14 → 15 | Node 16 → 18, standalone components |
| 3 | Angular 15 → 16 | TypeScript 4.9 → 5.1 |
| 4 | Angular 16 → 17 | Node 18 → 20, TypeScript 5.4, SwUpdate API changes |

### Additional Package Upgrades Required
- `@ng-bootstrap/ng-bootstrap` 11 → 16 (for Angular 17)
- `@zxing/ngx-scanner` 3.4 → 17 (for Angular 17)
- `@zxing/browser` 0.0.10 → 0.1.4
- `@zxing/library` 0.18 → 0.21
- `@popperjs/core` (new dependency for ng-bootstrap 16)
- `jasmine-core` 3.6 → 5.1
- `karma-jasmine` 4.0 → 5.1
- `karma-jasmine-html-reporter` 1.7 → 2.1
- `zone.js/testing` (new testing import pattern)

---

## Technical Learnings & Solutions

### 1. Webpack 5 Node.js Polyfills (The "node:stream" Error)
**Problem**: Angular 17 uses Webpack 5, which no longer polyfills Node.js core modules by default. The IPFS stack (Helia/OrbitDB) relies heavily on streams and uses `node:` protocol imports (e.g., `import ... from 'node:stream'`), causing build failures.

**Solution**:
1. Installed `stream-browserify`.
2. Installed `@angular-builders/custom-webpack`.
3. Created `extra-webpack.config.js` to:
   - Provide a fallback for `stream`.
   - Alias `node:stream` to `stream-browserify`.
   - Use `webpack.NormalModuleReplacementPlugin` to strip the `node:` prefix from imports, fixing compatibility with packages that hardcode protocol imports.

```javascript
const webpack = require('webpack');
module.exports = {
  resolve: {
    fallback: {
      "stream": require.resolve("stream-browserify"),
      "crypto": false
    },
    alias: {
      "node:stream": require.resolve("stream-browserify"),
    }
  },
  plugins: [
    new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
      resource.request = resource.request.replace(/^node:/, '');
    }),
  ]
};
```

### 2. IndexedDB Persistence for Helia
**Problem**: Default Helia initialization uses in-memory storage, meaning IPFS identity (PeerID) and data (blocks) are lost on page reload.

**Solution**:
1. Installed `blockstore-idb` and `datastore-idb`.
2. Initialized Helia with these persistent stores:
```typescript
const blockstore = new IDBBlockstore('nanonym-ipfs-blocks');
const datastore = new IDBDatastore('nanonym-ipfs-data');
await blockstore.open();
await datastore.open();
this.helia = await createHelia({ blockstore, datastore });
```
3. **Result**: The wallet now maintains a stable PeerID and retains notification data across sessions.

### 3. OrbitDB Requires Gossipsub for Replication
**Problem**: OrbitDB 3.x uses libp2p pubsub for database replication. Without pubsub configured, OrbitDB throws:
```
TypeError: undefined is not an object (evaluating 'pubsub.addEventListener')
```

**Solution**:
1. Installed `@chainsafe/libp2p-gossipsub@13` (version 13 required for compatibility with Helia 6's `@libp2p/interface@3.x`).
2. Extended Helia's default libp2p config to include gossipsub:
```typescript
const { createHelia, libp2pDefaults } = await import('helia');
const { gossipsub } = await import('@chainsafe/libp2p-gossipsub');

const libp2pOptions = libp2pDefaults();
(libp2pOptions.services as any).pubsub = gossipsub({
  allowPublishToZeroTopicPeers: true  // Required for single-peer operation
});

this.helia = await createHelia({
  libp2p: libp2pOptions,
  blockstore,
  datastore
});
```

**Version Compatibility Note**: 
- `@chainsafe/libp2p-gossipsub@14` uses `@libp2p/interface@2.x` which conflicts with Helia 6's `@libp2p/interface@3.x`
- Use version 13 for compatibility with Helia 6

### 4. Resolving "Cannot sign message, no private key present" Error
**Problem**: `gossipsub` v13 expects the PeerID object to contain a `privateKey` property (protobuf format). However, `libp2p` v3 (used by `helia` v6) uses `@libp2p/peer-id` v6, which removed this property in favor of a separate Keychain component. This caused `gossipsub` initialization to fail because it couldn't find the key for signing messages.

**Solution**:
1. **Explicit Key Generation**: Manually generated an Ed25519 key pair using `@libp2p/crypto` and created a PeerID from it.
2. **PeerID Patching**: Explicitly patched the PeerID object to include the `privateKey` property by marshaling the key to protobuf format (`privateKeyToProtobuf`).
3. **Factory Wrapper**: Wrapped the `gossipsub` factory function passed to `libp2pOptions`. This interceptor re-applies the patch to the actual PeerID object inside the factory call, ensuring `gossipsub` receives the key even if `libp2p` internals modify/clone the object during initialization.

```typescript
const { createEd25519PeerId } = await import('@libp2p/peer-id-factory');
const { privateKeyToProtobuf } = await import('@libp2p/crypto/keys');

// ... generate key and peerId ...

// Wrap gossipsub to patch the PeerID
const originalGossipSub = gossipsub({ ... });

(libp2pOptions.services as any).pubsub = (components: any) => {
  if (components.peerId && !components.peerId.privateKey) {
       const privKeyProto = privateKeyToProtobuf(privateKey);
       (components.peerId as any).privateKey = privKeyProto;
  }
  return originalGossipSub(components);
};
```

### 5. Trial Decryption Architecture
**Design**:
- **Global Log**: All notifications go to one OrbitDB event log (`nano-nym-alerts-v1`).
- **Receiver Privacy**: Entries are encrypted NIP-59 gift-wraps (just like Nostr).
- **Process**:
  1. Listener receives new log entry.
  2. Wallet iterates through all active NanoNyms.
  3. Attempts `nip59.unwrapEvent` with each account's private key.
  4. If successful, processes the payment (deduplication prevents double-counting if also received via Nostr).

### 6. P2P Infrastructure Architecture (Zero-Backend)
**Challenge**: Browsers cannot pin content permanently or reliably serve it to others (ephemeral sessions).
**Solution**: 
- **Community Containers**: We can ship a standard IPFS/Kubo Docker container configured to follow and pin the NanoNym topic.
- **DHT Discovery**: No hardcoded server IPs needed. Browsers and servers discover each other via the topic string (e.g., `/orbitdb/QmGlobalNanoNymAlerts`).
- **DNSLink Bootstrap**: Optional `_dnslink` TXT records can help browsers find these community super-peers faster than random DHT queries.
- **Conclusion**: We don't need to run "the" server; we just provide the software for the community to run the infrastructure.

---

## Files Created/Modified

| File | Status | Description |
|------|--------|-------------|
| `src/app/services/orbitdb-notification.service.ts` | **New** | Core service for Helia/OrbitDB lifecycle and log management |
| `extra-webpack.config.js` | **New** | Webpack overrides for Node.js polyfills |
| `src/app/services/nanonym-manager.service.ts` | Modified | Added OrbitDB listener and trial-decryption logic |
| `src/app/components/send/send.component.ts` | Modified | Added parallel sending to OrbitDB |
| `src/app/components/configure-app/` | Modified | Added "OrbitDB Notifications" toggle UI |
| `src/app/services/app-settings.service.ts` | Modified | Added persistence for the OrbitDB toggle setting |
| `angular.json` | Modified | Switched builder to `custom-webpack` |
| `tsconfig.json` | Modified | Added path mapping for `stream` polyfill |

---

---

## Phase 1 Testing Results (January 15, 2026)

### What Works ✅

1. **OrbitDB Posting**: Successfully posts encrypted notifications to local OrbitDB log
   ```
   [OrbitDB] 📤 Notification posted: zdpuAqKXDoy2uAKQhiJxSnmsbCsCu7oT4159vqwZs959dhTrX
   ```

2. **Parallel Operation**: Both Nostr and OrbitDB work simultaneously without interference
   - Nostr: Published to 3/3 relays
   - OrbitDB: Posted to local log
   - Settings toggles control each independently

3. **IndexedDB Persistence**: Data survives page reloads
   - Stable PeerID across sessions
   - Notification history retained

4. **NIP-59 Encryption**: Gift-wrapped events work identically to Nostr

### What Doesn't Work (Yet) ⚠️

**Critical Finding: No Cross-Instance Replication**

Each browser instance creates its **own isolated OrbitDB database**:
- Unique database address: `/orbitdb/zdpu<random-hash>`
- No peer discovery between instances
- No shared global log
- **Cannot read notifications from other browsers/devices**

**Why?**
1. **No relay infrastructure**: Browsers can't directly connect P2P
2. **No bootstrap nodes**: No way to discover other NanoNymNault instances
3. **Random database addresses**: Each instance creates a new log instead of connecting to a shared one
4. **WebRTC/WebSockets limitations**: Browser-to-browser requires signaling servers

**Evidence from logs:**
```
[Error] WebSocket connection to 'wss://<libp2p-peer>.libp2p.direct/' failed: Could not connect
```
- Helia tries to connect to public IPFS bootstrap nodes
- All connection attempts fail (expected - these are generic IPFS nodes, not NanoNym-aware)
- No custom bootstrap/relay configuration exists

### Replication Requirements (Missing Infrastructure)

To make OrbitDB work as a **global shared log**, we would need:

| Component | Purpose | Effort | Status |
|-----------|---------|--------|--------|
| **Relay nodes** | Browser-to-browser connectivity | Medium | ❌ Not implemented |
| **Bootstrap nodes** | Peer discovery | Low | ❌ Not implemented |
| **Deterministic DB address** | All instances use same log | Low | ❌ Random per-instance |
| **Signaling server** | WebRTC coordination | Medium | ❌ Not implemented |
| **Community infrastructure** | Persistent nodes | High | ❌ Requires deployment |

### Comparison: OrbitDB vs Nostr

| Feature | OrbitDB (Current) | Nostr (Existing) |
|---------|-------------------|------------------|
| **Cross-instance delivery** | ❌ No replication | ✅ Works immediately |
| **Infrastructure required** | Custom relay/bootstrap nodes | Public relays (already exist) |
| **Setup complexity** | High (custom infra) | Low (use existing relays) |
| **Persistent storage** | ✅ Local IndexedDB | ❌ Relay retention (7-30 days) |
| **Privacy** | ✅ NIP-59 encrypted | ✅ NIP-59 encrypted |
| **Browser compatibility** | ✅ Works | ✅ Works |

### The Infrastructure Reality

**What we learned:**
- OrbitDB is designed for **known peer networks** (e.g., organizational databases)
- Not designed for **ad-hoc P2P discovery** across random internet users
- Requires **always-on infrastructure nodes** to bridge browser instances

**What it would take to match Nostr:**
1. Deploy 3-5 relay nodes (VPS hosting, ~$50/mo)
2. Configure libp2p bootstrap addresses
3. Implement deterministic database addressing
4. Set up WebRTC signaling servers
5. Community needs to run persistent Kubo nodes

**vs. Nostr:**
- Use existing public relays (free, no infrastructure)
- Works immediately out of the box
- Already has 100+ public relays with retention

---

## Phase 1 Conclusions

### What Phase 1 Proved ✅
- OrbitDB technically works in the browser
- Can store notifications with IndexedDB persistence
- Integration with NanoNym protocol is sound
- No showstopper bugs

### What Phase 1 Revealed ⚠️
- **OrbitDB requires custom infrastructure** to work as a notification system
- Not a drop-in Nostr replacement without significant deployment effort
- Current implementation only provides **local storage**, not **global messaging**

### Recommendation

**OrbitDB Spike Assessment:**
- ✅ **Technology works** - Integration successful
- ❌ **Wrong tool for the job** - Designed for different use case
- 💡 **Better suited for Tier-2 backup** - Local persistent storage of notification history

**For real-time notifications:**
- **Keep using Nostr** - Already works, no infrastructure needed
- Public relays provide immediate cross-device delivery
- Proven reliable for messaging use cases

**For long-term recovery (Tier-2):**
- OrbitDB/IPFS makes more sense for **archival storage**
- Can complement Nostr by providing permanent backup
- See `IPFS-BACKUP-SPECIFICATION.md` for recovery strategy

---

## Next Steps (Updated)

### Immediate
1. ✅ **Phase 1 Complete** - OrbitDB integration validated
2. **Document findings** - Update spike plan with conclusions
3. **Decision point**: Continue to Phase 2/3, or pivot to backup implementation?

### Phase 2/3 Options (If Pursuing Replication)
- **Phase 2**: Raw IPFS DHT (skip OrbitDB overhead)
- **Phase 3**: libp2p Pubsub only (skip database abstraction)
- Both still require custom relay/bootstrap infrastructure

### Alternative Path: Tier-2 Backup
- Focus on using IPFS for **seed-recoverable backups** (not real-time notifications)
- Use Nostr for primary notifications (continue current implementation)
- Implement IPFS-based permanent storage for notification history
- Lower infrastructure requirements (can be user-optional)
