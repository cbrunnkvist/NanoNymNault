# Arweave/Irys Tier 2 Backup Spike Learnings

**Date**: 2026-01-08
**Branch**: `arweave_as_tier_2_event_storage`
**Status**: PARTIALLY SUCCESSFUL - Query works, Upload blocked

## Objective

Implement Arweave (via Irys bundler) as Tier 2 backup for NanoNym payment notifications, providing permanent storage backup for Nostr notifications.

## Key Findings

### What Works

1. **Arweave GraphQL Queries** - Fully functional
   - Query endpoint: `https://arweave.net/graphql`
   - Can search by tags (Protocol, Blind-Index)
   - Returns transaction IDs and metadata

2. **Irys Gateway Data Retrieval** - Fully functional
   - Gateway: `https://gateway.irys.xyz/{txId}`
   - Can fetch encrypted payloads from Arweave

3. **Encryption/Decryption** - Fully functional
   - NaCl box encryption to recipient's view key (Ed25519→X25519 conversion)
   - Blind index derivation from Nostr public key (BLAKE2b-256)

### What Doesn't Work

**Irys SDK Upload from Browser** - BLOCKED

The Irys SDK (both Node.js and "web" versions) cannot run in an Angular/webpack browser environment:

1. **@irys/upload + @irys/upload-ethereum** (Node.js packages)
   - Requires Node.js `crypto`, `fs`, `path` modules
   - Webpack 5 removed automatic polyfills
   - Error: "Can't resolve 'crypto'"

2. **@irys/web-upload + @irys/web-upload-ethereum** (Web packages)
   - Designed for dApps with MetaMask/wallet connection
   - Uses `withProvider()` instead of `withWallet()`
   - Expects injected Ethereum provider, not raw private keys
   - Still requires `@irys/upload-core` which needs `crypto`

3. **@irys/web-upload-ethereum-ethers-v6** (Ethers adapter)
   - Allows using ethers.js Wallet as provider
   - But `@irys/bundles` and `@irys/upload-core` still require Node.js `crypto`

### Root Cause

The Irys SDK architecture assumes either:
- **Server-side** (Node.js with full crypto/fs access)
- **Browser dApp** (user connects wallet via MetaMask/WalletConnect)

NanoNymNault is a **browser app with internally-derived keys** - a use case the SDK doesn't support.

## Technical Details

### Blind Index Design

```typescript
blindIndex = BLAKE2b-256(nostrPublicKey)
```

Tags stored on Arweave:
- `Protocol: "NanoNym-Signal"`
- `Protocol-Version: "1"`
- `Blind-Index: "{hex}"`

### Payload Format (Version 1)

```
[0]     Version byte (0x01)
[1-24]  Nonce (24 bytes)
[25-56] Ephemeral public key (32 bytes, X25519)
[57+]   Encrypted payload (NaCl box)
```

### Privacy Trade-off

Tags reveal **when** a NanoNym receives payment (timing metadata), but NOT:
- Sender identity
- Payment amount
- Stealth address

This is consistent with the existing NanoNym privacy model.

## Implementation Status

### IrysDiscoveryService (`src/app/services/irys-discovery.service.ts`)

| Method | Status | Notes |
|--------|--------|-------|
| `deriveBlindIndex()` | ✅ Working | BLAKE2b-256 of nostr public key |
| `encryptPayload()` | ✅ Working | NaCl box, Ed25519→X25519 conversion |
| `decryptPayload()` | ✅ Working | NaCl box.open |
| `queryNotifications()` | ✅ Working | GraphQL to arweave.net |
| `parseEncryptedPayload()` | ✅ Working | Version 1 format parser |
| `recoverNotificationsForNanoNym()` | ✅ Working | Query + decrypt pipeline |
| `uploadNotification()` | ❌ Stub | Returns null, logs warning |

### Send Flow Integration

The send component attempts Irys backup after Nostr notification:
1. Nostr notification sent (primary channel)
2. Irys backup attempted (currently no-op)
3. Transaction completes regardless of Irys status

## Alternative Approaches

### Option 1: Direct Arweave/Bundlr REST API

Skip the SDK and implement upload directly:
1. Create ANS-104 data item manually
2. Sign with Ethereum key (Secp256k1)
3. POST to `https://devnet.irys.xyz/tx`

**Pros**: Full control, no SDK dependencies
**Cons**: Complex signing implementation, need to match ANS-104 spec exactly

### Option 2: Server-Side Proxy

Run a small backend service that:
1. Receives encrypted payloads from browser
2. Uses Node.js Irys SDK to upload
3. Returns transaction ID

**Pros**: SDK works correctly server-side
**Cons**: Requires infrastructure, central point of failure

### Option 3: WebAssembly Bundler

Compile Irys signing logic to WASM for browser use.

**Pros**: Runs in browser, no server needed
**Cons**: Significant development effort, not clear if feasible

### Option 4: Alternative Storage

Consider other permanent/archival storage options:
- IPFS with pinning service (Pinata, Filebase)
- Filecoin (similar SDK issues likely)
- Custom relay with archival guarantee

## Recommendations

### Short-term (Current State)

1. Keep Nostr as primary notification channel (Tier 1)
2. Leave query functionality in place for future recovery
3. Document upload limitation clearly

### Medium-term

1. Investigate direct Arweave REST API approach
2. Create minimal ANS-104 signing implementation
3. Test with Irys devnet

### Long-term

1. Consider server-side proxy if direct approach fails
2. Monitor Irys SDK for browser-native support
3. Evaluate alternative archival solutions

## Angular 14 Migration (Side Effect)

The spike required upgrading Angular to resolve TypeScript compatibility:

| Package | Before | After |
|---------|--------|-------|
| Angular | 13.x | 14.3.0 |
| TypeScript | 4.5.5 | 4.8.4 |
| ng-bootstrap | 11.x | 13.1.1 |
| transloco | 3.1.1 | 4.3.0 |

The migration was successful and the app builds/works correctly.

## Files Changed

```
src/app/services/irys-discovery.service.ts  (NEW)
src/app/components/send/send.component.ts   (Irys integration)
package.json                                 (Angular 14 + deps)
docs/ARWEAVE-SPIKE-LEARNINGS.md            (this file)
```

## Conclusion

The Arweave/Irys Tier 2 backup concept is **technically sound** but **implementation blocked** by SDK browser compatibility. The query/recovery path is functional, enabling future uploads once a solution is found.

**Nostr remains the reliable primary notification channel.** Tier 2 is deferred, not abandoned.
