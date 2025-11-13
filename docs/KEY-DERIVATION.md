# NanoNym Key Derivation Architecture

## Overview

This document describes the cryptographic key derivation architecture for NanoNymNault, covering both current implementation (Nano-first) and future plans (Nostr-first with identity preservation).

---

## Critical Cryptographic Constraint

**Nano and Nostr use different elliptic curves that cannot be securely converted:**

- **Nano:** Ed25519 (Edwards curve)
- **Nostr:** Secp256k1 (Bitcoin's curve, via NIP-06)

**Consequence:** Cannot derive Nano keys from Nostr nsec, or vice versa, in a cryptographically secure and standardized way.

**Solution:** Support parallel seed management with versioned address formats.

---

## Version 1: Nano-First (Current Implementation)

### Architecture

```
═══════════════════════════════════════════════════════════════
                    NANO-FIRST FLOW (Version 1)
═══════════════════════════════════════════════════════════════

   User enters Nano seed (BIP-39 24 words)
              ↓
   ┌──────────────────────────────────────┐
   │   Nano Seed Derivation Engine        │
   │   Path: m/44'/165'/0'/1000'/N'/T     │
   │   Method: BLAKE2b-based (Ed25519)    │
   └──────────────────────────────────────┘
              ↓
         ┌────┴────┬────────┬──────────┐
         ↓         ↓        ↓          ↓
    T=0: b_spend  T=1: b_view  T=2: nostr_private
    (Ed25519)     (Ed25519)    (Ed25519→Nostr)
         │          │            │
         ↓          ↓            ↓
    B_spend ──→ B_view ──→ nostr_public
         │          │            │
         └──────────┴────────────┘
                    ↓
            ┌───────────────┐
            │  nnym_v1_...  │
            │  99 bytes:    │
            │  - B_spend    │
            │  - B_view     │
            │  - nostr_pub  │
            │  - checksum   │
            └───────────────┘
                    ↓
        ✅ Single seed backup recovers ALL keys
```

### Derivation Path Details

**BIP-44 Style Path:**
```
m / 44' / 165' / 0' / 1000' / <account_index>' / <key_type>

Where:
  44'            = BIP-44 standard (hardened)
  165'           = Nano coin type (hardened)
  0'             = Account 0 (hardened)
  1000'          = NanoNym namespace (hardened)
  <account_index>' = NanoNym account (0, 1, 2, ...) (hardened)
  <key_type>     = 0: spend, 1: view, 2: nostr (non-hardened)
```

**Key Derivation Method:**
- Uses BLAKE2b hash-based derivation (not BIP-32 secp256k1)
- Produces Ed25519 keys for all three key types
- Nostr key is Ed25519, used in Nostr context (note: non-standard for Nostr)

### User Experience

**Backup:** Single 24-word Nano seed  
**Recovery:** Deterministic - restore seed, recover all NanoNyms  
**Simplicity:** ★★★★★ (Excellent - one seed does everything)

### Use Cases

- Privacy-focused Nano users
- Merchants wanting unlinkable payment addresses
- Users new to both Nano and Nostr
- Anyone who values simplicity

---

## Version 2: Nostr-First (Future - Planned)

### Architecture

```
═══════════════════════════════════════════════════════════════
                    NOSTR-FIRST FLOW (Version 2)
═══════════════════════════════════════════════════════════════

   User has existing Nostr nsec (from NIP-06)
              ↓
   ┌──────────────────────────────────────┐
   │   NIP-06 Standard Derivation         │
   │   Path: m/44'/1237'/N'/0/0           │
   │   Method: BIP-32 secp256k1           │
   └──────────────────────────────────────┘
              ↓
         nostr_private (Secp256k1)
              ↓
         nostr_public ────────────────────┐
                                          │
   User generates/imports Nano seed       │
              ↓                           │
   ┌──────────────────────────────────┐  │
   │   Nano Seed Derivation           │  │
   │   Path: m/44'/165'/0'/1000'/N'/T │  │
   │   Method: BLAKE2b (Ed25519)      │  │
   └──────────────────────────────────┘  │
              ↓                           │
         ┌────┴────┐                      │
         ↓         ↓                      │
    T=0: b_spend  T=1: b_view             │
    (Ed25519)     (Ed25519)               │
         │          │                     │
         ↓          ↓                     │
    B_spend ──→ B_view                    │
         │          │                     │
         └──────────┴─────────────────────┘
                    ↓
            ┌───────────────┐
            │  nnym_v2_...  │
            │  100 bytes:   │
            │  - B_spend    │
            │  - B_view     │
            │  - nostr_pub  │  ← External key!
            │  - flags      │  ← Bit 0 = 1
            │  - checksum   │
            └───────────────┘
                    ↓
        ⚠️  TWO seed backup required:
            1. Nostr nsec (original identity)
            2. Nano seed (payment keys)
```

### v2 Address Format

**Structure (100 bytes):**
```
Byte 0:       Version (0x02)
Bytes 1-32:   B_spend (Ed25519 public key)
Bytes 33-64:  B_view (Ed25519 public key)
Bytes 65-96:  nostr_public (Secp256k1 public key)
Byte 97:      Flags:
              - Bit 0: external_nostr_key (1 = external, 0 = derived)
              - Bits 1-7: Reserved
Bytes 98-99:  Checksum (BLAKE2b-5, first 2 bytes)
```

**Flag Interpretation:**
- `external_nostr_key = 0`: Nostr key derived from Nano seed (v1 behavior)
- `external_nostr_key = 1`: Nostr key is independent (v2 Nostr-first)

### User Experience

**Backup:** TWO seeds (Nostr nsec + Nano seed)  
**Recovery:** Must restore both seeds correctly  
**Simplicity:** ★★★☆☆ (Moderate - dual seed management)

### Use Cases

- Existing Nostr users who want to preserve their identity
- NanoZap integration in Nostr clients
- Users who already have established Nostr presence
- Advanced users comfortable with multi-seed management

---

## Cryptographic Security Analysis

### Why Can't We Cross-Derive?

**Ed25519 and Secp256k1 are fundamentally incompatible:**

1. **Different mathematical groups**
   - Ed25519: Twisted Edwards curve with order 2^252 + 27742317777372353535851937790883648493
   - Secp256k1: Koblitz curve with order 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141

2. **Different operations**
   - Ed25519: Point addition uses Edwards curve formulas
   - Secp256k1: Point addition uses short Weierstrass formulas

3. **No standard conversion**
   - Point conversion would require mapping between incompatible groups
   - Hash-based conversion breaks HD wallet security model
   - Custom conversion = non-standard = security risk

**Attempted workarounds and why they fail:**

❌ **Hash Derivation:** `hash(secp256k1_key) → ed25519_seed`
- Breaks BIP-32 security assumptions
- Non-recoverable (one-way transformation)
- No way to prove mathematical soundness

❌ **Coordinate Conversion:** Convert curve points directly
- Mathematically undefined (different curve equations)
- Would require arbitrary mapping = security vulnerability

✅ **Parallel Seeds:** Keep separate, combine at address level
- Maintains standard derivation paths
- Each protocol uses its native curve
- Clear backup/recovery model

---

## User Interface Guidelines

### NanoNymNault Wallet (Nano-First)

**DO:**
- ✅ Generate Nano seed (24 words)
- ✅ Derive all keys from Nano seed
- ✅ Display Nostr notification keys (read-only in settings)
- ✅ Clear messaging: "One seed, full backup"
- ✅ Use v1 address format

**DON'T:**
- ❌ Ask user for Nostr nsec input
- ❌ Import external Nostr identities
- ❌ Attempt to derive Nostr keys differently
- ❌ Use v2 address format

**Target Users:** Privacy-focused Nano users, new users, simplicity seekers

---

### Future Nostr Client Integration (Nostr-First)

**DO:**
- ✅ Use existing Nostr nsec (NIP-06 standard)
- ✅ Prompt: "Generate new Nano seed or import existing?"
- ✅ Store both seeds securely
- ✅ Clear messaging: "Two seeds required for full backup"
- ✅ Use v2 address format with external_nostr_key flag

**DON'T:**
- ❌ Try to derive Nostr keys from Nano seed (breaks NIP-06)
- ❌ Hide the dual-seed requirement from users
- ❌ Allow mixing v1 and v2 in same context
- ❌ Promise single-seed recovery for v2

**Target Users:** Existing Nostr users, NanoZap recipients, advanced users

---

## Backup and Recovery Strategies

### Version 1 (Nano-First)

**Backup Process:**
1. Write down 24-word Nano seed
2. Store securely (paper, metal, encrypted digital)
3. Test recovery on separate device

**Recovery Process:**
1. Enter 24-word seed
2. Wallet automatically derives:
   - All Nano spend keys
   - All Nano view keys
   - All Nostr notification keys
3. Scan Nostr relays for historical notifications
4. Detect all past payments

**Recovery Time:** Minutes (depends on notification history)

---

### Version 2 (Nostr-First)

**Backup Process:**
1. Write down Nostr nsec (12 or 24 words, per NIP-06)
2. Write down Nano seed (24 words)
3. Label clearly: "Nostr identity" and "Nano payments"
4. Store both securely
5. Test recovery on separate device

**Recovery Process:**
1. Enter Nostr nsec → restores Nostr identity
2. Enter Nano seed → restores Nano payment keys
3. Wallet reconstructs nnym_v2 addresses
4. Scan Nostr relays using restored Nostr key
5. Detect all past payments

**Recovery Time:** Minutes (depends on notification history)

**Failure Modes:**
- Lost Nostr nsec: Cannot monitor for new payments (old payments recoverable if Nano seed intact)
- Lost Nano seed: Cannot spend received funds (can see notifications if Nostr nsec intact)

---

## Migration Path

### For Early Adopters (v1 Users)

**No forced migration:**
- v1 addresses remain valid forever
- Can continue using single Nano seed
- Can generate new v2 addresses if desired (requires new Nostr identity)

**Optional upgrade to v2:**
1. Generate fresh Nostr identity (NIP-06)
2. Create new v2 NanoNym with external key
3. Publish new address
4. Keep old v1 addresses working in parallel

---

## Address Stability Guarantee

**Critical Property:** Changing derivation path = different address

**Version 1 addresses will NEVER change:**
- Same Nano seed + same account index = same nnym_v1 address
- Forever stable, forever recoverable
- No breaking changes to derivation path

**Version 2 addresses:**
- Same Nano seed + same Nostr nsec + same account index = same nnym_v2 address
- Stable as long as both seeds are preserved
- Independent versioning from v1

---

## Implementation Status

### ✅ Completed (Phase 1)

- [x] v1 key derivation (Nano seed → all keys)
- [x] nnym_v1 address encoding/decoding
- [x] Unit tests for v1 cryptography
- [x] Documentation of v1 architecture

### 🔜 Planned (Phase 2+)

- [ ] v2 address format specification
- [ ] Dual-seed management system
- [ ] nnym_v2 encoding/decoding
- [ ] Migration tooling (v1 → v2 optional)
- [ ] Nostr client integration with NIP-06 support

---

## Security Considerations

### Threat Model

**Protected Against:**
- ✅ Seed compromise: Standard BIP-39 security
- ✅ Cross-derivation attacks: N/A (we don't attempt it)
- ✅ Key confusion: Clear separation of v1 and v2

**User Responsibilities:**
- Secure seed storage (both seeds for v2)
- Verify backup before funding
- Understand recovery requirements

### Audit Recommendations

**Before mainnet launch:**
1. Third-party cryptographic review of derivation paths
2. Verify BIP-44 compliance for Nano keys
3. Verify NIP-06 compliance for Nostr keys (v2)
4. Test recovery scenarios exhaustively
5. User testing: backup and recovery workflows

---

## FAQ

**Q: Why not use a single seed for everything?**  
A: Ed25519 (Nano) and Secp256k1 (Nostr) are mathematically incompatible. Secure cross-derivation is not possible.

**Q: Can I use my existing Nostr identity in NanoNymNault wallet?**  
A: No. NanoNymNault is Nano-first and derives Nostr keys internally. For existing Nostr identity preservation, wait for v2 in Nostr client integrations.

**Q: Will v1 addresses become obsolete?**  
A: No. v1 addresses are permanent and will always work. v2 is an additional option, not a replacement.

**Q: Can I convert a v1 address to v2?**  
A: No. They use different key material. You can create a new v2 address and migrate funds manually.

**Q: Is the dual-seed requirement in v2 a security weakness?**  
A: No. It's a consequence of supporting both protocols with their native curves. Each seed is secured independently.

---

## References

- **BIP-39:** Mnemonic seed phrases
- **BIP-44:** HD wallet derivation paths
- **NIP-06:** Nostr key derivation from mnemonic
- **Ed25519:** Nano's elliptic curve (RFC 8032)
- **Secp256k1:** Nostr/Bitcoin's elliptic curve
- **BLAKE2b:** Nano's hash function

---

*Document Version: 1.0*  
*Last Updated: 2025-11-13*  
*Status: Living Document*
