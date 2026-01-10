import { Injectable } from "@angular/core";
import { CeramicClient } from "@ceramicnetwork/http-client";
import { TileDocument } from "@ceramicnetwork/stream-tile";
import { DID } from "dids";
import { Ed25519Provider } from "key-did-provider-ed25519";
import { getResolver } from "key-did-resolver";
import * as nacl from "tweetnacl";
import { NanoNymCryptoService } from "./nanonym-crypto.service";
import {
  NanoNymNotification,
  NanoNymNotificationsRecord,
} from "../types/nanonym.types";
import { environment } from "../../environments/environment";

/**
 * CeramicStreamService
 *
 * Implements Ceramic Streams Tier-2 backup for NanoNym recovery.
 * Hash-based DID derivation enables both senders and receivers to append/read.
 *
 * Based on CERAMIC-BACKUP-SPECIFICATION.md
 */
@Injectable({
  providedIn: "root",
})
export class CeramicStreamService {
  private ceramicClient: CeramicClient;
  private readonly gatewayUrl: string;

  constructor(private crypto: NanoNymCryptoService) {
    this.gatewayUrl = environment.ceramicGateway;
    this.ceramicClient = new CeramicClient(this.gatewayUrl);
    console.log(`[Ceramic] Initialized client: ${this.gatewayUrl}`);
  }

  /**
   * Authenticate as a Ceramic DID and append encrypted blob to stream
   *
   * @param did - Ceramic DID string (did:key:z...)
   * @param privateKey - Ceramic DID private key (32 bytes)
   * @param encryptedBlob - Encrypted blob object
   */
  private async authenticateAndAppend(
    did: string,
    privateKey: Uint8Array,
    encryptedBlob: any
  ): Promise<string> {
    try {
      // Create DID provider from private key
      const provider = new Ed25519Provider(privateKey);
      const didInstance = new DID({
        provider,
        resolver: getResolver(),
      });
      await didInstance.authenticate();

      // Set authenticated DID on client
      this.ceramicClient.did = didInstance;

      // Create or load deterministic stream
      const stream = await TileDocument.deterministic(this.ceramicClient, {
        controllers: [did],
        family: "nanonym-backup",
        tags: ["v2"],
      });

      const streamID = stream.id.toString();

      // Append to stream content (merge with existing array)
      const existingContent = (stream.content as any)?.events || [];
      await stream.update({
        events: [...existingContent, encryptedBlob],
      });

      console.log(
        `[Ceramic] 📤 Appended to stream ${streamID.slice(0, 16)}...`
      );

      return streamID;
    } catch (error) {
      console.warn("[Ceramic] Append failed:", error);
      throw error;
    }
  }

  /**
   * Encrypt blob to recipient's B_view public key using NaCl box
   *
   * @param blob - Plaintext blob object
   * @param B_view - Recipient's view public key (Ed25519, 32 bytes)
   * @returns Encrypted blob envelope
   */
  private encryptBlobToView(blob: any, B_view: Uint8Array): any {
    // Convert Ed25519 B_view to X25519
    const recipientX25519 = this.crypto.ed25519ToCurve25519Public(B_view);

    // Generate ephemeral X25519 keypair
    const ephemeralKeyPair = nacl.box.keyPair();

    // Serialize blob to JSON
    const plaintext = new TextEncoder().encode(JSON.stringify(blob));

    // Generate nonce
    const nonce = nacl.randomBytes(24);

    // Encrypt with NaCl box
    const ciphertext = nacl.box(
      plaintext,
      nonce,
      recipientX25519,
      ephemeralKeyPair.secretKey
    );

    return {
      sealed: {
        ciphertext: this.base64Encode(ciphertext),
        nonce: this.base64Encode(nonce),
        recipient: this.bytesToHex(B_view),
      },
      ephemeral_pk: this.bytesToHex(ephemeralKeyPair.publicKey),
    };
  }

