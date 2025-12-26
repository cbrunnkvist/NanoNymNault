# Ceramic Backup for NanoNym Recovery Specification

**Version**: 1.2 (2025-12-04)
**Status**: Design finalized; implement as optional v1.1 post-Phase 5

## Specification Note

This document provides:

- **Core protocol specification** (Sections 1-4): Exact formulas and formats required for compatibility
- **Implementation guidance** (Sections 5-7): High-level workflows; actual implementation may vary
- **Analysis and constraints** (Sections 8-9): Privacy trade-offs and known limitations

Code examples are illustrative pseudocode. Developers should adapt to their integration needs while maintaining protocol compatibility.

---

## 1. Objective and Core Concept

**Problem**: Nostr relays prune historical events (typically 7–30 days), risking loss of `R` values for stealth account recovery. Tier-1 (multi-relay replay) fails on full prune; Tier-3 (chain heuristics) is infeasible without `R`. Users need seed-only discovery, but wallets can't persist or fund storage.

**Solution**: Ceramic Streams as append-only, per-NanoNym DID-keyed logs for encrypted event blobs containing `{R, tx_hash, open_ts}`. Both senders and receivers can compute the same DID from public keys, enabling sender-initiated appends with receiver-only decryption.

**Why Ceramic?**

- **Reliability**: DAG streams with Merkle proofs; IPFS anchoring for long-term availability
- **No costs**: Feeless writes to public nodes
- **PWA-native**: HTTP client only (no WebRTC)
- **Per-NanoNym isolation**: Separate DIDs prevent cross-linking

### Terminology

| Term | Definition |
|------|------------|
| Stream | Ceramic's append-only log (DID-keyed, one per NanoNym) |
| DID | Decentralized Identifier (Ed25519-based, derived from public keys) |
| Event Blob | Encrypted JSON containing stealth account data |
| Opportunistic Append | Add to stream on active receives; non-blocking |

---

## 2. Design Positioning

**Rejected Alternatives**:

| Approach | Rejection Reason |
|----------|-----------------|
| Seed-wide stream | Metadata leaks across all NanoNyms |
| Per-stealth streams | Over-proliferates; breaks aggregation |
| Arweave via Irys | Requires funded accounts (AR tokens) |
| HD Path-based DID | Sender cannot compute without receiver's seed |

**Adopted Approach**: Hash-based DID derivation from the three public keys embedded in every `nnym_` address. Both sender and receiver compute identical DIDs, enabling sender-initiated appends.

---

## 3. DID and Stream Format

### 3.1 DID Derivation via Public Key Hash

**Derivation Formula**:

```
ceramic_seed = BLAKE2b-256("nanonym-ceramic-did-v1" || B_spend || B_view || nostr_public)
ceramic_keypair = ed25519_keypair_from_seed(ceramic_seed)
ceramic_did = "did:key:" + multibase_encode(ceramic_public)
```

Where:

- `||` denotes byte concatenation
- `"nanonym-ceramic-did-v1"` is a domain separator (UTF-8 encoded, 22 bytes)
- `B_spend`, `B_view` are 32-byte Ed25519 public keys
- `nostr_public` is the 32-byte Secp256k1 public key (x-coordinate)
- BLAKE2b-256 outputs 32 bytes (suitable as Ed25519 seed)
- Multibase encoding uses Base58btc with `z` prefix and multicodec `0xed01` for Ed25519-pub

**Why Hash-Based?**

| Property | HD Path (`/1002'`) | Hash-Based |
|----------|-------------------|------------|
| Sender can compute | ❌ No (needs seed) | ✅ Yes |
| Deterministic | ✅ Yes | ✅ Yes |
| Per-NanoNym isolation | ✅ Yes | ✅ Yes |

**Security Note**: The Ceramic DID private key is computable by anyone with the `nnym_` address. This is intentional—it enables sender appends. Blob contents are separately encrypted to `B_view`, which requires the receiver's seed to decrypt.

### 3.2 Stream ID Computation

Ceramic computes deterministic stream IDs from `hash(DID + family + tags)`:

- **Family**: `"nanonym-backup"`
- **Tags**: `["v2"]`
- **Result**: Both sender and receiver independently compute the same stream ID

This uses Ceramic's `TileDocument.deterministic()` API with `controllers: [did]`.

### 3.3 Blob Structure

**Plaintext Schema** (before encryption):

