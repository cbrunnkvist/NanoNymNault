import { Injectable } from "@angular/core";
import * as bip39 from "bip39";
import { blake2b } from "blakejs";
import * as nacl from "tweetnacl";
import { UtilService } from "./util.service";
import { ed25519, edwardsToMontgomeryPub } from "@noble/curves/ed25519";
import { bytesToHex } from "@noble/curves/abstract/utils";
import { getPublicKey as getSecpPublicKey } from "@noble/secp256k1";
import { sha512 } from "@noble/hashes/sha512";

/**
 * NanoNymCryptoService
 *
 * Implements cryptographic operations for NanoNym privacy protocol:
 * - Multi-account key derivation (BIP-32 style paths)
 * - ECDH shared secret generation
 * - Stealth address derivation
 * - nnym_ address encoding/decoding
 *
 * Based on CLAUDE.md specification.
 */
@Injectable({
  providedIn: "root",
})
export class NanoNymCryptoService {
  constructor(private util: UtilService) {}

  /**
   * Derive NanoNym keys from master seed using BIP-44 style path:
   * m/44'/165'/0'/1000'/<account_index>'/0 → b_spend
   * m/44'/165'/0'/1000'/<account_index>'/1 → b_view
   * m/44'/165'/0'/1000'/<account_index>'/2 → nostr_private
   *
   * @param seed - Master seed (BIP-39 mnemonic or raw bytes)
   * @param accountIndex - NanoNym account index (0, 1, 2, ...)
   * @returns Object containing key pairs for spend, view, and nostr
   */
  deriveNanoNymKeys(
    seed: string | Uint8Array,
    accountIndex: number,
  ): {
    spend: { private: Uint8Array; public: Uint8Array };
    view: { private: Uint8Array; public: Uint8Array };
    nostr: { private: Uint8Array; public: Uint8Array };
  } {
    // Convert seed to bytes if needed
    let seedBytes: Uint8Array;
    if (typeof seed === "string") {
      // Check if it's a 64-character hex string (32 bytes)
      if (/^[0-9A-Fa-f]{64}$/.test(seed)) {
        // Hex seed - convert directly to bytes
        seedBytes = this.util.hex.toUint8(seed);
      } else {
        // BIP-39 mnemonic - convert using BIP-39 derivation
        seedBytes = new Uint8Array(bip39.mnemonicToSeedSync(seed));
      }
    } else {
      seedBytes = seed;
    }

    // Derive keys using BIP-44 style path
    // Path: m/44'/165'/0'/1000'/<account_index>'/<key_type>
    // Note: We use BLAKE2b-based derivation since we're in Ed25519 context

    const basePath = this.uint32ToBytes(44 | 0x80000000) // 44'
      .concat(this.uint32ToBytes(165 | 0x80000000)) // 165' (Nano)
      .concat(this.uint32ToBytes(0 | 0x80000000)) // 0'
      .concat(this.uint32ToBytes(1000 | 0x80000000)) // 1000' (NanoNym)
      .concat(this.uint32ToBytes(accountIndex | 0x80000000)); // account_index'

    console.debug(`[Derivation] NanoNym keys for index ${accountIndex} (BIP-44 style with BLAKE2b):`);
    console.debug(`  → Spend:  m/44'/165'/0'/1000'/${accountIndex}'/0`);
    console.debug(`  → View:   m/44'/165'/0'/1000'/${accountIndex}'/1`);
    console.debug(`  → Nostr:  m/44'/165'/0'/1000'/${accountIndex}'/2 (Secp256k1)`);

    // Derive spend key (key_type = 0)
    const spendSeed = this.deriveChildKey(
      seedBytes,
      basePath.concat(this.uint32ToBytes(0)),
    );
    const spendKeyPair = this.blake2bKeyPairFromSeed(spendSeed);

    // Derive view key (key_type = 1)
    const viewSeed = this.deriveChildKey(
      seedBytes,
      basePath.concat(this.uint32ToBytes(1)),
    );
    const viewKeyPair = this.blake2bKeyPairFromSeed(viewSeed);

    // Derive Nostr key (key_type = 2)
    const nostrSeed = this.deriveChildKey(
      seedBytes,
      basePath.concat(this.uint32ToBytes(2)),
    );
    // This seed is not a valid private key. Hash it to get a private key.
    // Using blake2b to be consistent with the rest of the derivation.
    const nostrPrivateKey = new Uint8Array(blake2b(nostrSeed, undefined, 32));

    // Derive the public key (x-only, 32 bytes)
    const nostrFullPublicKey = getSecpPublicKey(nostrPrivateKey, true); // Get compressed public key (33 bytes)
    const nostrPublicKey = nostrFullPublicKey.slice(1); // Get the 32-byte x-coordinate

    return {
      spend: {
        private: spendKeyPair.private,
        public: spendKeyPair.public,
      },
      view: {
        private: viewKeyPair.private,
        public: viewKeyPair.public,
      },
      nostr: {
        private: nostrPrivateKey,
        public: nostrPublicKey,
      },
    };
  }