  /**
   * Decrypt blob using receiver's b_view private key
   *
   * @param encryptedBlob - Encrypted blob envelope
   * @param b_view - Receiver's view private key (Ed25519, 32 bytes)
   * @returns Decrypted blob object or null on failure
   */
  private decryptBlobWithView(encryptedBlob: any, b_view: Uint8Array): any | null {
    try {
      // Convert Ed25519 b_view to X25519
      const receiverX25519Private = this.crypto.ed25519ToCurve25519Private(b_view);

      // Decode encrypted components
      const ciphertext = this.base64Decode(encryptedBlob.sealed.ciphertext);
      const nonce = this.base64Decode(encryptedBlob.sealed.nonce);
      const ephemeralPk = this.hexToBytes(encryptedBlob.ephemeral_pk);

      // Decrypt with NaCl box.open
      const plaintext = nacl.box.open(
        ciphertext,
        nonce,
        ephemeralPk,
        receiverX25519Private
      );

      if (!plaintext) {
        console.warn("[Ceramic] Decryption failed: invalid ciphertext or wrong key");
        return null;
      }

      const blob = JSON.parse(new TextDecoder().decode(plaintext));

      // Validate blob structure
      if (!this.validateBlob(blob)) {
        console.warn("[Ceramic] Decryption succeeded but blob validation failed");
        return null;
      }

      return blob;
    } catch (error) {
      console.warn("[Ceramic] Decryption error:", error);
      return null;
    }
  }

  /**
   * Append send event to Ceramic stream (fire-and-forget)
   *
   * @param nnymAddress - Recipient's nnym_ address
   * @param R - Ephemeral public key (hex)
   * @param txHash - Nano transaction hash
   * @param amountRaw - Raw amount string
   */
  async appendSendEvent(
    nnymAddress: string,
    R: string,
    txHash: string,
    amountRaw: string
  ): Promise<void> {
    try {
      // Derive target DID from address (sender-side)
      const { privateKey, did } = this.crypto.deriveCeramicDIDFromAddress(nnymAddress);

      // Parse address to get B_view for encryption
      const parsed = this.decodeAddress(nnymAddress);

      // Create notification object (Tier-1 format)
      const notification: NanoNymNotification = {
        _v: 1,
        _p: "NNymNotify",
        R: R,
        tx_h: txHash,
        a_raw: amountRaw,
      };

      // Wrap in Ceramic record (Tier-2 format)
      const record: NanoNymNotificationsRecord = {
        _v: 3,
        _p: "NNymRecord",
        o_ts: Math.floor(Date.now() / 1000),
        s_txs: [notification],
      };

      // Encrypt record to B_view
      const encrypted = this.encryptBlobToView(record, parsed.viewPublic);

      // Authenticate and append
      const streamID = await this.authenticateAndAppend(did, privateKey, encrypted);

      console.log(
        `[Ceramic] 📤 Backup appended for tx ${txHash.slice(0, 8)}... to stream ${streamID.slice(0, 16)}...`
      );
    } catch (error) {
      // Non-blocking: log warning but don't throw
      console.warn("[Ceramic] Backup append failed (non-fatal):", error);
    }
  }

