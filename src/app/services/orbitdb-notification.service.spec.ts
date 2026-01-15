import { TestBed } from '@angular/core/testing';
import { OrbitdbNotificationService } from './orbitdb-notification.service';
import { NanoNymNotification } from './nostr-notification.service';

describe('OrbitdbNotificationService Integration', () => {
  let service: OrbitdbNotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(OrbitdbNotificationService);
  });

  afterEach(async () => {
    await service.shutdown();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize Helia and OrbitDB (Integration Test)', async () => {
    const initResult = await service.initialize();
    expect(initResult).toBeTrue();
    expect(service.isReady()).toBeTrue();

    const nodeInfo = await service.getNodeInfo();
    console.log('Helia PeerID:', nodeInfo?.peerId);
    expect(nodeInfo).toBeTruthy();
    expect(nodeInfo?.peerId).toBeDefined();
  });

  it('should post and retrieve a notification via OrbitDB', async () => {
    await service.initialize();

    const mockNotification: NanoNymNotification = {
      version: 1,
      protocol: 'nanonym-1.0',
      R: 'mock_R_value_hex',
      tx_hash: 'mock_tx_hash_hex',
      amount_raw: '1000000000000000000000000000000',
      memo: 'Integration Test'
    };

    // Use dummy keys (32 bytes)
    const mockSenderPriv = new Uint8Array(32).fill(1);
    const mockReceiverPub = new Uint8Array(32).fill(2);

    console.log('Sending notification...');
    const hash = await service.sendNotification(mockNotification, mockSenderPriv, mockReceiverPub);
    console.log('Notification hash:', hash);

    expect(hash).toBeTruthy();

    // Verify it's in the log
    const notifications = await service.getNotifications();
    console.log('Retrieved notifications count:', notifications.length);
    
    // Check if any notification matches our hash
    const found = notifications.find(n => n.hash === hash);
    expect(found).toBeDefined();
    expect(found.payload.op).toBe('ADD');
  }, 30000); // 30s timeout for IPFS ops
});
