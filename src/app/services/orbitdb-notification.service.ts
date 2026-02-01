import { Injectable } from '@angular/core';
import { NanoNymNotification } from './nostr-notification.service';
import { nip59, nip19 } from 'nostr-tools';
import { IDBBlockstore } from 'blockstore-idb';
import { IDBDatastore } from 'datastore-idb';

/**
 * OrbitDB Notification Service
 *
 * IPFS-based notification channel for NanoNym payments.
 * This is Tier-2 (T2) persistent storage for seed recovery.
 *
 * Architecture:
 * - Browser wallet connects to relay daemon via WebSocket
 * - Relay stores notifications permanently in OrbitDB
 * - Wallet can fetch historical notifications for seed recovery
 *
 * See: docs/SESSION-HANDOFF.md
 */
@Injectable({
  providedIn: 'root'
})
export class OrbitdbNotificationService {
  private helia: any = null;
  private orbitdb: any = null;
  private db: any = null;
  private isInitialized = false;

  private readonly DEFAULT_RELAY_WS = 'ws://localhost:8081';
  private readonly DEFAULT_RELAY_HTTP = 'http://localhost:3000';
  private relayWsUrl: string = this.DEFAULT_RELAY_WS;
  private relayHttpUrl: string = this.DEFAULT_RELAY_HTTP;
  private remoteDbAddress: string | null = null;

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
      const { createHelia, libp2pDefaults } = await import('helia');
      const { createOrbitDB } = await import('@orbitdb/core');
      const { gossipsub } = await import('@chainsafe/libp2p-gossipsub');
      const { identify } = await import('@libp2p/identify');
      const { createLibp2p } = await import('libp2p');
      const { generateKeyPair, privateKeyToProtobuf } = await import('@libp2p/crypto/keys');
      const { peerIdFromPrivateKey } = await import('@libp2p/peer-id');

      // Initialize persistent stores
      const blockstore = new IDBBlockstore('nanonym-ipfs-blocks');
      const datastore = new IDBDatastore('nanonym-ipfs-data');
      
      await blockstore.open();
      await datastore.open();

      // Generate PeerID with private key FIRST (needed for gossipsub signing)
      console.log('[OrbitDB] Generating PeerID with private key...');
      const privateKey = await generateKeyPair('Ed25519');
      const peerId = await peerIdFromPrivateKey(privateKey);
      
      // Patch peerId object to include privateKey in protobuf format (gossipsub v13 expects this)
      const privKeyProto = privateKeyToProtobuf(privateKey);
      (peerId as any).privateKey = privKeyProto;
      
      // Ensure toBytes() method exists (OrbitDB publishing requires this)
      if (!(peerId as any).toBytes || typeof (peerId as any).toBytes !== 'function') {
        (peerId as any).toBytes = () => peerId.toMultihash().bytes;
      }
      
      console.log('[OrbitDB] PeerID created:', peerId.toString());
      console.log('[OrbitDB] PeerID privateKey present:', !!(peerId as any).privateKey);
      console.log('[OrbitDB] PeerID toBytes available:', typeof (peerId as any).toBytes === 'function');

      // Get Helia's default libp2p config and add gossipsub for OrbitDB replication
      console.log('[OrbitDB] Creating libp2p with gossipsub...');
      const libp2pOptions = libp2pDefaults();
      
      // Ensure services object exists
      if (!libp2pOptions.services) {
        (libp2pOptions as any).services = {};
      }

      // Wrap gossipsub factory to patch components.peerId with privateKey
      const originalGossipSub = gossipsub({
        allowPublishToZeroTopicPeers: true
      });

      (libp2pOptions.services as any).pubsub = (components: any) => {
        // Patch components.peerId to include privateKey for message signing
        if (components.peerId && !components.peerId.privateKey) {
             console.log('[OrbitDB] Patching components.peerId with privateKey...');
             components.peerId.privateKey = privKeyProto;
             
             // Also ensure toBytes() method exists
             if (!components.peerId.toBytes || typeof components.peerId.toBytes !== 'function') {
               components.peerId.toBytes = () => components.peerId.toMultihash().bytes;
             }
        }
        return originalGossipSub(components);
      };

      (libp2pOptions.services as any).identify = identify();

