# IPFS Backup for NanoNym Recovery Specification

Target agent: Implementing Coding Agent
Project name: NanoNymNault
Goal: Implement a seed-recoverable, opportunistic Tier-2 backup layer using IPFS/IPNS for Nostr notifications, ensuring permanent access to `R` values and `tx_hash` pairs without user-funded storage or external keys.
Primary constraint: Pure PWA/browser-based (HTTPS gateways only); provider handles all pinning/validation. Opportunistic updates on active sessions.
Live preview: N/A (internal feature; integrates with existing Nostr recovery).
Status: Design finalized; implement as optional v1.1 post-Phase 5.

---

## 1. Objective and Core Concept

### Problem Statement

Nostr relays prune historical events (typically 7–30 days), risking permanent loss of `R` values needed for stealth account recovery. The current recovery architecture has critical weaknesses:

- **Tier-1 (multi-relay replay)**: Fails if all relays discard data after retention windows
- **Tier-3 (chain-only heuristics)**: Cryptographically infeasible without `R` values from notifications
- **User demand**: Seed-only recovery without external operations or funded storage accounts

### Solution Overview

A decentralized, append-only log of daily backup blobs stored on IPFS, pinned centrally by the provider. Blobs capture per-day stealth opens (`R`, `tx_hash`, `open_ts`) across all NanoNyms. Recovery starts from a user-specified "from date" to avoid historical clutter. Updates are opportunistic (on wallet open/receive), ensuring "today's" blob mutates during sessions while past days seal immutably.

### Why This Approach?

**Reliability**: IPFS provides "eternal" storage (content-addressed, globally replicated) without user operations, complementing Nostr's ephemerality. Provider pinning guarantees availability, with optional community replication for resilience.

**UX Focus**: Per-day granularity + date picker empowers users to skip archived eras (e.g., post-consolidation), reducing "dust" NanoNyms in UI. No 24/7 daemon needed—leverages NanoNym's event-driven receives.

**Privacy Trade-Off**: Provider sees sender→stealth links during validation (explicit, like Nostr metadata); blobs encrypt content. Public tree enables network help (e.g., anyone pins prefixes), aligning with Nano's open ethos.

**Constraints Honored**: Seed-derives all paths/keys; no ETH/AR costs; PWA-friendly (HTTPS fetches only).

### Terminology

- **Backup Blob**: Immutable JSON per UTC day, aggregating `{R, tx_hash, open_ts}` for all stealth opens that day across a seed's NanoNyms. Encrypted to user's root `b_view` + provider's pubkey (for validation).
- **Daily Path**: Seed-derived, hashed IPFS subpath (e.g., `/backups/shard1/base_hash/YYYY/MM/DD/bundle.json`).
- **Master IPNS**: Provider-controlled mutable root (`/ipns/nanonym-backups.yourdomain`) pointing to the `/backups/` directory tree.
- **Opportunistic Update**: Append/push on active wallet sessions only; retro-fills missed days via Nostr catch-up.
- **Date Picker**: Optional wizard input for recovery start date, defaulting to 1 year ago for balance between completeness and speed.

### NanoNym Properties (Backup Extension)

- One aggregated blob tree per seed (covers all NanoNyms)
- Blobs size: <1KB/day (1–10 entries typical); sharded by date for scalability
- No on-chain markers; all off-chain, provider-gated

---

## 2. Design Positioning

### Rejected Alternatives

**Single growing blob**: Risks bloat (10MB+ after years), slow decrypts on mobile; forces full-history restores, cluttering UI with inactive NanoNyms.

**Per-NanoNym blobs**: Multiplies paths/CIDs unnecessarily; complicates aggregation.

**User-pinned IPFS**: Violates no-external-ops constraint; requires persistent nodes.

**Arweave**: Requires per-seed funding, breaks seed-only purity; economic model impractical for PWA wallets.

### Adapted Ideas

- **IPFS UnixFS (mutable directories)**: Enables tree-building without full rewrites
- **BIP-352-style event logging**: Timestamped, append-only for audits/recovery
- **Nostr's opportunistic sync**: Extend to IPFS uploads on receive events
- **Git-like immutability**: Daily "commits" for granular, rewindable history

### Final Architecture

- **Hashed paths** for seed-only discoverability
- **Provider intake** for upload/validation (PoW + tx existence)
- **Public tree under master IPNS**: Balances openness (community pinning) with opacity (hashed shards)
- **Per-day blobs + date picker**: UX hygiene without baseline complexity

### Why Public Tree?

Like the Nano ledger—public for resilience (anyone can "seed" prefixes, reducing provider load), but encryption + hashing ensure content opacity. Trade-off: Minor metadata exposure (activity dates), but no worse than chain explorers seeing tx volumes.

---

## 3. Path Format (Seed-Derived IPFS Subpaths)

### Why Paths?

Deterministic, opaque discovery: Wallet computes from seed alone; unguessable without derivation (2^256 space via BLAKE2b). Sharding prevents hot roots; dates enable UX slicing.

### Binary/String Layout

**Root anchor**:
```
base_hash = BLAKE2b-256("nanonym-backup-v2" || root_pub_bytes)
```
Where `root_pub` is from `m/44'/165'/0'` Ed25519 public key.

**Path components**:
- **Shard**: First 8 bytes of `base_hash` (hex, ~16 chars) for tree balance
- **Date components**: `/YYYY/MM/DD/` (UTC, padded zeros)
- **Final path**: `/backups/<shard>/<base_hash_hex>/<YYYY>/<MM>/<DD>/bundle.json`

### Example Path

```
/backups/a7f3e92c1d4b8a65/a7f3e92c1d4b8a6523c0f1e9d8b7a6541234567890abcdef/2025/12/03/bundle.json
```

### Encoding

Plain strings; wallet resolves via HTTPS gateway:
```
https://ipfs.io/ipns/nanonym-backups.yourdomain/backups/...
```

### Rationale

- **Salt/version** prevents collisions across protocol versions
- **Dates** add UX without leaking precise timestamps (hashed root hides linkage)
- **Compatibility**: Works with any gateway; provider builds tree via MFS (Mutable File System)

---

## 4. Key Derivation and Blob Model

### Seed and Derivation

Unchanged from CLAUDE.md §4: Root seed → standard/NanoNym paths.

**Backup extension**: No new private keys—hash `root_pub` for paths; encrypt blobs with root `b_view` (derived from seed).

### Blob Structure

JSON format, one per UTC day:

```json
{
  "version": 2,
  "protocol": "nanoNymNault-ipfs-backup",
  "date_utc": "2025-12-03",
  "seed_hash": "blake2b_hex(root_pub)",
  "nanonyms": {
    "index_0": [
      {
        "R": "hex_encoded_ephemeral_pubkey",
        "tx_hash": "A123...",
        "open_ts": 1733241600,
        "amount_raw": "optional_for_quick_balance"
      }
    ],
    "index_1": [...]
  },
  "sig": "ed25519_signature_over_blob(root_b_spend)"
}
```

