# Arweave/Irys Tier 2 Backup Spike Learnings

**Date**: 2026-01-08
**Branch**: `arweave_as_tier_2_event_storage`
**Status**: SUCCESSFUL - Query and Upload both working

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

### Initial Blocker: Irys SDK

The Irys SDK (both Node.js and "web" versions) couldn't run in Angular/webpack:
- Required Node.js `crypto`, `fs`, `path` modules
- Web version expected browser wallet (MetaMask), not raw keys

### Solution: Custom ANS-104 Implementation

Instead of fighting the SDK, we implemented direct data item creation:

1. **IrysDataItemService** (`src/app/services/irys-data-item.service.ts`)
   - Creates ANS-104 data items from scratch
   - Uses `@noble/secp256k1` for Ethereum signing
   - Uses `@noble/hashes/sha512` (sha384) for DeepHash
   - Uses `@noble/hashes/sha3` (keccak256) for message hashing
   - POSTs directly to `https://devnet.irys.xyz/tx/ethereum`

2. **Key Implementation Details**
   - DeepHash algorithm (SHA-384 based recursive hashing)
   - AVS (Avro) tag encoding with ZigZag VInt
   - Ethereum message signing with `\x19Ethereum Signed Message:\n` prefix
   - ANS-104 binary format construction

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

### IrysDataItemService (`src/app/services/irys-data-item.service.ts`)

| Method | Status | Notes |
|--------|--------|-------|
| `createAndUploadDataItem()` | ✅ Working | Main entry point |
| `createDataItem()` | ✅ Working | ANS-104 format construction |
| `deepHash()` | ✅ Working | SHA-384 recursive hashing |
| `signEthereumMessage()` | ✅ Working | Keccak256 + secp256k1 |
| `serializeAvroTags()` | ✅ Working | AVS encoding with ZigZag VInt |
| `uploadDataItem()` | ✅ Working | POST to Irys devnet |

### IrysDiscoveryService (`src/app/services/irys-discovery.service.ts`)

| Method | Status | Notes |
|--------|--------|-------|
| `deriveBlindIndex()` | ✅ Working | BLAKE2b-256 of nostr public key |
| `deriveIrysKey()` | ✅ Working | m/44'/60'/0'/0/255 derivation |
| `encryptPayload()` | ✅ Working | NaCl box, Ed25519→X25519 conversion |
| `decryptPayload()` | ✅ Working | NaCl box.open |
| `queryNotifications()` | ✅ Working | GraphQL to arweave.net |
| `parseEncryptedPayload()` | ✅ Working | Version 1 format parser |
| `recoverNotificationsForNanoNym()` | ✅ Working | Query + decrypt pipeline |
| `uploadNotification()` | ✅ Working | Uses IrysDataItemService |

### Send Flow Integration

The send component performs Irys backup after Nostr notification:
1. Nostr notification sent (primary channel)
2. Irys backup uploaded to Arweave (Tier 2)
3. Transaction completes regardless of Irys status (non-blocking)

## Solution: Direct ANS-104 Implementation

We chose Option 1 from our analysis and implemented it successfully:

1. **Create ANS-104 data item manually** - Done in `IrysDataItemService`
2. **Sign with Ethereum key (Secp256k1)** - Using `@noble/secp256k1`
3. **POST to Irys devnet** - Direct HTTP request

### Why This Worked

- `@noble/secp256k1` and `@noble/hashes` are pure JavaScript, browser-compatible
- No Node.js dependencies required
- Full control over the signing and encoding process
- ~20KB bundle size increase (minimal impact)

### Privacy Model: Scan-All (Private Broadcast)

Initially, we planned to use a "Blind Index" tag (`BLAKE2b(nostr_pub)`) to allow efficient querying. However, this leaks payment frequency and volume for specific recipients.

**We switched to a "Scan-All" model:**
- **No Blind Index Tag**: Uploads are tagged only with `Protocol: NanoNym-Signal`.
- **Query All**: Recovery involves fetching *all* protocol events since the wallet birthday.
- **Client-Side Filter**: The client attempts to decrypt every event. Successful decryption = "It's for me".
- **Privacy Gain**: Observers see only a global stream of encrypted blobs. They cannot correlate payments to specific recipients or see who is receiving how much traffic.
- **Trade-off**: Recovery is slower (O(n) decryption attempts), but acceptable for a one-time recovery process using pagination and time-based filtering.

### ANS-104 Implementation Details

Key components that were implemented:

1. **DeepHash** - Recursive SHA-384 hashing with "blob"/"list" tags
2. **AVS Tags** - Avro serialization with ZigZag variable-length integers
3. **Ethereum Message Signing** - `\x19Ethereum Signed Message:\n{len}` prefix + keccak256
4. **Binary Layout** - Signature type (2) + signature (65) + owner (65) + flags + tags + data

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
src/app/services/irys-data-item.service.ts  (NEW - ANS-104 implementation)
src/app/services/irys-discovery.service.ts  (NEW - encryption, query, upload)
src/app/components/send/send.component.ts   (Irys integration)
package.json                                 (Angular 14 + deps)
docs/ARWEAVE-SPIKE-LEARNINGS.md            (this file)
```

## Conclusion

The Arweave/Irys Tier 2 backup is **fully implemented**:

- ✅ Query notifications from Arweave (working)
- ✅ Upload notifications to Arweave via Irys devnet (working)
- ✅ Integrated into NanoNym send flow
- ✅ No external SDK dependencies (pure @noble/* libraries)

**Nostr remains the primary notification channel.** Arweave provides permanent archival backup for enhanced recovery guarantees.