  /**
   * Derive a child key from parent seed using BLAKE2b-based key derivation
   *
   * @param parentSeed - Parent seed bytes
   * @param path - Derivation path as byte array
   * @returns Derived 32-byte seed
   */
  private deriveChildKey(parentSeed: Uint8Array, path: number[]): Uint8Array {
    // Concatenate parent seed with path
    const data = new Uint8Array(parentSeed.length + path.length);
    data.set(parentSeed, 0);
    data.set(new Uint8Array(path), parentSeed.length);

    // Hash with BLAKE2b to derive child seed
    const hash = blake2b(data, undefined, 32);
    return new Uint8Array(hash);
  }

  /**
   * Convert uint32 to 4-byte array (big-endian)
   */
  private uint32ToBytes(value: number): number[] {
    return [
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    ];
  }

  /**
   * Generate ECDH shared secret using Ed25519 directly (CamoNano style)
   * Matches nanopyrs: (scalar * EdwardsPoint).compress()
   *
   * @param privateKey - Private key as scalar (32 bytes)
   * @param publicKey - Public key as Ed25519 point (32 bytes)
   * @returns Shared secret (32 bytes compressed point)
   */
  generateSharedSecret(
    privateKey: Uint8Array,
    publicKey: Uint8Array,
  ): Uint8Array {
    // CamoNano ECDH: (scalar * EdwardsPoint).compress()
    // Convert seed/private key to scalar using blake2b_scalar process
    // This matches CamoNano's scalar derivation (BLAKE2b-512, clamp, reduce mod L)
    const scalarBytes = this.blake2bToScalar(privateKey);
    const scalar = this.bytesToBigIntLE(scalarBytes);

    // Convert public key bytes to Ed25519 point
    const point = ed25519.ExtendedPoint.fromHex(bytesToHex(publicKey));

    // Compute scalar * point
    const result = point.multiply(scalar);

    // Compress and return bytes (this is the shared secret)
    return result.toRawBytes();
  }

  /**
   * Convert Ed25519 private key to Curve25519 private key
   * Uses nanocurrency-web's conversion logic
   */
  private ed25519PrivateToX25519(ed25519Private: Uint8Array): Uint8Array {
    // Hash the 32-byte seed with BLAKE2b to get the scalar
    const hash = blake2b(ed25519Private, undefined, 64);
    const scalar = new Uint8Array(hash.slice(0, 32));

    // Clamp the scalar for Curve25519
    scalar[0] &= 248;
    scalar[31] &= 127;
    scalar[31] |= 64;

    return scalar;
  }

