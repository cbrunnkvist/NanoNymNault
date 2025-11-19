import { Injectable } from '@angular/core';
import BigNumber from 'bignumber.js';
import { StealthAccount } from '../types/nanonym.types';

/**
 * Result from account selection algorithm
 */
export interface AccountSelectionResult {
  /** Selected stealth accounts to spend from */
  accounts: StealthAccount[];
  /** Total balance of selected accounts */
  totalBalance: BigNumber;
  /** Whether multiple accounts are required (triggers privacy warning) */
  requiresMultipleAccounts: boolean;
}

/**
 * Service for selecting stealth accounts when spending from NanoNyms
 * Implements the "Minimum Accounts with Randomized Tie-Breaking" strategy from Section 8.2
 */
@Injectable({
  providedIn: 'root'
})
export class NanoNymAccountSelectionService {

  /**
   * Select stealth accounts to cover the requested amount
   *
   * Strategy: "Minimum Accounts with Randomized Tie-Breaking"
   * 1. Try to use single account first (best privacy)
   * 2. If not possible, use minimum number of accounts
   * 3. Randomize order of sends to reduce timing correlation
   *
   * @param amount Amount to send (in raw)
   * @param availableStealthAccounts All stealth accounts available for spending
   * @returns Selected accounts and metadata
   */
  selectAccountsForSend(
    amount: BigNumber,
    availableStealthAccounts: StealthAccount[]
  ): AccountSelectionResult {

    console.log('[AccountSelection] selectAccountsForSend called', {
      requestedAmount: amount.toString(),
      availableAccountsCount: availableStealthAccounts.length,
      accounts: availableStealthAccounts.map(a => ({
        address: a.address,
        amountRaw: a.amountRaw,
        balance: a.balance?.toString(),
        balanceGt0: a.balance?.gt(0) || (typeof a.amountRaw === 'string' ? a.amountRaw !== '0' : false)
      }))
    });

    // 1. Filter accounts with non-zero balance
    const funded = availableStealthAccounts.filter(a => {
      const balance = new BigNumber(a.amountRaw || a.balance || 0);
      return balance.gt(0);
    });

    console.log('[AccountSelection] Filtered funded accounts:', {
      fundedCount: funded.length,
      funded: funded.map(a => ({
        address: a.address,
        balance: new BigNumber(a.amountRaw || a.balance || 0).toString()
      }))
    });

    if (funded.length === 0) {
      console.log('[AccountSelection] No funded accounts found, returning empty');
      return {
        accounts: [],
        totalBalance: new BigNumber(0),
        requiresMultipleAccounts: false
      };
    }

    // 2. Try single account first (best privacy - no linkage!)
    const singleAccount = funded.find(a => {
      const balance = new BigNumber(a.amountRaw || a.balance || 0);
      return balance.gte(amount);
    });

    if (singleAccount) {
      const singleBalance = new BigNumber(singleAccount.amountRaw || singleAccount.balance || 0);
      console.log('[AccountSelection] Single account sufficient', {
        address: singleAccount.address,
        balance: singleBalance.toString(),
        requested: amount.toString()
      });
      return {
        accounts: [singleAccount],
        totalBalance: singleBalance,
        requiresMultipleAccounts: false
      };
    }

    console.log('[AccountSelection] No single account sufficient, trying multiple accounts');

    // 3. Need multiple accounts - use minimum with greedy algorithm
    // Sort by balance descending (largest first)
    const sorted = [...funded].sort((a, b) => {
      const balanceA = new BigNumber(a.amountRaw || a.balance || 0);
      const balanceB = new BigNumber(b.amountRaw || b.balance || 0);
      return balanceB.comparedTo(balanceA);
    });

    // 4. Find minimal set using greedy approach
    const selected: StealthAccount[] = [];
    let remaining = new BigNumber(amount);

    for (const account of sorted) {
      if (remaining.lte(0)) break;

      const accountBalance = new BigNumber(account.amountRaw || account.balance || 0);
      selected.push(account);
      remaining = remaining.minus(accountBalance);
    }

    // Check if we have enough balance
    const totalBalance = selected.reduce((sum, account) => {
      const balance = new BigNumber(account.amountRaw || account.balance || 0);
      return sum.plus(balance);
    }, new BigNumber(0));

    console.log('[AccountSelection] Multiple accounts result', {
      selectedCount: selected.length,
      totalBalance: totalBalance.toString(),
      requested: amount.toString(),
      sufficient: totalBalance.gte(amount)
    });

    if (totalBalance.lt(amount)) {
      // Insufficient funds even with all accounts
      console.log('[AccountSelection] Insufficient funds, returning empty', {
        totalBalance: totalBalance.toString(),
        requested: amount.toString()
      });
      return {
        accounts: [],
        totalBalance: new BigNumber(0),
        requiresMultipleAccounts: false
      };
    }

    // 5. Randomize order of sends (reduces timing correlation)
    const randomized = this.shuffleArray(selected);

    console.log('[AccountSelection] Selection successful', {
      selectedCount: randomized.length,
      totalBalance: totalBalance.toString(),
      requiresMultiple: true
    });

    return {
      accounts: randomized,
      totalBalance: totalBalance,
      requiresMultipleAccounts: true
    };
  }

  /**
   * Get total balance across all stealth accounts
   */
  getTotalBalance(stealthAccounts: StealthAccount[]): BigNumber {
    return stealthAccounts.reduce((sum, account) => {
      const balance = new BigNumber(account.amountRaw || account.balance || 0);
      return sum.plus(balance);
    }, new BigNumber(0));
  }

  /**
   * Fisher-Yates shuffle algorithm for randomizing account order
   * Reduces timing correlation between multiple sends
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Calculate privacy impact score (for future use in warnings)
   * Returns number of accounts that will be linked on-chain
   */
  calculatePrivacyImpact(result: AccountSelectionResult): {
    accountsLinked: number;
    privacyLevel: 'high' | 'medium' | 'low';
  } {
    const count = result.accounts.length;

    let privacyLevel: 'high' | 'medium' | 'low' = 'high';
    if (count === 1) {
      privacyLevel = 'high'; // No linkage
    } else if (count <= 3) {
      privacyLevel = 'medium'; // Some linkage
    } else {
      privacyLevel = 'low'; // Significant linkage
    }

    return {
      accountsLinked: count,
      privacyLevel
    };
  }
}
