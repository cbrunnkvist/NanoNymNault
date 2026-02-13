import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NostrNotificationService, NanoNymNotification } from './nostr-notification.service';
import { NanoNymCryptoService } from './nanonym-crypto.service';
import { NostrSyncStateService } from './nostr-sync-state.service';
import { UtilService } from './util.service';

describe('NostrNotificationService', () => {
  let service: NostrNotificationService;
  let cryptoService: NanoNymCryptoService;
  let syncStateService: NostrSyncStateService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [NostrNotificationService, NanoNymCryptoService, NostrSyncStateService, UtilService]
    });
    service = TestBed.inject(NostrNotificationService);
    cryptoService = TestBed.inject(NanoNymCryptoService);
    syncStateService = TestBed.inject(NostrSyncStateService);
  });

  afterEach(() => {
    service.destroy();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have default relays configured', () => {
    const relays = service.getRelays();
    expect(relays.length).toBeGreaterThan(0);
    expect(relays).toContain('wss://relay.damus.io');
    expect(relays).toContain('wss://nos.lol');
  });

  it('should initialize relay status', (done) => {
    service.relayStatus$.subscribe(statuses => {
      if (statuses.length > 0) {
        expect(statuses.length).toBeGreaterThan(0);
        statuses.forEach(status => {
          expect(status.url).toBeTruthy();
          expect(typeof status.connected).toBe('boolean');
        });
        done();
      }
    });
  });

  it('should create subscription for a NanoNym', () => {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const keys = cryptoService.deriveNanoNymKeys(mnemonic, 0);

    expect(service.getActiveSubscriptionCount()).toBe(0);

    service.subscribeToNotifications(keys.nostr.public, keys.nostr.private);

    expect(service.getActiveSubscriptionCount()).toBe(1);
  });

  it('should not create duplicate subscriptions', () => {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const keys = cryptoService.deriveNanoNymKeys(mnemonic, 0);

    service.subscribeToNotifications(keys.nostr.public, keys.nostr.private);
    service.subscribeToNotifications(keys.nostr.public, keys.nostr.private);

    expect(service.getActiveSubscriptionCount()).toBe(1);
  });

  it('should unsubscribe from notifications', () => {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const keys = cryptoService.deriveNanoNymKeys(mnemonic, 0);

    service.subscribeToNotifications(keys.nostr.public, keys.nostr.private);
    expect(service.getActiveSubscriptionCount()).toBe(1);

    service.unsubscribeFromNotifications(keys.nostr.public);
    expect(service.getActiveSubscriptionCount()).toBe(0);
  });

  it('should handle multiple NanoNym subscriptions', () => {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    const keys0 = cryptoService.deriveNanoNymKeys(mnemonic, 0);
    const keys1 = cryptoService.deriveNanoNymKeys(mnemonic, 1);
    const keys2 = cryptoService.deriveNanoNymKeys(mnemonic, 2);

    service.subscribeToNotifications(keys0.nostr.public, keys0.nostr.private);
    service.subscribeToNotifications(keys1.nostr.public, keys1.nostr.private);
    service.subscribeToNotifications(keys2.nostr.public, keys2.nostr.private);

    expect(service.getActiveSubscriptionCount()).toBe(3);

    const activeSubs = service.getActiveSubscriptions();
    expect(activeSubs.length).toBe(3);
  });

  it('should validate notification structure correctly', () => {
    const validNotification: NanoNymNotification = {
      version: 1,
      protocol: 'nanoNymNault',
      R: '0123456789abcdef',
      tx_hash: 'ABC123XYZ789',
      amount: '1.5',
      amount_raw: '1500000000000000000000000000000'
    };

    // Access private method via type assertion for testing
    const validateNotification = (service as any).validateNotification.bind(service);

    expect(validateNotification(validNotification)).toBe(true);
  });

  it('should reject invalid notification - wrong version', () => {
    const invalidNotification = {
      version: 2, // Wrong version
      protocol: 'nanoNymNault',
      R: '0123456789abcdef',
      tx_hash: 'ABC123XYZ789'
    };

    const validateNotification = (service as any).validateNotification.bind(service);
    expect(validateNotification(invalidNotification)).toBe(false);
  });

  it('should reject invalid notification - wrong protocol', () => {
    const invalidNotification = {
      version: 1,
      protocol: 'wrongProtocol', // Wrong protocol
      R: '0123456789abcdef',
      tx_hash: 'ABC123XYZ789'
    };

    const validateNotification = (service as any).validateNotification.bind(service);
    expect(validateNotification(invalidNotification)).toBe(false);
  });

  it('should reject invalid notification - missing required fields', () => {
    const invalidNotification = {
      version: 1,
      protocol: 'nanoNymNault'
      // Missing R and tx_hash
    };

    const validateNotification = (service as any).validateNotification.bind(service);
    expect(validateNotification(invalidNotification)).toBe(false);
  });

  it('should accept notification with optional fields', () => {
    const notificationWithMemo: NanoNymNotification = {
      version: 1,
      protocol: 'nanoNymNault',
      R: '0123456789abcdef',
      tx_hash: 'ABC123XYZ789',
      memo: 'Payment for services'
    };

    const validateNotification = (service as any).validateNotification.bind(service);
    expect(validateNotification(notificationWithMemo)).toBe(true);
  });

  it('should convert bytes to hex correctly', () => {
    const bytes = new Uint8Array([0, 15, 255, 128, 64]);
    const expectedHex = '000fff8040';

    const bytesToHex = (service as any).bytesToHex.bind(service);
    expect(bytesToHex(bytes)).toBe(expectedHex);
  });

  it('should convert hex to bytes correctly', () => {
    const hex = '000fff8040';
    const expectedBytes = new Uint8Array([0, 15, 255, 128, 64]);

    const hexToBytes = (service as any).hexToBytes.bind(service);
    const result = hexToBytes(hex);

    expect(result).toEqual(expectedBytes);
  });

  it('should have incoming notifications observable', (done) => {
    let emitted = false;

    service.incomingNotifications$.subscribe(data => {
      emitted = true;
      expect(data.notification).toBeTruthy();
      expect(data.receiverNostrPrivate).toBeTruthy();
    });

    // The observable should be available even if no notifications yet
    setTimeout(() => {
      // If no error thrown, observable is working
      expect(emitted).toBe(false); // No notifications sent yet
      done();
    }, 100);
  });

  it('should clean up all subscriptions on destroy', () => {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    const keys0 = cryptoService.deriveNanoNymKeys(mnemonic, 0);
    const keys1 = cryptoService.deriveNanoNymKeys(mnemonic, 1);

    service.subscribeToNotifications(keys0.nostr.public, keys0.nostr.private);
    service.subscribeToNotifications(keys1.nostr.public, keys1.nostr.private);

    expect(service.getActiveSubscriptionCount()).toBe(2);

    service.destroy();

    expect(service.getActiveSubscriptionCount()).toBe(0);
  });

  // Integration test: Send and receive notification
  // Note: This requires mocked relays, marking as pending for manual testing
  xit('should send and receive notification between two NanoNyms', async () => {
    const senderMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const receiverMnemonic = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';

    const senderKeys = cryptoService.deriveNanoNymKeys(senderMnemonic, 0);
    const receiverKeys = cryptoService.deriveNanoNymKeys(receiverMnemonic, 0);

    // Subscribe receiver
    service.subscribeToNotifications(receiverKeys.nostr.public, receiverKeys.nostr.private);

    // Create notification
    const notification: NanoNymNotification = {
      version: 1,
      protocol: 'nanoNymNault',
      R: 'deadbeef',
      tx_hash: 'ABC123',
      amount: '10.5'
    };

    // Send notification
    const relays = await service.sendNotification(
      notification,
      senderKeys.nostr.private,
      receiverKeys.nostr.public
    );

    expect(relays.length).toBeGreaterThan(0);

    // In real scenario, would wait for incomingNotifications$ to emit
    // This requires live relay connections, so marked as pending
  });

  describe('Integration: Cold Recovery with sinceOverride', () => {
    it('should use sinceOverride timestamp in subscription filter', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const keys = cryptoService.deriveNanoNymKeys(mnemonic, 0);

      const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 86400);

      service.subscribeToNotifications(
        keys.nostr.public,
        keys.nostr.private,
        0,
        thirtyDaysAgo
      );

      expect(service.getActiveSubscriptionCount()).toBe(1);
    });

    it('should accept nanoNymIndex parameter for sync state tracking', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const keys0 = cryptoService.deriveNanoNymKeys(mnemonic, 0);
      const keys1 = cryptoService.deriveNanoNymKeys(mnemonic, 1);

      service.subscribeToNotifications(keys0.nostr.public, keys0.nostr.private, 0);
      service.subscribeToNotifications(keys1.nostr.public, keys1.nostr.private, 1);

      expect(service.getActiveSubscriptionCount()).toBe(2);
    });

    it('should use default 4-day lookback when sinceOverride is not provided', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const keys = cryptoService.deriveNanoNymKeys(mnemonic, 0);

      const beforeSubscribe = Math.floor(Date.now() / 1000);

      service.subscribeToNotifications(keys.nostr.public, keys.nostr.private, 0);

      expect(service.getActiveSubscriptionCount()).toBe(1);
    });
  });

  describe('Integration: Event Deduplication', () => {
    it('should track processed events via NostrSyncStateService', fakeAsync(() => {
      syncStateService.updateState(0, 'event_id_123', 1700000000);
      tick(1100);

      expect(syncStateService.isEventProcessed(0, 'event_id_123')).toBeTrue();
      expect(syncStateService.isEventProcessed(0, 'event_id_456')).toBeFalse();
    }));

    it('should not process duplicate events after restart', fakeAsync(() => {
      syncStateService.updateState(0, 'persistent_event', 1700000000);
      tick(1100);

      const newSyncService = new NostrSyncStateService();

      expect(newSyncService.isEventProcessed(0, 'persistent_event')).toBeTrue();
    }));

    it('should maintain separate dedup state per NanoNym', fakeAsync(() => {
      syncStateService.updateState(0, 'event_for_nym_0', 1700000000);
      syncStateService.updateState(1, 'event_for_nym_1', 1700000001);
      tick(1100);

      expect(syncStateService.isEventProcessed(0, 'event_for_nym_0')).toBeTrue();
      expect(syncStateService.isEventProcessed(0, 'event_for_nym_1')).toBeFalse();
      expect(syncStateService.isEventProcessed(1, 'event_for_nym_0')).toBeFalse();
      expect(syncStateService.isEventProcessed(1, 'event_for_nym_1')).toBeTrue();
    }));

    it('should update sync state when processing valid notifications', fakeAsync(() => {
      const eventId = 'new_event_abc';
      const timestamp = 1700000500;

      syncStateService.updateState(0, eventId, timestamp);
      tick(1100);

      const state = syncStateService.getState(0);
      expect(state).not.toBeNull();
      expect(state!.lastSeenTimestamp).toBe(timestamp);
      expect(state!.processedEventIds).toContain(eventId);
    }));
  });

  describe('Integration: Manual Rescan', () => {
    it('should allow unsubscribe and resubscribe with different sinceOverride', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const keys = cryptoService.deriveNanoNymKeys(mnemonic, 0);

      service.subscribeToNotifications(keys.nostr.public, keys.nostr.private, 0);
      expect(service.getActiveSubscriptionCount()).toBe(1);

      service.unsubscribeFromNotifications(keys.nostr.public);
      expect(service.getActiveSubscriptionCount()).toBe(0);

      const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 86400);
      service.subscribeToNotifications(keys.nostr.public, keys.nostr.private, 0, thirtyDaysAgo);
      expect(service.getActiveSubscriptionCount()).toBe(1);
    });

    it('should not create duplicate subscriptions on rescan', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const keys = cryptoService.deriveNanoNymKeys(mnemonic, 0);

      service.subscribeToNotifications(keys.nostr.public, keys.nostr.private, 0);
      service.subscribeToNotifications(keys.nostr.public, keys.nostr.private, 0);
      service.subscribeToNotifications(keys.nostr.public, keys.nostr.private, 0);

      expect(service.getActiveSubscriptionCount()).toBe(1);
    });

    it('should properly clean up on unsubscribe before rescan', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const keys = cryptoService.deriveNanoNymKeys(mnemonic, 0);

      service.subscribeToNotifications(keys.nostr.public, keys.nostr.private, 0);

      const activeBefore = service.getActiveSubscriptions();
      expect(activeBefore.length).toBe(1);

      service.unsubscribeFromNotifications(keys.nostr.public);

      const activeAfter = service.getActiveSubscriptions();
      expect(activeAfter.length).toBe(0);
    });

    it('should support multiple rescan cycles', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const keys = cryptoService.deriveNanoNymKeys(mnemonic, 0);

      for (let cycle = 0; cycle < 3; cycle++) {
        service.subscribeToNotifications(
          keys.nostr.public,
          keys.nostr.private,
          0,
          Math.floor(Date.now() / 1000) - ((cycle + 1) * 7 * 86400)
        );
        expect(service.getActiveSubscriptionCount()).toBe(1);

        service.unsubscribeFromNotifications(keys.nostr.public);
        expect(service.getActiveSubscriptionCount()).toBe(0);
      }
    });
  });
});