  /**
   * Convert input to Ed25519 scalar (matches nanopyrs blake2b_scalar)
   * Process: BLAKE2b-512 -> take first 32 bytes -> clamp -> reduce mod L
   *
   * @param input - Input bytes to hash
   * @returns Ed25519 scalar as 32-byte array
   */
  private blake2bToScalar(input: Uint8Array): Uint8Array {
    // Step 1: Hash with BLAKE2b-512 (64 bytes)
    const hash64 = blake2b(input, undefined, 64);
    const hash32 = new Uint8Array(hash64).slice(0, 32);

    // Step 2: Clamp the bytes (Ed25519 clamping)
    // Clear bits 0, 1, 2, and 255
    // Set bit 254
    const clamped = new Uint8Array(hash32);
    clamped[0] &= 248; // Clear bits 0, 1, 2
    clamped[31] &= 127; // Clear bit 255
    clamped[31] |= 64; // Set bit 254

    // Step 3: Reduce modulo L (Ed25519 group order)
    // L = 2^252 + 27742317777372353535851937790883648493
    const L = BigInt(
      "0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed",
    );
    const scalar = this.bytesToBigIntLE(clamped);
    const reduced = scalar % L;

    return this.bigIntToBytesLE(reduced, 32);
  }

  /**
   * Reduce a 64-byte hash to a scalar mod L without clamping
   * Used for EdDSA r and k computation (RFC 8032)
   * Clamping is only for seed-derived scalars, not for hash-based scalars like r and k
   *
   * @param hash64 - 64-byte hash output
   * @returns 32-byte scalar reduced mod L
   */
  private hashToScalarModL(hash64: Uint8Array): Uint8Array {
    // RFC 8032: interpret hash as little-endian integer and reduce mod L
    // NO clamping - that's only for seed-derived scalars
    const L = BigInt(
      "0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed",
    );
    const hashInt = this.bytesToBigIntLE(hash64);
    const reduced = hashInt % L;
    return this.bigIntToBytesLE(reduced, 32);
  }

  /**
   * Derive Ed25519 keypair from seed using Blake2b (CamoNano compatible)
   * Matches nanopyrs key derivation: scalar = blake2b_scalar(seed), public = scalar * G
   *
   * @param seed - 32-byte seed
   * @returns Keypair with private (seed) and public (32 bytes) keys
   */
  private blake2bKeyPairFromSeed(seed: Uint8Array): {
    private: Uint8Array;
    public: Uint8Array;
  } {
    // Derive scalar from seed using blake2b_scalar
    const scalarBytes = this.blake2bToScalar(seed);
    const scalar = this.bytesToBigIntLE(scalarBytes);

    // Compute public key: scalar * G
    const publicPoint = ed25519.ExtendedPoint.BASE.multiply(scalar);
    const publicKey = publicPoint.toRawBytes();

    return {
      private: seed, // Keep seed as private key (will convert to scalar when needed)
      public: publicKey,
    };
  }

  /**
   * Derive stealth address from shared secret and recipient's spend key
   *
   * @param sharedSecret - ECDH shared secret
   * @param ephemeralPublic - Sender's ephemeral public key (R)
   * @param recipientSpendPublic - Recipient's spend public key (B_spend)
   * @returns One-time stealth address (as Nano address string)
   */
  deriveStealthAddress(
    sharedSecret: Uint8Array,
    ephemeralPublic: Uint8Array,
    recipientSpendPublic: Uint8Array,
  ): { publicKey: Uint8Array; address: string } {
    // Compute tweak scalar using CamoNano's get_account_scalar(secret, 0):
    // 1. Concatenate shared_secret || account_index (0 as 4 bytes big-endian)
    // 2. Hash with BLAKE2b-256 to get "account_seed"
    // 3. Convert account_seed to scalar using blake2b_scalar
    const accountIndex = new Uint8Array(4); // [0, 0, 0, 0]
    accountIndex[0] = 0; // Big-endian uint32 = 0
    const accountSeedInput = new Uint8Array(sharedSecret.length + 4);
    accountSeedInput.set(sharedSecret, 0);
    accountSeedInput.set(accountIndex, sharedSecret.length);

    const accountSeed = blake2b(accountSeedInput, undefined, 32);
    const tweakScalar = this.blake2bToScalar(new Uint8Array(accountSeed));

    console.log('[DEBUG deriveStealthAddress] sharedSecret:', bytesToHex(sharedSecret));
    console.log('[DEBUG deriveStealthAddress] ephemeralPublic:', bytesToHex(ephemeralPublic));
    console.log('[DEBUG deriveStealthAddress] recipientSpendPublic:', bytesToHex(recipientSpendPublic));
    console.log('[DEBUG deriveStealthAddress] accountSeed:', bytesToHex(new Uint8Array(accountSeed)));
    console.log('[DEBUG deriveStealthAddress] tweakScalar:', bytesToHex(tweakScalar));

    // Compute stealth address: P_masked = B_spend + (t * G)
    // Step 1: Compute t * G (scalar multiply base point)
    const tweakPoint = ed25519.ExtendedPoint.BASE.multiply(
      this.bytesToBigIntLE(tweakScalar),
    ).toRawBytes();

    console.log('[DEBUG deriveStealthAddress] tweakPoint (t*G):', bytesToHex(tweakPoint));

    // Step 2: Add B_spend + tweakPoint
    const stealthPublicKey = this.ed25519PointAdd(
      recipientSpendPublic,
      tweakPoint,
    );

    console.log('[DEBUG deriveStealthAddress] stealthPublicKey:', bytesToHex(stealthPublicKey));

    // Convert to Nano address using util service
    const stealthAddress = this.util.account.getPublicAccountID(
      stealthPublicKey,
      "nano",
    );

    console.log('[DEBUG deriveStealthAddress] stealthAddress:', stealthAddress);

    return {
      publicKey: stealthPublicKey,
      address: stealthAddress,
    };
  }

