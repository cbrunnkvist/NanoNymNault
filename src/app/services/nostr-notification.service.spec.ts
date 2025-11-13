import { TestBed } from '@angular/core/testing';
import { NostrNotificationService, NanoNymNotification } from './nostr-notification.service';
import { NanoNymCryptoService } from './nanonym-crypto.service';
import { UtilService } from './util.service';

describe('NostrNotificationService', () => {
  let service: NostrNotificationService;
  let cryptoService: NanoNymCryptoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [NostrNotificationService, NanoNymCryptoService, UtilService]
    });
    service = TestBed.inject(NostrNotificationService);
    cryptoService = TestBed.inject(NanoNymCryptoService);
  });

  afterEach(() => {
    // Clean up subscriptions
    service.destroy();
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
});
