import { Injectable } from '@angular/core';
import { NanoNymNotification } from './nostr-notification.service';
import { nip59 } from 'nostr-tools';

/**
 * OrbitDB Notification Service - ARCHIVED
 *
 * This service was part of a tech spike exploring IPFS-based notification channels.
 * The OrbitDB/Helia approach encountered fundamental browser compatibility issues
 * (CBOR cross-realm Uint8Array handling) and has been archived.
 *
 * TODO: Replace with new Tier2 implementation (Waku, Gun.js, or similar)
 * The interface patterns are preserved for drop-in replacement.
 *
 * See: docs/SESSION-HANDOFF.md for context
 */
@Injectable({
  providedIn: 'root'
})
export class OrbitdbNotificationService {
  private isInitialized = false;

  async initialize(): Promise<boolean> {
    console.log('[OrbitDB] Service archived - Tier2 not implemented');
    this.isInitialized = false;
    return false;
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  configureRelay(_wsUrl: string, _httpUrl: string): void {
    // No-op - archived
  }

  async getNodeInfo(): Promise<{ peerId: string; multiaddrs: string[] } | null> {
    return null;
  }

  async sendNotification(
    notification: NanoNymNotification,
    senderNostrPrivate: Uint8Array,
    receiverNostrPublic: Uint8Array
  ): Promise<string | null> {
    console.log('[OrbitDB] sendNotification archived - needs Tier2 implementation');

    try {
      const receiverPublicHex = this.bytesToHex(receiverNostrPublic);
      const payloadJson = JSON.stringify(notification);

      const rumor = {
        kind: 14,
        content: payloadJson,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', receiverPublicHex]]
      };

      const _giftWrap = nip59.wrapEvent(
        rumor,
        senderNostrPrivate,
        receiverPublicHex
      );

      console.log('[OrbitDB] TODO: Post NIP-59 event to Tier2 backend');
      return null;
    } catch (error) {
      console.error('[OrbitDB] Failed to post notification:', error);
      return null;
    }
  }

  async getNotifications(_since?: number): Promise<any[]> {
    console.log('[OrbitDB] getNotifications archived - needs Tier2 implementation');
    return [];
  }

  onNotification(_callback: (entry: any) => void): void {
    // No-op - archived
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async shutdown(): Promise<void> {
    this.isInitialized = false;
    console.log('[OrbitDB] Shutdown (archived service)');
  }
}