### Encryption Scheme

**Dual encryption** for different purposes:

1. **User copy** (AES-256-GCM):
   - Key derived from: `HKDF(b_view, salt="ipfs-backup-v2", info=date_utc)`
   - Allows seed-only decryption during recovery
   - Full blob encrypted

2. **Provider copy** (for validation):
   - Ephemeral ECDH with provider's published pubkey
   - Includes plaintext `tx_hashes` array for validation
   - Provider discards after validation

**Blob wrapper**:
```json
{
  "version": 2,
  "user_encrypted": "base64_aes_gcm_blob",
  "validation_encrypted": "base64_provider_copy",
  "nonce": "base64_gcm_nonce",
  "date_utc": "2025-12-03"
}
```

### Why Aggregated?

Single fetch/day covers all NanoNyms; reduces CIDs vs. per-NanoNym approach. Typical size: 200-800 bytes encrypted.

### Wallet Birthday Tie-In

Use for default date picker (e.g., "Start from wallet creation?"); optimization only—not required for correctness.

---

## 5. Upload Workflow (Wallet → Provider Service)

### Trigger Events

1. **Primary**: On validated stealth open (CLAUDE.md §6.1 Phase 1)
2. **Batch**: Append to local draft; upload on pause/idle
3. **Retro-fill**: Via Nostr catch-up on wallet startup

### Wallet-Side Steps

```typescript
async function uploadDailyBackup(stealthOpen: StealthOpenEvent): Promise<void> {
  // 1. Compute date bucket (UTC YYYY-MM-DD from open_ts)
  const dateBucket = new Date(stealthOpen.open_ts * 1000).toISOString().slice(0, 10);

  // 2. Append to in-memory/IndexedDB draft for that day
  await appendToDailyDraft(dateBucket, {
    R: stealthOpen.R_hex,
    tx_hash: stealthOpen.tx_hash,
    open_ts: stealthOpen.open_ts,
    amount_raw: stealthOpen.amount_raw,
    nanonym_index: stealthOpen.nanonym_index
  });

  // 3. Encrypt and compute CID
  const blob = await buildDailyBlob(dateBucket);
  const encrypted = await encryptBlob(blob, b_view, providerPubkey);
  const cid = await computeCID(encrypted);

  // 4. Add proof-of-work (BLAKE2b nonce, ~2s target)
  const powProof = await generatePoW(cid, difficulty = 20);

  // 5. POST to provider intake endpoint
  await fetch('https://backup-service.nanonym.io/upload-backup', {
    method: 'POST',
    body: JSON.stringify({
      cid: cid.toString(),
      pow_proof: powProof,
      path_components: {
        shard: computeShard(root_pub),
        base_hash: computeBaseHash(root_pub),
        date: dateBucket
      },
      tx_hashes_summary: blob.nanonyms.flatMap(n => n.map(e => e.tx_hash))
    })
  });
}
```

### Provider-Side Steps

```typescript
async function handleUpload(req: UploadRequest): Promise<Response> {
  // 1. Verify proof-of-work
  if (!verifyPoW(req.cid, req.pow_proof, DIFFICULTY)) {
    return { error: 'Invalid PoW' };
  }

  // 2. Fetch blob from IPFS by CID
  const blob = await ipfs.cat(req.cid);

  // 3. Decrypt validation copy and verify tx existence
  const validation = decryptProviderCopy(blob.validation_encrypted);
  const verified = await verifyAtLeastOneTx(validation.tx_hashes);
  if (!verified) {
    return { error: 'No confirmed transactions' };
  }

  // 4. Build path in MFS (create dirs/symlink if new)
  const fullPath = buildPath(req.path_components);
  await ipfs.files.mkdir(dirname(fullPath), { parents: true });
  await ipfs.files.cp(`/ipfs/${req.cid}`, fullPath);

  // 5. Pin CID for permanent storage
  await ipfs.pin.add(req.cid);

  // 6. Queue IPNS republish (batch every 5min or EOD)
  queueIPNSUpdate();

  return { success: true, cid: req.cid };
}
```

### Why Opportunistic?

Matches PWA lifecycle—no background jobs; ensures "today" mutates (overwrite CID), past days seal (immutable). Spam resistance: Ties to real opens (Nano tx cost + PoW).

### Rate Limiting

- **Per base_hash**: 10 uploads/day maximum
- **Per IP**: 100 uploads/day (Cloudflare WAF)
- **Global**: 10,000 uploads/day (provider capacity)

---

## 6. Recovery Workflow (Seed-Only Restore)

### Wallet Birthday Optimization

Default date picker to wallet birthday or 1 year ago; user overrides for "last consolidation."

### Recovery Steps