```json
{
  "version": 2,
  "protocol": "nanoNymNault-ceramic",
  "open_ts": 1733241600,
  "stealths": [
    {
      "R": "64-char-hex-ephemeral-public-key",
      "tx_hash": "64-char-hex-nano-transaction-hash",
      "amount_raw": "optional-raw-amount",
      "memo": "optional-encrypted-memo"
    }
  ],
  "sig": "optional-ed25519-signature"
}
```

**Encrypted Envelope**:

```json
{
  "sealed": {
    "ciphertext": "base64_encrypted_blob",
    "nonce": "base64_24_bytes",
    "recipient": "B_view_hex"
  },
  "ephemeral_pk": "sender_ephemeral_x25519_public_key"
}
```

**Encryption**: NaCl box (X25519-XSalsa20-Poly1305) to `B_view` converted to Curve25519.

### 3.4 Ed25519 to Curve25519 Conversion

The `B_view` key is Ed25519, but NaCl box requires X25519. Use the standard birational map:

```
B_view (Ed25519 public, in nnym_) → ed25519_to_curve25519() → X25519 public → NaCl box encrypt
b_view (Ed25519 private, from seed) → ed25519_to_curve25519() → X25519 private → NaCl box decrypt
```

**Library**: Use `@noble/curves` which provides Ed25519 and X25519 with built-in conversion utilities.

---

## 4. Stream Authorization Model

**Who Can Do What**:

| Actor | Compute DID? | Append? | Decrypt Blobs? |
|-------|-------------|---------|----------------|
| Receiver (has seed) | ✅ Yes | ✅ Yes | ✅ Yes |
| Sender (has `nnym_` address) | ✅ Yes | ✅ Yes | ❌ No |
| Third party (no address) | ❌ No | ❌ No | ❌ No |
| Third party (has address) | ✅ Yes | ✅ Yes | ❌ No |

**Implications**:

- Anyone with the `nnym_` address can append encrypted blobs (spam risk)
- Only the receiver can decrypt those blobs
- Acceptable because:
    - The `nnym_` address is shared intentionally with payers
    - Blobs are encrypted; attackers can't read or forge valid payment data
    - The receiver validates `tx_hash` against the Nano ledger

**Spam Mitigation** (if needed later): Optional PoW requirement or signature verification. Start without; add if spam becomes a problem.

---

## 5. Workflows

### 5.1 Sender Append Workflow

**Trigger**: After successful Nano send and Nostr notification.

**Steps**:

1. Derive target DID from `nnym_` address (extract public keys → hash)
2. Create blob with `{R, tx_hash, open_ts}`
3. Encrypt blob to `B_view` using NaCl box
4. Authenticate as the Ceramic DID
5. Append encrypted blob to deterministic stream

**Design Principles**:

- **Non-blocking**: Failures don't affect Nano send or Nostr notification
- **Fire-and-forget**: No UI feedback; background operation
- **Optional delay**: Configurable random delay (0-60s) mitigates timing correlation

### 5.2 Receiver Recovery Workflow

**Trigger**: User initiates "Recover from Ceramic Backup" in wallet UI.

**Steps**:

1. Prompt for recovery start date (default: NanoNym creation or 1 year ago)
2. For each NanoNym index (up to gap limit):
    - Derive public keys from seed
    - Compute Ceramic DID via hash
    - Resolve stream ID (may not exist if never used)
    - Read all encrypted blobs from stream
    - Decrypt each blob using `b_view` private key
    - Filter by `open_ts >= sinceDate`
    - Import stealth accounts, deduplicating by `tx_hash`
3. Display results: "Found X payments across Y NanoNyms"
4. Fallback to Nostr if Ceramic returns empty

**Optimizations**:

- Parallel stream reads with concurrency limit (10 max)
- Individual stream failures don't block others
- Duplicate events (from Nostr + Ceramic) deduplicated by `tx_hash`

---

## 6. Ceramic Node Requirements

### 6.1 Configuration

**Ceramic Access in 2025**:

As of December 2025, **no public Ceramic gateway exists**. The previously documented `gateway.ceramic.network` domain does not resolve (DNS NXDOMAIN). Developers must run their own Ceramic node locally.

**Local Node Setup**:

```bash
npm install -g @ceramicnetwork/cli
ceramic daemon
```

Default node URL: `http://localhost:7007`

**Development Configuration** (CORS handling):

Since browser-based wallets cannot directly access `localhost:7007` from a served application due to CORS restrictions, use a CORS proxy during development:

