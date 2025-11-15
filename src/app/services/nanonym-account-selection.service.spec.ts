import { TestBed } from '@angular/core/testing';
import BigNumber from 'bignumber.js';
import { NanoNymAccountSelectionService } from './nanonym-account-selection.service';
import { StealthAccount } from '../types/nanonym.types';

describe('NanoNymAccountSelectionService', () => {
  let service: NanoNymAccountSelectionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NanoNymAccountSelectionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  /**
   * Helper to create mock stealth accounts
   */
  function createMockStealthAccount(amountRaw: string, index: number): StealthAccount {
    return {
      address: `nano_${index}${'0'.repeat(60)}`,
      publicKey: new Uint8Array(32),
      privateKey: new Uint8Array(32),
      ephemeralPublicKey: new Uint8Array(32),
      txHash: `hash_${index}`,
      amountRaw: amountRaw,
      receivedAt: Date.now(),
      parentNanoNymIndex: 0,
      balance: new BigNumber(amountRaw)
    };
  }

  describe('Single Account Selection (Best Privacy)', () => {
    it('should select single account when balance is sufficient', () => {
      const accounts = [
        createMockStealthAccount('1000000000000000000000000000000', 0), // 1 XNO
        createMockStealthAccount('2000000000000000000000000000000', 1), // 2 XNO
        createMockStealthAccount('3000000000000000000000000000000', 2), // 3 XNO
      ];

      const amount = new BigNumber('1500000000000000000000000000000'); // 1.5 XNO
      const result = service.selectAccountsForSend(amount, accounts);

      expect(result.accounts.length).toBe(1);
      expect(result.accounts[0]).toBe(accounts[1]); // First account >= 1.5 XNO
      expect(result.requiresMultipleAccounts).toBe(false);
    });

    it('should not require multiple accounts when single account is sufficient', () => {
      const accounts = [
        createMockStealthAccount('5000000000000000000000000000000', 0), // 5 XNO
      ];

      const amount = new BigNumber('2000000000000000000000000000000'); // 2 XNO
      const result = service.selectAccountsForSend(amount, accounts);

      expect(result.requiresMultipleAccounts).toBe(false);
    });
  });

  describe('Multiple Account Selection (Section 8.2 Algorithm)', () => {
    it('should select minimum number of accounts using greedy algorithm', () => {
      const accounts = [
        createMockStealthAccount('1200000000000000000000000000000', 0), // 1.2 XNO
        createMockStealthAccount('1300000000000000000000000000000', 1), // 1.3 XNO
        createMockStealthAccount('500000000000000000000000000', 2),    // 0.5 XNO
      ];

      const amount = new BigNumber('2500000000000000000000000000000'); // 2.5 XNO
      const result = service.selectAccountsForSend(amount, accounts);

      // Should use 1.3 + 1.2 = 2.5 XNO (2 accounts, not 3)
      expect(result.accounts.length).toBe(2);
      expect(result.requiresMultipleAccounts).toBe(true);
    });

    it('should use largest-first strategy for greedy selection', () => {
      const accounts = [
        createMockStealthAccount('1000000000000000000000000000000', 0), // 1 XNO
        createMockStealthAccount('5000000000000000000000000000000', 1), // 5 XNO (largest)
        createMockStealthAccount('2000000000000000000000000000000', 2), // 2 XNO
      ];

      const amount = new BigNumber('3000000000000000000000000000000'); // 3 XNO
      const result = service.selectAccountsForSend(amount, accounts);

      // Should select 5 XNO account first (greedy = largest first)
      expect(result.accounts.length).toBe(1);
      expect(result.accounts[0]).toBe(accounts[1]);
    });

    it('should set requiresMultipleAccounts flag correctly', () => {
      const accounts = [
        createMockStealthAccount('1000000000000000000000000000000', 0),
        createMockStealthAccount('1000000000000000000000000000000', 1),
      ];

      const amount = new BigNumber('1500000000000000000000000000000'); // 1.5 XNO
      const result = service.selectAccountsForSend(amount, accounts);

      expect(result.accounts.length).toBe(2); // Need both accounts
      expect(result.requiresMultipleAccounts).toBe(true);
    });

    it('should randomize order to reduce timing correlation', () => {
      const accounts = [
        createMockStealthAccount('1000000000000000000000000000000', 0),
        createMockStealthAccount('1000000000000000000000000000000', 1),
        createMockStealthAccount('1000000000000000000000000000000', 2),
      ];

      const amount = new BigNumber('2500000000000000000000000000000');

      // Run selection multiple times - order should vary due to randomization
      const orders = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const result = service.selectAccountsForSend(amount, accounts);
        const order = result.accounts.map(a => a.address).join(',');
        orders.add(order);
      }

      // With randomization, we expect different orders (reduces timing analysis)
      expect(orders.size).toBeGreaterThan(1);
    });
  });

  describe('Edge Cases', () => {
    it('should return empty result when insufficient balance', () => {
      const accounts = [
        createMockStealthAccount('1000000000000000000000000000000', 0), // 1 XNO
        createMockStealthAccount('500000000000000000000000000', 1),    // 0.5 XNO
      ];

      const amount = new BigNumber('2000000000000000000000000000000'); // 2 XNO
      const result = service.selectAccountsForSend(amount, accounts);

      expect(result.accounts.length).toBe(0);
    });

    it('should return empty result for empty account list', () => {
      const result = service.selectAccountsForSend(
        new BigNumber('1000000000000000000000000000000'),
        []
      );

      expect(result.accounts.length).toBe(0);
      expect(result.requiresMultipleAccounts).toBe(false);
    });

    it('should filter out zero balance accounts', () => {
      const accounts = [
        createMockStealthAccount('0', 0), // 0 XNO (should be ignored)
        createMockStealthAccount('1000000000000000000000000000000', 1), // 1 XNO
        createMockStealthAccount('0', 2), // 0 XNO (should be ignored)
      ];

      const amount = new BigNumber('500000000000000000000000000'); // 0.5 XNO
      const result = service.selectAccountsForSend(amount, accounts);

      expect(result.accounts.length).toBe(1);
      expect(result.accounts[0]).toBe(accounts[1]);
    });
  });

  describe('Balance Aggregation (User-Specified Test Case)', () => {
    it('should correctly aggregate 1.2 XNO + 1.3 XNO stealth accounts to 2.5 XNO total', () => {
      const stealthAccounts = [
        createMockStealthAccount('1200000000000000000000000000000', 0), // 1.2 XNO
        createMockStealthAccount('1300000000000000000000000000000', 1), // 1.3 XNO
      ];

      const totalBalance = service.getTotalBalance(stealthAccounts);
      const expected = new BigNumber('2500000000000000000000000000000');

      // Verify aggregation logic produces correct raw total
      expect(totalBalance.eq(expected)).toBe(true);
    });

    it('should use amountRaw field for balance calculation', () => {
      // Test that we use amountRaw, not balance (balance may be 0 for unopened accounts)
      const accountWithDifferentFields = {
        ...createMockStealthAccount('1000000000000000000000000000000', 0),
        balance: new BigNumber(0), // Unopened account has 0 balance on-chain
        amountRaw: '1000000000000000000000000000000' // But notification said 1 XNO
      };

      const result = service.getTotalBalance([accountWithDifferentFields]);
      const expected = new BigNumber('1000000000000000000000000000000');

      // Should use amountRaw (1 XNO), not balance (0)
      expect(result.eq(expected)).toBe(true);
    });
  });

  describe('Privacy Impact Calculation', () => {
    it('should report high privacy for single account sends', () => {
      const result = {
        accounts: [createMockStealthAccount('1000000000000000000000000000000', 0)],
        totalBalance: new BigNumber('1000000000000000000000000000000'),
        requiresMultipleAccounts: false
      };

      const impact = service.calculatePrivacyImpact(result);

      expect(impact.accountsLinked).toBe(1);
      expect(impact.privacyLevel).toBe('high');
    });

    it('should report medium privacy for 2-3 linked accounts', () => {
      const result = {
        accounts: [
          createMockStealthAccount('1000000000000000000000000000000', 0),
          createMockStealthAccount('1000000000000000000000000000000', 1)
        ],
        totalBalance: new BigNumber('2000000000000000000000000000000'),
        requiresMultipleAccounts: true
      };

      const impact = service.calculatePrivacyImpact(result);

      expect(impact.accountsLinked).toBe(2);
      expect(impact.privacyLevel).toBe('medium');
    });

    it('should report low privacy for 4+ linked accounts', () => {
      const result = {
        accounts: Array(5).fill(null).map((_, i) =>
          createMockStealthAccount('1000000000000000000000000000000', i)
        ),
        totalBalance: new BigNumber('5000000000000000000000000000000'),
        requiresMultipleAccounts: true
      };

      const impact = service.calculatePrivacyImpact(result);

      expect(impact.accountsLinked).toBe(5);
      expect(impact.privacyLevel).toBe('low');
    });
  });
});
