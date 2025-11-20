import { TestBed, inject } from '@angular/core/testing';
import { NanoNymManagerService } from './nanonym-manager.service';
import { NanoNymStorageService } from './nanonym-storage.service';
import { NanoNymCryptoService } from './nanonym-crypto.service';
import { NostrNotificationService } from './nostr-notification.service';
import { ApiService } from './api.service';
import { WalletService } from './wallet.service';
import { NanoBlockService } from './nano-block.service';
import { UtilService } from './util.service';
import { BehaviorSubject, of } from 'rxjs';
import BigNumber from 'bignumber.js';
import { NotificationService } from './notification.service';
import { NoPaddingZerosPipe } from 'app/pipes/no-padding-zeros.pipe';
import { NanoNymAccountSelectionService } from './nanonym-account-selection.service';

class MockNanoNymStorageService {
  getNextIndex = jasmine.createSpy('getNextIndex').and.returnValue(0);
  addNanoNym = jasmine.createSpy('addNanoNym');
  getNanoNym = jasmine.createSpy('getNanoNym').and.returnValue({
    index: 0,
    label: 'TestNym',
    nnymAddress: 'nnym_testaddress',
    fallbackAddress: 'nano_testfallback',
    status: 'active',
    createdAt: Date.now(),
    keys: {
      spendPublic: new Uint8Array(32),
      spendPrivate: new Uint8Array(32),
      viewPublic: new Uint8Array(32),
      viewPrivate: new Uint8Array(32),
      nostrPublic: new Uint8Array(32),
      nostrPrivate: new Uint8Array(32),
    },
    balance: new BigNumber(0),
    paymentCount: 0,
    stealthAccounts: [],
  });
  updateNanoNym = jasmine.createSpy('updateNanoNym');
  addStealthAccount = jasmine.createSpy('addStealthAccount');
  updateStealthAccountBalance = jasmine.createSpy('updateStealthAccountBalance');
  getAllNanoNyms = jasmine.createSpy('getAllNanoNyms').and.returnValue([]);
  getActiveNanoNyms = jasmine.createSpy('getActiveNanoNyms').and.returnValue([]);
  whenLoaded = jasmine.createSpy('whenLoaded').and.returnValue(Promise.resolve());
}

class MockNanoNymCryptoService {
  deriveNanoNymKeys = jasmine.createSpy('deriveNanoNymKeys').and.returnValue({
    spend: { public: new Uint8Array(32), private: new Uint8Array(32) },
    view: { public: new Uint8Array(32), private: new Uint8Array(32) },
    nostr: { public: new Uint8Array(32), private: new Uint8Array(32) },
  });
  encodeNanoNymAddress = jasmine.createSpy('encodeNanoNymAddress').and.returnValue('nnym_testaddress');
  getFallbackAddress = jasmine.createSpy('getFallbackAddress').and.returnValue('nano_testfallback');
  generateSharedSecret = jasmine.createSpy('generateSharedSecret').and.returnValue(new Uint8Array(32));
  deriveStealthAddress = jasmine.createSpy('deriveStealthAddress').and.returnValue({ address: 'nano_stealth', publicKey: new Uint8Array(32) });
  deriveStealthPrivateKey = jasmine.createSpy('deriveStealthPrivateKey').and.returnValue(new Uint8Array(32));
  hexToUint8Array = jasmine.createSpy('hexToUint8Array').and.callFake((hex: string) => new Uint8Array(hex.length / 2));
  getKeyPairFromPrivateKey = jasmine.createSpy('getKeyPairFromPrivateKey').and.callFake((privKey: Uint8Array) => ({
    secretKey: privKey,
    publicKey: new Uint8Array(32)
  }));
}

class MockNostrNotificationService {
  incomingNotifications$ = new BehaviorSubject({
    receiverNostrPrivate: new Uint8Array(32),
    notification: {
      version: 1,
      protocol: 'nanoNymNault',
      R: 'R_hex_value',
      tx_hash: 'tx_hash_value',
      amount: '1000',
      amount_raw: '1000000000000000000000000000000',
      memo: 'test memo'
    }
  });
  subscribeToNotifications = jasmine.createSpy('subscribeToNotifications').and.returnValue(Promise.resolve());
  unsubscribeFromNotifications = jasmine.createSpy('unsubscribeFromNotifications').and.returnValue(Promise.resolve());
}

class MockApiService {
  accountInfo = jasmine.createSpy('accountInfo').and.returnValue(of({ balance: '0', error: 'Account not found' }).toPromise());
}

