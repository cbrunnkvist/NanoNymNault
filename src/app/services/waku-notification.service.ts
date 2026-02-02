import { Injectable } from "@angular/core";
import { nip59, nip19 } from "nostr-tools";
import * as Rx from "rxjs";
import { deriveContentTopic, deriveBucket } from "./waku-topics";
import type { NanoNymNotification } from "./nostr-notification.service";

import { createLightNode, waitForRemotePeer, Protocols } from "@waku/sdk";
import { createEncoder, createDecoder } from "@waku/sdk";
import type { LightNode, IEncoder, IDecodedMessage } from "@waku/sdk";
import type { IRoutingInfo } from "@waku/interfaces";

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
 * Progress callback for recovery operations
 */
export type WakuRecoveryProgressCallback = (progress: WakuRecoveryProgress) => void;

/**
 * Progress information for recovery operations
 */
export interface WakuRecoveryProgress {
  /** Current day being processed (1-indexed) */
  currentDay: number;
  /** Total days to process */
  totalDays: number;
  /** Messages found so far */
  messagesFound: number;
  /** Current date being queried */
  currentDate: Date;
}

/**
 * Result of a Store recovery operation
 */
export interface WakuRecoveryResult {
  success: boolean;
  /** Total unique messages recovered */
  messagesRecovered: number;
  /** Number of duplicates filtered out */
  duplicatesFiltered: number;
  /** Days successfully queried */
  daysProcessed: number;
  /** Any errors encountered */
  errors: string[];
  /** Recovered notifications (decrypted if possible) */
  notifications: NanoNymNotification[];
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

  public incomingNotifications$ = new Rx.Subject<{
    notification: NanoNymNotification;
    receiverNostrPrivate: Uint8Array;
  }>();

  private subscriptions = new Map<
    string,
    {
      decoder: ReturnType<typeof createDecoder>;
      nostrPrivate: Uint8Array;
      contentTopic: string;
    }
  >();

  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY_MS = 3000;
  private reconnectTimer: any = null;

  private lastVisibleTimestamp: number = Date.now();
  private visibilityChangeHandler: (() => void) | null = null;
  private recoveryInProgress = false;
  private readonly FOREGROUND_RECOVERY_THRESHOLD_MS = 5000;

  constructor() {
    this.setupVisibilityHandler();
  }

  private setupVisibilityHandler(): void {
    if (typeof document === "undefined") return;

    this.visibilityChangeHandler = () => {
      if (document.visibilityState === "visible") {
        this.handleForegroundResume();
      } else {
        this.lastVisibleTimestamp = Date.now();
      }
    };

    document.addEventListener("visibilitychange", this.visibilityChangeHandler);
    console.log("[Waku] ✅ Page Visibility handler registered");
  }

  private async handleForegroundResume(): Promise<void> {
    const hiddenDurationMs = Date.now() - this.lastVisibleTimestamp;
    const hiddenDurationSec = Math.round(hiddenDurationMs / 1000);

    if (hiddenDurationMs < this.FOREGROUND_RECOVERY_THRESHOLD_MS) {
      console.debug(`[Waku] Foreground resume after ${hiddenDurationSec}s - skipping (threshold: ${this.FOREGROUND_RECOVERY_THRESHOLD_MS / 1000}s)`);
      return;
    }

    if (this.recoveryInProgress || this.subscriptions.size === 0) {
      return;
    }

    console.log(`[Waku] 📱 Foreground resume after ${hiddenDurationSec}s - recovering ${this.subscriptions.size} subscription(s)`);
    this.recoveryInProgress = true;

    try {
      const startDate = new Date(this.lastVisibleTimestamp);
      const endDate = new Date();

      for (const [nostrPublicHex, subData] of this.subscriptions) {
        const nostrPublic = this.hexToBytes(nostrPublicHex);

        try {
          const result = await this.recoverNotifications(startDate, endDate, nostrPublic, subData.nostrPrivate);
          if (result.messagesRecovered > 0) {
            console.log(`[Waku] ✅ Recovered ${result.messagesRecovered} notification(s) for ${nostrPublicHex.slice(0, 16)}...`);
          }
        } catch (error) {
          console.warn(`[Waku] Recovery failed for ${nostrPublicHex.slice(0, 16)}...:`, error);
        }
      }

      // iOS PWA kills WebSocket when backgrounded - re-establish subscriptions
      await this.resubscribeAll();
    } finally {
      this.recoveryInProgress = false;
      this.lastVisibleTimestamp = Date.now();
    }
  }

