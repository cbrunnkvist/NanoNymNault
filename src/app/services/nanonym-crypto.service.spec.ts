import { TestBed } from "@angular/core/testing";
import { NanoNymCryptoService } from "./nanonym-crypto.service";
import { UtilService } from "./util.service";

describe("NanoNymCryptoService", () => {
  let service: NanoNymCryptoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [NanoNymCryptoService, UtilService],
    });
    service = TestBed.inject(NanoNymCryptoService);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  describe("Multi-account key derivation", () => {
    it("should derive keys from mnemonic seed", () => {
      const testMnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
      const keys = service.deriveNanoNymKeys(testMnemonic, 0);

      expect(keys.spend.private).toBeTruthy();
      expect(keys.spend.public).toBeTruthy();
      expect(keys.view.private).toBeTruthy();
      expect(keys.view.public).toBeTruthy();
      expect(keys.nostr.private).toBeTruthy();
      expect(keys.nostr.public).toBeTruthy();

      // Verify key lengths
      expect(keys.spend.private.length).toBe(32);
      expect(keys.spend.public.length).toBe(32);
      expect(keys.view.private.length).toBe(32);
      expect(keys.view.public.length).toBe(32);
      expect(keys.nostr.private.length).toBe(32);
      expect(keys.nostr.public.length).toBe(32);
    });

    it("should derive different keys for different account indices", () => {
      const testMnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
      const keys0 = service.deriveNanoNymKeys(testMnemonic, 0);
      const keys1 = service.deriveNanoNymKeys(testMnemonic, 1);

      // Keys should be different for different accounts
      expect(keys0.spend.public).not.toEqual(keys1.spend.public);
      expect(keys0.view.public).not.toEqual(keys1.view.public);
      expect(keys0.nostr.public).not.toEqual(keys1.nostr.public);
    });

    it("should derive same keys for same seed and index (deterministic)", () => {
      const testMnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
      const keys1 = service.deriveNanoNymKeys(testMnemonic, 0);
      const keys2 = service.deriveNanoNymKeys(testMnemonic, 0);

      // Keys should be identical for same inputs
      expect(keys1.spend.public).toEqual(keys2.spend.public);
      expect(keys1.view.public).toEqual(keys2.view.public);
      expect(keys1.nostr.public).toEqual(keys2.nostr.public);
    });

    it("should derive keys from hex seed (production format)", () => {
      const testHexSeed = "71EAB3C81D1259021018A7040D585A41BEDB13932F443207B4D3B76405A106D7";
      const keys = service.deriveNanoNymKeys(testHexSeed, 0);

      expect(keys.spend.private).toBeTruthy();
      expect(keys.spend.public).toBeTruthy();
      expect(keys.view.private).toBeTruthy();
      expect(keys.view.public).toBeTruthy();
      expect(keys.nostr.private).toBeTruthy();
      expect(keys.nostr.public).toBeTruthy();

      // Verify key lengths
      expect(keys.spend.private.length).toBe(32);
      expect(keys.spend.public.length).toBe(32);
      expect(keys.view.private.length).toBe(32);
      expect(keys.view.public.length).toBe(32);
      expect(keys.nostr.private.length).toBe(32);
      expect(keys.nostr.public.length).toBe(32);
    });

    it("should derive deterministic keys from hex seed", () => {
      const testHexSeed = "71EAB3C81D1259021018A7040D585A41BEDB13932F443207B4D3B76405A106D7";
      const keys1 = service.deriveNanoNymKeys(testHexSeed, 0);
      const keys2 = service.deriveNanoNymKeys(testHexSeed, 0);

      // Keys should be identical for same hex seed and index
      expect(keys1.spend.public).toEqual(keys2.spend.public);
      expect(keys1.view.public).toEqual(keys2.view.public);
      expect(keys1.nostr.public).toEqual(keys2.nostr.public);
    });

    it("should derive different keys for hex vs mnemonic (different input types)", () => {
      const testMnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
      const testHexSeed = "71EAB3C81D1259021018A7040D585A41BEDB13932F443207B4D3B76405A106D7";

      const mnemonicKeys = service.deriveNanoNymKeys(testMnemonic, 0);
      const hexKeys = service.deriveNanoNymKeys(testHexSeed, 0);

      // Keys should be different for different seed types
      expect(mnemonicKeys.spend.public).not.toEqual(hexKeys.spend.public);
      expect(mnemonicKeys.view.public).not.toEqual(hexKeys.view.public);
      expect(mnemonicKeys.nostr.public).not.toEqual(hexKeys.nostr.public);
    });
  });

  describe("nnym_ address encoding/decoding", () => {
    it("should encode and decode NanoNym address", () => {
      const testMnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
      const keys = service.deriveNanoNymKeys(testMnemonic, 0);

      // Encode
      const address = service.encodeNanoNymAddress(
        keys.spend.public,
        keys.view.public,
        keys.nostr.public,
      );

      // Should start with nnym_
      expect(address.startsWith("nnym_")).toBe(true);

      // Should be approximately 160 characters (nnym_ + base32 encoded 99 bytes)
      expect(address.length).toBeGreaterThan(150);
      expect(address.length).toBeLessThan(170);

      // Decode
      const decoded = service.decodeNanoNymAddress(address);

      // Verify decoded values match original
      expect(decoded.version).toBe(1);
      expect(decoded.spendPublic).toEqual(keys.spend.public);
      expect(decoded.viewPublic).toEqual(keys.view.public);
      expect(decoded.nostrPublic).toEqual(keys.nostr.public);
    });

    it("should reject invalid addresses", () => {
      // Invalid prefix
      expect(() => service.decodeNanoNymAddress("nano_invalid")).toThrowError(
        "Invalid NanoNym address: must start with nnym_",
      );

      // Invalid checksum
      expect(() =>
        service.decodeNanoNymAddress(
          "nnym_111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111",
        ),
      ).toThrowError();
    });
  });

  describe("Ephemeral key generation", () => {
    it("should generate random ephemeral keys", () => {
      const key1 = service.generateEphemeralKey();
      const key2 = service.generateEphemeralKey();

      // Should have correct lengths
      expect(key1.private.length).toBe(32);
      expect(key1.public.length).toBe(32);
      expect(key2.private.length).toBe(32);
      expect(key2.public.length).toBe(32);

      // Should be different (random)
      expect(key1.private).not.toEqual(key2.private);
      expect(key1.public).not.toEqual(key2.public);
    });
  });

  describe("ECDH shared secret generation", () => {
    it("should generate shared secret between sender and receiver", () => {
      const testMnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
      const receiverKeys = service.deriveNanoNymKeys(testMnemonic, 0);
      const senderEphemeral = service.generateEphemeralKey();

      // Generate shared secret from sender's perspective
      const sharedSecret = service.generateSharedSecret(
        senderEphemeral.private,
        receiverKeys.view.public,
      );

      // Should produce 32-byte shared secret
      expect(sharedSecret.length).toBe(32);

      // Should not be all zeros
      const isAllZeros = sharedSecret.every((byte) => byte === 0);
      expect(isAllZeros).toBe(false);
    });
  });

  describe("Stealth address derivation", () => {
    it("should derive stealth address from shared secret", () => {
      const testMnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
      const receiverKeys = service.deriveNanoNymKeys(testMnemonic, 0);
      const senderEphemeral = service.generateEphemeralKey();

      // Generate shared secret
      const sharedSecret = service.generateSharedSecret(
        senderEphemeral.private,
        receiverKeys.view.public,
      );

      // Derive stealth address
      const stealthAddr = service.deriveStealthAddress(
        sharedSecret,
        senderEphemeral.public,
        receiverKeys.spend.public,
      );

      // Should have valid structure
      expect(stealthAddr.publicKey.length).toBe(32);
      expect(stealthAddr.address).toBeTruthy();
      expect(stealthAddr.address.startsWith("nano_")).toBe(true);
    });

    it("should derive different stealth addresses for different ephemeral keys", () => {
      const testMnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
      const receiverKeys = service.deriveNanoNymKeys(testMnemonic, 0);

      // First payment
      const ephemeral1 = service.generateEphemeralKey();
      const sharedSecret1 = service.generateSharedSecret(
        ephemeral1.private,
        receiverKeys.view.public,
      );
      const stealth1 = service.deriveStealthAddress(
        sharedSecret1,
        ephemeral1.public,
        receiverKeys.spend.public,
      );

      // Second payment
      const ephemeral2 = service.generateEphemeralKey();
      const sharedSecret2 = service.generateSharedSecret(
        ephemeral2.private,
        receiverKeys.view.public,
      );
      const stealth2 = service.deriveStealthAddress(
        sharedSecret2,
        ephemeral2.public,
        receiverKeys.spend.public,
      );

      // Stealth addresses should be different (unlinkable payments)
      expect(stealth1.address).not.toEqual(stealth2.address);
      expect(stealth1.publicKey).not.toEqual(stealth2.publicKey);
    });
  });

  describe("Stealth private key derivation", () => {
    it("should derive private key for spending stealth funds", () => {
      const testMnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
      const receiverKeys = service.deriveNanoNymKeys(testMnemonic, 0);
      const senderEphemeral = service.generateEphemeralKey();

      // Sender derives stealth address
      const sharedSecretSender = service.generateSharedSecret(
        senderEphemeral.private,
        receiverKeys.view.public,
      );
      const stealthAddr = service.deriveStealthAddress(
        sharedSecretSender,
        senderEphemeral.public,
        receiverKeys.spend.public,
      );

      // Receiver derives shared secret (using view key)
      const sharedSecretReceiver = service.generateSharedSecret(
        receiverKeys.view.private,
        senderEphemeral.public,
      );

      // Receiver derives private key for spending
      const stealthPrivate = service.deriveStealthPrivateKey(
        receiverKeys.spend.private,
        sharedSecretReceiver,
        senderEphemeral.public,
        receiverKeys.spend.public,
      );

      // Should produce valid 32-byte private key
      expect(stealthPrivate.length).toBe(32);

      // Should not be all zeros
      const isAllZeros = stealthPrivate.every((byte) => byte === 0);
      expect(isAllZeros).toBe(false);
    });
  });

  describe("Fallback address", () => {
    it("should generate standard nano_ address from spend key", () => {
      const testMnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
      const keys = service.deriveNanoNymKeys(testMnemonic, 0);

      const fallbackAddr = service.getFallbackAddress(keys.spend.public);

      // Should be valid nano_ address
      expect(fallbackAddr).toBeTruthy();
      expect(fallbackAddr.startsWith("nano_")).toBe(true);
      expect(fallbackAddr.length).toBe(65); // Standard Nano address length
    });
  });

  describe("Round-trip encoding/decoding", () => {
    it("should correctly round-trip multiple NanoNym addresses", () => {
      const testMnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

      for (let i = 0; i < 5; i++) {
        const keys = service.deriveNanoNymKeys(testMnemonic, i);
        const address = service.encodeNanoNymAddress(
          keys.spend.public,
          keys.view.public,
          keys.nostr.public,
        );
        const decoded = service.decodeNanoNymAddress(address);

        expect(decoded.spendPublic).toEqual(keys.spend.public);
        expect(decoded.viewPublic).toEqual(keys.view.public);
        expect(decoded.nostrPublic).toEqual(keys.nostr.public);
      }
    });
  });

  describe("CRITICAL: Full sender-receiver cryptographic roundtrip", () => {
    it("should verify receiver can spend from sender-derived stealth address", () => {
      // SETUP: Use deterministic test seed
      const testMnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
      const receiverKeys = service.deriveNanoNymKeys(testMnemonic, 0);

      // SENDER SIDE: Generate payment
      const senderEphemeral = service.generateEphemeralKey();
      const sharedSecretSender = service.generateSharedSecret(
        senderEphemeral.private,
        receiverKeys.view.public,
      );
      const stealthSender = service.deriveStealthAddress(
        sharedSecretSender,
        senderEphemeral.public,
        receiverKeys.spend.public,
      );

      // RECEIVER SIDE: Process notification (with R = senderEphemeral.public)
      const sharedSecretReceiver = service.generateSharedSecret(
        receiverKeys.view.private,
        senderEphemeral.public,
      );
      const stealthReceiver = service.deriveStealthAddress(
        sharedSecretReceiver,
        senderEphemeral.public,
        receiverKeys.spend.public,
      );
      const privateKeyReceiver = service.deriveStealthPrivateKey(
        receiverKeys.spend.private,
        sharedSecretReceiver,
        senderEphemeral.public,
        receiverKeys.spend.public,
      );

      // CRITICAL VERIFICATION 1: Addresses match
      expect(stealthSender.address).toEqual(stealthReceiver.address);
      expect(stealthSender.publicKey).toEqual(stealthReceiver.publicKey);

      // CRITICAL VERIFICATION 2: Receiver's private key controls sender's public key
      const derivedPublicKey =
        service.derivePublicKeyFromPrivate(privateKeyReceiver);
      expect(derivedPublicKey).toEqual(stealthSender.publicKey);

      // CRITICAL VERIFICATION 3: Can generate valid Nano address from derived keys
      const addressFromReceiverKeys =
        service.publicKeyToNanoAddress(derivedPublicKey);
      expect(addressFromReceiverKeys).toEqual(stealthSender.address);
    });

    it("should verify roundtrip works for multiple payments (unlinkability)", () => {
      // Test that 3 separate payments all work independently
      const testMnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
      const receiverKeys = service.deriveNanoNymKeys(testMnemonic, 0);

      const stealthAddresses: string[] = [];

      for (let i = 0; i < 3; i++) {
        // Each payment uses different ephemeral key
        const senderEphemeral = service.generateEphemeralKey();

        // Sender derives stealth address
        const sharedSecretSender = service.generateSharedSecret(
          senderEphemeral.private,
          receiverKeys.view.public,
        );
        const stealthSender = service.deriveStealthAddress(
          sharedSecretSender,
          senderEphemeral.public,
          receiverKeys.spend.public,
        );

        // Receiver derives from notification
        const sharedSecretReceiver = service.generateSharedSecret(
          receiverKeys.view.private,
          senderEphemeral.public,
        );
        const stealthReceiver = service.deriveStealthAddress(
          sharedSecretReceiver,
          senderEphemeral.public,
          receiverKeys.spend.public,
        );
        const privateKeyReceiver = service.deriveStealthPrivateKey(
          receiverKeys.spend.private,
          sharedSecretReceiver,
          senderEphemeral.public,
          receiverKeys.spend.public,
        );

        // Verify each payment independently
        expect(stealthSender.address).toEqual(stealthReceiver.address);
        const derivedPubKey =
          service.derivePublicKeyFromPrivate(privateKeyReceiver);
        expect(derivedPubKey).toEqual(stealthSender.publicKey);

        // Track addresses to verify they're all different (unlinkable)
        stealthAddresses.push(stealthSender.address);
      }

      // Verify all stealth addresses are different (unlinkability)
      const uniqueAddresses = new Set(stealthAddresses);
      expect(uniqueAddresses.size).toBe(3);
    });
  });

  describe("NanoNym End-to-End Crypto Flow (Block Signing)", () => {
    it("should derive valid stealth keys that can sign blocks", () => {
      // Test: Verify the full flow - receiver derives stealth private key,
      // derives public key from it, and the public key matches the stealth address

      const testMnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

      // Step 1: Receiver creates NanoNym0
      const receiverKeys = service.deriveNanoNymKeys(testMnemonic, 0);
      expect(receiverKeys.spend.public).toBeTruthy();
      expect(receiverKeys.spend.private).toBeTruthy();

      // Step 2: Sender generates ephemeral keypair for this payment
      const senderEphemeral = service.generateEphemeralKey();
      expect(senderEphemeral.public.length).toBe(32);
      expect(senderEphemeral.private.length).toBe(32);

      // Step 3: Sender computes shared secret and derives stealth address
      const sharedSecretSender = service.generateSharedSecret(
        senderEphemeral.private,
        receiverKeys.view.public,
      );
      const stealthAddressSender = service.deriveStealthAddress(
        sharedSecretSender,
        senderEphemeral.public,
        receiverKeys.spend.public,
      );

      // Step 4: Receiver receives notification with ephemeral key, derives stealth account
      const sharedSecretReceiver = service.generateSharedSecret(
        receiverKeys.view.private,
        senderEphemeral.public,
      );
      const stealthAddressReceiver = service.deriveStealthAddress(
        sharedSecretReceiver,
        senderEphemeral.public,
        receiverKeys.spend.public,
      );

      // Step 5: Receiver derives the stealth private key
      const stealthPrivateKey = service.deriveStealthPrivateKey(
        receiverKeys.spend.private,
        sharedSecretReceiver,
        senderEphemeral.public,
        receiverKeys.spend.public,
      );

      // CRITICAL VERIFICATION: Private key is 32 bytes (scalar)
      expect(stealthPrivateKey.length).toBe(32);

      // Step 6: Receiver derives public key from private key
      const derivedPublicKey =
        service.derivePublicKeyFromPrivate(stealthPrivateKey);

      // Step 7: Verify the derived public key matches the stealth address
      expect(derivedPublicKey).toEqual(stealthAddressSender.publicKey);
      expect(stealthAddressReceiver.address).toEqual(stealthAddressSender.address);

      // SUCCESS: The stealth private key scalar correctly produces the stealth address
      // This validates that the key derivation is correct for signing blocks
      expect(stealthPrivateKey).toBeTruthy();
      expect(derivedPublicKey).toBeTruthy();
    });
  });
});
