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
import { WalletService, WalletAccount } from "./wallet.service";
import { Subscription, Subject, interval } from "rxjs";
import { NanoBlockService } from "./nano-block.service";
import { UtilService } from "./util.service";
import { NotificationService } from "./notification.service";
import { NoPaddingZerosPipe } from "app/pipes/no-padding-zeros.pipe";
import { tools as nanocurrencyWebTools } from "nanocurrency-web";
const nacl = window["nacl"];

@Injectable({
  providedIn: "root",
})
export class NanoNymManagerService {
  private notificationSubscription: Subscription | null = null;
  private backgroundRetrySubscription: Subscription | null = null;
  // Map nostr private key hex -> NanoNym index for fast notification routing
  private nostrPrivateToIndexMap = new Map<string, number>();
  private pendingStealthBlocks: StealthAccount[] = [];
  // Track retry attempts per account (address -> retry count)
  private stealthAccountRetryCount = new Map<string, number>();

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
    private nanoBlock: NanoBlockService,
    private util: UtilService,
    private notifications: NotificationService,
    private noZerosPipe: NoPaddingZerosPipe,
  ) {
    // Subscribe to incoming Nostr notifications
    this.setupNotificationListener();

    // Subscribe to wallet unlock events to process any pending stealth receives
    this.wallet.wallet.locked$.subscribe(isLocked => {
      if (!isLocked) { // Wallet is unlocked
        this.processPendingStealthBlocks();
      }
    });

    // Phase 2: Start background retry mechanism (every 5 minutes)
    this.startBackgroundRetry();
  }

  /**
   * Start periodic background retry for unopened stealth accounts (every 5 minutes)
   * Phase 2 of the stealth account opening workflow
   */
  private startBackgroundRetry(): void {
    // Run every 5 minutes (300000 ms)
    this.backgroundRetrySubscription = interval(300000).subscribe(() => {
      this.attemptBackgroundOpening();
    });

    // Also run once on startup
    this.attemptBackgroundOpening();
  }

  /**
   * Attempt to open stealth accounts that failed immediate opening
   * Retries up to 12 times per account (1 hour total with 5-minute intervals)
   */
  private async attemptBackgroundOpening(): Promise<void> {
    if (this.wallet.wallet.locked) {
      console.debug('[Manager] Phase 2: Wallet locked, skipping background opening attempt.');
      return;
    }

    if (this.pendingStealthBlocks.length === 0) {
      return; // No pending accounts
    }

    console.log(`[Manager] Phase 2: Background opening attempt for ${this.pendingStealthBlocks.length} unopened stealth account(s)`);

    // Show persistent notification for Phase 2 retry
    this.notifications.sendInfo(
      `Retrying to open ${this.pendingStealthBlocks.length} unopened stealth account(s)...`,
      { identifier: 'phase2-retry-progress', timeout: 0 }
    );

    // Create a copy to avoid modification during iteration
    const blocksToProcess = [...this.pendingStealthBlocks];

    for (const stealthAccount of blocksToProcess) {
      const retryCount = this.stealthAccountRetryCount.get(stealthAccount.address) || 0;

      // Max 12 retries (1 hour total)
      if (retryCount >= 12) {
        console.warn(`[Manager] Phase 2: Max retries (12) reached for ${stealthAccount.address}. Stopping retry.`);
        this.removePendingStealthBlock(stealthAccount.address);
        this.stealthAccountRetryCount.delete(stealthAccount.address);
        continue;
      }

      const nanoNym = this.storage.getNanoNym(stealthAccount.parentNanoNymIndex);
      if (!nanoNym) {
        console.warn(`[Manager] Phase 2: NanoNym not found for ${stealthAccount.address}, removing from retry queue.`);
        this.removePendingStealthBlock(stealthAccount.address);
        this.stealthAccountRetryCount.delete(stealthAccount.address);
        continue;
      }

      try {
        console.log(`[Manager] Phase 2: Retry ${retryCount + 1}/12 for ${stealthAccount.address}`);

        // Attempt to open the account using the same method as Phase 1
        const pseudoWalletAccount: WalletAccount = {
          id: stealthAccount.address,
          frontier: null,
          secret: stealthAccount.privateKey,
          keyPair: nacl.sign.keyPair.fromSecretKey(stealthAccount.privateKey),
          index: -1,
          balance: new BigNumber(0),
          pending: new BigNumber(0),
          balanceRaw: new BigNumber(0),
          pendingRaw: new BigNumber(0),
          balanceFiat: 0,
          pendingFiat: 0,
          addressBookName: nanoNym.label,
          receivePow: false,
          isStealthAccount: true  // Flag to use scalar signing in nano-block.service
        };

        const newHash = await this.nanoBlock.generateReceive(
          pseudoWalletAccount,
          stealthAccount.txHash,
          false,
        );

        if (newHash) {
          console.log(`[Manager] ✅ Phase 2 Success: ${stealthAccount.address} opened. Hash: ${newHash}`);

          // Update balances
          const accountInfo = await this.api.accountInfo(stealthAccount.address);
          const newBalance = new BigNumber(accountInfo.balance || 0);

          this.storage.updateStealthAccountBalance(
            nanoNym.index,
            stealthAccount.address,
            newBalance,
          );
          this.storage.updateNanoNym(nanoNym.index, {
            balance: nanoNym.balance.plus(newBalance),
          });

          // Remove from pending
          this.removePendingStealthBlock(stealthAccount.address);
          this.stealthAccountRetryCount.delete(stealthAccount.address);
        } else {
          // Increment retry count and continue
          this.stealthAccountRetryCount.set(stealthAccount.address, retryCount + 1);
        }
      } catch (error) {
        // Increment retry count and continue
        this.stealthAccountRetryCount.set(stealthAccount.address, retryCount + 1);
        console.warn(`[Manager] Phase 2: Error retry #${retryCount + 1} for ${stealthAccount.address}:`, error.message);
      }
    }

    // Dismiss the progress notification
    this.notifications.removeNotification('phase2-retry-progress');

    // Show summary if still pending
    if (this.pendingStealthBlocks.length > 0) {
      console.log(`[Manager] Phase 2: ${this.pendingStealthBlocks.length} accounts still pending, will retry in 5 minutes`);
    }
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
        `[Manager] 📡 Starting monitoring for "${nanoNym.label}" (index: ${nanoNym.index})`,
      );
      console.debug(`[Manager] Nostr public key: ${nostrPublicHex}`);

      await this.nostr.subscribeToNotifications(
        nanoNym.keys.nostrPublic,
        nanoNym.keys.nostrPrivate,
      );

      // Add to routing map
      this.nostrPrivateToIndexMap.set(nostrPrivateHex, nanoNym.index);

      console.log(
        `[Manager] ✅ Monitoring active for "${nanoNym.label}"`,
      );
    } catch (error) {
      console.error(
        `[Manager] ❌ Failed to start monitoring "${nanoNym.label}":`,
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
        `[Manager] 🔌 Stopped monitoring "${nanoNym.label}"`,
      );
    } catch (error) {
      console.error(
        `[Manager] ❌ Failed to stop monitoring "${nanoNym.label}":`,
        error,
      );
    }
  }

  /**
   * Start monitoring all active NanoNyms
   */
  async startMonitoringAll(): Promise<void> {
    await this.storage.whenLoaded(); // Wait for storage to load
    const activeNanoNyms = this.storage.getActiveNanoNyms();
    for (const nanoNym of activeNanoNyms) {
      await this.startMonitoring(nanoNym);
    }
    // Verify all stealth account balances against Nano node
    // Ensures we have accurate on-chain balances on startup
    await this.refreshAllBalances();
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
    console.log('[Manager] 🔄 Resetting all NanoNym data');

    // Stop all Nostr monitoring
    await this.stopMonitoringAll();

    // Clear routing map
    this.nostrPrivateToIndexMap.clear();

    // Clear storage
    this.storage.clearAll();

    console.log('[Manager] ✅ All NanoNym data cleared');
  }

  /**
   * Process an incoming Nostr notification
   */
  async processNotification(
    notification: NanoNymNotification,
    nanoNymIndex: number,
  ): Promise<StealthAccount | null> {
    try {
      const nanoNym = this.storage.getNanoNym(nanoNymIndex);
      if (!nanoNym) {
        console.error(
          `[Manager] ❌ NanoNym index ${nanoNymIndex} not found`,
        );
        return null;
      }

      console.log(`[Manager] 💰 Processing payment for "${nanoNym.label}" (tx: ${notification.tx_hash})`);

      // 1. Parse ephemeral public key R from notification
      const R = this.util.hex.toUint8(notification.R);
      console.debug(`[Manager] Ephemeral key R: ${notification.R}`);

      // DEBUG: Log receiver-side input data
      console.log('[Manager] RECEIVER-SIDE STEALTH ADDRESS COMPUTATION');
      console.log('[Manager] Ephemeral public (R):', notification.R);
      console.log('[Manager] Recipient B_spend:', this.util.hex.fromUint8(nanoNym.keys.spendPublic));
      console.log('[Manager] Recipient B_view:', this.util.hex.fromUint8(nanoNym.keys.viewPublic));

      // 2. Generate shared secret using view key
      const sharedSecret = this.crypto.generateSharedSecret(
        nanoNym.keys.viewPrivate,
        R,
      );
      console.debug(`[Manager] Shared secret generated`);
      console.log('[Manager] Shared secret:', this.util.hex.fromUint8(sharedSecret));

      // 3. Derive expected stealth address
      const stealth = this.crypto.deriveStealthAddress(
        sharedSecret,
        R,
        nanoNym.keys.spendPublic,
      );
      console.debug(`[Manager] Stealth address: ${stealth.address}`);
      console.log('[Manager] Stealth address:', stealth.address);
      console.log('[Manager] Stealth public key:', this.util.hex.fromUint8(stealth.publicKey));

      // 4. Verify transaction exists on blockchain (account may not be opened yet)
      const accountInfo = await this.api.accountInfo(stealth.address);

      // Handle unopened accounts (normal for fresh stealth addresses)
      let accountBalance = "0";
      if (accountInfo.error) {
        if (accountInfo.error === "Account not found") {
          console.debug(`[Manager] Unopened stealth account (pending receive block)`);
          // Use notification amount_raw as expected balance (will be verified when block opens)
          accountBalance = notification.amount_raw || "0";
          console.debug(`[Manager] Using notification amount_raw as expected balance: ${accountBalance} raw`);
        } else {
          console.error(
            `[Manager] ❌ Error querying stealth address: ${accountInfo.error}`,
          );
          return null;
        }
      } else {
        accountBalance = accountInfo.balance || "0";
        console.debug(`[Manager] On-chain balance: ${accountBalance} raw`);
      }

      // 5. Derive private key for spending
      const privateKeyBytes = this.crypto.deriveStealthPrivateKey(
        nanoNym.keys.spendPrivate,
        sharedSecret,
        R,
        nanoNym.keys.spendPublic,
      );
      console.debug(`[Manager] Private key derived`);

      // 6. Create stealth account object
      const stealthAccount: StealthAccount = {
        address: stealth.address,
        publicKey: stealth.publicKey,
        privateKey: privateKeyBytes,
        ephemeralPublicKey: this.util.hex.toUint8(notification.R),
        txHash: notification.tx_hash,
        amountRaw: notification.amount_raw || "0",
        memo: notification.memo,
        receivedAt: Date.now(),
        parentNanoNymIndex: nanoNymIndex,
        balance: new BigNumber(accountBalance),
      };

      // 7. Store stealth account
      this.storage.addStealthAccount(nanoNymIndex, stealthAccount);
      console.log(`[Manager] ✅ Stealth account created: ${stealth.address}`);

      // 8. Initiate receive process for the stealth account
      await this.receiveStealthFunds(stealthAccount, nanoNym);

      // 9. Emit event for UI updates
      this.notificationProcessed$.next({
        nanoNymIndex,
        nanoNymLabel: nanoNym.label,
        amount: this.formatAmount(stealthAccount.balance),
        stealthAddress: stealth.address,
        txHash: notification.tx_hash,
      });

      console.log(
        `[Manager] ✅ Payment: ${this.formatAmount(stealthAccount.balance)} XNO → "${nanoNym.label}"`,
      );
      return stealthAccount;
    } catch (error) {
      console.error(
        "[Manager] ❌ Failed to process notification:",
        error,
      );
      return null;
    }
  }

  /**
   * Receive funds for a stealth account by publishing a receive block.
   * Handles wallet locking and queues if necessary.
   */
  private async receiveStealthFunds(
    stealthAccount: StealthAccount,
    nanoNym: NanoNym,
  ): Promise<void> {
    const pseudoWalletAccount: WalletAccount = {
      id: stealthAccount.address,
      frontier: null, // Will be fetched by generateReceive
      secret: stealthAccount.privateKey,
      keyPair: null, // Not used for stealth accounts (scalar-based signing instead)
      index: -1, // Not applicable for stealth accounts
      balance: new BigNumber(0),
      pending: new BigNumber(0),
      balanceRaw: new BigNumber(0),
      pendingRaw: new BigNumber(0),
      balanceFiat: 0,
      pendingFiat: 0,
      addressBookName: nanoNym.label,
      receivePow: false,
      isStealthAccount: true,  // Flag to use scalar signing in nano-block.service
      publicKeyHex: this.util.hex.fromUint8(stealthAccount.publicKey),  // Store the public key as hex string for signature verification
    };

    if (this.wallet.wallet.locked) {
      console.log(`[Manager] 🔒 Wallet locked, queuing stealth account opening for ${stealthAccount.address}`);
      // Add to pending for later processing when unlocked
      this.addPendingStealthBlock(stealthAccount);
      return;
    }

    try {
      console.log(`[Manager] 📤 Phase 1: Attempting immediate stealth account opening for ${stealthAccount.address} (amount: ${stealthAccount.amountRaw})`);
      const newHash = await this.nanoBlock.generateReceive(
        pseudoWalletAccount,
        stealthAccount.txHash,
        false, // Not using Ledger for stealth accounts
      );

      if (newHash) {
        console.log(`[Manager] ✅ Phase 1 Success: Stealth account ${stealthAccount.address} opened. Receive block hash: ${newHash}`);

        const receiveAmount = new BigNumber(stealthAccount.amountRaw);
        this.notifications.removeNotification('success-receive-nanonym');
        this.notifications.sendSuccess(`Successfully received ${this.noZerosPipe.transform(this.util.nano.rawToMnano(receiveAmount).toFixed(6)) } XNO to ${nanoNym.label}!`, { identifier: 'success-receive-nanonym' });

        // Update the stealth account's balance and the parent NanoNym's balance
        const accountInfo = await this.api.accountInfo(stealthAccount.address);
        const newBalance = new BigNumber(accountInfo.balance || 0);

        this.storage.updateStealthAccountBalance(
          nanoNym.index,
          stealthAccount.address,
          newBalance,
        );
        this.storage.updateNanoNym(nanoNym.index, {
          balance: nanoNym.balance.plus(newBalance),
          paymentCount: nanoNym.paymentCount + 1,
        });

        // Remove from pending if it was queued
        this.removePendingStealthBlock(stealthAccount.address);
      } else {
        console.warn(`[Manager] ⚠️ Phase 1 Failed: Could not open stealth account ${stealthAccount.address}. Will retry via Phase 2 (background retry).`);
        // Queue for retry
        this.addPendingStealthBlock(stealthAccount);
      }
    } catch (error) {
      console.warn(`[Manager] ⚠️ Phase 1 Failed: Error opening stealth account ${stealthAccount.address}:`, error.message);
      console.log(`[Manager] Queuing ${stealthAccount.address} for Phase 2 background retry (every 5 minutes).`);
      // Queue for retry
      this.addPendingStealthBlock(stealthAccount);
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
            `[Manager] ⚠️ Notification for unknown Nostr key: ${receiverPrivateHex.slice(0, 8)}...`,
          );
          return;
        }

        console.debug(
          `[Manager] Routing notification to NanoNym index: ${nanoNymIndex}`,
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

  /**
   * Add a stealth account to the pending list for later processing.
   */
  private addPendingStealthBlock(stealthAccount: StealthAccount): void {
    if (!this.pendingStealthBlocks.find(b => b.txHash === stealthAccount.txHash && b.address === stealthAccount.address)) {
      this.pendingStealthBlocks.push(stealthAccount);
    }
  }

  /**
   * Remove a stealth account from the pending list.
   */
  private removePendingStealthBlock(address: string): void {
    this.pendingStealthBlocks = this.pendingStealthBlocks.filter(b => b.address !== address);
  }

  /**
   * Process all queued pending stealth blocks when the wallet is unlocked.
   */
  private async processPendingStealthBlocks(): Promise<void> {
    if (this.wallet.wallet.locked) {
      console.debug('[Manager] Wallet is still locked, cannot process pending stealth blocks.');
      return;
    }
    if (this.pendingStealthBlocks.length === 0) {
      console.debug('[Manager] No pending stealth blocks to process.');
      return;
    }

    console.log(`[Manager] Processing ${this.pendingStealthBlocks.length} pending stealth blocks...`);
    // Create a copy of the array to avoid issues if blocks are added/removed during processing
    const blocksToProcess = [...this.pendingStealthBlocks];
    for (const stealthAccount of blocksToProcess) {
      const nanoNym = this.storage.getNanoNym(stealthAccount.parentNanoNymIndex);
      if (nanoNym) {
        await this.receiveStealthFunds(stealthAccount, nanoNym);
      } else {
        console.warn(`[Manager] NanoNym not found for pending stealth account ${stealthAccount.address}, removing from queue.`);
        this.removePendingStealthBlock(stealthAccount.address);
      }
    }
  }
}
