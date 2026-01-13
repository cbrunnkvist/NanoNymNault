import { Injectable } from '@angular/core';
import { NanoNymNotification } from './nostr-notification.service';
import { nip59, nip19 } from 'nostr-tools';
import { IDBBlockstore } from 'blockstore-idb';
import { IDBDatastore } from 'datastore-idb';

/**
 * OrbitDB Notification Service
 *
 * IPFS-based notification channel for NanoNym payments.
 * This is an alternative/complement to the Nostr notification system.
 *
 * Status: Spike/Prototype
 * See: docs/IPFS-SPIKE-PLAN.md
 */
@Injectable({
  providedIn: 'root'
})
export class OrbitdbNotificationService {
  private helia: any = null;
  private orbitdb: any = null;
  private db: any = null;
  private isInitialized = false;

  /**
   * Initialize Helia and OrbitDB
   * Must be called before using other methods
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    try {
      console.log('[OrbitDB] Initializing Helia with IndexedDB persistence...');

      // Dynamic imports to avoid bundling issues
      const { createHelia } = await import('helia');
      const { createOrbitDB } = await import('@orbitdb/core');

      // Initialize persistent stores
      const blockstore = new IDBBlockstore('nanonym-ipfs-blocks');
      const datastore = new IDBDatastore('nanonym-ipfs-data');
      
      await blockstore.open();
      await datastore.open();

      this.helia = await createHelia({
        blockstore,
        datastore
      });
      console.log('[OrbitDB] Helia initialized successfully (Persistent)');

      this.orbitdb = await createOrbitDB({ ipfs: this.helia });
      console.log('[OrbitDB] OrbitDB initialized successfully');

      // Auto-open global log
      await this.openGlobalLog();

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('[OrbitDB] Initialization failed:', error);
      return false;
    }
  }

  /**
   * Check if the service is initialized and ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get Helia node info for debugging
   */
  async getNodeInfo(): Promise<{ peerId: string; multiaddrs: string[] } | null> {
    if (!this.helia) return null;

    try {
      return {
        peerId: this.helia.libp2p.peerId.toString(),
        multiaddrs: this.helia.libp2p.getMultiaddrs().map((ma: any) => ma.toString())
      };
    } catch (error) {
      console.error('[OrbitDB] Failed to get node info:', error);
      return null;
    }
  }

  /**
   * Open or create a global notification log
   * This is a shared append-only log for all NanoNym alerts
   */
  async openGlobalLog(logName: string = 'nano-nym-alerts-v1'): Promise<boolean> {
    if (!this.orbitdb) {
      console.error('[OrbitDB] OrbitDB not initialized');
      return false;
    }

    try {
      console.log(`[OrbitDB] Opening global log: ${logName}`);
      this.db = await this.orbitdb.open(logName, { type: 'eventlog' });
      console.log(`[OrbitDB] Log opened: ${this.db.address}`);
      return true;
    } catch (error) {
      console.error('[OrbitDB] Failed to open log:', error);
      return false;
    }
  }

  /**
   * Send a notification to the global log (Encrypted via NIP-59)
   */
  async sendNotification(
    notification: NanoNymNotification,
    senderNostrPrivate: Uint8Array,
    receiverNostrPublic: Uint8Array
  ): Promise<string | null> {
    if (!this.db) {
      console.error('[OrbitDB] Database not opened');
      return null;
    }

    try {
      // Convert keys for NIP-59
      const receiverPublicHex = this.bytesToHex(receiverNostrPublic);
      const payloadJson = JSON.stringify(notification);

      // Create NIP-59 gift-wrapped event
      const rumor = {
        kind: 14,
        content: payloadJson,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', receiverPublicHex]]
      };

      const giftWrap = nip59.wrapEvent(
        rumor,
        senderNostrPrivate,
        receiverPublicHex
      );

      // Post the NIP-59 event wrapper to OrbitDB
      const hash = await this.db.add({
        type: 'nip59',
        event: giftWrap,
        timestamp: Date.now()
      });

      console.log(`[OrbitDB] 📤 Notification posted: ${hash}`);
      return hash;
    } catch (error) {
      console.error('[OrbitDB] Failed to post notification:', error);
      return null;
    }
  }

  /**
   * Get all notifications (for trial decryption)
   * @param since - Optional timestamp to filter entries
   */
  async getNotifications(since?: number): Promise<any[]> {
    if (!this.db) {
      console.error('[OrbitDB] Database not opened');
      return [];
    }

    try {
      const all = await this.db.all();
      return since ? all.filter((entry: any) => entry.value.timestamp >= since) : all;
    } catch (error) {
      console.error('[OrbitDB] Failed to get notifications:', error);
      return [];
    }
  }

  /**
   * Subscribe to new notifications
   * @param callback - Called when new entries are added
   */
  onNotification(callback: (entry: any) => void): void {
    if (!this.db) {
      console.error('[OrbitDB] Database not opened');
      return;
    }

    this.db.events.on('update', (entry: any) => {
      // The entry.payload.value contains the data we added
      callback(entry.payload.value);
    });
  }

  /**
   * Helper: Convert Uint8Array to hex string
   */
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    try {
      if (this.db) await this.db.close();
      if (this.orbitdb) await this.orbitdb.stop();
      if (this.helia) await this.helia.stop();

      this.db = null;
      this.orbitdb = null;
      this.helia = null;
      this.isInitialized = false;

      console.log('[OrbitDB] Shutdown complete');
    } catch (error) {
      console.error('[OrbitDB] Shutdown error:', error);
    }
  }
}