  /**
   * Recover stealth account events from Ceramic stream
   *
   * @param seed - Wallet seed
   * @param accountIndex - NanoNym account index
   * @param sinceTimestamp - Optional: only return events after this timestamp (default: 0)
   * @returns Array of NanoNymNotification objects
   */
  async recoverFromStream(
    seed: string | Uint8Array,
    accountIndex: number,
    sinceTimestamp: number = 0
  ): Promise<NanoNymNotification[]> {
    try {
      // Derive Ceramic DID for this NanoNym (receiver-side)
      const { did } = this.crypto.deriveCeramicDIDForNanoNym(seed, accountIndex);

      // Derive view key for decryption
      const keys = this.crypto.deriveNanoNymKeys(seed, accountIndex);
      const b_view = keys.view.private;

      // Resolve stream ID (may not exist if never used)
      let stream: TileDocument;
      try {
        stream = await TileDocument.deterministic(
          this.ceramicClient,
          {
            controllers: [did],
            family: "nanonym-backup",
            tags: ["v2"],
          },
          { anchor: false, publish: false } // Don't create if missing
        );
      } catch (error) {
        // Stream doesn't exist
        console.log(
          `[Ceramic] No stream found for NanoNym #${accountIndex} (never used)`
        );
        return [];
      }

      const streamID = stream.id.toString();
      const events: any[] = (stream.content as any)?.events || [];

      if (events.length === 0) {
        console.log(
          `[Ceramic] Stream ${streamID.slice(0, 16)}... exists but is empty`
        );
        return [];
      }

      // Decrypt and filter events
      const recovered: NanoNymNotification[] = [];

      for (const encryptedRecord of events) {
        const record = this.decryptBlobWithView(encryptedRecord, b_view) as NanoNymNotificationsRecord;
        if (!record) {
          continue; // Skip failed decryptions
        }

        // Filter by timestamp
        if (record.o_ts < sinceTimestamp) {
          continue;
        }

        // Extract notification objects from record
        for (const notification of record.s_txs) {
          recovered.push(notification);
        }
      }

      console.log(
        `[Ceramic] 📥 Recovered ${recovered.length} events from stream ${streamID.slice(0, 16)}... for NanoNym #${accountIndex}`
      );

      return recovered;
    } catch (error) {
      console.warn(
        `[Ceramic] Recovery failed for NanoNym #${accountIndex}:`,
        error
      );
      return []; // Return empty array on failure
    }
  }

  // ========================================================================
  // HEALTH CHECK
  // ========================================================================

  /**
   * Check if Ceramic gateway is reachable and healthy
   * @returns Health status with message
   */
  async checkHealth(): Promise<{ healthy: boolean; message: string }> {
    const healthUrl = `${this.gatewayUrl}/api/v0/node/healthcheck`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(healthUrl, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const text = await response.text();
      const healthy = response.status === 200 && text === "Alive!";

      console.log(
        `[Ceramic] Health check: ${healthy ? "✅ OK" : "❌ Failed"} (${this.gatewayUrl})`
      );
      return { healthy, message: text };
    } catch (error: any) {
      const message = error.name === "AbortError" ? "Timeout" : error.message;
      console.warn(`[Ceramic] Health check: ❌ ${message}`);
      return { healthy: false, message };
    }
  }

  // ========================================================================
  // HELPER METHODS
  // ========================================================================

  private validateBlob(record: any): boolean {
    // Validate Ceramic record structure (Tier-2)
    if (
      record._v !== 3 ||
      record._p !== "NNymRecord" ||
      typeof record.o_ts !== "number" ||
      !Array.isArray(record.s_txs)
    ) {
      return false;
    }

    // Validate each notification (Tier-1) within the record
    return record.s_txs.every(
      (notification: any) =>
        notification._v === 1 &&
        notification._p === "NNymNotify" &&
        typeof notification.R === "string" &&
        typeof notification.tx_h === "string" &&
        notification.R.length === 64 &&
        notification.tx_h.length === 64
    );
  }

  private decodeAddress(nnymAddress: string): {
    spendPublic: Uint8Array;
    viewPublic: Uint8Array;
    nostrPublic: Uint8Array;
  } {
    // Extract public keys from nnym_ address
    // This is a simplified version - actual implementation should use
    // the full decodeNanoNymAddress method from crypto service
    // For now, we'll call the crypto service method
    return this.crypto.decodeNanoNymAddress(nnymAddress);
  }

  private base64Encode(data: Uint8Array): string {
    return Buffer.from(data).toString("base64");
  }

  private base64Decode(data: string): Uint8Array {
    return new Uint8Array(Buffer.from(data, "base64"));
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }
}
