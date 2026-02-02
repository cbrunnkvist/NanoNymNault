import { Injectable } from "@angular/core";
import { nip59, nip19 } from "nostr-tools";
import * as Rx from "rxjs";
import { deriveContentTopic, deriveBucket } from "./waku-topics";
import type { NanoNymNotification } from "./nostr-notification.service";

import { createLightNode, waitForRemotePeer, Protocols } from "@waku/sdk";
import { createEncoder } from "@waku/sdk";
import type { LightNode, IEncoder, IRoutingInfo } from "@waku/sdk";

/**
 * Result of a Waku send operation
 */
export interface WakuSendResult {
  success: boolean;
  contentTopic: string;
  error?: string;
}

/**
 * Connection status for Waku node
 */
export interface WakuConnectionStatus {
  connected: boolean;
  peerCount: number;
  error?: string;
}

/**
 * WakuNotificationService
 *
 * Sends encrypted NanoNym payment notifications via Waku LightPush protocol.
 * Parallel implementation to NostrNotificationService for the Waku/Codex spike.
 *
 * Features:
 * - Connects to local nwaku node
 * - Uses NIP-59 gift-wrapping for encryption (same as Nostr)
 * - Routes messages by content topic derived from receiver's pubkey
 * - Sends via LightPush protocol
 */
const DEFAULT_CLUSTER_ID = 1;
const DEFAULT_NUM_SHARDS = 8;

@Injectable({
  providedIn: "root",
})
export class WakuNotificationService {
  private readonly NWAKU_MULTIADDR =
    "/ip4/127.0.0.1/tcp/8545/ws/p2p/16Uiu2HAm7gPPVHYxTZ9kXctnSumLcQ67m2dN2NLXaEwbXZh2WN8C";

  private readonly NWAKU_WS_ENDPOINT = "/ip4/127.0.0.1/tcp/8545/ws";

  private node: LightNode | null = null;

  public connectionStatus$ = new Rx.BehaviorSubject<WakuConnectionStatus>({
    connected: false,
    peerCount: 0,
  });

  constructor() {}

  /**
   * Convert Uint8Array to hex string
   */
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Convert hex string to Uint8Array
   */
  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Initialize and connect the Waku light node
   *
   * @returns Promise<boolean> - True if connected successfully
   */
  async connect(): Promise<boolean> {
    try {
      console.log("[Waku] Creating light node...");

      // Create a light node
      this.node = await createLightNode({
        defaultBootstrap: false, // We'll connect to local nwaku manually
      });

      console.log("[Waku] Starting node...");
      await this.node.start();

      console.log("[Waku] Connecting to local nwaku node...");

      // Connect to local nwaku node
      // Try multiaddr with peer ID first, then fallback to discovery
      try {
        await this.node.dial(this.NWAKU_MULTIADDR);
        console.log("[Waku] ✅ Connected to nwaku via multiaddr");
      } catch (dialError) {
        console.warn(
          "[Waku] Could not dial full multiaddr, trying WS endpoint:",
          dialError,
        );
        // Try just the WebSocket endpoint
        await this.node.dial(this.NWAKU_WS_ENDPOINT);
        console.log("[Waku] ✅ Connected to nwaku via WS endpoint");
      }

      // Wait for LightPush protocol to be available
      console.log("[Waku] Waiting for LightPush protocol...");
      await waitForRemotePeer(this.node, [Protocols.LightPush], 10000);

      const peers = await this.node.libp2p.getPeers();
      console.log(`[Waku] ✅ Connected with ${peers.length} peers`);

      this.connectionStatus$.next({
        connected: true,
        peerCount: peers.length,
      });

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[Waku] ❌ Connection failed:", errorMessage);

      this.connectionStatus$.next({
        connected: false,
        peerCount: 0,
        error: errorMessage,
      });

      return false;
    }
  }

  /**
   * Disconnect the Waku node
   */
  async disconnect(): Promise<void> {
    if (this.node) {
      console.log("[Waku] Stopping node...");
      await this.node.stop();
      this.node = null;

      this.connectionStatus$.next({
        connected: false,
        peerCount: 0,
      });

      console.log("[Waku] ✅ Node stopped");
    }
  }

  /**
   * Check if the node is connected
   */
  isConnected(): boolean {
    return this.node !== null && this.connectionStatus$.value.connected;
  }

