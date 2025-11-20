import { Injectable } from "@angular/core";
import { SimplePool, nip59, nip19 } from "nostr-tools";
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
  // Reduced to 3 most reliable relays for testing
  private defaultRelays = [
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.primal.net",
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

  // Relay connection tracking
  private relayFirstSeen = new Map<string, number>();
  private relayEventCount = new Map<string, number>();

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
    const receiverNpub = nip19.npubEncode(receiverPublicHex);

    console.debug(
      "[Nostr Send] Receiver public key (hex):",
      receiverPublicHex,
    );
    console.debug("[Nostr Send] Receiver public key (npub):", receiverNpub);

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

      console.debug(`[Nostr Send] Gift-wrap created:`, {
        id: giftWrap.id,
        kind: giftWrap.kind,
        pubkey: giftWrap.pubkey.slice(0, 16) + "...",
        created_at: giftWrap.created_at,
        tags: giftWrap.tags,
        content_length: giftWrap.content.length,
      });

      console.log(`[Nostr Send] 📤 Publishing payment notification to ${this.defaultRelays.length} relays...`);

      // Publish to all relays and wait for confirmation
      const acceptedRelays: string[] = [];

      for (const relay of this.defaultRelays) {
        try {
          console.debug(`[Nostr Send] Publishing to ${relay}...`);
          const publishPromise = this.pool.publish([relay], giftWrap);

          // Wait for the promise and check if relay accepted it
          const result = await Promise.race([
            publishPromise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Timeout")), 5000),
            ),
          ]);

          console.debug(`[Nostr Send] ✅ ${relay} accepted`);
          acceptedRelays.push(relay);
          this.updateRelayStatus(relay, true);
        } catch (error) {
          console.warn(`[Nostr Send] ⚠️ ${relay} rejected or timeout`);
          this.updateRelayStatus(relay, false, error);
        }
      }

      console.log(
        `[Nostr Send] ✅ Published to ${acceptedRelays.length}/${this.defaultRelays.length} relays`,
      );
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
    const nostrNpub = nip19.npubEncode(nostrPublicHex);

    console.debug("[Nostr] Nostr public key (hex):", nostrPublicHex);
    console.debug("[Nostr] Nostr public key (npub):", nostrNpub);

    // Don't create duplicate subscriptions
    if (this.subscriptions.has(nostrPublicHex)) {
      console.debug("[Nostr] Already subscribed to:", nostrNpub);
      return;
    }

    // Subscribe to kind:1059 (gift-wrapped) events
    // Note: NIP-59 gift wraps use ephemeral keys in the outer envelope,
    // so we cannot filter by #p tag. We must receive all gift wraps and
    // attempt to decrypt them.
    const filter = {
      kinds: [1059],
      // NIP-59 randomizes timestamps by ±2 days, so we need to look back 4 days
      // to catch all events (2 days randomization + 2 days buffer)
      since: Math.floor(Date.now() / 1000) - 4 * 86400, // Last 4 days
    };

    console.debug(
      "[Nostr] Subscription filter:",
      JSON.stringify(filter),
    );
    console.log(`[Nostr] 📡 Starting subscription to ${this.defaultRelays.length} relays for npub: ${nostrNpub.substring(0, 16)}...`);

    // Track relay sync events
    let eoseCount = 0;
    let eventCount = 0;

    const sub = this.pool.subscribeMany(this.defaultRelays, filter, {
      onevent: (event: Event) => {
        eventCount++;
        // Only process event, don't log every single one (too noisy - thousands of events)
        this.handleIncomingEvent(event, nostrPrivate);
      },

      // Track which relays are responding (uses relay.url from AbstractRelay)
      receivedEvent: (relay: any, id: string) => {
        const relayUrl = relay.url;

        // Only log on first event from each relay (connection confirmation)
        if (!this.relayFirstSeen.has(relayUrl)) {
          this.relayFirstSeen.set(relayUrl, Date.now());
          console.log(`[Nostr] 🔌 Connected: ${relayUrl}`);
          this.updateRelayStatus(relayUrl, true);
        }

        // Track event counts for statistics (silent)
        const count = (this.relayEventCount.get(relayUrl) || 0) + 1;
        this.relayEventCount.set(relayUrl, count);
      },

      oneose: () => {
        // oneose fires when a relay finishes sending stored events
        eoseCount++;
        console.debug(
          `[Nostr] EOSE ${eoseCount}/${this.defaultRelays.length} - ${eventCount} events received`,
        );
        if (eoseCount === this.defaultRelays.length) {
          console.log(
            `[Nostr] 🔄 Sync complete - ${eventCount} total events from ${this.defaultRelays.length} relays`,
          );
          this.logRelayStats();
        }
      },
    });

    this.subscriptions.set(nostrPublicHex, sub);
    console.log(
      `[Nostr] ✅ Subscription active for ${nostrNpub.substring(0, 16)}...`,
    );
  }

  /**
   * Unsubscribe from notifications for a specific NanoNym
   *
   * @param nostrPublic - The Nostr public key to stop monitoring
   */
  unsubscribeFromNotifications(nostrPublic: Uint8Array): void {
    const nostrPublicHex = this.bytesToHex(nostrPublic);
    const nostrNpub = nip19.npubEncode(nostrPublicHex);
    const sub = this.subscriptions.get(nostrPublicHex);

    if (sub) {
      sub.close();
      this.subscriptions.delete(nostrPublicHex);
      console.log(`[Nostr] 🔌 Disconnected: Stopped subscription for ${nostrNpub.substring(0, 16)}...`);
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
      // This may throw an error if the event is not meant for us (wrong key)
      let unwrapped;
      try {
        unwrapped = nip59.unwrapEvent(event, nostrPrivate);
      } catch (decryptError) {
        // Expected - this event is encrypted for a different recipient
        // Silent fail - this is normal behavior (most events are not for us)
        return;
      }

      if (!unwrapped) {
        // Silent fail - event not for us
        return;
      }

      // Parse the notification payload
      const notification: NanoNymNotification = JSON.parse(unwrapped.content);

      // Validate notification format
      if (!this.validateNotification(notification)) {
        console.warn("[Nostr] Invalid notification format:", notification);
        return;
      }

      // ONLY log successful, valid NanoNym notifications
      console.log("[Nostr] ✅ Payment notification received:", {
        tx_hash: notification.tx_hash,
        amount: notification.amount || "unknown",
      });

      // Emit the notification for processing
      this.incomingNotifications$.next({
        notification,
        receiverNostrPrivate: nostrPrivate,
      });
    } catch (error) {
      console.error("[Nostr] Error processing incoming Nostr event:", error);
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
   * Log relay statistics
   */
  private logRelayStats(): void {
    if (this.relayFirstSeen.size === 0) {
      console.warn("[Nostr] ⚠️ No relays responded");
      return;
    }

    console.debug("[Nostr] Relay Statistics:");
    this.relayFirstSeen.forEach((timestamp, url) => {
      const eventCount = this.relayEventCount.get(url) || 0;
      console.debug(`  ${url}: ${eventCount} events`);
    });
  }

  /**
   * Clean up all subscriptions and connections
   */
  destroy(): void {
    const subscriptionCount = this.subscriptions.size;

    // Close all subscriptions
    this.subscriptions.forEach((sub) => sub.close());
    this.subscriptions.clear();

    // Clear tracking maps
    this.relayFirstSeen.clear();
    this.relayEventCount.clear();

    // Close pool connections
    this.pool.close(this.defaultRelays);

    console.log(`[Nostr] 🔌 Service destroyed - Closed ${subscriptionCount} subscriptions`);
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