  /**
   * Add two Ed25519 points using proper elliptic curve arithmetic
   * Uses @noble/ed25519 for cryptographically correct point addition
   *
   * @param point1 - First Ed25519 point (32 bytes)
   * @param point2 - Second Ed25519 point (32 bytes)
   * @returns Sum of the two points (32 bytes)
   */
  private ed25519PointAdd(point1: Uint8Array, point2: Uint8Array): Uint8Array {
    // Convert compressed points to ExtendedPoint and add
    const p1 = ed25519.ExtendedPoint.fromHex(bytesToHex(point1));
    const p2 = ed25519.ExtendedPoint.fromHex(bytesToHex(point2));
    const sum = p1.add(p2);

    // Convert back to compressed 32-byte representation
    return sum.toRawBytes();
  }

  /**
   * Add two scalars modulo Ed25519 group order l
   * l = 2^252 + 27742317777372353535851937790883648493
   *
   * @param scalar1 - First scalar (32 bytes)
   * @param scalar2 - Second scalar (32 bytes)
   * @returns (scalar1 + scalar2) mod l (32 bytes)
   */
  private ed25519ScalarAdd(
    scalar1: Uint8Array,
    scalar2: Uint8Array,
  ): Uint8Array {
    // Ed25519 group order (little-endian)
    const L = BigInt(
      "0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed",
    );

    // Convert scalars from little-endian bytes to BigInt
    const s1 = this.bytesToBigIntLE(scalar1);
    const s2 = this.bytesToBigIntLE(scalar2);

    // Add and reduce modulo L
    const sum = (s1 + s2) % L;

    // Convert back to 32-byte little-endian representation
    return this.bigIntToBytesLE(sum, 32);
  }

  /**
   * Convert little-endian bytes to BigInt
   */
  private bytesToBigIntLE(bytes: Uint8Array): bigint {
    let result = BigInt(0);
    for (let i = 0; i < bytes.length; i++) {
      result += BigInt(bytes[i]) << BigInt(i * 8);
    }
    return result;
  }

  /**
   * Convert BigInt to little-endian bytes
   */
  private bigIntToBytesLE(value: bigint, length: number): Uint8Array {
    const result = new Uint8Array(length);
    let v = value;
    for (let i = 0; i < length; i++) {
      result[i] = Number(v & BigInt(0xff));
      v = v >> BigInt(8);
    }
    return result;
  }

