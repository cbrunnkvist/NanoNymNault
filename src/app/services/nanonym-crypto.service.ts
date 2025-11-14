import { Injectable } from "@angular/core";
import * as bip39 from "bip39";
import { blake2b } from "blakejs";
import * as nacl from "tweetnacl";
import { UtilService } from "./util.service";
import { ed25519, edwardsToMontgomeryPub } from "@noble/curves/ed25519.js";
import { etc } from "@noble/ed25519";
import { getPublicKey as getSecpPublicKey } from "@noble/secp256k1";

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
    // Convert mnemonic to seed if needed
    let seedBytes: Uint8Array;
    if (typeof seed === "string") {
      seedBytes = new Uint8Array(bip39.mnemonicToSeedSync(seed));
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

    // Derive spend key (key_type = 0)
    const spendSeed = this.deriveChildKey(
      seedBytes,
      basePath.concat(this.uint32ToBytes(0)),
    );
    const spendKeyPair = nacl.sign.keyPair.fromSeed(spendSeed);

    // Derive view key (key_type = 1)
    const viewSeed = this.deriveChildKey(
      seedBytes,
      basePath.concat(this.uint32ToBytes(1)),
    );
    const viewKeyPair = nacl.sign.keyPair.fromSeed(viewSeed);

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
        private: spendKeyPair.secretKey.slice(0, 32),
        public: spendKeyPair.publicKey,
      },
      view: {
        private: viewKeyPair.secretKey.slice(0, 32),
        public: viewKeyPair.publicKey,
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
   * Generate ECDH shared secret between sender's ephemeral key and receiver's view key
   *
   * @param ephemeralPrivate - Sender's ephemeral private key (r) - 32 bytes
   * @param recipientViewPublic - Recipient's view public key (B_view) - 32 bytes Ed25519
   * @returns Shared secret point (32 bytes)
   */
  generateSharedSecret(
    ephemeralPrivate: Uint8Array,
    recipientViewPublic: Uint8Array,
  ): Uint8Array {
    // Convert Ed25519 keys to Curve25519 keys for ECDH
    const curve25519Private = this.ed25519PrivateToX25519(ephemeralPrivate);

    // Convert Ed25519 public key to Curve25519 (X25519) public key
    const curve25519Public = edwardsToMontgomeryPub(recipientViewPublic);

    // Compute shared secret using X25519 (ECDH on Curve25519)
    const sharedSecret = nacl.scalarMult(curve25519Private, curve25519Public);

    return sharedSecret;
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
    // Compute tweak scalar: t = BLAKE2b(shared_secret || R || B_spend)
    const data = new Uint8Array(
      sharedSecret.length +
        ephemeralPublic.length +
        recipientSpendPublic.length,
    );
    data.set(sharedSecret, 0);
    data.set(ephemeralPublic, sharedSecret.length);
    data.set(
      recipientSpendPublic,
      sharedSecret.length + ephemeralPublic.length,
    );

    const tweakHash = blake2b(data, undefined, 32);
    const tweak = new Uint8Array(tweakHash);

    // Compute stealth address: P_masked = B_spend + (t * G)
    // Step 1: Compute t * G (scalar multiply base point)
    const tweakKeyPair = nacl.sign.keyPair.fromSeed(tweak);
    const tweakPoint = tweakKeyPair.publicKey;

    // Step 2: Add B_spend + tweakPoint
    // For now, use a simplified approach with nanocurrency utilities
    // TODO: Implement proper Ed25519 point addition
    const stealthPublicKey = this.ed25519PointAdd(
      recipientSpendPublic,
      tweakPoint,
    );

    // Convert to Nano address using util service
    const stealthAddress = this.util.account.getPublicAccountID(
      stealthPublicKey,
      "nano",
    );

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
    // Convert compressed points to Point and add
    const p1 = ed25519.Point.fromHex(etc.bytesToHex(point1));
    const p2 = ed25519.Point.fromHex(etc.bytesToHex(point2));
    const sum = p1.add(p2);

    // Convert back to compressed 32-byte representation
    return sum.toBytes();
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
    // Compute tweak scalar: t = BLAKE2b(shared_secret || R || B_spend)
    const data = new Uint8Array(
      sharedSecret.length + ephemeralPublic.length + spendPublic.length,
    );
    data.set(sharedSecret, 0);
    data.set(ephemeralPublic, sharedSecret.length);
    data.set(spendPublic, sharedSecret.length + ephemeralPublic.length);

    const tweakHash = blake2b(data, undefined, 32);
    const tweak = new Uint8Array(tweakHash);

    // Compute private key: p_masked = b_spend + t (mod l)
    // where l is the Ed25519 group order
    // l = 2^252 + 27742317777372353535851937790883648493
    const stealthPrivate = this.ed25519ScalarAdd(spendPrivate, tweak);

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
   * Generate fallback Nano address from spend public key
   * This is the standard nano_ address derived from B_spend
   * Used as non-private fallback when sender doesn't support NanoNyms
   *
   * @param spendPublic - Spend public key (32 bytes)
   * @returns Standard nano_ address
   */
  getFallbackAddress(spendPublic: Uint8Array): string {
    return this.util.account.getPublicAccountID(spendPublic, "nano");
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

    // Derive Ed25519 keypair
    const keyPair = nacl.sign.keyPair.fromSeed(seed);

    return {
      private: keyPair.secretKey.slice(0, 32),
      public: keyPair.publicKey,
    };
  }
}