  /**
   * Send a NanoNym notification via Waku LightPush
   *
   * Uses NIP-59 gift-wrapping for encryption (same as NostrNotificationService)
   * to maintain compatibility and reuse proven encryption scheme.
   *
   * @param notification - The notification payload (R, tx_hash, amount, etc.)
   * @param senderNostrPrivate - Sender's Nostr private key (for gift-wrap signing)
   * @param receiverNostrPublic - Receiver's Nostr public key (for encryption & routing)
   * @returns Promise<WakuSendResult> - Result of the send operation
   */
  async sendNotification(
    notification: NanoNymNotification,
    senderNostrPrivate: Uint8Array,
    receiverNostrPublic: Uint8Array,
  ): Promise<WakuSendResult> {
    // Ensure we're connected
    if (!this.node) {
      const connected = await this.connect();
      if (!connected) {
        return {
          success: false,
          contentTopic: "",
          error: "Failed to connect to Waku network",
        };
      }
    }

    // Convert receiver public key to hex for NIP-59
    const receiverPublicHex = this.bytesToHex(receiverNostrPublic);
    const receiverNpub = nip19.npubEncode(receiverPublicHex);

    console.debug(
      "[Waku Send] Receiver public key (hex):",
      receiverPublicHex.slice(0, 16) + "...",
    );
    console.debug("[Waku Send] Receiver public key (npub):", receiverNpub);

    // Derive content topic from receiver's public key
    const contentTopic = deriveContentTopic(receiverNostrPublic);
    console.debug("[Waku Send] Content topic:", contentTopic);

    // Serialize notification payload
    const payloadJson = JSON.stringify(notification);
    console.debug("[Waku Send] Payload:", payloadJson);

    try {
      // Create NIP-59 gift-wrapped event (same encryption as Nostr)
      // This ensures the notification is encrypted to the receiver
      const rumor = {
        kind: 14, // Direct message rumor
        content: payloadJson,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", receiverPublicHex]],
      };

      // Use nip59.wrapEvent to create the gift-wrapped message
      // This handles both sealing (encrypting to recipient) and wrapping (with ephemeral key)
      const giftWrap = nip59.wrapEvent(
        rumor,
        senderNostrPrivate,
        receiverPublicHex,
      );

      console.debug("[Waku Send] Gift-wrap created:", {
        id: giftWrap.id,
        kind: giftWrap.kind,
        pubkey: giftWrap.pubkey.slice(0, 16) + "...",
        created_at: giftWrap.created_at,
        content_length: giftWrap.content.length,
      });

      // Serialize the gift-wrapped event to JSON, then to bytes
      const giftWrapJson = JSON.stringify(giftWrap);
      const messagePayload = new TextEncoder().encode(giftWrapJson);

      // Create encoder for this content topic
      const encoder: IEncoder = createEncoder({
        contentTopic,
        ephemeral: false, // Store in nwaku for retrieval
      });

      console.log(
        `[Waku Send] 📤 Sending notification via LightPush to topic: ${contentTopic}`,
      );

      // Send via LightPush
      const sendResult = await this.node!.lightPush.send(encoder, {
        payload: messagePayload,
      });

      // Check result
      if (sendResult.failures && sendResult.failures.length > 0) {
        const failureMsg = sendResult.failures
          .map((f) => f.error?.message || "Unknown error")
          .join(", ");
        console.warn("[Waku Send] ⚠️ Some failures:", failureMsg);

        // If all failed, return error
        if (
          !sendResult.successes ||
          sendResult.successes.length === 0
        ) {
          return {
            success: false,
            contentTopic,
            error: `LightPush failed: ${failureMsg}`,
          };
        }
      }

      console.log(
        `[Waku Send] ✅ Notification sent successfully to ${sendResult.successes?.length || 0} peers`,
      );

      return {
        success: true,
        contentTopic,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[Waku Send] ❌ Error sending notification:", errorMessage);

      return {
        success: false,
        contentTopic,
        error: errorMessage,
      };
    }
  }

  /**
   * Get the content topic for a given receiver public key
   * Useful for debugging and testing
   *
   * @param receiverNostrPublic - Receiver's Nostr public key
   * @returns Content topic string
   */
  getContentTopic(receiverNostrPublic: Uint8Array): string {
    return deriveContentTopic(receiverNostrPublic);
  }
}