  /**
   * Derive private key for spending from stealth address
   * Receiver uses this to compute: p_masked = b_spend + t (mod l)
   *
   * @param spendPrivate - Recipient's spend private key (b_spend) - 32 bytes
   * @param sharedSecret - ECDH shared secret
   * @param ephemeralPublic - Sender's ephemeral public key (R)
   * @param spendPublic - Recipient's spend public key (B_spend)
   * @returns Private key for stealth address (32 bytes)
   */
  deriveStealthPrivateKey(
    spendPrivate: Uint8Array,
    sharedSecret: Uint8Array,
    ephemeralPublic: Uint8Array,
    spendPublic: Uint8Array,
  ): Uint8Array {
    // Compute tweak scalar using SAME process as deriveStealthAddress:
    // 1. Concatenate shared_secret || account_index (0 as 4 bytes big-endian)
    // 2. Hash with BLAKE2b-256 to get "account_seed"
    // 3. Convert account_seed to scalar using blake2b_scalar
    const accountIndex = new Uint8Array(4); // [0, 0, 0, 0]
    accountIndex[0] = 0; // Big-endian uint32 = 0
    const accountSeedInput = new Uint8Array(sharedSecret.length + 4);
    accountSeedInput.set(sharedSecret, 0);
    accountSeedInput.set(accountIndex, sharedSecret.length);

    const accountSeed = blake2b(accountSeedInput, undefined, 32);
    const tweakScalar = this.blake2bToScalar(new Uint8Array(accountSeed));

    console.log('[DEBUG deriveStealthPrivateKey] sharedSecret:', bytesToHex(sharedSecret));
    console.log('[DEBUG deriveStealthPrivateKey] ephemeralPublic:', bytesToHex(ephemeralPublic));
    console.log('[DEBUG deriveStealthPrivateKey] spendPublic:', bytesToHex(spendPublic));
    console.log('[DEBUG deriveStealthPrivateKey] accountSeed:', bytesToHex(new Uint8Array(accountSeed)));
    console.log('[DEBUG deriveStealthPrivateKey] tweakScalar:', bytesToHex(tweakScalar));
    console.log('[DEBUG deriveStealthPrivateKey] spendPrivate (seed):', bytesToHex(spendPrivate));

    // Convert spend private SEED to SCALAR first (CamoNano uses blake2b_scalar)
    const spendPrivateScalar = this.blake2bToScalar(spendPrivate);
    console.log('[DEBUG deriveStealthPrivateKey] spendPrivateScalar:', bytesToHex(spendPrivateScalar));

    // Compute private key: p_masked = b_spend + t (mod l)
    const stealthPrivate = this.ed25519ScalarAdd(spendPrivateScalar, tweakScalar);

    console.log('[DEBUG deriveStealthPrivateKey] stealthPrivate (b_spend + t):', bytesToHex(stealthPrivate));

    return stealthPrivate;
  }

  /**
   * Encode NanoNym address in nnym_ format
   *
   * Format: nnym_<base32_encoded_data>
   * Data (99 bytes):
   *   - Byte 0: Version (0x01)
   *   - Bytes 1-32: B_spend (32 bytes)
   *   - Bytes 33-64: B_view (32 bytes)
   *   - Bytes 65-96: nostr_public (32 bytes)
   *   - Bytes 97-98: Checksum (first 2 bytes of BLAKE2b-5)
   *
   * @param spendPublic - Spend public key (32 bytes)
   * @param viewPublic - View public key (32 bytes)
   * @param nostrPublic - Nostr public key (32 bytes)
   * @returns nnym_ address string (~160 characters)
   */
  encodeNanoNymAddress(
    spendPublic: Uint8Array,
    viewPublic: Uint8Array,
    nostrPublic: Uint8Array,
  ): string {
    // Build data structure
    const data = new Uint8Array(99);

    // Byte 0: Version
    data[0] = 0x01;

    // Bytes 1-32: B_spend
    data.set(spendPublic, 1);

    // Bytes 33-64: B_view
    data.set(viewPublic, 33);

    // Bytes 65-96: nostr_public
    data.set(nostrPublic, 65);

    // Bytes 97-98: Checksum (first 2 bytes of BLAKE2b-5)
    const checksumHash = blake2b(data.slice(0, 97), undefined, 5);
    data.set(checksumHash.slice(0, 2), 97);

    // Encode to base32 using Nano's alphabet
    const base32 = this.encodeNanoBase32(data);

    return "nnym_" + base32;
  }