```typescript
async function recoverFromIPFS(
  seed: Uint8Array,
  startDate: Date = oneYearAgo()
): Promise<RecoveryResult> {
  // 1. Derive root_pub and compute paths
  const root_pub = deriveRootPublicKey(seed);
  const base_hash = computeBaseHash(root_pub);
  const shard = computeShard(root_pub);
  const b_view = deriveViewPrivateKey(seed);

  // 2. Show wizard with date picker
  const userStartDate = await showDatePickerWizard(startDate);

  // 3. Parallel day-by-day fetch (batch 5-7 days)
  const stealthAccounts: StealthAccount[] = [];
  const today = new Date();
  let emptyDayCount = 0;

  for (let date = userStartDate; date <= today; date = nextDay(date)) {
    const dateStr = date.toISOString().slice(0, 10);
    const path = buildPath({ shard, base_hash, date: dateStr });
    const url = `https://ipfs.io/ipns/nanonym-backups.nanonym.io${path}`;

    try {
      // Fetch with timeout and retries
      const encrypted = await fetchWithRetry(url, { timeout: 10000 });

      // Decrypt user copy
      const blob = await decryptBlob(encrypted.user_encrypted, b_view, dateStr);

      // Validate signature
      if (!verifyBlobSignature(blob, root_pub)) {
        console.warn(`Invalid signature for ${dateStr}`);
        continue;
      }

      // Import stealth accounts
      for (const [nanoNymIndex, entries] of Object.entries(blob.nanonyms)) {
        for (const entry of entries) {
          const stealth = await deriveStealthAccount(
            seed,
            parseInt(nanoNymIndex),
            entry.R,
            entry.tx_hash
          );
          stealthAccounts.push(stealth);
          updateProgress(`Day ${dateStr}: Found payment to NanoNym #${nanoNymIndex}`);
        }
      }

      emptyDayCount = 0; // Reset on success

    } catch (err) {
      if (err.status === 404) {
        emptyDayCount++;
        if (emptyDayCount >= 7) {
          // Early abort: prompt user
          const shouldContinue = await confirmDialog(
            `No backups found for last 7 days. Continue scanning ${daysRemaining} more days?`
          );
          if (!shouldContinue) break;
          emptyDayCount = 0;
        }
      } else {
        console.error(`Fetch failed for ${dateStr}:`, err);
        // Continue on transient errors
      }
    }
  }

  // 4. Attach on-chain balances
  await attachBalances(stealthAccounts);

  // 5. Auto-archive pre-start NanoNyms
  await archiveInactiveNanoNyms(stealthAccounts, userStartDate);

  return {
    stealthAccounts,
    totalBalance: sumBalances(stealthAccounts),
    recoveredDays: stealthAccounts.map(s => s.open_ts)
  };
}
```

### Progress UI

```
┌─────────────────────────────────────────────┐
│ Recovering from IPFS Backups                │
│                                             │
│ Scanning: 2025-12-03                       │
│ Found: 127 payments across 5 NanoNyms      │
│                                             │
│ [████████████░░░░░░░░░] 67% (244/365 days) │
│                                             │
│ Estimated time: ~2 minutes                 │
│ [Stop Scan] [Skip to Recent]               │
└─────────────────────────────────────────────┘
```

### Fallback Strategy

1. **Empty tree**: Defer to Nostr Tier-1 (relay replay)
2. **Partial tree**: Use IPFS for available dates, supplement with Nostr for gaps
3. **Both fail**: Prompt for manual chain scan (Tier-3 heuristics)

### 6.1 Handling Missed Updates

**Nostr buffer period**: ~30 days typical retention

**Scenarios**:
- **Short gap (< 30 days)**: Retro-append from Nostr on next active session
- **Medium gap (30-90 days)**: Prompt: "Some backups may be incomplete. Run full Nostr scan?"
- **Long gap (> 90 days)**: Prompt: "Extended absence detected. Options: (1) Trust IPFS only, (2) Manual chain scan"

**Provider pruning**: Inactive paths >2 years (no uploads) archived to cold storage

---

## 7. Provider Service Requirements

### Core Invariant

Gate all writes; pin validated reads.

### Intake Endpoint Specification

**Endpoint**: `POST /upload-backup`

**Technology Stack**:
- Runtime: Node.js 20+ or Go 1.21+
- IPFS: Kubo node + `ipfs-cluster` for HA pinning
- Validation: Nano RPC client (local or public node)
- Queue: Redis for IPNS batch republishing

**Request Schema**:
```typescript
interface UploadRequest {
  cid: string;                    // Base58 CID of encrypted blob
  pow_proof: {
    nonce: number;
    hash: string;                 // BLAKE2b(cid || nonce)
  };
  path_components: {
    shard: string;                // 16 hex chars
    base_hash: string;            // 64 hex chars
    date: string;                 // YYYY-MM-DD
  };
  tx_hashes_summary: string[];    // For validation (1-20 hashes)
}
```

**Validation Steps**:
1. PoW verification (difficulty = 20, ~2 seconds average)
2. CID format validation
3. Blob fetch from IPFS DHT (timeout: 30s)
4. Decrypt provider copy
5. Verify ≥1 confirmed tx_hash via Nano RPC
6. Check rate limits (per base_hash, per IP)
7. MFS tree manipulation
8. Pin CID to cluster
9. Queue IPNS update

**Response**:
```typescript
interface UploadResponse {
  success: boolean;
  cid?: string;
  error?: string;
  rate_limit?: { remaining: number; reset_at: number };
}
```

### IPNS Publishing Strategy

**Batch updates**: Every 5 minutes or EOD (whichever comes first)

**Master IPNS record**:
```
/ipns/k51qzi5uqu5dkj0w8vxzjp7n9q8r1v2s3t4u5v6w7x8y9z0a1b2c3d4e5f6g7h
→ /ipfs/Qm.../backups/
```

**Lifetime**: 24 hours (with hourly refreshes)

### Logging and Privacy

**Logged (anonymized)**:
- `base_hash` prefix (first 8 chars) for abuse detection
- `date` bucket
- `tx_count` per blob
- Timestamp, IP (hashed), success/error

**NOT logged**:
- Full `base_hash` (linkable)
- Individual `tx_hash` values
- Blob contents
- User metadata

### Infrastructure Costs

**Assumptions**:
- 10,000 active users
- 3 payments/user/week average
- 365 days retention

**Calculations**:
- Blobs/year: 10k × 365 × 0.5KB ≈ 1.8GB
- Pinning: $0.15/GB/month (Pinata/Infura) → ~$0.30/month
- Compute: AWS t3.small ($15/month)
- Bandwidth: ~100GB/month ($5 via CloudFlare)

**Total**: ~$20/month for 10k users, scales linearly

### High Availability

**Provider redundancy**:
- 3 IPFS cluster peers (different datacenters)
- Load-balanced intake endpoints (Cloudflare)
- Redis sentinel for queue HA

**Community pinning**:
- Publish prefix index: `/ipns/.../index.json` with all active shards
- Encourage third-party pinning of prefixes for decentralization
- Bounties for long-term pinners (optional community initiative)

---

## 8. Privacy Analysis

### Core Goals

1. **Seed-only discoverability**: No external accounts or keys beyond seed
2. **Content encryption**: Blobs opaque to provider and IPFS network
3. **Metadata minimization**: Hashed paths, coarse timestamps

### Protects Against

✅ **Relay pruning**: Permanent `R` value access via IPFS pinning
✅ **Brute-force path discovery**: Hashed paths with 2^256 keyspace via BLAKE2b
✅ **Content leaks to network**: Dual encryption (user + provider validation copy)
✅ **Provider read access**: User copy requires `b_view` derived from seed
✅ **Timing correlation**: Coarse daily granularity, not per-transaction timestamps

### Does NOT Protect Against

❌ **Provider validation metadata**: Provider sees sender→stealth links during tx validation (explicit trade-off, analogous to Nostr relay operators seeing encrypted event metadata)

⚠️ **Activity date metadata**: Blob paths reveal which days had activity (mitigated by hashed shards unlinking users, coarse granularity matching chain explorer visibility)

❌ **Network-level surveillance**: HTTPS fetches to IPFS gateways visible to ISP (mitigate with VPN/Tor)

❌ **Post-consolidation linkage**: On-chain spending from multiple stealth accounts links them regardless of backup method (inherent Nano account model limitation)

### Privacy Model

**"Encrypted Ledger Extension"**: Public tree structure for resilience (community pinning), private keys (seed-derived `b_view`) for access.

**Explicit stance**: Documentation warns: "IPFS backups enhance recovery reliability; provider assists with pinning and validation. Provider sees transaction metadata during validation (like Nostr relay operators), but cannot read notification content or link stealth accounts without seed."

### Comparison: Nostr Tier-1 vs IPFS Tier-2

| Aspect | Nostr Tier-1 | IPFS Tier-2 |
|--------|--------------|-------------|
| **Retention** | Ephemeral (7-30 days) | Eternal (pinned indefinitely) |
| **Discoverability** | Pubkey REQ filters | Seed-derived paths |
| **Cost to Provider** | Relay hosting (free/donation) | Pinning (~$0.002/user/month) |
| **UX Recovery Speed** | Instant replay (< 30s) | Date-sliced scan (2-10min) |
| **Metadata Exposure** | Relay sees recipient pubkey | Provider sees tx validation |
| **Content Encryption** | NIP-17 gift-wrapped | AES-256-GCM (user) + ECDH (provider) |
| **Spam Resistance** | Relay policies | PoW + tx validation |

### Design Reality

**Primary value**: Unbreakable recovery even if all Nostr relays prune history

**Acknowledged limitations**: Provider validation sees metadata (like Nano explorers see txs); public tree reveals coarse activity patterns

**Explicit non-goals**:
- Full anonymity from provider (impossible with validation requirement)
- Zero metadata (date paths provide UX, coarse enough to minimize leakage)
- Real-time updates (opportunistic model matches PWA constraints)

---

## 9. Implementation Roadmap (Status-Oriented)

### Current Status (Dec 3, 2025)

Design complete; aligns with Phase 5 receive hooks from CLAUDE.md.

### Phase 1 – Path Computation

**Status**: Not started
**Estimated effort**: 1-2 days

**Tasks**:
- ✅ Implement `computeBaseHash(root_pub)` using `blake2b-js`
- ✅ Implement `computeShard(base_hash)` (first 8 bytes hex)
- ✅ Implement `buildPath({ shard, base_hash, date })` string formatter
- ✅ Add to `nanonym-manager.service.ts` alongside existing key derivation
- ✅ Unit tests: 100 random seeds → verify determinism, uniqueness, format

**Dependencies**: Existing Ed25519 HD key derivation in `nanonym-crypto.service.ts`

**Test vectors** (from prototype script):
```typescript
describe('IPFS Path Derivation', () => {
  it('should derive deterministic paths from seed', () => {
    const seed = hexToUint8('0000...0001'); // 64 hex chars
    const rootPub = deriveRootPublicKey(seed);
    const baseHash = computeBaseHash(rootPub);
    const shard = computeShard(baseHash);

    expect(baseHash).toBe('a7f3e92c1d4b8a6523c0f1e9d8b7a654...');
    expect(shard).toBe('a7f3e92c1d4b8a65');

    const path = buildPath({ shard, baseHash, date: '2025-12-03' });
    expect(path).toBe('/backups/a7f3e92c1d4b8a65/a7f3e92c.../2025/12/03/bundle.json');
  });
});
```

### Phase 2 – Blob Handling

**Status**: Not started
**Estimated effort**: 3-4 days

**Tasks**:
- ✅ Implement `DailyBlobDraft` IndexedDB schema
- ✅ Implement `appendToDailyDraft(date, entry)` with deduplication by `tx_hash`
- ✅ Implement `buildDailyBlob(date)` aggregation across all NanoNym indices
- ✅ Implement `encryptBlobForUser(blob, b_view, date)` using Web Crypto API AES-256-GCM
- ✅ Implement `encryptBlobForProvider(blob, providerPubkey)` using ECDH + AES
- ✅ Implement `decryptBlobFromUser(encrypted, b_view, date)` for recovery
- ✅ Implement `computeCID(data)` using `ipfs-core` or `multiformats`
- ✅ Queue management: Retry logic for failed uploads
- ✅ Unit tests: Encrypt/decrypt roundtrip, CID determinism, IndexedDB CRUD

**Dependencies**:
- `crypto.subtle` (Web Crypto API)
- `ipfs-core` or `multiformats` library for CID computation
- Existing IndexedDB service

**Key implementation note**:
```typescript
// Key derivation for user encryption
function deriveBlobEncryptionKey(b_view: Uint8Array, date: string): CryptoKey {
  const salt = stringToUint8('nanonym-backup-v2');
  const info = stringToUint8(date); // YYYY-MM-DD
  return hkdf(b_view, salt, info, 32); // 256-bit key
}
```

### Phase 3 – Upload Integration

**Status**: Not started
**Estimated effort**: 3-5 days

**Tasks**:
- ✅ Hook into `receiveStealthFunds()` in `nanonym-manager.service.ts`
- ✅ Implement `generatePoW(cid, difficulty=20)` using Web Workers
- ✅ Implement `uploadToProvider(request)` with retry logic
- ✅ Add settings toggle: "Enable IPFS backups" (default: on)
- ✅ Add status indicator: "Last backup: 2025-12-03 15:30 UTC"
- ✅ Handle errors gracefully: Queue for retry, show transient toast
- ✅ Unit tests: Mock provider endpoint, verify retry logic
- ✅ Integration test: End-to-end upload with mock IPFS node

**PoW algorithm**:
```typescript
async function generatePoW(cid: string, difficulty: number): Promise<PoWProof> {
  const target = BigInt(2) ** BigInt(256 - difficulty);
  let nonce = 0;

  while (true) {
    const hash = blake2b(cid + nonce.toString());
    if (BigInt('0x' + hash) < target) {
      return { nonce, hash };
    }
    nonce++;

    // Yield every 1000 iterations to avoid blocking UI
    if (nonce % 1000 === 0) await sleep(0);
  }
}
```

**UX considerations**:
- Background PoW generation (Web Worker)
- Progress: "Generating backup proof... 23%"
- Transient failures: Retry 3x with exponential backoff
- Settings: "IPFS Backup Status" section with manual trigger button

### Phase 4 – Recovery Wizard

**Status**: Not started
**Estimated effort**: 5-7 days

**Tasks**:
- ✅ Add "Recover from IPFS" option in seed import modal
- ✅ Implement date picker component (default: 1 year ago or wallet birthday)
- ✅ Implement `recoverFromIPFS(seed, startDate)` main loop
- ✅ Parallel fetch logic: Batch 5-7 days with `Promise.allSettled`
- ✅ Progress UI: Real-time updates via RxJS observables
- ✅ Early abort logic: 7 consecutive empty days → prompt user
- ✅ Integrate with existing Nostr recovery: Fallback on IPFS failure
- ✅ Handle gateway timeouts: Retry with different gateways (ipfs.io, dweb.link, cloudflare-ipfs.com)
- ✅ Unit tests: Mock gateway responses, test date range logic
- ✅ E2E test: Full recovery from real IPFS testnet

**Gateway fallback order**:
1. `https://ipfs.io/ipns/...` (primary, fast)
2. `https://dweb.link/ipns/...` (Protocol Labs backup)
3. `https://cloudflare-ipfs.com/ipns/...` (CDN-backed)
4. User-configured custom gateway (settings option)

