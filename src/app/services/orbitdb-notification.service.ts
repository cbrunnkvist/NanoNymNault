import { Injectable } from '@angular/core';

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

  constructor() {}

  /**
   * Initialize Helia and OrbitDB
   * Must be called before using other methods
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    try {
      console.log('[OrbitDB] Initializing Helia...');

      // Dynamic imports to avoid bundling issues
      const { createHelia } = await import('helia');
      const { createOrbitDB } = await import('@orbitdb/core');

      this.helia = await createHelia();
      console.log('[OrbitDB] Helia initialized successfully');

      this.orbitdb = await createOrbitDB({ ipfs: this.helia });
      console.log('[OrbitDB] OrbitDB initialized successfully');

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
    if (!this.helia) {
      return null;
    }

    try {
      const peerId = this.helia.libp2p.peerId.toString();
      const multiaddrs = this.helia.libp2p.getMultiaddrs().map((ma: any) => ma.toString());

      return { peerId, multiaddrs };
    } catch (error) {
      console.error('[OrbitDB] Failed to get node info:', error);
      return null;
    }
  }

  /**
   * Open or create a global notification log
   * This is a shared append-only log for all NanoNym alerts
   */
  async openGlobalLog(logName: string = 'nano-nym-alerts'): Promise<boolean> {
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
   * Add an encrypted notification to the log
   * @param tag - BLAKE2b hash of shared secret for filtering
   * @param encryptedPayload - Encrypted notification data
   */
  async postNotification(tag: string, encryptedPayload: string): Promise<string | null> {
    if (!this.db) {
      console.error('[OrbitDB] Database not opened');
      return null;
    }

    try {
      const entry = {
        tag,
        encrypted: encryptedPayload,
        timestamp: Date.now()
      };

      const hash = await this.db.add(entry);
      console.log(`[OrbitDB] Notification posted: ${hash}`);
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
      if (since) {
        return all.filter((entry: any) => entry.value.timestamp >= since);
      }
      return all;
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
      callback(entry);
    });
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    try {
      if (this.db) {
        await this.db.close();
        this.db = null;
      }
      if (this.orbitdb) {
        await this.orbitdb.stop();
        this.orbitdb = null;
      }
      if (this.helia) {
        await this.helia.stop();
        this.helia = null;
      }
      this.isInitialized = false;
      console.log('[OrbitDB] Shutdown complete');
    } catch (error) {
      console.error('[OrbitDB] Shutdown error:', error);
    }
  }
}