      // Provide the generated peerId to libp2p
      (libp2pOptions as any).peerId = peerId;
      (libp2pOptions as any).datastore = datastore;

      // Allow connections to localhost/private IPs (for local relay testing)
      (libp2pOptions as any).connectionGater = {
        denyDialMultiaddr: () => false,
        denyDialPeer: () => false,
        denyInboundConnection: () => false,
        denyOutboundConnection: () => false,
        denyInboundEncryptedConnection: () => false,
        denyOutboundEncryptedConnection: () => false,
        denyInboundUpgradedConnection: () => false,
        denyOutboundUpgradedConnection: () => false,
        filterMultiaddrForPeer: async () => true
      };

      // Create libp2p node explicitly
      console.log('[OrbitDB] Creating libp2p node...');
      const libp2pNode = await createLibp2p(libp2pOptions);
      console.log('[OrbitDB] libp2p node created with PeerID:', libp2pNode.peerId.toString());

      console.log('[OrbitDB] Creating Helia...');
      this.helia = await createHelia({
        libp2p: libp2pNode,
        blockstore,
        datastore
      });
      console.log('[OrbitDB] Helia initialized successfully (Persistent)');

      console.log('[OrbitDB] Creating OrbitDB...');
      this.orbitdb = await createOrbitDB({ ipfs: this.helia });
      console.log('[OrbitDB] OrbitDB initialized successfully');

      await this.connectToRelayPeer();
      await this.openGlobalLog();

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('[OrbitDB] Initialization failed:', error);
      return false;
    }
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  configureRelay(wsUrl: string, httpUrl: string): void {
    this.relayWsUrl = wsUrl;
    this.relayHttpUrl = httpUrl;
  }

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

  async fetchRelayInfo(): Promise<{ dbAddress: string; peerId: string; addresses: string[] } | null> {
    try {
      const response = await fetch(`${this.relayHttpUrl}/health`);
      if (!response.ok) {
        console.error('[OrbitDB] Relay health check failed:', response.status);
        return null;
      }
      const data = await response.json();
      if (data.status !== 'ok' || !data.dbAddress) {
        console.error('[OrbitDB] Relay not ready:', data);
        return null;
      }
      console.log('[OrbitDB] Relay info:', data);
      return {
        dbAddress: data.dbAddress,
        peerId: data.peerId,
        addresses: data.addresses || []
      };
    } catch (error) {
      console.error('[OrbitDB] Failed to fetch relay info:', error);
      return null;
    }
  }

  async connectToRelayPeer(): Promise<boolean> {
    if (!this.helia) {
      console.error('[OrbitDB] Helia not initialized');
      return false;
    }

    try {
      const relayInfo = await this.fetchRelayInfo();
      if (!relayInfo) {
        console.warn('[OrbitDB] Could not fetch relay info, running in standalone mode');
        return false;
      }

      const wsAddress = relayInfo.addresses.find(addr => addr.includes('/ws/'));
      if (!wsAddress) {
        console.warn('[OrbitDB] No WebSocket address found in relay info');
        return false;
      }

      console.log('[OrbitDB] Connecting to relay peer:', wsAddress);
      const { multiaddr } = await import('@multiformats/multiaddr');
      await this.helia.libp2p.dial(multiaddr(wsAddress));
      console.log('[OrbitDB] Connected to relay peer');

      this.remoteDbAddress = relayInfo.dbAddress;
      return true;
    } catch (error) {
      console.error('[OrbitDB] Failed to connect to relay:', error);
      return false;
    }
  }

  async openGlobalLog(): Promise<boolean> {
    if (!this.orbitdb) {
      console.error('[OrbitDB] OrbitDB not initialized');
      return false;
    }

    try {
      const addressToOpen = this.remoteDbAddress || 'nano-nym-alerts-v2';
      const isRemote = addressToOpen.startsWith('/orbitdb/');
      
      console.log(`[OrbitDB] Opening database: ${addressToOpen} (remote: ${isRemote})`);
      
      if (isRemote) {
        this.db = await this.orbitdb.open(addressToOpen);
      } else {
        this.db = await this.orbitdb.open(addressToOpen, { type: 'events' });
      }
      
      console.log(`[OrbitDB] Database opened: ${this.db.address}`);
      return true;
    } catch (error) {
      console.error('[OrbitDB] Failed to open database:', error);
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
