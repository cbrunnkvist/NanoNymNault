import { Injectable } from "@angular/core";
import { SimplePool, nip59 } from "nostr-tools";
import type { Event } from "nostr-tools/lib/types/core";
import * as Rx from "rxjs";
import { NanoNymCryptoService } from "./nanonym-crypto.service";

export interface NanoNymNotification {
  version: number;
  protocol: string;
  R: string; // Ephemeral public key (hex)
  tx_hash: string; // Nano transaction hash
  amount?: string; // Optional: XNO amount
  amount_raw?: string; // Optional: raw amount
  memo?: string; // Optional: encrypted memo
}

export interface RelayStatus {
  url: string;
  connected: boolean;
  error?: string;
}

@Injectable({
  providedIn: "root",
})
export class NostrNotificationService {
  // Default relay list - can be configured by user later
  private defaultRelays = [
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.snort.social",
    "wss://relay.nostr.band",
    "wss://nostr.wine",
  ];

  // SimplePool for managing multiple relay connections
  private pool: SimplePool;

  // Observable for relay connection status
  public relayStatus$ = new Rx.BehaviorSubject<RelayStatus[]>([]);

  // Observable for incoming notifications
  public incomingNotifications$ = new Rx.Subject<{
    notification: NanoNymNotification;
    receiverNostrPrivate: Uint8Array;
  }>();

  // Active subscriptions map (nostrPublicHex -> subscription)
  private subscriptions = new Map<string, any>();

  constructor(private nanoNymCrypto: NanoNymCryptoService) {
    this.pool = new SimplePool();
    this.initializeRelays();
  }

  /**
   * Initialize connections to default relays
   */
  private initializeRelays(): void {
    const statuses: RelayStatus[] = this.defaultRelays.map((url) => ({
      url,
      connected: false,
    }));
    this.relayStatus$.next(statuses);
  }

  /**
   * Get current relay URLs
   */
  getRelays(): string[] {
    return [...this.defaultRelays];
  }

  /**
   * Update relay status
   */
  private updateRelayStatus(
    url: string,
    connected: boolean,
    error?: string,
  ): void {
    const currentStatuses = this.relayStatus$.value;
    const updatedStatuses = currentStatuses.map((status) =>
      status.url === url ? { url, connected, error } : status,
    );
    this.relayStatus$.next(updatedStatuses);
  }

  /**
   * Send a NanoNym notification
   *
   * @param notification - The notification payload
   * @param senderNostrPrivate - Sender's Nostr private key (for signing)
   * @param receiverNostrPublic - Receiver's Nostr public key (for encryption)
   * @returns Promise<string[]> - Array of relay URLs that accepted the event
   */
  async sendNotification(
    notification: NanoNymNotification,
    senderNostrPrivate: Uint8Array,
    receiverNostrPublic: Uint8Array,
  ): Promise<string[]> {
    // Convert receiver public key to hex format (wrapEvent expects Uint8Array for private key)
    const receiverPublicHex = this.bytesToHex(receiverNostrPublic);

    // Serialize notification payload
    const payloadJson = JSON.stringify(notification);

    try {
      // Create NIP-59 gift-wrapped event
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

      // Publish to all relays
      const publishResults = await Promise.allSettled(
        this.defaultRelays.map((relay) => this.pool.publish([relay], giftWrap)),
      );

      // Track which relays accepted the event
      const acceptedRelays: string[] = [];
      publishResults.forEach((result, index) => {
        const relayUrl = this.defaultRelays[index];
        if (result.status === "fulfilled") {
          acceptedRelays.push(relayUrl);
          this.updateRelayStatus(relayUrl, true);
        } else {
          this.updateRelayStatus(relayUrl, false, result.reason);
        }
      });

      return acceptedRelays;
    } catch (error) {
      console.error("Error sending Nostr notification:", error);
      throw error;
    }
  }

  /**
   * Subscribe to notifications for a specific NanoNym account
   *
   * @param nostrPublic - The Nostr public key to monitor (from NanoNym address)
   * @param nostrPrivate - The Nostr private key for decryption
   */
  subscribeToNotifications(
    nostrPublic: Uint8Array,
    nostrPrivate: Uint8Array,
  ): void {
    const nostrPublicHex = this.bytesToHex(nostrPublic);

    // Don't create duplicate subscriptions
    if (this.subscriptions.has(nostrPublicHex)) {
      console.log("Already subscribed to notifications for", nostrPublicHex);
      return;
    }

    // Subscribe to kind:1059 (gift-wrapped) events for this pubkey
    const sub = this.pool.subscribeMany(
      this.defaultRelays,
      [
        {
          kinds: [1059], // Gift-wrapped events
          "#p": [nostrPublicHex], // Targeted to this pubkey
          since: Math.floor(Date.now() / 1000) - 86400, // Last 24 hours
        },
      ],
      {
        onevent: (event: Event) => {
          this.handleIncomingEvent(event, nostrPrivate);
        },
        oneose: () => {
          console.log("Nostr subscription synced for", nostrPublicHex);
        },
      },
    );

    this.subscriptions.set(nostrPublicHex, sub);
    console.log(
      "Subscribed to Nostr notifications for NanoNym:",
      nostrPublicHex,
    );
  }

  /**
   * Unsubscribe from notifications for a specific NanoNym
   *
   * @param nostrPublic - The Nostr public key to stop monitoring
   */
  unsubscribeFromNotifications(nostrPublic: Uint8Array): void {
    const nostrPublicHex = this.bytesToHex(nostrPublic);
    const sub = this.subscriptions.get(nostrPublicHex);

    if (sub) {
      sub.close();
      this.subscriptions.delete(nostrPublicHex);
      console.log("Unsubscribed from Nostr notifications for", nostrPublicHex);
    }
  }

  /**
   * Handle incoming gift-wrapped event
   */
  private async handleIncomingEvent(
    event: Event,
    nostrPrivate: Uint8Array,
  ): Promise<void> {
    try {
      // Unwrap the gift-wrapped event using NIP-59
      const unwrapped = nip59.unwrapEvent(event, nostrPrivate);

      if (!unwrapped) {
        console.warn("Failed to unwrap Nostr event");
        return;
      }

      // Parse the notification payload
      const notification: NanoNymNotification = JSON.parse(unwrapped.content);

      // Validate notification format
      if (!this.validateNotification(notification)) {
        console.warn("Invalid notification format:", notification);
        return;
      }

      // Emit the notification for processing
      this.incomingNotifications$.next({
        notification,
        receiverNostrPrivate: nostrPrivate,
      });

      console.log("Received NanoNym notification:", notification);
    } catch (error) {
      console.error("Error processing incoming Nostr event:", error);
    }
  }

  /**
   * Validate notification structure
   */
  private validateNotification(
    notification: any,
  ): notification is NanoNymNotification {
    return (
      notification &&
      typeof notification === "object" &&
      notification.version === 1 &&
      notification.protocol === "nanoNymNault" &&
      typeof notification.R === "string" &&
      typeof notification.tx_hash === "string"
    );
  }

  /**
   * Get active subscription count
   */
  getActiveSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Get all active subscription public keys
   */
  getActiveSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Clean up all subscriptions and connections
   */
  destroy(): void {
    // Close all subscriptions
    this.subscriptions.forEach((sub) => sub.close());
    this.subscriptions.clear();

    // Close pool connections
    this.pool.close(this.defaultRelays);

    console.log("NostrNotificationService destroyed");
  }

  /**
   * Helper: Convert Uint8Array to hex string
   */
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Helper: Convert hex string to Uint8Array
   */
  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }
}