```bash
# Terminal 1: Start Ceramic node
ceramic daemon

# Terminal 2: Start CORS proxy (configured in package.json)
npm run proxy:ceramic

# Terminal 3: Start wallet dev server
npm run wallet:dev
```

The proxy runs on `http://localhost:8010/proxy` and forwards requests to the local Ceramic node with appropriate CORS headers.

**Environment Configuration**:

- Development (`environment.ts`): `ceramicGateway: "http://localhost:8010/proxy"`
- Production (`environment.prod.ts`): User must configure their own Ceramic node URL

**Parameters**:

- Timeout: 30s per request
- Retries: 3 with exponential backoff (1s/2s/4s)
- Health check endpoint: `GET /api/v0/node/healthcheck` (returns `"Alive!"` or `"Insufficient resources"`)

**Production Deployment Considerations**:

For production PWA deployment, users have several options:

1. **Self-hosted Ceramic node** with public HTTPS endpoint and CORS headers
2. **Reverse proxy** to local node (e.g., nginx with CORS configuration)
3. **Disable Tier-2 backup** and rely solely on Nostr Tier-1 recovery

Ceramic Tier-2 backup is **optional**; the NanoNym protocol guarantees seed-only recovery via Nostr multi-relay redundancy (Tier-1).

### 6.2 Dependencies

```json
{
  "@ceramicnetwork/http-client": "^2.30.0",
  "@ceramicnetwork/stream-tile": "^2.30.0",
  "dids": "^4.0.0",
  "key-did-provider-ed25519": "^3.0.0",
  "key-did-resolver": "^3.0.0",
  "@noble/curves": "^1.2.0",
  "@noble/hashes": "^1.3.0"
}
```

**Estimated Bundle Impact**: ~200KB gzipped. Verify actual impact during implementation.

### 6.3 SDK Stability Notice

Ceramic is transitioning from Streams API (v2.x) to ComposeDB (v3.0). This specification targets stable v2.x.

**Migration Plan**:

- Pin SDK to `@ceramicnetwork/http-client@^2.30.0`
- Monitor Ceramic changelog for v3.0 stable release
- Isolate Ceramic logic in `ceramic.service.ts` for easier migration

### 6.4 Node Limits (To Be Verified)

Document during implementation:

- Maximum events per stream
- Append rate limits
- Total streams per DID

These could affect design if a NanoNym receives thousands of payments.

### 6.5 IPFS Anchoring Guarantees

Ceramic anchors to IPFS with eventual consistency. If anchor fails, the append may not persist long-term.

**Practical expectation**: IPFS-anchored data has high retention on popular networks, but this is community-dependent, not guaranteed. Document actual retention rates observed during testing.

---

## 7. Privacy Analysis

### 7.1 What Ceramic Protects

- ✅ Event persistence (survives Nostr pruning)
- ✅ Content privacy (all blobs encrypted to `B_view`)
- ✅ Unlinkability (separate DIDs per NanoNym)
- ✅ Unpublished privacy (no stream until first payment)

### 7.2 What Ceramic Does NOT Protect

- ❌ Stream existence metadata (nodes see a stream exists)
- ❌ Append timing (nodes see when events added)
- ⚠️ DID derivability (anyone with `nnym_` address can compute DID)

### 7.3 Metadata Comparison

| Metadata | Nostr (NIP-17) | Ceramic Streams |
|----------|----------------|-----------------|
| Event timestamps | Randomized ±2 days | Actual (append time) |
| Recipient identity | Ephemeral outer key | Per-NanoNym DID |
| Retention | 7-30 days | Indefinite (IPFS) |

### 7.4 Timing Correlation Risk

**Attack**: Observer monitors Nano network and Ceramic nodes, correlates transaction times with append times.

**Mitigation**: Configurable random delay before Ceramic append (default: 30-60s max).

### 7.5 Privacy Stance

"Private per-NanoNym log with eternal availability"

- Stronger than Nostr: Persistence
- Weaker than Nostr: Timing metadata, DID derivability
- **Net benefit**: Trade timing leakage for guaranteed recovery

---

## 8. Error Handling

### 8.1 Append Failures

- Retry with exponential backoff (3 attempts)
- Try backup nodes from configuration
- Log failure; don't block send flow
- No UI notification (fire-and-forget)

### 8.2 Recovery Failures

- Individual stream failures don't block others
- Partial success: "Recovered 8/10 NanoNyms (2 failed)"
- Decryption failures: Skip blob, continue processing
- Empty streams: Skip silently (NanoNym shared but never paid)
- All Ceramic fails: Fallback to Nostr Tier-1 recovery