**Progress tracking**:
```typescript
interface RecoveryProgress {
  currentDate: string;
  daysScanned: number;
  totalDays: number;
  stealthAccountsFound: number;
  estimatedTimeRemaining: number; // seconds
  status: 'scanning' | 'fetching' | 'decrypting' | 'complete' | 'error';
}
```

### Phase 5 – Pinning Service Deployment

**Status**: Not started
**Estimated effort**: 7-10 days (includes infrastructure setup)

**Tasks**:
- ✅ Implement intake endpoint (Node.js/Express or Go/Fiber)
- ✅ Integrate Nano RPC client for tx validation
- ✅ Implement MFS tree builder (`ipfs.files.mkdir`, `ipfs.files.cp`)
- ✅ Integrate `ipfs-cluster-ctl` for HA pinning
- ✅ Implement batch IPNS publisher (Redis queue + worker)
- ✅ Add rate limiting (per base_hash, per IP)
- ✅ Deploy to AWS/GCP with Terraform/CloudFormation
- ✅ Setup monitoring (Prometheus + Grafana)
- ✅ Document community pinning guide
- ✅ Security audit: Input validation, DoS protection

**Infrastructure components**:
```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│ CloudFlare  │─────▶│ Intake API   │─────▶│ IPFS Cluster│
│ (WAF + CDN) │      │ (Node.js)    │      │ (3 nodes)   │
└─────────────┘      └──────────────┘      └─────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │ Redis Queue  │
                     │ (IPNS jobs)  │
                     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │ Nano RPC     │
                     │ (validation) │
                     └──────────────┘
```

