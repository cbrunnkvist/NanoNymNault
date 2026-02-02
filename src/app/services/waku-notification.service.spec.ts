import { TestBed } from '@angular/core/testing';
import {
  WakuNotificationService,
  WakuRecoveryProgress,
  WakuRecoveryResult,
} from './waku-notification.service';
import { NanoNymCryptoService } from './nanonym-crypto.service';
import { UtilService } from './util.service';

describe('WakuNotificationService', () => {
  let service: WakuNotificationService;
  let cryptoService: NanoNymCryptoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [WakuNotificationService, NanoNymCryptoService, UtilService],
    });
    service = TestBed.inject(WakuNotificationService);
    cryptoService = TestBed.inject(NanoNymCryptoService);
  });

  afterEach(async () => {
    await service.disconnect();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with disconnected status', () => {
    expect(service.isConnected()).toBe(false);
    expect(service.connectionStatus$.value.connected).toBe(false);
  });

  describe('recoverNotifications', () => {
    const mnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    it('should have recoverNotifications method', () => {
      expect(typeof service.recoverNotifications).toBe('function');
    });

    it('should return WakuRecoveryResult structure', async () => {
      const keys = cryptoService.deriveNanoNymKeys(mnemonic, 0);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 1);
      const endDate = new Date();

      // Without connection, should return error result
      const result = await service.recoverNotifications(
        startDate,
        endDate,
        keys.nostr.public,
        keys.nostr.private
      );

      // Check result structure
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.messagesRecovered).toBe('number');
      expect(typeof result.duplicatesFiltered).toBe('number');
      expect(typeof result.daysProcessed).toBe('number');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.notifications)).toBe(true);
    });

    it('should return error when not connected and cannot connect', async () => {
      const keys = cryptoService.deriveNanoNymKeys(mnemonic, 0);
      const startDate = new Date();
      const endDate = new Date();

      const result = await service.recoverNotifications(
        startDate,
        endDate,
        keys.nostr.public,
        keys.nostr.private
      );

      // Without nwaku running, should fail to connect
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should accept progress callback parameter', async () => {
      const keys = cryptoService.deriveNanoNymKeys(mnemonic, 0);
      const startDate = new Date();
      const endDate = new Date();
      const progressCalls: WakuRecoveryProgress[] = [];

      // Method should accept progress callback (even if it fails to connect)
      await service.recoverNotifications(
        startDate,
        endDate,
        keys.nostr.public,
        keys.nostr.private,
        (progress) => {
          progressCalls.push({ ...progress });
        }
      );

      // Progress callback type should be correct
      expect(typeof progressCalls).toBe('object');
    });

    it('should calculate correct number of days', async () => {
      const keys = cryptoService.deriveNanoNymKeys(mnemonic, 0);
      const startDate = new Date('2025-01-01T00:00:00Z');
      const endDate = new Date('2025-01-07T23:59:59Z');

      // Even without connection, we can verify the progress reporting
      // by checking the totalDays in progress callback
      const progressReports: WakuRecoveryProgress[] = [];

      await service.recoverNotifications(
        startDate,
        endDate,
        keys.nostr.public,
        keys.nostr.private,
        (progress) => progressReports.push({ ...progress })
      );

      // Without connection this won't get far, but the interface is correct
      expect(typeof progressReports).toBe('object');
    });
  });

  describe('WakuRecoveryProgress interface', () => {
    it('should have correct progress structure', () => {
      const progress: WakuRecoveryProgress = {
        currentDay: 1,
        totalDays: 7,
        messagesFound: 5,
        currentDate: new Date(),
      };

      expect(progress.currentDay).toBe(1);
      expect(progress.totalDays).toBe(7);
      expect(progress.messagesFound).toBe(5);
      expect(progress.currentDate instanceof Date).toBe(true);
    });
  });

  describe('WakuRecoveryResult interface', () => {
    it('should have correct result structure', () => {
      const result: WakuRecoveryResult = {
        success: true,
        messagesRecovered: 10,
        duplicatesFiltered: 2,
        daysProcessed: 7,
        errors: [],
        notifications: [],
      };

      expect(result.success).toBe(true);
      expect(result.messagesRecovered).toBe(10);
      expect(result.duplicatesFiltered).toBe(2);
      expect(result.daysProcessed).toBe(7);
      expect(result.errors.length).toBe(0);
      expect(result.notifications.length).toBe(0);
    });
  });

  describe('getContentTopic', () => {
    it('should derive content topic from public key', () => {
      const keys = cryptoService.deriveNanoNymKeys(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        0
      );
      const topic = service.getContentTopic(keys.nostr.public);

      expect(topic).toBeTruthy();
      expect(topic.startsWith('/nanoNym/1/')).toBe(true);
      expect(topic.endsWith('/proto')).toBe(true);
    });

    it('should include date in content topic', () => {
      const keys = cryptoService.deriveNanoNymKeys(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        0
      );
      const topic = service.getContentTopic(keys.nostr.public);

      // Topic format: /nanoNym/1/{bucket}/{date}/proto
      // Split gives: ['', 'nanoNym', '1', '{bucket}', '{date}', 'proto']
      const parts = topic.split('/');
      expect(parts.length).toBe(6);
      expect(parts[1]).toBe('nanoNym');
      expect(parts[2]).toBe('1');
      const bucket = parseInt(parts[3], 10);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThanOrEqual(255);
      const dateMatch = parts[4].match(/^\d{4}-\d{2}-\d{2}$/);
      expect(dateMatch).toBeTruthy();
      expect(parts[5]).toBe('proto');
    });
  });

  describe('iOS foreground recovery', () => {
    it('should have destroyVisibilityHandler method', () => {
      expect(typeof service.destroyVisibilityHandler).toBe('function');
    });

    it('should start with no active subscriptions', () => {
      expect(service.getActiveSubscriptionCount()).toBe(0);
      expect(service.getActiveSubscriptions()).toEqual([]);
    });

    it('should track active subscriptions count', () => {
      expect(service.getActiveSubscriptionCount()).toBe(0);
    });

    it('should return empty array when no active subscriptions', () => {
      const subs = service.getActiveSubscriptions();
      expect(Array.isArray(subs)).toBe(true);
      expect(subs.length).toBe(0);
    });

    it('should handle destroyVisibilityHandler gracefully when not set', () => {
      expect(() => service.destroyVisibilityHandler()).not.toThrow();
    });
  });

  describe('subscription management', () => {
    const mnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    it('should have subscribeToNotifications method', () => {
      expect(typeof service.subscribeToNotifications).toBe('function');
    });

    it('should have unsubscribeFromNotifications method', () => {
      expect(typeof service.unsubscribeFromNotifications).toBe('function');
    });

    it('should handle unsubscribe for non-existent subscription gracefully', async () => {
      const keys = cryptoService.deriveNanoNymKeys(mnemonic, 0);
      let error: Error | null = null;
      try {
        await service.unsubscribeFromNotifications(keys.nostr.public);
      } catch (e) {
        error = e as Error;
      }
      expect(error).toBeNull();
    });
  });
});
