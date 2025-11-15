import { Injectable } from "@angular/core";
import BigNumber from "bignumber.js";
import {
  NanoNym,
  StealthAccount,
  NanoNymNotification,
} from "../types/nanonym.types";
import {
  NanoNymAccount,
  truncateNanoNymAddress,
} from "../types/spendable-account.types";
import { NanoNymStorageService } from "./nanonym-storage.service";
import { NanoNymCryptoService } from "./nanonym-crypto.service";
import { NostrNotificationService } from "./nostr-notification.service";
import { ApiService } from "./api.service";
import { WalletService } from "./wallet.service";
import { Subscription, Subject } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class NanoNymManagerService {
  private notificationSubscription: Subscription | null = null;
  // Map nostr private key hex -> NanoNym index for fast notification routing
  private nostrPrivateToIndexMap = new Map<string, number>();

  // Observable for notification processing events
  public notificationProcessed$ = new Subject<{
    nanoNymIndex: number;
    nanoNymLabel: string;
    amount: string;
    stealthAddress: string;
    txHash: string;
  }>();

  constructor(
    private storage: NanoNymStorageService,
    private crypto: NanoNymCryptoService,
    private nostr: NostrNotificationService,
    private api: ApiService,
    private wallet: WalletService,
  ) {
    // Subscribe to incoming Nostr notifications
    this.setupNotificationListener();
  }

  /**
   * Create a new NanoNym
   */
  async createNanoNym(label?: string): Promise<NanoNym> {
    // Get wallet seed
    const seed = this.wallet.wallet.seed;
    if (!seed) {
      throw new Error("Wallet seed not available");
    }

    // Get next index
    const index = this.storage.getNextIndex();

    // Derive keys
    const keys = this.crypto.deriveNanoNymKeys(seed, index);

    // Encode nnym_ address
    const nnymAddress = this.crypto.encodeNanoNymAddress(
      keys.spend.public,
      keys.view.public,
      keys.nostr.public,
    );

    // Get fallback address
    const fallbackAddress = this.crypto.getFallbackAddress(keys.spend.public);

    // Create NanoNym object
    const nanoNym: NanoNym = {
      index,
      label: label || `NanoNym ${index}`,
      nnymAddress,
      fallbackAddress,
      status: "active",
      createdAt: Date.now(),
      keys: {
        spendPublic: keys.spend.public,
        spendPrivate: keys.spend.private,
        viewPublic: keys.view.public,
        viewPrivate: keys.view.private,
        nostrPublic: keys.nostr.public,
        nostrPrivate: keys.nostr.private,
      },
      balance: new BigNumber(0),
      paymentCount: 0,
      stealthAccounts: [],
    };

    // Save to storage
    this.storage.addNanoNym(nanoNym);

    // Start monitoring Nostr
    await this.startMonitoring(nanoNym);

    return nanoNym;
  }

  /**
   * Archive a NanoNym (stop monitoring)
   */
  async archiveNanoNym(index: number): Promise<void> {
    const nanoNym = this.storage.getNanoNym(index);
    if (!nanoNym) {
      throw new Error(`NanoNym with index ${index} not found`);
    }

    // Stop Nostr monitoring
    await this.stopMonitoring(nanoNym);

    // Update status
    this.storage.updateNanoNym(index, { status: "archived" });
  }

  /**
   * Reactivate a NanoNym (resume monitoring)
   */
  async reactivateNanoNym(index: number): Promise<void> {
    const nanoNym = this.storage.getNanoNym(index);
    if (!nanoNym) {
      throw new Error(`NanoNym with index ${index} not found`);
    }

    // Update status
    this.storage.updateNanoNym(index, { status: "active" });

    // Start monitoring
    await this.startMonitoring(nanoNym);
  }

  /**
   * Start monitoring Nostr for a NanoNym
   */
  private async startMonitoring(nanoNym: NanoNym): Promise<void> {
    try {
      const nostrPublicHex = this.bytesToHex(nanoNym.keys.nostrPublic);
      const nostrPrivateHex = this.bytesToHex(nanoNym.keys.nostrPrivate);

      console.log(
        `[Manager] Starting monitoring for NanoNym ${nanoNym.index}: ${nanoNym.label}`,
      );
      console.log(`[Manager] Nostr public key (hex): ${nostrPublicHex}`);

      await this.nostr.subscribeToNotifications(
        nanoNym.keys.nostrPublic,
        nanoNym.keys.nostrPrivate,
      );

      // Add to routing map
      this.nostrPrivateToIndexMap.set(nostrPrivateHex, nanoNym.index);

      console.log(
        `Started monitoring NanoNym ${nanoNym.index}: ${nanoNym.label}`,
      );
    } catch (error) {
      console.error(
        `Failed to start monitoring for NanoNym ${nanoNym.index}:`,
        error,
      );
    }
  }

  /**
   * Stop monitoring Nostr for a NanoNym
   */
  private async stopMonitoring(nanoNym: NanoNym): Promise<void> {
    try {
      await this.nostr.unsubscribeFromNotifications(nanoNym.keys.nostrPublic);

      // Remove from routing map
      const nostrPrivateHex = this.bytesToHex(nanoNym.keys.nostrPrivate);
      this.nostrPrivateToIndexMap.delete(nostrPrivateHex);

      console.log(
        `Stopped monitoring NanoNym ${nanoNym.index}: ${nanoNym.label}`,
      );
    } catch (error) {
      console.error(
        `Failed to stop monitoring for NanoNym ${nanoNym.index}:`,
        error,
      );
    }
  }

  /**
   * Start monitoring all active NanoNyms
   */
  async startMonitoringAll(): Promise<void> {
    const activeNanoNyms = this.storage.getActiveNanoNyms();
    for (const nanoNym of activeNanoNyms) {
      await this.startMonitoring(nanoNym);
    }
  }

  /**
   * Stop monitoring all NanoNyms
   */
  async stopMonitoringAll(): Promise<void> {
    const allNanoNyms = this.storage.getAllNanoNyms();
    for (const nanoNym of allNanoNyms) {
      if (nanoNym.status === "active") {
        await this.stopMonitoring(nanoNym);
      }
    }
  }

  /**
   * Reset all NanoNym data (for wallet seed change)
   * Stops monitoring, clears storage, and resets internal state
   */
  async resetAll(): Promise<void> {
    console.log('[Manager] Resetting all NanoNym data');

    // Stop all Nostr monitoring
    await this.stopMonitoringAll();

    // Clear routing map
    this.nostrPrivateToIndexMap.clear();

    // Clear storage
    this.storage.clearAll();

    console.log('[Manager] All NanoNym data cleared');
  }

  /**
   * Process an incoming Nostr notification
   */
  async processNotification(
    notification: NanoNymNotification,
    nanoNymIndex: number,
  ): Promise<StealthAccount | null> {
    console.log(
      "[Manager-Process] Starting processing for notification:",
      notification,
    );
    try {
      const nanoNym = this.storage.getNanoNym(nanoNymIndex);
      if (!nanoNym) {
        console.error(
          `[Manager-Process] NanoNym with index ${nanoNymIndex} not found`,
        );
        return null;
      }
      console.log(`[Manager-Process] Found NanoNym: ${nanoNym.label}`);

      // 1. Parse ephemeral public key R from notification
      const R = this.hexToUint8Array(notification.R);
      console.log(
        `[Manager-Process] Ephemeral public key R: ${notification.R}`,
      );

      // 2. Generate shared secret using view key
      const sharedSecret = this.crypto.generateSharedSecret(
        nanoNym.keys.viewPrivate,
        R,
      );
      console.log(`[Manager-Process] Generated shared secret.`);

      // 3. Derive expected stealth address
      const stealth = this.crypto.deriveStealthAddress(
        sharedSecret,
        R,
        nanoNym.keys.spendPublic,
      );
      console.log(
        `[Manager-Process] Derived stealth address: ${stealth.address}`,
      );

      // 4. Verify transaction exists on blockchain (account may not be opened yet)
      console.log(
        `[Manager-Process] Checking account info for ${stealth.address} on-chain...`,
      );
      const accountInfo = await this.api.accountInfo(stealth.address);

      // Handle unopened accounts (normal for fresh stealth addresses)
      let accountBalance = "0";
      if (accountInfo.error) {
        if (accountInfo.error === "Account not found") {
          console.log(
            `[Manager-Process] ✅ Stealth address is new (unopened account). Balance will be 0 until receive block is published.`,
          );
        } else {
          console.error(
            `[Manager-Process] ❌ Unexpected error querying stealth address: ${accountInfo.error}`,
          );
          return null;
        }
      } else {
        accountBalance = accountInfo.balance || "0";
        console.log(
          `[Manager-Process] ✅ On-chain account info found. Balance: ${accountBalance}`,
        );
      }

      // 5. Derive private key for spending
      const privateKey = this.crypto.deriveStealthPrivateKey(
        nanoNym.keys.spendPrivate,
        sharedSecret,
        R,
        nanoNym.keys.spendPublic,
      );
      console.log(`[Manager-Process] Derived stealth private key.`);

      // 6. Create stealth account object
      const stealthAccount: StealthAccount = {
        address: stealth.address,
        publicKey: stealth.publicKey,
        privateKey: privateKey,
        ephemeralPublicKey: R,
        txHash: notification.tx_hash,
        amountRaw: notification.amount_raw || "0",
        memo: notification.memo,
        receivedAt: Date.now(),
        parentNanoNymIndex: nanoNymIndex,
        balance: new BigNumber(accountBalance),
      };
      console.log(
        `[Manager-Process] Created stealth account object:`,
        stealthAccount,
      );

      // 7. Store stealth account
      this.storage.addStealthAccount(nanoNymIndex, stealthAccount);
      console.log(`[Manager-Process] Stored stealth account.`);

      // 8. Import into wallet for spending capability
      await this.importStealthAccountToWallet(stealthAccount);

      // 9. Emit event for UI updates (reuse nanoNym from earlier)
      console.log(
        "[Manager-Process] Emitting notificationProcessed$ event for UI update...",
      );
      this.notificationProcessed$.next({
        nanoNymIndex,
        nanoNymLabel: nanoNym.label,
        amount: this.formatAmount(stealthAccount.balance),
        stealthAddress: stealth.address,
        txHash: notification.tx_hash,
      });

      console.log(
        `✅ Payment received: ${this.formatAmount(stealthAccount.balance)} XNO to ${nanoNym.label}`,
      );
      return stealthAccount;
    } catch (error) {
      console.error(
        "[Manager-Process] 💥 Failed to process notification:",
        error,
      );
      return null;
    }
  }

  /**
   * Import stealth account into wallet for spending
   */
  private async importStealthAccountToWallet(
    stealthAccount: StealthAccount,
  ): Promise<void> {
    try {
      // TODO: Add stealth account to WalletService
      // This will require modifying WalletService to support imported accounts
      // For now, we'll just log it
      console.log(
        `TODO: Import stealth account ${stealthAccount.address} to wallet`,
      );
    } catch (error) {
      console.error("Failed to import stealth account to wallet:", error);
    }
  }

  /**
   * Refresh balances for all stealth accounts of a NanoNym
   */
  async refreshBalances(nanoNymIndex: number): Promise<void> {
    const nanoNym = this.storage.getNanoNym(nanoNymIndex);
    if (!nanoNym) return;

    for (const stealthAccount of nanoNym.stealthAccounts) {
      try {
        const accountInfo = await this.api.accountInfo(stealthAccount.address);
        const balance = new BigNumber(accountInfo.balance || 0);
        this.storage.updateStealthAccountBalance(
          nanoNymIndex,
          stealthAccount.address,
          balance,
        );
      } catch (error) {
        console.error(
          `Failed to refresh balance for ${stealthAccount.address}:`,
          error,
        );
      }
    }
  }

  /**
   * Refresh balances for all NanoNyms
   */
  async refreshAllBalances(): Promise<void> {
    const allNanoNyms = this.storage.getAllNanoNyms();
    for (const nanoNym of allNanoNyms) {
      await this.refreshBalances(nanoNym.index);
    }
  }

  /**
   * Get aggregated balance for a NanoNym
   */
  getAggregatedBalance(nanoNymIndex: number): BigNumber {
    const nanoNym = this.storage.getNanoNym(nanoNymIndex);
    if (!nanoNym) return new BigNumber(0);
    return nanoNym.balance;
  }

  /**
   * Get all NanoNyms as spendable accounts
   * Converts NanoNym objects to the SpendableAccount interface
   * Shows all NanoNyms regardless of balance (like regular accounts)
   */
  getSpendableNanoNymAccounts(): NanoNymAccount[] {
    const allNanoNyms = this.storage.getAllNanoNyms();

    return allNanoNyms.map(nn => this.convertToSpendableAccount(nn));
  }

  /**
   * Get a specific NanoNym as a spendable account
   */
  getNanoNymAsSpendableAccount(nanoNymIndex: number): NanoNymAccount | null {
    const nanoNym = this.storage.getNanoNym(nanoNymIndex);
    if (!nanoNym) return null;
    return this.convertToSpendableAccount(nanoNym);
  }

  /**
   * Convert a NanoNym to a SpendableAccount
   */
  private convertToSpendableAccount(nanoNym: NanoNym): NanoNymAccount {
    const nano = new BigNumber('1000000000000000000000000000000');

    return {
      type: 'nanonym',
      id: nanoNym.nnymAddress,
      label: nanoNym.label,
      balance: nanoNym.balance,
      balanceRaw: nanoNym.balance.mod(nano),
      pending: new BigNumber(0), // Stealth accounts auto-receive
      balanceFiat: 0, // Will be calculated by component
      index: nanoNym.index,
      nanoNym: nanoNym,
      truncatedAddress: truncateNanoNymAddress(nanoNym.nnymAddress),
    };
  }

  /**
   * Convert hex string to Uint8Array
   */
  private hexToUint8Array(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Set up listener for incoming Nostr notifications
   */
  private setupNotificationListener(): void {
    console.log("[Manager] Setting up notification listener");
    this.notificationSubscription = this.nostr.incomingNotifications$.subscribe(
      async (incoming) => {
        // Find which NanoNym this notification belongs to by matching private key
        const receiverPrivateHex = this.bytesToHex(
          incoming.receiverNostrPrivate,
        );

        const nanoNymIndex =
          this.nostrPrivateToIndexMap.get(receiverPrivateHex);

        if (nanoNymIndex === undefined) {
          console.warn(
            `[Manager] Received notification for unknown Nostr private key: ${receiverPrivateHex.slice(0, 8)}...`,
          );
          return;
        }

        console.log(
          `[Manager] Matched notification to NanoNym index: ${nanoNymIndex}`,
        );

        // Process the notification for the matched NanoNym
        await this.processNotification(incoming.notification, nanoNymIndex);
      },
    );
  }

  /**
   * Convert Uint8Array to hex string
   */
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Format raw amount to human-readable XNO
   */
  private formatAmount(rawAmount: BigNumber): string {
    const mnano = rawAmount.dividedBy(
      new BigNumber("1000000000000000000000000000000"),
    );
    return mnano.toFixed(6);
  }

  /**
   * Clean up subscriptions
   */
  ngOnDestroy(): void {
    if (this.notificationSubscription) {
      this.notificationSubscription.unsubscribe();
    }
  }
}