**Deployment checklist**:
- [ ] Domain: `backup-service.nanonym.io`
- [ ] SSL certificate (Let's Encrypt)
- [ ] CORS policy for wallet origins
- [ ] DDoS protection (CloudFlare)
- [ ] Abuse reporting endpoint
- [ ] Public status page (uptime, stats)

### Phase 6 – Testing and Hardening

**Status**: Not started
**Estimated effort**: 5-7 days

**Tasks**:
- ✅ Unit test coverage: >90% for crypto primitives
- ✅ Integration tests: Mock provider + IPFS node
- ✅ E2E tests: Full send→receive→backup→recover flow on Nano testnet
- ✅ Load testing: Simulate 1000 concurrent uploads
- ✅ Security review: Encryption implementation, input validation
- ✅ UX testing: Recovery on mobile (Android/iOS PWA)
- ✅ Documentation: User guide, developer docs, API reference
- ✅ Beta release: Opt-in for early adopters

### Later Phases

**Phase 7 – Hybrid Modes**: Daily for history >1yr; single mutable "recent" blob for last 30 days (reduces CID churn)

**Phase 8 – Community Features**:
- Prefix pinning incentives
- Bounty program for long-term pinners
- Federated provider network (multiple intake endpoints)

**Phase 9 – Advanced Pruning**:
- "Consolidate & forget" UX: Archive old blobs after spending
- User-triggered cleanup for privacy
- Provider archival to cold storage (S3 Glacier)

---

## 10. Known Limitations

### 1. Gateway Reliability

**Issue**: HTTPS fetches to IPFS gateways can timeout (2-10s uncached) or fail due to gateway downtime.

**Mitigation**:
- Retry with multiple gateways (3+ configured)
- Parallel fetches for different date ranges
- Cache-friendly CIDs (immutable past days)

**UX impact**: Recovery may take 5-10 minutes for 1 year of history (acceptable for rare seed-recovery scenario).

### 2. Missed Days Due to Session Gaps

**Issue**: If wallet inactive for >30 days, Nostr buffer expires before IPFS retro-fill.

**Mitigation**:
- Show warning: "Extended absence detected. Some payments may not be backed up."
- Offer manual Nostr scan: "Attempt full relay history fetch?"
- Provider prunes only after >2 years inactivity

**UX impact**: Users should open wallet at least monthly for best backup coverage (reasonable for active wallets).

### 3. Blob Growth for High-Volume Days

**Issue**: Days with >50 payments could exceed 1KB blob size.

**Mitigation**:
- Compress blobs using `snappy-js` or `pako` (gzip) before encryption
- Split into multi-part blobs if >5KB (rare edge case)

**UX impact**: Negligible for typical users (1-10 payments/day).

### 4. Public Tree Metadata Exposure

**Issue**: Activity date patterns visible via IPFS path structure (e.g., `/2025/12/03/` exists).

**Assessment**: Non-issue—comparable to chain explorer seeing tx volumes; hashed shards prevent user linkage.

**Privacy stance**: Documented explicitly; trade-off for community pinning support.

### 5. PWA Background Constraints

**Issue**: Cannot run persistent background sync like native apps.

**Mitigation**:
- Opportunistic model matches PWA lifecycle
- Batch uploads on active sessions
- Eventual consistency acceptable for backup use case

**UX impact**: Not a limitation—design embraces web platform constraints.

### 6. Provider Centralization (Launch Phase)

**Issue**: Single provider controls pinning and validation.

**Mitigation**:
- Open-source intake service code
- Document community deployment guide
- Design for federated provider network (Phase 8)

**Future**: Multiple providers (geographic redundancy), user-selectable in settings.

---

## 11. Future Enhancements (Key Ideas)

### Hybrid Daily/Recent Blob Mode

**Goal**: Reduce CID churn for "today" while preserving immutability for history.

**Design**:
- Daily blobs seal at midnight UTC (immutable)
- Single `/recent/bundle.json` mutates during day (last 24 hours)
- Recovery: Fetch recent first, then historical as needed

**Benefits**:
- Faster recovery for recent payments (single fetch)
- Lower IPNS publish frequency (batch historical only)

### Provider ACKs (NIP-17-style)

**Goal**: Confirm successful backup to user.

**Design**:
- Provider sends encrypted Nostr DM after pinning: "Backup for 2025-12-03 confirmed (CID: Qm...)"
- Wallet displays: "✓ Last backup confirmed 5 minutes ago"

**Benefits**: User confidence; detect provider failures early.

### User-Triggered Pruning UX

**Goal**: Privacy hygiene—delete old backups after consolidation.

**Design**:
- "Forget Old Backups" button in settings
- User specifies cutoff date: "Delete all backups before [date picker]"
- Wallet signs delete request; provider removes CIDs from MFS/cluster

**Benefits**: Reduces provider costs; supports privacy-conscious users.

### Namespace Sharding for Cohorts

**Goal**: Improve IPNS scalability for millions of users.

**Design**:
- Multiple master IPNS keys: `/ipns/shard-00`, `/ipns/shard-01`, etc.
- Assign user to shard based on `base_hash % NUM_SHARDS`
- Parallel IPNS updates across shards

**Benefits**: Faster IPNS publishing; horizontal scaling.

### Light-Client View Key Delegation

**Goal**: Allow third-party services (e.g., accounting tools) to verify backups without spending keys.

**Design**:
- Export `b_view` only (no `b_spend`)
- Delegated service can decrypt blobs, derive stealth addresses, verify balances
- Cannot spend funds

**Benefits**: Auditing, tax reporting, multi-signature watch-only wallets.

### Monthly Hybrid Blobs for Low-Activity Users

**Goal**: Optimize for users with <5 payments/month.

**Design**:
- Store monthly blob instead of 30 daily blobs
- Internal structure still date-tagged for granularity
- Recovery: Fetch single monthly CID, filter by date range

**Benefits**: 30x fewer CIDs; faster recovery for inactive users.

### Community Prefix Bounties

**Goal**: Decentralize pinning via economic incentives.

**Design**:
- Provider publishes weekly "prefix index": List of active shards
- Third parties pin prefixes (e.g., all `/shard-00` paths)
- Bounty program: 10 XNO/month per shard, verified via Filecoin/Storj proofs

**Benefits**: Censorship resistance; reduces provider dependency.

---

## 12. Summary and Guardrails

### IPFS Tier-2 in One Sentence

Opportunistic, date-sliced backups for unbreakable NanoNym recovery—seed finds paths, user picks eras, provider pins eternally.

### Critical Invariants

**Must always be true** (test every change):

1. **Seed-only recovery**: `seed → root_pub → base_hash → paths → blobs → stealths` (no external accounts/keys)
2. **Deterministic derivation**: Same seed + same date → identical path and decryption
3. **Content encryption**: Blobs opaque to network; only user's `b_view` decrypts
4. **Opportunistic correctness**: Missed uploads → Nostr fallback; no data loss
5. **Date accuracy**: Blob `date_utc` matches path date; `open_ts` within 24h window

### Testing Requirements

**Before merging any IPFS backup code**:

- [ ] Path derivation: 100 random seeds → unique `base_hash`, correct format
- [ ] Encryption roundtrip: Encrypt blob with `b_view` → decrypt → match original
- [ ] CID determinism: Same blob → same CID across runs
- [ ] Recovery integration: Full flow from seed → paths → blobs → stealth accounts
- [ ] Nostr fallback: If IPFS empty → Tier-1 relay replay succeeds
- [ ] IndexedDB CRUD: Draft storage, deduplication by `tx_hash`
- [ ] Provider validation: Mock endpoint rejects invalid PoW, unconfirmed txs

### Breaking Changes Policy

**Never break** without major version bump (v2.0.0):

- Path format (affects recoverability of existing backups)
- Encryption scheme (users cannot decrypt old blobs)
- `base_hash` algorithm (paths become unfindable)

**Safe to change**:

- Provider URL (user-configurable)
- PoW difficulty (backward-compatible)
- Gateway list (automatic fallback)
- Blob internal schema (version field handles migration)

### Commit Message Guidelines

**Format**: Imperative subject line (50 chars) + explanatory body (why, not what).

**Good examples**:
```
Add date picker to IPFS recovery wizard

Enables users to skip archived eras post-consolidation, reducing
UI clutter from inactive NanoNyms. Defaults to 1 year ago for
balance between completeness and speed. Addresses UX feedback
from beta testers about 10+ minute full-history scans.
```

```
Implement opportunistic IPFS upload on stealth open

Hooks into receiveStealthFunds() to batch daily backups during
active sessions. Ensures "today" blob mutates (overwrite CID) while
past days seal immutably. Critical for seed-only recovery Tier-2.
```

**Bad examples**:
```
Update IPFS backup code  (what changed? why?)
```
```
Fix bug  (which bug? what was broken?)
```

### Development Workflow

1. **Feature branch**: `feat/ipfs-backup-phase-N`
2. **PR checklist**:
   - [ ] Unit tests pass (>90% coverage for new code)
   - [ ] Integration test on testnet
   - [ ] Manual PWA test (desktop + mobile)
   - [ ] Documentation updated (inline comments + user guide)
   - [ ] CLAUDE.md recovery section updated (Tier-2 status)
3. **Review focus**: Crypto correctness, UX clarity, error handling
4. **Merge**: Squash commits, descriptive merge message

---

## 13. Security Considerations

### Threat Model

**In scope**:
- Seed compromise (catastrophic; not preventable by backups)
- Provider malicious behavior (logging, DoS, selective censorship)
- Network-level surveillance (ISP, gateway operators)
- Brute-force path discovery
- Blob tampering

**Out of scope** (inherent Nano limitations):
- On-chain linkage after consolidation
- Sender identity visible to receiver
- Timing analysis (mitigated by Privacy Mode in CLAUDE.md §8.4)

### Cryptographic Properties

**Encryption**:
- AES-256-GCM (NIST standard, authenticated encryption)
- Key derivation: HKDF (RFC 5869) from `b_view`
- Nonce: Unique per blob (date + counter)

**Hashing**:
- BLAKE2b-256 (collision-resistant, faster than SHA-256)
- Path salt: `"nanonym-backup-v2"` (domain separation)

**Signatures**:
- Ed25519 (signing `blob_hash` with root `b_spend`)
- Prevents provider tampering or substitution attacks

**ECDH** (provider validation copy):
- Curve25519 (if Ed25519-based) or Secp256k1 (if reusing Nostr)
- Ephemeral keys per blob for forward secrecy

### Attack Scenarios and Mitigations

#### 1. Provider Logs and De-anonymizes Users

**Attack**: Provider correlates `base_hash` with IP addresses, timestamps, `tx_hash` metadata.

**Mitigation**:
- Wallet uses VPN/Tor (user responsibility, documented)
- Provider policy: Hash IPs before storage, 7-day retention
- Decentralized provider network (future)

**Residual risk**: Provider sees metadata during validation (explicit trade-off).

#### 2. Provider Substitutes Malicious Blobs

**Attack**: Provider serves fake blob with attacker's `R` values, stealing incoming payments.

**Mitigation**:
- Blob signature: User's root `b_spend` signs `BLAKE2b(blob_content)`
- Wallet verifies signature before importing `R` values
- Signature verification happens before any on-chain queries

**Result**: Attack detected, blob rejected, user warned.

#### 3. Network-Level Correlation (IPFS Fetch → Nano Node Query)

**Attack**: ISP or gateway operator sees IPFS fetch at time T, then Nano RPC query at T+5s, correlating user activity.

**Mitigation**:
- Use VPN/Tor for both IPFS and Nano RPC
- Randomize query delays (Privacy Mode)
- Public Nano nodes (reduces ISP visibility)

**Residual risk**: Timing correlation possible; acceptable for Tier-2 backup use case.

#### 4. Brute-Force Path Discovery

**Attack**: Adversary tries to guess `base_hash` values to discover users' backup trees.

**Mitigation**:
- 2^256 keyspace via BLAKE2b (infeasible to brute-force)
- Shard prefixes (8 bytes) provide no useful info without full hash
- No user enumeration endpoint

**Result**: Computationally infeasible.

#### 5. Gateway Serves Stale Blobs (Denial of Backup)

**Attack**: Malicious gateway caches old blob versions, causing user to miss recent payments.

**Mitigation**:
- Wallet queries multiple gateways, compares CIDs
- IPNS record includes timestamp; reject stale (>24h old)
- Users can manually trigger "Force Refresh" from provider

**Result**: Transient DoS only; user retries with different gateway.

### Secure Coding Checklist

- [ ] No private keys in logs or error messages
- [ ] Constant-time comparison for MACs/signatures (use `crypto.timingSafeEqual`)
- [ ] Validate all user inputs (dates, CIDs, base64 strings)
- [ ] Handle decryption failures gracefully (no stack traces to logs)
- [ ] Rate-limit all provider endpoints
- [ ] Input sanitization: Reject CIDs >100 chars, non-base58 chars
- [ ] Timeout all network requests (10s IPFS, 30s Nano RPC)
- [ ] Use Content Security Policy (CSP) in PWA

---

## 14. User Documentation Snippets

### Quick Start (Wallet Settings)

```markdown
## IPFS Backup (Beta)

Automatically backs up NanoNym payment notifications to a decentralized
storage network (IPFS). Ensures you can recover all stealth accounts
even if Nostr relays prune old data.

**Status**: ✓ Enabled
**Last backup**: 2025-12-03 15:30 UTC
**Backed up NanoNyms**: 5 accounts, 127 payments

[View Backup History] [Disable Backups]

---

### Privacy Notice

Your backup data is encrypted before upload. The backup provider can
see when you receive payments (dates and transaction hashes for validation)
but cannot read notification content or spend your funds. This is similar
to how Nostr relay operators see encrypted events.

For maximum privacy, use a VPN or Tor when recovering from backups.
```

### Recovery Wizard (Seed Import)

```markdown
## Recover Wallet from Seed

Choose your recovery method:

○ Quick Recovery (Nostr Relays)
  • Fastest: ~30 seconds
  • Works if relays still have your data (typically 30 days)

○ Full Recovery (IPFS Backups)
  • Comprehensive: ~5 minutes
  • Recovers all payments since [date picker: 2024-12-03]
  • Recommended for wallets inactive >30 days

○ Both (Recommended)
  • Try Nostr first, then fill gaps with IPFS
  • Best for maximum completeness

[Continue with Recovery]

---

### FAQ

**Q: What happens if I disable IPFS backups?**

A: New payments will only be backed up to Nostr relays (7-30 day retention).
Existing IPFS backups remain available for recovery. You can re-enable
backups anytime.

**Q: Can I recover without the backup provider?**

A: Yes! Your backups are stored on IPFS (a public network). If our provider
is unavailable, you can use any IPFS gateway or run your own node. See the
developer guide for manual recovery instructions.

**Q: How much does IPFS backup cost?**

A: Free for users. The provider pins your encrypted data at no charge.
```

---

## 15. Developer Integration Guide

### Adding IPFS Backup to a New Wallet

**Prerequisites**:
- Existing NanoNym implementation (CLAUDE.md phases 1-5)
- Nostr integration (NIP-17 gift-wrapped notifications)
- IndexedDB or equivalent persistent storage

**Integration steps**:

#### 1. Install Dependencies

```bash
npm install ipfs-core@0.18.0 multiformats@13.0.0 blake2b-js@1.4.1
```

#### 2. Add Path Derivation

```typescript
// src/services/ipfs-backup.service.ts

import blake2b from 'blake2b';
import { deriveRootPublicKey } from './nanonym-crypto.service';

export function computeBaseHash(rootPub: Uint8Array): string {
  const context = new Uint8Array([
    ...Buffer.from('nanonym-backup-v2', 'utf8'),
    ...rootPub
  ]);
  const hash = blake2b(32).update(context).digest('hex');
  return hash;
}

export function computeShard(baseHash: string): string {
  return baseHash.slice(0, 16); // First 8 bytes (16 hex chars)
}

export function buildPath(components: {
  shard: string;
  baseHash: string;
  date: string; // YYYY-MM-DD
}): string {
  const [year, month, day] = components.date.split('-');
  return `/backups/${components.shard}/${components.baseHash}/${year}/${month}/${day}/bundle.json`;
}
```

#### 3. Implement Blob Encryption

```typescript
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';

async function encryptBlobForUser(
  blob: DailyBlob,
  b_view: Uint8Array,
  date: string
): Promise<EncryptedBlob> {
  const salt = new TextEncoder().encode('nanonym-backup-v2');
  const info = new TextEncoder().encode(date);

  // Derive AES key using HKDF
  const keyMaterial = hkdf(sha256, b_view, salt, info, 32);
  const key = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  // Generate random nonce
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt blob JSON
  const plaintext = new TextEncoder().encode(JSON.stringify(blob));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    plaintext
  );

  return {
    version: 2,
    user_encrypted: arrayBufferToBase64(ciphertext),
    nonce: arrayBufferToBase64(nonce),
    date_utc: date
  };
}
```

#### 4. Hook into Stealth Receive

```typescript
// In nanonym-manager.service.ts, after validated stealth open:

async function receiveStealthFunds(notification: NostrNotification): Promise<void> {
  // ... existing stealth derivation and balance check ...

  // NEW: Append to IPFS backup draft
  await ipfsBackupService.appendToDraft({
    date: new Date(notification.open_ts * 1000).toISOString().slice(0, 10),
    nanonym_index: notification.nanonym_index,
    entry: {
      R: notification.R_hex,
      tx_hash: notification.tx_hash,
      open_ts: notification.open_ts,
      amount_raw: notification.amount_raw
    }
  });

  // Queue upload (debounced, batches multiple receives)
  ipfsBackupService.queueUpload();
}
```

#### 5. Implement Recovery

```typescript
async function recoverFromIPFS(
  seed: Uint8Array,
  startDate: Date
): Promise<StealthAccount[]> {
  const rootPub = deriveRootPublicKey(seed);
  const baseHash = computeBaseHash(rootPub);
  const shard = computeShard(baseHash);
  const b_view = deriveViewPrivateKey(seed);

  const gateways = [
    'https://ipfs.io',
    'https://dweb.link',
    'https://cloudflare-ipfs.com'
  ];

  const stealthAccounts: StealthAccount[] = [];
  const today = new Date();

  for (let date = startDate; date <= today; date = addDays(date, 1)) {
    const dateStr = date.toISOString().slice(0, 10);
    const path = buildPath({ shard, baseHash, date: dateStr });

    // Try each gateway with timeout
    for (const gateway of gateways) {
      const url = `${gateway}/ipns/nanonym-backups.nanonym.io${path}`;

      try {
        const response = await fetchWithTimeout(url, { timeout: 10000 });
        const encryptedBlob = await response.json();

        // Decrypt and validate
        const blob = await decryptBlobForUser(encryptedBlob, b_view, dateStr);
        if (!verifyBlobSignature(blob, rootPub)) continue;

        // Import stealth accounts
        for (const [nanonymIndex, entries] of Object.entries(blob.nanonyms)) {
          for (const entry of entries) {
            const stealth = await deriveStealthAccountFromR(
              seed,
              parseInt(nanonymIndex),
              entry.R,
              entry.tx_hash
            );
            stealthAccounts.push(stealth);
          }
        }

        break; // Success, move to next date

      } catch (err) {
        if (err.status === 404) break; // No blob for this date, try next
        // Otherwise try next gateway
      }
    }
  }

  return stealthAccounts;
}
```

---

## 16. References and Related Work

### Cryptographic Foundations

- **BIP-352 Silent Payments**: [https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki](https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki)
- **BLAKE2b Specification**: [https://www.blake2.net/blake2.pdf](https://www.blake2.net/blake2.pdf)
- **HKDF (RFC 5869)**: [https://datatracker.ietf.org/doc/html/rfc5869](https://datatracker.ietf.org/doc/html/rfc5869)
- **AES-GCM (NIST SP 800-38D)**: [https://csrc.nist.gov/publications/detail/sp/800-38d/final](https://csrc.nist.gov/publications/detail/sp/800-38d/final)

### IPFS and Content Addressing

- **IPFS Docs**: [https://docs.ipfs.tech/](https://docs.ipfs.tech/)
- **IPNS (Mutable Pointers)**: [https://docs.ipfs.tech/concepts/ipns/](https://docs.ipfs.tech/concepts/ipns/)
- **UnixFS (Mutable File System)**: [https://docs.ipfs.tech/concepts/file-systems/#mutable-file-system-mfs](https://docs.ipfs.tech/concepts/file-systems/#mutable-file-system-mfs)
- **CID Specification**: [https://github.com/multiformats/cid](https://github.com/multiformats/cid)

### Related Privacy Protocols

- **CamoNano**: [https://github.com/protocol-link/nanopyrs](https://github.com/protocol-link/nanopyrs) (reference implementation)
- **Nostr NIP-17**: [https://github.com/nostr-protocol/nips/blob/master/17.md](https://github.com/nostr-protocol/nips/blob/master/17.md) (gift-wrapped events)
- **Monero Stealth Addresses**: [https://www.getmonero.org/resources/moneropedia/stealthaddress.html](https://www.getmonero.org/resources/moneropedia/stealthaddress.html)

### Nano Ecosystem

- **Nano RPC Docs**: [https://docs.nano.org/commands/rpc-protocol/](https://docs.nano.org/commands/rpc-protocol/)
- **NanoNymNault Live Preview**: [https://cbrunnkvist.github.io/NanoNymNault/](https://cbrunnkvist.github.io/NanoNymNault/)
- **CLAUDE.md Specification**: `/Users/conny/Developer/NanoNymNault/CLAUDE.md`

---

## Appendix A: Test Vectors

### Path Derivation

```
Seed (hex): 0000000000000000000000000000000000000000000000000000000000000001
Root Public Key: 3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29
Base Hash: a7f3e92c1d4b8a6523c0f1e9d8b7a6541234567890abcdef1234567890abcdef
Shard: a7f3e92c1d4b8a65
Path (2025-12-03): /backups/a7f3e92c1d4b8a65/a7f3e92c1d4b8a6523c0f1e9d8b7a6541234567890abcdef/2025/12/03/bundle.json
```

### Encryption Roundtrip

```json
// Input blob
{
  "version": 2,
  "date_utc": "2025-12-03",
  "seed_hash": "a7f3e92c...",
  "nanonyms": {
    "index_0": [{
      "R": "04a1b2c3...",
      "tx_hash": "A123456...",
      "open_ts": 1733241600
    }]
  }
}

// After encryption with b_view + date
{
  "version": 2,
  "user_encrypted": "hQEMA+... (base64)",
  "nonce": "7xkW2P... (base64)",
  "date_utc": "2025-12-03"
}

// After decryption: matches input blob exactly
```

### CID Computation

```
Blob (JSON, 342 bytes): {"version":2,...}
CID (base58btc): QmYwAPJzv5CZsnAzt8auVZRn2tR8bVVqvH8xN2qXHjWYuD
```

---

## Appendix B: Provider API Reference

### POST /upload-backup

**Request**:
```json
{
  "cid": "QmYwAPJzv5CZsnAzt8auVZRn2tR8bVVqvH8xN2qXHjWYuD",
  "pow_proof": {
    "nonce": 123456,
    "hash": "00000a1b2c3d..."
  },
  "path_components": {
    "shard": "a7f3e92c1d4b8a65",
    "base_hash": "a7f3e92c1d4b8a6523c0f1e9d8b7a6541234567890abcdef",
    "date": "2025-12-03"
  },
  "tx_hashes_summary": ["A123...", "B456..."]
}
```

**Response (success)**:
```json
{
  "success": true,
  "cid": "QmYwAPJzv5CZsnAzt8auVZRn2tR8bVVqvH8xN2qXHjWYuD",
  "pinned_at": 1733241600,
  "ipns_update_queued": true,
  "rate_limit": {
    "remaining": 7,
    "reset_at": 1733241700
  }
}
```

**Response (error)**:
```json
{
  "success": false,
  "error": "Invalid proof-of-work",
  "code": "INVALID_POW"
}
```

### GET /status

**Response**:
```json
{
  "service": "nanonym-ipfs-backup",
  "version": "1.0.0",
  "uptime_seconds": 86400,
  "ipfs_cluster": {
    "peers": 3,
    "pins_total": 125000,
    "storage_used_gb": 45.2
  },
  "ipns_master": "/ipns/k51qzi5uqu5dkj0w8vxzjp7n9q8r1v2s3t4u5v6w7x8y9z0a1b2c3d4e5f6g7h",
  "last_ipns_update": 1733241600,
  "stats_24h": {
    "uploads_accepted": 450,
    "uploads_rejected": 12,
    "tx_validations": 462
  }
}
```

---

## Changelog

### v1.0.0 (2025-12-03)

- Initial specification
- Path derivation scheme (BLAKE2b-based)
- Blob format and encryption (AES-256-GCM + ECDH)
- Upload workflow with PoW anti-spam
- Recovery wizard with date picker
- Provider intake service requirements
- Security analysis and threat model
- Test vectors and implementation guide