  /**
   * Decode NanoNym address from nnym_ format
   *
   * @param nnymAddress - nnym_ address string
   * @returns Object containing spend, view, and nostr public keys
   * @throws Error if address is invalid
   */
  decodeNanoNymAddress(nnymAddress: string): {
    version: number;
    spendPublic: Uint8Array;
    viewPublic: Uint8Array;
    nostrPublic: Uint8Array;
  } {
    console.log("[NanoNymCrypto] Decoding NanoNym address:", nnymAddress);

    // Validate prefix
    if (!nnymAddress.startsWith("nnym_")) {
      throw new Error("Invalid NanoNym address: must start with nnym_");
    }

    // Extract base32 part
    const base32 = nnymAddress.slice(5);

    // Decode from base32
    const data = this.decodeNanoBase32(base32);

    // Validate length
    if (data.length !== 99) {
      throw new Error(
        `Invalid NanoNym address: expected 99 bytes, got ${data.length}`,
      );
    }

    // Validate version
    const version = data[0];
    if (version !== 0x01) {
      throw new Error(`Unsupported NanoNym version: ${version} (expected 1)`);
    }

    // Verify checksum
    const checksumHash = blake2b(data.slice(0, 97), undefined, 5);
    const expectedChecksum = checksumHash.slice(0, 2);
    const actualChecksum = data.slice(97, 99);

    if (!this.arraysEqual(expectedChecksum, actualChecksum)) {
      throw new Error("Invalid NanoNym address: checksum mismatch");
    }

    // Extract keys
    const spendPublic = data.slice(1, 33);
    const viewPublic = data.slice(33, 65);
    const nostrPublic = data.slice(65, 97);

    console.log("[NanoNymCrypto] Extracted keys from address:");
    console.log(
      "  - Spend public (hex):",
      Array.from(spendPublic)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    );
    console.log(
      "  - View public (hex):",
      Array.from(viewPublic)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    );
    console.log(
      "  - Nostr public (hex):",
      Array.from(nostrPublic)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    );

    return {
      version,
      spendPublic,
      viewPublic,
      nostrPublic,
    };
  }

  /**
   * Encode bytes to Nano's base32 alphabet
   * Uses the same alphabet as standard Nano addresses
   */
  private encodeNanoBase32(data: Uint8Array): string {
    const alphabet = "13456789abcdefghijkmnopqrstuwxyz";
    let bits = 0;
    let value = 0;
    let output = "";

    for (let i = 0; i < data.length; i++) {
      value = (value << 8) | data[i];
      bits += 8;

      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += alphabet[(value << (5 - bits)) & 31];
    }

    return output;
  }

  /**
   * Decode Nano's base32 alphabet to bytes
   */
  private decodeNanoBase32(encoded: string): Uint8Array {
    const alphabet = "13456789abcdefghijkmnopqrstuwxyz";
    const lookup: { [key: string]: number } = {};

    for (let i = 0; i < alphabet.length; i++) {
      lookup[alphabet[i]] = i;
    }

    let bits = 0;
    let value = 0;
    let index = 0;
    const output = new Uint8Array(Math.ceil((encoded.length * 5) / 8));

    for (let i = 0; i < encoded.length; i++) {
      const char = encoded[i].toLowerCase();
      if (!(char in lookup)) {
        throw new Error(`Invalid base32 character: ${char}`);
      }

      value = (value << 5) | lookup[char];
      bits += 5;

      if (bits >= 8) {
        output[index++] = (value >>> (bits - 8)) & 255;
        bits -= 8;
      }
    }

    return output.slice(0, index);
  }

  /**
   * Compare two Uint8Arrays for equality
   */
  private arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Generate ephemeral keypair for sending
   * Used by sender to create one-time key for each payment
   *
   * @returns Ephemeral key pair { private: r, public: R }
   */
  generateEphemeralKey(): { private: Uint8Array; public: Uint8Array } {
    // Generate random 32-byte seed
    const seed = nacl.randomBytes(32);

    // Derive Ed25519 keypair using Blake2b (CamoNano compatible)
    return this.blake2bKeyPairFromSeed(seed);
  }