class MockWalletService {
  wallet = {
    seed: 'testseed',
    locked: false,
    locked$: new BehaviorSubject(false),
  };
  getWalletAccount = jasmine.createSpy('getWalletAccount');
}

class MockNanoBlockService {
  generateReceive = jasmine.createSpy('generateReceive').and.returnValue(Promise.resolve('tx_hash_receive'));
  generateSend = jasmine.createSpy('generateSend').and.returnValue(Promise.resolve('tx_hash_send'));
}

class MockUtilService {
  hex = {
    toUint8: jasmine.createSpy('toUint8').and.callFake((hex: string) => new Uint8Array(hex.length / 2)),
    fromUint8: jasmine.createSpy('fromUint8').and.callFake((arr: Uint8Array) => Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join(''))
  };
  account = {
    getPublicAccountID: jasmine.createSpy('getPublicAccountID').and.returnValue('nano_accountid')
  };
  nano = {
    rawToMnano: jasmine.createSpy('rawToMnano').and.callFake((raw: BigNumber) => raw.dividedBy('1000000000000000000000000000000'))
  }
}

class MockNotificationService {
  sendSuccess = jasmine.createSpy('sendSuccess');
  sendInfo = jasmine.createSpy('sendInfo');
  removeNotification = jasmine.createSpy('removeNotification');
}

class MockNoPaddingZerosPipe {
  transform = jasmine.createSpy('transform').and.callFake(value => value);
}

class MockNanoNymAccountSelectionService {
  selectAccountsForSend = jasmine.createSpy('selectAccountsForSend').and.returnValue(Promise.resolve({
    selectedAccounts: [],
    totalSelectedAmount: new BigNumber(0),
    privacyImpact: { numberOfSources: 0, warningLevel: 'none' }
  }));
}