  private async resubscribeAll(): Promise<void> {
    if (!this.isConnected()) {
      console.log("[Waku] Reconnecting after foreground resume...");
      const connected = await this.connect();
      if (!connected) {
        console.error("[Waku] Failed to reconnect after foreground resume");
        return;
      }
    }

    const subscriptionData = Array.from(this.subscriptions.entries()).map(([pubHex, data]) => ({
      nostrPublic: this.hexToBytes(pubHex),
      nostrPrivate: data.nostrPrivate,
    }));

    this.subscriptions.clear();

    for (const { nostrPublic, nostrPrivate } of subscriptionData) {
      try {
        await this.subscribeToNotifications(nostrPublic, nostrPrivate);
      } catch (error) {
        console.warn("[Waku] Failed to resubscribe:", error);
      }
    }

    console.log(`[Waku] ✅ Re-established ${this.subscriptions.size} subscription(s)`);
  }

  destroyVisibilityHandler(): void {
    if (this.visibilityChangeHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityChangeHandler);
      this.visibilityChangeHandler = null;
    }
  }

  /**
   * Convert Uint8Array to hex string
   */
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private createRoutingInfo(pubkey: Uint8Array): IRoutingInfo {
    const bucket = deriveBucket(pubkey);
    const shardId = bucket % DEFAULT_NUM_SHARDS;
    const pubsubTopic = `/waku/2/rs/${DEFAULT_CLUSTER_ID}/${shardId}`;
    return { clusterId: DEFAULT_CLUSTER_ID, shardId, pubsubTopic };
  }

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

      // Wait for LightPush, Store, and Filter protocols to be available
      console.log("[Waku] Waiting for LightPush, Store, and Filter protocols...");
      await waitForRemotePeer(this.node, [Protocols.LightPush, Protocols.Store, Protocols.Filter], 10000);

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

      const routingInfo = this.createRoutingInfo(receiverNostrPublic);
      const encoder: IEncoder = createEncoder({
        contentTopic,
        routingInfo,
        ephemeral: false,
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
          .map((f) => String(f.error))
          .join(", ");
        console.warn("[Waku Send] Some failures:", failureMsg);

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

  /**
   * Recover notifications from Store protocol using 24h chunked queries.
   * Waku Store has ~24h query limit, so we iterate day-by-day.
   *
   * @param startDate - Start of recovery window
   * @param endDate - End of recovery window
   * @param receiverNostrPublic - Receiver's Nostr public key (for content topic derivation)
   * @param receiverNostrPrivate - Receiver's Nostr private key (for decryption)
   * @param onProgress - Optional callback for progress updates
   * @returns Recovery result with notifications
   */
  async recoverNotifications(
    startDate: Date,
    endDate: Date,
    receiverNostrPublic: Uint8Array,
    receiverNostrPrivate: Uint8Array,
    onProgress?: WakuRecoveryProgressCallback,
  ): Promise<WakuRecoveryResult> {
    const result: WakuRecoveryResult = {
      success: false,
      messagesRecovered: 0,
      duplicatesFiltered: 0,
      daysProcessed: 0,
      errors: [],
      notifications: [],
    };

    if (!this.node) {
      const connected = await this.connect();
      if (!connected) {
        result.errors.push("Failed to connect to Waku network");
        return result;
      }
    }

    const seenMessageIds = new Set<string>();
    const receiverPublicHex = this.bytesToHex(receiverNostrPublic);

    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);

    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));

    console.log(`[Waku Recovery] Starting recovery from ${start.toISOString()} to ${end.toISOString()} (${totalDays} days)`);

    let currentDay = 0;
    const currentDate = new Date(start);

    while (currentDate <= end) {
      currentDay++;
      const dayStart = new Date(currentDate);
      const dayEnd = new Date(currentDate);
      dayEnd.setUTCHours(23, 59, 59, 999);

      const contentTopic = deriveContentTopic(receiverNostrPublic, currentDate);

      console.log(`[Waku Recovery] Day ${currentDay}/${totalDays}: ${currentDate.toISOString().split('T')[0]} - Topic: ${contentTopic}`);

      if (onProgress) {
        onProgress({
          currentDay,
          totalDays,
          messagesFound: result.messagesRecovered,
          currentDate: new Date(currentDate),
        });
      }

      try {
        const routingInfo = this.createRoutingInfo(receiverNostrPublic);
        const decoder = createDecoder(contentTopic, routingInfo);
        const messagesForDay: IDecodedMessage[] = [];

        await this.node!.store.queryWithOrderedCallback(
          [decoder],
          (message: IDecodedMessage) => {
            if (message && message.payload) {
              messagesForDay.push(message);
            }
          },
        );

        console.log(`[Waku Recovery] Day ${currentDay}: Found ${messagesForDay.length} messages`);

        for (const message of messagesForDay) {
          try {
            const payloadText = new TextDecoder().decode(message.payload);
            const giftWrap = JSON.parse(payloadText);
            const messageId = giftWrap.id;

            if (seenMessageIds.has(messageId)) {
              result.duplicatesFiltered++;
              continue;
            }
            seenMessageIds.add(messageId);

            const unwrapped = nip59.unwrapEvent(giftWrap, receiverNostrPrivate);
            if (unwrapped && unwrapped.content) {
              const notification = JSON.parse(unwrapped.content) as NanoNymNotification;
              result.notifications.push(notification);
              result.messagesRecovered++;
            }
          } catch (decryptError) {
            // Message not for us or corrupted - skip silently
          }
        }

        result.daysProcessed++;
      } catch (dayError) {
        const errorMsg = dayError instanceof Error ? dayError.message : String(dayError);
        console.warn(`[Waku Recovery] Error querying day ${currentDay}: ${errorMsg}`);
        result.errors.push(`Day ${currentDay}: ${errorMsg}`);
      }

      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    result.success = result.errors.length === 0 || result.messagesRecovered > 0;

    console.log(`[Waku Recovery] Complete: ${result.messagesRecovered} messages recovered, ${result.duplicatesFiltered} duplicates filtered, ${result.daysProcessed}/${totalDays} days processed`);

    return result;
  }

  async subscribeToNotifications(
    nostrPublic: Uint8Array,
    nostrPrivate: Uint8Array,
  ): Promise<void> {
    const nostrPublicHex = this.bytesToHex(nostrPublic);
    const nostrNpub = nip19.npubEncode(nostrPublicHex);

    console.debug("[Waku Filter] Nostr public key (hex):", nostrPublicHex.slice(0, 16) + "...");
    console.debug("[Waku Filter] Nostr public key (npub):", nostrNpub);

    if (this.subscriptions.has(nostrPublicHex)) {
      console.debug("[Waku Filter] Already subscribed to:", nostrNpub.substring(0, 16) + "...");
      return;
    }

    if (!this.node) {
      const connected = await this.connect();
      if (!connected) {
        console.error("[Waku Filter] Failed to connect to Waku network");
        return;
      }
    }

    const contentTopic = deriveContentTopic(nostrPublic);
    console.debug("[Waku Filter] Content topic:", contentTopic);

    try {
      const routingInfo = this.createRoutingInfo(nostrPublic);
      const decoder = createDecoder(contentTopic, routingInfo);

      const callback = (message: IDecodedMessage) => {
        if (!message || !message.payload) return;
        this.handleIncomingMessage(message, nostrPrivate);
      };

      console.log(`[Waku Filter] 📡 Creating subscription for ${nostrNpub.substring(0, 16)}...`);

      const success = await this.node!.filter.subscribe(decoder, callback);

      if (!success) {
        console.error("[Waku Filter] ❌ Subscription creation failed");
        this.scheduleReconnect(nostrPublic, nostrPrivate);
        return;
      }

      this.subscriptions.set(nostrPublicHex, {
        decoder,
        nostrPrivate,
        contentTopic,
      });

      this.reconnectAttempts = 0;
      console.log(`[Waku Filter] ✅ Subscription active for ${nostrNpub.substring(0, 16)}...`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[Waku Filter] ❌ Error creating subscription:", errorMessage);
      this.scheduleReconnect(nostrPublic, nostrPrivate);
    }
  }

  private handleIncomingMessage(
    message: IDecodedMessage,
    nostrPrivate: Uint8Array,
  ): void {
    try {
      const payloadText = new TextDecoder().decode(message.payload);
      const giftWrap = JSON.parse(payloadText);

      let unwrapped;
      try {
        unwrapped = nip59.unwrapEvent(giftWrap, nostrPrivate);
      } catch (decryptError) {
        return;
      }

      if (!unwrapped) {
        return;
      }

      const notification: NanoNymNotification = JSON.parse(unwrapped.content);

      if (!this.validateNotification(notification)) {
        console.warn("[Waku Filter] Invalid notification format:", notification);
        return;
      }

      console.log("[Waku Filter] ✅ Payment notification received:", {
        tx_hash: notification.tx_hash,
        amount: notification.amount || "unknown",
      });

      this.incomingNotifications$.next({
        notification,
        receiverNostrPrivate: nostrPrivate,
      });
    } catch (error) {
      console.error("[Waku Filter] Error processing incoming message:", error);
    }
  }

  private validateNotification(notification: any): notification is NanoNymNotification {
    return (
      notification &&
      typeof notification === "object" &&
      notification.version === 1 &&
      notification.protocol === "nanoNymNault" &&
      typeof notification.R === "string" &&
      typeof notification.tx_hash === "string"
    );
  }

  private scheduleReconnect(nostrPublic: Uint8Array, nostrPrivate: Uint8Array): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error("[Waku Filter] ❌ Max reconnection attempts reached");
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    const delay = this.RECONNECT_DELAY_MS * this.reconnectAttempts;

    console.log(`[Waku Filter] 🔄 Scheduling reconnect attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);

    this.reconnectTimer = setTimeout(async () => {
      console.log(`[Waku Filter] 🔄 Reconnecting (attempt ${this.reconnectAttempts})...`);

      const nostrPublicHex = this.bytesToHex(nostrPublic);
      this.subscriptions.delete(nostrPublicHex);

      try {
        if (!this.node || !this.isConnected()) {
          await this.disconnect();
          await this.connect();
        }
        await this.subscribeToNotifications(nostrPublic, nostrPrivate);
      } catch (error) {
        console.error("[Waku Filter] Reconnection failed:", error);
        this.scheduleReconnect(nostrPublic, nostrPrivate);
      }
    }, delay);
  }

  async unsubscribeFromNotifications(nostrPublic: Uint8Array): Promise<void> {
    const nostrPublicHex = this.bytesToHex(nostrPublic);
    const subData = this.subscriptions.get(nostrPublicHex);

    if (!subData) {
      console.debug("[Waku Filter] No subscription found for:", nostrPublicHex.slice(0, 16) + "...");
      return;
    }

    try {
      await this.node?.filter.unsubscribe(subData.decoder);
      console.log("[Waku Filter] ✅ Unsubscribed from:", nostrPublicHex.slice(0, 16) + "...");
    } catch (error) {
      console.warn("[Waku Filter] Error during unsubscribe:", error);
    }

    this.subscriptions.delete(nostrPublicHex);
  }

  getActiveSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  getActiveSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys());
  }
}