  /**
   * Derive public key from private key (for testing/verification)
   * Used to verify that derived private keys correctly correspond to public keys
   *
   * @param privateKey - Ed25519 private key (32 bytes)
   * @returns Corresponding public key (32 bytes)
   */
  derivePublicKeyFromPrivate(privateKey: Uint8Array): Uint8Array {
    // Note: privateKey can be either a SEED or a SCALAR
    // - For normal keys: it's a seed that needs to be hashed
    // - For stealth keys: it's already a scalar from ed25519ScalarAdd
    // We use the scalar directly (multiply by G) instead of hashing again
    console.log('[DEBUG derivePublicKeyFromPrivate] privateKey:', bytesToHex(privateKey));

    // Interpret as scalar and multiply by G
    const scalar = this.bytesToBigIntLE(privateKey);
    const publicPoint = ed25519.ExtendedPoint.BASE.multiply(scalar);
    const publicKey = publicPoint.toRawBytes();

    console.log('[DEBUG derivePublicKeyFromPrivate] derived publicKey:', bytesToHex(publicKey));
    return publicKey;
  }

  /**
   * Convert public key to Nano address (for testing/verification)
   * Used to verify that derived keys produce correct Nano addresses
   *
   * @param publicKey - Ed25519 public key (32 bytes)
   * @returns Nano address (nano_...)
   */
  publicKeyToNanoAddress(publicKey: Uint8Array): string {
    return this.util.account.getPublicAccountID(publicKey, "nano");
  }

