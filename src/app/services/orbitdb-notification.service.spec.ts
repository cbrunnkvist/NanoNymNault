import { TestBed } from '@angular/core/testing';
import { OrbitdbNotificationService } from './orbitdb-notification.service';
import { NanoNymNotification } from './nostr-notification.service';

/**
 * OrbitDB tests - ARCHIVED
 *
 * These tests are marked as pending (xit) because the OrbitDB/Helia
 * approach has been archived. They serve as reference for the next
 * Tier2 implementation.
 *
 * TODO: Rewrite tests for new Tier2 backend
 */
describe('OrbitdbNotificationService Standalone', () => {
  let service: OrbitdbNotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(OrbitdbNotificationService);
    service.configureRelay('ws://invalid:9999', 'http://invalid:9999');
  });

  afterEach(async () => {
    await service.shutdown();
  });

  xit('should be created', () => {
    expect(service).toBeTruthy();
  });

  xit('should initialize without relay (standalone mode)', async () => {
    const initResult = await service.initialize();
    expect(initResult).toBeTrue();
    expect(service.isReady()).toBeTrue();

    const nodeInfo = await service.getNodeInfo();
    console.log('Standalone Helia PeerID:', nodeInfo?.peerId);
    expect(nodeInfo).toBeTruthy();
    expect(nodeInfo?.peerId).toBeDefined();

    expect(service['db']).toBeTruthy();
    console.log('Standalone DB address:', service['db']?.address);
  });

  xit('should post and retrieve notification in standalone mode', async () => {
    await service.initialize();

    const mockNotification: NanoNymNotification = {
      version: 1,
      protocol: 'nanonym-1.0',
      R: 'mock_R_value_hex',
      tx_hash: 'mock_tx_hash_hex',
      amount_raw: '1000000000000000000000000000000',
      memo: 'Standalone Test'
    };

    const mockSenderPriv = new Uint8Array(32).fill(1);
    const mockReceiverPub = new Uint8Array(32).fill(2);

    console.log('Sending notification (standalone)...');
    const hash = await service.sendNotification(mockNotification, mockSenderPriv, mockReceiverPub);
    console.log('Notification hash:', hash);

    expect(hash).toBeTruthy();

    const notifications = await service.getNotifications();
    console.log('Retrieved notifications count:', notifications.length);

    const found = notifications.find(n => n.hash === hash);
    expect(found).toBeDefined();
    expect(found.value).toBeDefined();
    expect(found.value.type).toBe('nip59');
  }, 30000);
});

describe('OrbitdbNotificationService with Relay', () => {
  let service: OrbitdbNotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(OrbitdbNotificationService);
  });

  afterEach(async () => {
    await service.shutdown();
  });

  xit('should connect to relay and open remote database', async () => {
    const initResult = await service.initialize();
    expect(initResult).toBeTrue();
    expect(service.isReady()).toBeTrue();

    const nodeInfo = await service.getNodeInfo();
    console.log('Relay-connected Helia PeerID:', nodeInfo?.peerId);
    expect(nodeInfo).toBeTruthy();
  });

  xit('should post and retrieve notification with relay', async () => {
    await service.initialize();

    const mockNotification: NanoNymNotification = {
      version: 1,
      protocol: 'nanonym-1.0',
      R: 'mock_R_value_hex',
      tx_hash: 'mock_tx_hash_hex',
      amount_raw: '1000000000000000000000000000000',
      memo: 'Relay Test'
    };

    const mockSenderPriv = new Uint8Array(32).fill(1);
    const mockReceiverPub = new Uint8Array(32).fill(2);

    console.log('Sending notification (with relay)...');
    const hash = await service.sendNotification(mockNotification, mockSenderPriv, mockReceiverPub);
    console.log('Notification hash:', hash);

    expect(hash).toBeTruthy();

    const notifications = await service.getNotifications();
    console.log('Retrieved notifications count:', notifications.length);

    const found = notifications.find(n => n.hash === hash);
    expect(found).toBeDefined();
    expect(found.value).toBeDefined();
    expect(found.value.type).toBe('nip59');
  }, 30000);
});