describe('NanoNymManagerService', () => {

  let service: NanoNymManagerService;
  let nanoNymStorageService: MockNanoNymStorageService;
  let nanoNymCryptoService: MockNanoNymCryptoService;
  let nostrNotificationService: MockNostrNotificationService;
  let apiService: MockApiService;
  let walletService: MockWalletService;
  let nanoBlockService: MockNanoBlockService;
  let utilService: MockUtilService;

  beforeEach(() => {
    // Mock nacl for keyPair creation
    (window as any).nacl = {
      sign: {
        keyPair: {
          fromSecretKey: jasmine.createSpy('fromSecretKey').and.returnValue({
            secretKey: new Uint8Array(32),
            publicKey: new Uint8Array(32),
          }),
        },
      },
    };

    TestBed.configureTestingModule({
      providers: [
        NanoNymManagerService,
        { provide: NanoNymStorageService, useClass: MockNanoNymStorageService },
        { provide: NanoNymCryptoService, useClass: MockNanoNymCryptoService },
        { provide: NostrNotificationService, useClass: MockNostrNotificationService },
        { provide: ApiService, useClass: MockApiService },
        { provide: WalletService, useClass: MockWalletService },
        { provide: NanoBlockService, useClass: MockNanoBlockService },
        { provide: UtilService, useClass: MockUtilService },
        { provide: NotificationService, useClass: MockNotificationService },
        { provide: NoPaddingZerosPipe, useClass: MockNoPaddingZerosPipe },
        { provide: NanoNymAccountSelectionService, useClass: MockNanoNymAccountSelectionService },
      ],
    });

    service = TestBed.inject(NanoNymManagerService);
    nanoNymStorageService = TestBed.inject(NanoNymStorageService) as unknown as MockNanoNymStorageService;
    nanoNymCryptoService = TestBed.inject(NanoNymCryptoService) as unknown as MockNanoNymCryptoService;
    nostrNotificationService = TestBed.inject(NostrNotificationService) as unknown as MockNostrNotificationService;
    apiService = TestBed.inject(ApiService) as unknown as MockApiService;
    walletService = TestBed.inject(WalletService) as unknown as MockWalletService;
    nanoBlockService = TestBed.inject(NanoBlockService) as unknown as MockNanoBlockService;
    utilService = TestBed.inject(UtilService) as unknown as MockUtilService;
    TestBed.inject(NotificationService);
    TestBed.inject(NoPaddingZerosPipe);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('processNotification', () => {
    beforeEach(() => {
      // Mock nacl for keyPair creation, as it's used inside the service
      (window as any).nacl = {
        sign: {
          keyPair: {
            fromSecretKey: jasmine.createSpy('fromSecretKey').and.returnValue({
              secretKey: new Uint8Array(32),
              publicKey: new Uint8Array(32),
            }),
          },
        },
      };
    });

    it('should process notification and generate receive block when wallet is unlocked', async () => {
      walletService.wallet.locked = false;
      nanoNymCryptoService.deriveStealthPrivateKey.and.returnValue(new Uint8Array(Array(32).fill(1))); // Mock a private key
      utilService.hex.fromUint8.and.returnValue('01'.repeat(32)); // Mock hex conversion

      const notification = {
        version: 1,
        protocol: 'nanoNymNault',
        R: 'R_hex_value',
        tx_hash: 'tx_hash_value',
        amount: '1000',
        amount_raw: '1000000000000000000000000000000',
        memo: 'test memo'
      };
      const nanoNymIndex = 0;
      nanoNymStorageService.getNanoNym.and.returnValue({
        index: nanoNymIndex,
        label: 'TestNym',
        nnymAddress: 'nnym_testaddress',
        fallbackAddress: 'nano_testfallback',
        status: 'active',
        createdAt: Date.now(),
        keys: {
          spendPublic: new Uint8Array(32),
          spendPrivate: new Uint8Array(32),
          viewPublic: new Uint8Array(32),
          viewPrivate: new Uint8Array(32),
          nostrPublic: new Uint8Array(32),
          nostrPrivate: new Uint8Array(32),
        },
        balance: new BigNumber(0),
        paymentCount: 0,
        stealthAccounts: [],
      });

      apiService.accountInfo.and.returnValue(Promise.resolve({ balance: '0', error: 'Account not found' }));

      await service.processNotification(notification, nanoNymIndex);

      expect(nanoNymCryptoService.deriveStealthAddress).toHaveBeenCalled();
      expect(apiService.accountInfo).toHaveBeenCalledWith('nano_stealth');
      expect(nanoNymCryptoService.deriveStealthPrivateKey).toHaveBeenCalled();
      expect(nanoNymStorageService.addStealthAccount).toHaveBeenCalled();
      expect(nanoBlockService.generateReceive).toHaveBeenCalledWith(
        jasmine.objectContaining({
          id: 'nano_stealth',
          secret: new Uint8Array(Array(32).fill(1)),
        }),
        'tx_hash_value',
        false
      );
      expect(nanoNymStorageService.updateStealthAccountBalance).toHaveBeenCalled();
      expect(nanoNymStorageService.updateNanoNym).toHaveBeenCalled();
    });

    it('should add stealth account to pending blocks when wallet is locked', async () => {
      walletService.wallet.locked = true;
      nanoNymCryptoService.deriveStealthPrivateKey.and.returnValue(new Uint8Array(Array(32).fill(1)));
      utilService.hex.fromUint8.and.returnValue('01'.repeat(32));

      const notification = {
        version: 1,
        protocol: 'nanoNymNault',
        R: 'R_hex_value',
        tx_hash: 'tx_hash_value_locked',
        amount: '1000',
        amount_raw: '1000000000000000000000000000000',
        memo: 'test memo locked'
      };
      const nanoNymIndex = 0;
      nanoNymStorageService.getNanoNym.and.returnValue({
        index: nanoNymIndex,
        label: 'TestNym',
        nnymAddress: 'nnym_testaddress',
        fallbackAddress: 'nano_testfallback',
        status: 'active',
        createdAt: Date.now(),
        keys: {
          spendPublic: new Uint8Array(32),
          spendPrivate: new Uint8Array(32),
          viewPublic: new Uint8Array(32),
          viewPrivate: new Uint8Array(32),
          nostrPublic: new Uint8Array(32),
          nostrPrivate: new Uint8Array(32),
        },
        balance: new BigNumber(0),
        paymentCount: 0,
        stealthAccounts: [],
      });
      apiService.accountInfo.and.returnValue(Promise.resolve({ balance: '0', error: 'Account not found' }));

      await service.processNotification(notification, nanoNymIndex);

      // Verify it's added to pending blocks (internal state)
      const pendingStealthBlocks = (service as any).pendingStealthBlocks;
      expect(pendingStealthBlocks.length).toBe(1);
      expect(pendingStealthBlocks[0].txHash).toBe('tx_hash_value_locked');
      expect(nanoBlockService.generateReceive).not.toHaveBeenCalled();
    });

    it('should process pending stealth blocks when wallet is unlocked', async () => {
      walletService.wallet.locked = true; // Start locked
      nanoNymCryptoService.deriveStealthPrivateKey.and.returnValue(new Uint8Array(Array(32).fill(1)));
      utilService.hex.fromUint8.and.returnValue('01'.repeat(32));

      const notification1 = {
        version: 1,
        protocol: 'nanoNymNault',
        R: 'R_hex_value1',
        tx_hash: 'tx_hash_value_pending1',
        amount: '1000',
        amount_raw: '1000000000000000000000000000000',
        memo: 'test memo pending1'
      };
      const notification2 = {
        version: 1,
        protocol: 'nanoNymNault',
        R: 'R_hex_value2',
        tx_hash: 'tx_hash_value_pending2',
        amount: '2000',
        amount_raw: '2000000000000000000000000000000',
        memo: 'test memo pending2'
      };
      const nanoNymIndex = 0;
      const mockNanoNym = {
        index: nanoNymIndex,
        label: 'TestNym',
        nnymAddress: 'nnym_testaddress',
        fallbackAddress: 'nano_testfallback',
        status: 'active',
        createdAt: Date.now(),
        keys: {
          spendPublic: new Uint8Array(32),
          spendPrivate: new Uint8Array(32),
          viewPublic: new Uint8Array(32),
          viewPrivate: new Uint8Array(32),
          nostrPublic: new Uint8Array(32),
          nostrPrivate: new Uint8Array(32),
        },
        balance: new BigNumber(0),
        paymentCount: 0,
        stealthAccounts: [],
      };
      nanoNymStorageService.getNanoNym.and.returnValue(mockNanoNym);
      apiService.accountInfo.and.returnValue(Promise.resolve({ balance: '0', error: 'Account not found' }));

      // Simulate receiving notifications while locked
      await service.processNotification(notification1, nanoNymIndex);
      await service.processNotification(notification2, nanoNymIndex);

      expect(nanoBlockService.generateReceive).not.toHaveBeenCalled(); // Should not have been called yet

      // Unlock the wallet and trigger processing
      walletService.wallet.locked = false;
      walletService.wallet.locked$.next(false); // Manually trigger the observable

      // Need to wait for the async processing to complete
      await new Promise(resolve => setTimeout(resolve, 50)); // Small delay to allow promises to resolve

      // Expect generateReceive to have been called for both pending blocks
      expect(nanoBlockService.generateReceive).toHaveBeenCalledTimes(2);
      expect(nanoBlockService.generateReceive).toHaveBeenCalledWith(
        jasmine.objectContaining({
          id: 'nano_stealth',
          secret: new Uint8Array(Array(32).fill(1)),
        }),
        'tx_hash_value_pending1',
        false
      );
      expect(nanoBlockService.generateReceive).toHaveBeenCalledWith(
        jasmine.objectContaining({
          id: 'nano_stealth',
          secret: new Uint8Array(Array(32).fill(1)),
        }),
        'tx_hash_value_pending2',
        false
      );

      // Verify pending blocks are cleared
      const pendingStealthBlocks = (service as any).pendingStealthBlocks;
      expect(pendingStealthBlocks.length).toBe(0);
    });
  });

  describe('Phase 2 - Background Retry Mechanism', () => {
    beforeEach(() => {
      // Reset service state before each test
      (service as any).pendingStealthBlocks = [];
      (service as any).stealthAccountRetryCount = new Map();
      if ((service as any).backgroundRetrySubscription) {
        (service as any).backgroundRetrySubscription.unsubscribe();
        (service as any).backgroundRetrySubscription = null;
      }
    });

    it('should track retry count per stealth account', async () => {
      walletService.wallet.locked = false;
      nanoNymCryptoService.deriveStealthPrivateKey.and.returnValue(new Uint8Array(Array(32).fill(1)));
      utilService.hex.fromUint8.and.returnValue('01'.repeat(32));

      const notification = {
        version: 1,
        protocol: 'nanoNymNault',
        R: 'R_hex_value',
        tx_hash: 'tx_hash_retry_test',
        amount: '1000',
        amount_raw: '1000000000000000000000000000000',
        memo: 'test memo'
      };

      const mockNanoNym = {
        index: 0,
        label: 'TestNym',
        nnymAddress: 'nnym_testaddress',
        fallbackAddress: 'nano_testfallback',
        status: 'active',
        createdAt: Date.now(),
        keys: {
          spendPublic: new Uint8Array(32),
          spendPrivate: new Uint8Array(32),
          viewPublic: new Uint8Array(32),
          viewPrivate: new Uint8Array(32),
          nostrPublic: new Uint8Array(32),
          nostrPrivate: new Uint8Array(32),
        },
        balance: new BigNumber(0),
        paymentCount: 0,
        stealthAccounts: [],
      };
      nanoNymStorageService.getNanoNym.and.returnValue(mockNanoNym);
      apiService.accountInfo.and.returnValue(Promise.resolve({ balance: '0', error: 'Account not found' }));

      // Simulate retry by calling attemptBackgroundOpening directly
      const retryCountMap = (service as any).stealthAccountRetryCount;
      expect(retryCountMap.size).toBe(0);

      // Add a pending stealth block manually
      const stealthAccount = {
        address: 'nano_stealth_test',
        privateKey: new Uint8Array(32),
        txHash: 'tx_hash_retry_test',
        amountRaw: '1000000000000000000000000000000',
        ephemeralPublicKey: new Uint8Array(32),
        parentNanoNymIndex: 0
      };
      (service as any).pendingStealthBlocks = [stealthAccount];
      retryCountMap.set('nano_stealth_test', 0);

      // Mock generateReceive to fail on first call (simulating temporary failure)
      nanoBlockService.generateReceive.and.returnValue(Promise.reject(new Error('Node unavailable')));

      await (service as any).attemptBackgroundOpening();

      // Retry count should be incremented
      expect(retryCountMap.get('nano_stealth_test')).toBe(1);
    });

    it('should stop retrying after max retries (12)', async () => {
      walletService.wallet.locked = false;

      const stealthAccount = {
        address: 'nano_stealth_max_retry',
        privateKey: new Uint8Array(32),
        txHash: 'tx_hash_max_retry',
        amountRaw: '1000000000000000000000000000000',
        ephemeralPublicKey: new Uint8Array(32),
        parentNanoNymIndex: 0
      };

      const retryCountMap = (service as any).stealthAccountRetryCount;
      (service as any).pendingStealthBlocks = [stealthAccount];
      retryCountMap.set('nano_stealth_max_retry', 12); // Already at max

      await (service as any).attemptBackgroundOpening();

      // Should have removed from pending blocks
      expect((service as any).pendingStealthBlocks.length).toBe(0);
      // Retry count should be deleted
      expect(retryCountMap.has('nano_stealth_max_retry')).toBe(false);
    });

    it('should skip background retry when wallet is locked', async () => {
      walletService.wallet.locked = true;

      const stealthAccount = {
        address: 'nano_stealth_locked',
        privateKey: new Uint8Array(32),
        txHash: 'tx_hash_locked',
        amountRaw: '1000000000000000000000000000000',
        ephemeralPublicKey: new Uint8Array(32),
        parentNanoNymIndex: 0
      };

      (service as any).pendingStealthBlocks = [stealthAccount];
      nanoBlockService.generateReceive.and.returnValue(Promise.resolve('tx_hash'));

      await (service as any).attemptBackgroundOpening();

      // generateReceive should not have been called
      expect(nanoBlockService.generateReceive).not.toHaveBeenCalled();
      // Pending blocks should still be there
      expect((service as any).pendingStealthBlocks.length).toBe(1);
    });

    it('should remove stealth account from pending blocks after successful opening', async () => {
      walletService.wallet.locked = false;
      nanoNymCryptoService.deriveStealthPrivateKey.and.returnValue(new Uint8Array(Array(32).fill(1)));
      utilService.hex.fromUint8.and.returnValue('01'.repeat(32));

      const stealthAccount = {
        address: 'nano_stealth_success',
        privateKey: new Uint8Array(32),
        txHash: 'tx_hash_success',
        amountRaw: '1000000000000000000000000000000',
        ephemeralPublicKey: new Uint8Array(32),
        parentNanoNymIndex: 0
      };

      (service as any).pendingStealthBlocks = [stealthAccount];
      (service as any).stealthAccountRetryCount.set('nano_stealth_success', 1);

      nanoBlockService.generateReceive.and.returnValue(Promise.resolve('tx_hash_new'));

      await (service as any).attemptBackgroundOpening();

      // Should have been removed from pending
      expect((service as any).pendingStealthBlocks.length).toBe(0);
      // Retry count should be deleted
      expect((service as any).stealthAccountRetryCount.has('nano_stealth_success')).toBe(false);
    });

    it('should not process pending blocks if list is empty', async () => {
      walletService.wallet.locked = false;
      (service as any).pendingStealthBlocks = [];

      const logSpy = spyOn(console, 'debug');

      await (service as any).attemptBackgroundOpening();

      // Should have returned early without processing
      expect(nanoBlockService.generateReceive).not.toHaveBeenCalled();
    });
  });

  describe('send from NanoNym', () => {
    let nanoNymAccountSelectionService: MockNanoNymAccountSelectionService;
    let notificationService: MockNotificationService;
    let noPaddingZerosPipe: MockNoPaddingZerosPipe;

    beforeEach(() => {
      nanoNymAccountSelectionService = TestBed.inject(NanoNymAccountSelectionService) as unknown as MockNanoNymAccountSelectionService;
      notificationService = TestBed.inject(NotificationService) as unknown as MockNotificationService;
      noPaddingZerosPipe = TestBed.inject(NoPaddingZerosPipe) as unknown as MockNoPaddingZerosPipe;
    });

    it('should call account selection service when sending from NanoNym', async () => {
      const nanoNym = {
        index: 0,
        label: 'TestNym',
        nnymAddress: 'nnym_testaddress',
        balance: new BigNumber('1000000000000000000000000000000'), // 1 XNO
        stealthAccounts: [
          {
            address: 'nano_stealth1',
            privateKey: new Uint8Array(32).fill(1),
            publicKey: new Uint8Array(32).fill(1),
            ephemeralPublicKey: new Uint8Array(32).fill(1),
            txHash: 'tx_hash_value_1',
            amountRaw: '500000000000000000000000000000',
            receivedAt: Date.now(),
            parentNanoNymIndex: 0,
            balance: new BigNumber('500000000000000000000000000000'), // 0.5 XNO
          },
          {
            address: 'nano_stealth2',
            privateKey: new Uint8Array(32).fill(2),
            publicKey: new Uint8Array(32).fill(2),
            ephemeralPublicKey: new Uint8Array(32).fill(2),
            txHash: 'tx_hash_value_2',
            amountRaw: '600000000000000000000000000000',
            receivedAt: Date.now(),
            parentNanoNymIndex: 0,
            balance: new BigNumber('600000000000000000000000000000'), // 0.6 XNO
          },
        ]
      };
      nanoNymStorageService.getNanoNym.and.returnValue(nanoNym);
      nanoNymStorageService.getAllNanoNyms.and.returnValue([nanoNym]);

      const amountToSend = new BigNumber('0.8').times('1000000000000000000000000000000'); // 0.8 XNO in raw
      const destinationAddress = 'nano_destination';

      // Mock the selection service to return specific accounts
      const selectedStealthAccounts = [
        { ...nanoNym.stealthAccounts[0], amountRaw: new BigNumber('0.5').times('1000000000000000000000000000000') },
        { ...nanoNym.stealthAccounts[1], amountRaw: new BigNumber('0.3').times('1000000000000000000000000000000') },
      ];
      nanoNymAccountSelectionService.selectAccountsForSend.and.returnValue(Promise.resolve({
        selectedAccounts: selectedStealthAccounts,
        totalSelectedAmount: new BigNumber('0.8').times('1000000000000000000000000000000'),
        privacyImpact: { numberOfSources: 2, warningLevel: 'medium' }
      }));

      // In a real scenario, a component would get this result and then call the NanoBlockService.
      // Here, we simulate that part.
      for (const account of selectedStealthAccounts) {
        const pseudoWalletAccount = {
          id: account.address,
          frontier: null, // Will be fetched by generateSend
          secret: account.privateKey,
          keyPair: (window as any).nacl.sign.keyPair.fromSecretKey(account.privateKey),
          index: -1, // Not applicable for stealth accounts
          balance: account.balance,
          pending: new BigNumber(0),
          balanceRaw: account.balance,
          pendingRaw: new BigNumber(0),
          balanceFiat: 0,
          pendingFiat: 0,
          addressBookName: nanoNym.label,
          receivePow: false,
        };
        await nanoBlockService.generateSend(pseudoWalletAccount, destinationAddress, account.amountRaw.toString(), false);
      }

      // Assert generateSend was called for each selected account
      expect(nanoBlockService.generateSend).toHaveBeenCalledTimes(2);
      expect(nanoBlockService.generateSend).toHaveBeenCalledWith(
        jasmine.objectContaining({ id: 'nano_stealth1' }),
        destinationAddress,
        selectedStealthAccounts[0].amountRaw.toString(),
        false
      );
      expect(nanoBlockService.generateSend).toHaveBeenCalledWith(
        jasmine.objectContaining({ id: 'nano_stealth2' }),
        destinationAddress,
        selectedStealthAccounts[1].amountRaw.toString(),
        false
      );
    });
  });
});