  /**
   * Sign a block hash using a stealth private key scalar
   *
   * For stealth accounts, the private key is a 32-byte scalar (not a seed).
   * This method signs directly using @noble/ed25519 which accepts scalars.
   *
   * IMPORTANT: This is required because nacl.sign.keyPair.fromSecretKey()
   * treats input as a seed and hashes it with BLAKE2b, which would produce
   * an incorrect signature. Stealth keys are already scalars and must not be hashed again.
   *
   * @param privateKeyScalar - 32-byte stealth private key scalar (p_masked = b_spend + t)
   * @param messageHash - Block hash to sign (typically 256-bit BLAKE2b hash)
   * @returns Signature (64 bytes)
   */
  signBlockWithScalar(
    privateKeyScalar: Uint8Array,
    messageHash: Uint8Array,
    expectedPublicKeyHex?: string,
  ): Uint8Array {
    console.log('[NanoNymCrypto] Signing block with stealth scalar');
    console.log('[NanoNymCrypto] Private scalar:', bytesToHex(privateKeyScalar));
    console.log('[NanoNymCrypto] Message hash:', bytesToHex(messageHash));

    // Verify public key derivation if expected public key hex provided
    if (expectedPublicKeyHex) {
      try {
        const derivedPublic = this.derivePublicKeyFromPrivate(privateKeyScalar);
        const derivedPublicHex = bytesToHex(derivedPublic);

        console.log('[NanoNymCrypto] Expected public key (from stealth account):', expectedPublicKeyHex);
        console.log('[NanoNymCrypto] Derived public key (from scalar):        ', derivedPublicHex);

        if (derivedPublicHex.toLowerCase() !== expectedPublicKeyHex.toLowerCase()) {
          console.error('[NanoNymCrypto] ⚠️ PUBLIC KEY MISMATCH! Scalar does not derive to the expected public key');
          console.error('[NanoNymCrypto]   This indicates the private scalar is incorrect for this stealth account!');
        } else {
          console.log('[NanoNymCrypto] ✅ Public key verification PASSED');
        }
      } catch (e) {
        console.error('[NanoNymCrypto] Error verifying public key:', e);
      }
    }

    // CRITICAL FIX: Must pass messageHash as Uint8Array, NOT as hex string
    // The original code did: ed25519.sign(bytesToHex(messageHash), privateKeyScalar)
    // This converted the hash to a hex STRING, which was then treated as the message!
    // This is wrong - we need to pass the actual message bytes.

    // ed25519.sign() expects (message: Uint8Array, privateKey: Uint8Array)
    // However, it also expects privateKey to be a SEED (32 bytes), not a pre-computed scalar
    // It will hash the seed internally, which breaks our stealth account keys

    // Solution: Use nacl.sign.detached() directly with our scalar
    // nacl.sign() uses the tweetnacl format, which also has this issue
    // Both libraries expect seeds, not scalars

    // Since @noble/curves ExtendedPoint works with scalars, and nacl doesn't,
    // we need to implement Ed25519 signing manually using low-level primitives

    // For now, use nacl with a workaround: Nano specifically uses tweetnacl,
    // so we match that behavior. The issue is that we can't pass a pre-computed scalar.
    // We need to construct a "seed" that will hash to our scalar.

    // This is impossible without knowledge of the original seed.
    // CORRECT SOLUTION: Use the ExtendedPoint and implement signing from scratch
    // following RFC 8032 exactly, using scalar directly (not hashing it)

    // Get public key for the signature
    const publicKeyPoint = ed25519.ExtendedPoint.BASE.multiply(
      this.bytesToBigIntLE(privateKeyScalar)
    );
    const publicKeyBytes = publicKeyPoint.toRawBytes();

    // For Nano compatibility, we use BLAKE2b like tweetnacl expects
    // tweetnacl uses SHA512, but Nano doesn't verify that, it just verifies the signature format

    // EdDSA(RFC 8032): sig = R || S where:
    // - r = H(hash(seed)[0:32] || M)  (but we don't have seed, we have scalar directly)
    // - R = [r]B
    // - S = (r + H(R || A || M) * a) mod L

    // Key insight: Since we have a pre-computed scalar (not a seed), we need to derive
    // the prefix for EdDSA signing differently than standard Ed25519.
    // In RFC 8032, the prefix comes from the first 32 bytes of SHA512(seed).
    // For scalar-based signing, we derive it from SHA512(scalar) instead.

    // NANO SCHNORR-STYLE SIGNATURE (based on nanopyrs reference implementation)
    // NOT RFC 8032 EdDSA - Nano uses a Schnorr variant with BLAKE2B512

    // Step 1: Compute r = BLAKE2B512(scalar || message) mod L (deterministic ephemeral value)
    const rInput = new Uint8Array(privateKeyScalar.length + messageHash.length);
    rInput.set(privateKeyScalar, 0);
    rInput.set(messageHash, privateKeyScalar.length);
    const rHash = blake2b(rInput, undefined, 64);
    const r = this.hashToScalarModL(new Uint8Array(rHash));
    const rBigInt = this.bytesToBigIntLE(r);

    console.log('[NanoNymCrypto] Schnorr r (BLAKE2B512):', bytesToHex(r));

    // Step 2: Compute R = r * G
    const RPoint = ed25519.ExtendedPoint.BASE.multiply(rBigInt);
    const RBytes = RPoint.toRawBytes();

    console.log('[NanoNymCrypto] Schnorr R:', bytesToHex(RBytes));

    // Step 3: Compute k = BLAKE2B512(R || public_key || message) mod L
    const kInput = new Uint8Array(RBytes.length + publicKeyBytes.length + messageHash.length);
    kInput.set(RBytes, 0);
    kInput.set(publicKeyBytes, RBytes.length);
    kInput.set(messageHash, RBytes.length + publicKeyBytes.length);
    const kHash = blake2b(kInput, undefined, 64);
    const k = this.hashToScalarModL(new Uint8Array(kHash));
    const kBigInt = this.bytesToBigIntLE(k);

    console.log('[NanoNymCrypto] Schnorr k (BLAKE2B512):', bytesToHex(k));

    // Step 4: Compute s = (r + k * a) mod L
    const scalar = this.bytesToBigIntLE(privateKeyScalar);
    const L = BigInt(
      "0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed"
    );
    const s = (rBigInt + kBigInt * scalar) % L;
    const sBytes = this.bigIntToBytesLE(s, 32);

    console.log('[NanoNymCrypto] Schnorr s:', bytesToHex(sBytes));

    // Step 5: Combine R || s into 64-byte signature
    const signature = new Uint8Array(64);
    signature.set(RBytes, 0);
    signature.set(sBytes, 32);

    console.log('[NanoNymCrypto] Block signed with Schnorr-style signature:', bytesToHex(signature));
    return signature;
  }
}
