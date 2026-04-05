import { Injectable } from "@angular/core";
import { nip19 } from "nostr-tools";
import {
  createNanoNymIdentity,
  prepareNanoNymPayment,
  recoverStealthPayment,
} from "@nanomyms/core";
import {
  NANO_NYM_VERSION,
  createNostrNotificationUri,
  decodeNanoNymAddress as decodeNanoNymAddressV2,
  encodeNanoNymAddress as encodeNanoNymAddressV2,
} from "@nanomyms/protocol";
import {
  deriveNanoNymAddress,
  deriveNanoNymKeys,
  derivePublicKeyFromScalar,
  deriveStealthAddress,
  deriveStealthPrivateKey,
  generateEphemeralKey,
  generateSharedSecret,
  signBlockWithScalar,
} from "@nanomyms/crypto";

@Injectable({
  providedIn: "root",
})
export class NanoNymCryptoService {
  deriveNanoNymKeys(
    seed: string | Uint8Array,
    accountIndex: number,
  ): {
    spend: { private: Uint8Array; public: Uint8Array };
    view: { private: Uint8Array; public: Uint8Array };
    nostr: { private: Uint8Array; public: Uint8Array };
  } {
    const keys = deriveNanoNymKeys(seed, accountIndex);

    return {
      spend: {
        private: keys.spend.privateKey,
        public: keys.spend.publicKey,
      },
      view: {
        private: keys.view.privateKey,
        public: keys.view.publicKey,
      },
      nostr: {
        private: keys.nostr.privateKey,
        public: keys.nostr.publicKey,
      },
    };
  }

  createNanoNymIdentity(
    seed: string | Uint8Array,
    accountIndex: number,
    notificationUri?: string,
  ) {
    return createNanoNymIdentity(seed, accountIndex, notificationUri);
  }

  deriveNanoNymAddress(
    seed: string | Uint8Array,
    accountIndex: number,
    notificationUri?: string,
  ): string {
    return deriveNanoNymAddress(seed, accountIndex, { notificationUri });
  }

  generateSharedSecret(
    privateKey: Uint8Array,
    publicKey: Uint8Array,
  ): Uint8Array {
    return generateSharedSecret(privateKey, publicKey);
  }

  deriveStealthAddress(
    sharedSecret: Uint8Array,
    _ephemeralPublic: Uint8Array,
    recipientSpendPublic: Uint8Array,
  ): { publicKey: Uint8Array; address: string } {
    return deriveStealthAddress(sharedSecret, recipientSpendPublic);
  }

  deriveStealthPrivateKey(
    spendPrivate: Uint8Array,
    sharedSecret: Uint8Array,
    _ephemeralPublic: Uint8Array,
    _spendPublic: Uint8Array,
  ): Uint8Array {
    return deriveStealthPrivateKey(spendPrivate, sharedSecret);
  }

  encodeNanoNymAddress(
    spendPublic: Uint8Array,
    viewPublic: Uint8Array,
    nostrPublic: Uint8Array,
  ): string {
    const npub = nip19.npubEncode(this.bytesToHex(nostrPublic));

    return encodeNanoNymAddressV2({
      version: NANO_NYM_VERSION,
      spendPublicKey: spendPublic,
      viewPublicKey: viewPublic,
      notificationUri: createNostrNotificationUri(npub),
    });
  }

  decodeNanoNymAddress(nnymAddress: string): {
    version: number;
    spendPublic: Uint8Array;
    viewPublic: Uint8Array;
    notificationUri: string;
  } {
    const decoded = decodeNanoNymAddressV2(nnymAddress);

    return {
      version: decoded.version,
      spendPublic: decoded.spendPublicKey,
      viewPublic: decoded.viewPublicKey,
      notificationUri: decoded.notificationUri,
    };
  }

  generateEphemeralKey(): { private: Uint8Array; public: Uint8Array } {
    const keyPair = generateEphemeralKey();
    return {
      private: keyPair.privateKey,
      public: keyPair.publicKey,
    };
  }

  prepareNanoNymPayment(
    recipientAddress: string,
    txHash: string,
    amountRaw?: bigint,
    memo?: string,
  ) {
    return prepareNanoNymPayment(recipientAddress, txHash, amountRaw, memo);
  }

  recoverStealthPayment(
    recipientKeys: {
      spend: { private: Uint8Array; public: Uint8Array };
      view: { private: Uint8Array; public: Uint8Array };
    },
    notification: {
      version: number;
      protocol: string;
      R: string;
      tx_hash: string;
      amount?: string;
      amount_raw?: string;
      memo?: string;
    },
  ) {
    return recoverStealthPayment(
      {
        spend: {
          privateKey: recipientKeys.spend.private,
          publicKey: recipientKeys.spend.public,
        },
        view: {
          privateKey: recipientKeys.view.private,
          publicKey: recipientKeys.view.public,
        },
      },
      notification,
    );
  }

  derivePublicKeyFromPrivate(privateKey: Uint8Array): Uint8Array {
    return derivePublicKeyFromScalar(privateKey);
  }

  signBlockWithScalar(
    privateKeyScalar: Uint8Array,
    messageHash: Uint8Array,
    expectedPublicKeyHex?: string,
  ): Uint8Array {
    const signature = signBlockWithScalar(privateKeyScalar, messageHash);

    if (expectedPublicKeyHex) {
      const derivedPublicHex = this.bytesToHex(
        derivePublicKeyFromScalar(privateKeyScalar),
      );
      if (derivedPublicHex.toLowerCase() !== expectedPublicKeyHex.toLowerCase()) {
        console.error(
          "[NanoNymCrypto] Public key mismatch for stealth scalar signing",
        );
      }
    }

    return signature;
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
}