### 8.3 Validation

- Verify blob `version === 2` and `protocol === "nanoNymNault-ceramic"`
- Validate `R` and `tx_hash` format (64 hex chars)
- Deduplicate by `tx_hash` before importing

---

## 9. Known Limitations

1. **Date filtering is client-side**: All blobs must be downloaded and decrypted before filtering by `open_ts`. Acceptable for typical usage (<1000 events per NanoNym).

2. **DID derivability**: Anyone with the `nnym_` address can compute the Ceramic DID and observe stream activity (but not decrypt content).

3. **Community pinning**: IPFS retention is community-dependent, not guaranteed.

4. **PWA constraints**: HTTP-only communication; relies on Ceramic gateway availability.

---

## 10. Implementation Roadmap

### Phase 1: DID Derivation (2 days)

- Implement `deriveCeramicDID(B_spend, B_view, nostr_public)`
- Implement `deriveCeramicDIDFromAddress(nnymAddress)`
- Implement `did:key` encoding
- Unit tests for determinism and sender-receiver equivalence

### Phase 2: Stream Handling and Encryption (3 days)

- Create `ceramic.service.ts` with HTTP client
- Implement Ed25519 → Curve25519 conversion
- Implement blob encryption/decryption
- Stream creation, append, and read methods
- Retry logic and node failover

### Phase 3: Sender Integration (2 days)

- Hook send flow to append after successful payment
- Non-blocking fire-and-forget pattern
- Configurable random delay

### Phase 4: Recovery Wizard (3 days)

- UI for "Recover from Ceramic" with date picker
- Parallel stream reads
- Deduplication and import logic
- Fallback to Nostr

### Phase 5: Production Readiness (2 days)

- Configure production nodes
- Measure bundle size impact
- Document actual node limits and retention rates
- User documentation

---

## 11. Architectural Decision Record

### ADR-001: Hash-Based DID Derivation

**Status**: Accepted (Dec 4, 2025)

**Context**: Ceramic DIDs must be computable by both sender (to append) and receiver (to recover). HD path derivation requires the seed, which senders don't have.

**Decision**: Derive Ceramic DID by hashing the three public keys:

```
ceramic_seed = BLAKE2b-256("nanonym-ceramic-did-v1" || B_spend || B_view || nostr_public)
```

**Consequences**:

- ✅ Sender can compute DID from `nnym_` address alone
- ✅ Receiver computes identical DID
- ✅ No address format change required
- ⚠️ Anyone with `nnym_` address can compute DID (acceptable; content encrypted)

**Alternatives Rejected**:

- HD path derivation: Sender cannot compute
- Embedded DID in address: Breaking format change
- Discovery service: Centralization

---

## Appendix A: Test Coverage Requirements

### A.1 DID Derivation Tests

- **Determinism**: Same public keys must produce same DID (100 runs)
- **Sender-Receiver Equivalence**: `deriveCeramicDIDFromAddress(addr)` must equal `deriveCeramicDIDForNanoNym(seed, index)` for matching NanoNym
- **Collision Resistance**: Different public key sets must produce different DIDs
- **Domain Separator**: Verify UTF-8 encoding of `"nanonym-ceramic-did-v1"` is 22 bytes

### A.2 Encryption Tests

- **Ed25519→Curve25519**: Verify against known test vectors from libsodium
- **Encrypt-Decrypt Roundtrip**: Plaintext → encrypt(B_view) → decrypt(b_view) → must equal plaintext
- **Wrong Key Rejection**: decrypt(wrong_b_view) must fail with clear error

### A.3 Integration Tests

- **End-to-end**: Send payment → Ceramic append → Fresh wallet recovery → Stealth account accessible
- **Append failure resilience**: Ceramic unavailable → Nano send still succeeds
- **Deduplication**: Same event from Nostr and Ceramic → Single import

*Actual test vectors to be generated during Phase 1 and documented in test files.*

---

## Appendix B: Critical Invariants

**Must Never Break**:

1. `Same public keys → same DID` (always)
2. `deriveCeramicDIDFromAddress(addr) === deriveCeramicDIDForNanoNym(seed, index)` for matching NanoNym
3. Each NanoNym has independent stream (no cross-linking)
4. All blobs encrypted to `B_view` before append
5. Ceramic operations never delay Nano sends
6. `Seed + date → full stealth account history`

---

**End of Specification**
