import { Injectable } from "@angular/core";
import { BehaviorSubject, Observable } from "rxjs";
import BigNumber from "bignumber.js";
import {
  NanoNym,
  StealthAccount,
  StoredNanoNym,
  StoredStealthAccount,
} from "../types/nanonym.types";

const STORAGE_KEY = "nanonyms-v1";

@Injectable({
  providedIn: "root",
})
export class NanoNymStorageService {
  private nanonymsSubject = new BehaviorSubject<NanoNym[]>([]);
  public nanonyms$: Observable<NanoNym[]> = this.nanonymsSubject.asObservable();
  private loaded = false;
  private loadPromise: Promise<void>;

  constructor() {
    this.loadPromise = this.loadFromStorage();
  }

  /**
   * Wait for the storage to be loaded
   */
  public whenLoaded(): Promise<void> {
    return this.loadPromise;
  }

  /**
   * Get all NanoNyms
   */
  getAllNanoNyms(): NanoNym[] {
    return this.nanonymsSubject.value;
  }

  /**
   * Get NanoNym by index
   */
  getNanoNym(index: number): NanoNym | null {
    return this.nanonymsSubject.value.find((nn) => nn.index === index) || null;
  }

  /**
   * Get active (monitoring) NanoNyms
   */
  getActiveNanoNyms(): NanoNym[] {
    return this.nanonymsSubject.value.filter((nn) => nn.status === "active");
  }

  /**
   * Add a new NanoNym
   */
  addNanoNym(nanoNym: NanoNym): void {
    const current = this.nanonymsSubject.value;
    const updated = [...current, nanoNym];
    this.nanonymsSubject.next(updated);
    this.saveToStorage(updated);
  }

  /**
   * Update an existing NanoNym
   */
  updateNanoNym(index: number, updates: Partial<NanoNym>): void {
    const current = this.nanonymsSubject.value;
    const updated = current.map((nn) =>
      nn.index === index ? { ...nn, ...updates } : nn,
    );
    this.nanonymsSubject.next(updated);
    this.saveToStorage(updated);
  }

  /**
   * Delete a NanoNym
   */
  deleteNanoNym(index: number): void {
    const current = this.nanonymsSubject.value;
    const updated = current.filter((nn) => nn.index !== index);
    this.nanonymsSubject.next(updated);
    this.saveToStorage(updated);
  }

  /**
   * Add a stealth account to a NanoNym
   */
  addStealthAccount(
    nanoNymIndex: number,
    stealthAccount: StealthAccount,
  ): void {
    const nanoNym = this.getNanoNym(nanoNymIndex);
    if (!nanoNym) {
      console.error(`NanoNym with index ${nanoNymIndex} not found`);
      return;
    }

    // Add to stealth accounts array
    const updatedStealthAccounts = [...nanoNym.stealthAccounts, stealthAccount];

    // Update payment count and balance
    const balance = this.calculateAggregatedBalance(updatedStealthAccounts);
    const paymentCount = updatedStealthAccounts.length;

    this.updateNanoNym(nanoNymIndex, {
      stealthAccounts: updatedStealthAccounts,
      balance,
      paymentCount,
    });
  }

  /**
   * Update stealth account balance
   */
  updateStealthAccountBalance(
    nanoNymIndex: number,
    stealthAddress: string,
    balance: BigNumber,
  ): void {
    const nanoNym = this.getNanoNym(nanoNymIndex);
    if (!nanoNym) return;

    const updatedStealthAccounts = nanoNym.stealthAccounts.map((sa) =>
      sa.address === stealthAddress ? { ...sa, balance } : sa,
    );

    const aggregatedBalance = this.calculateAggregatedBalance(
      updatedStealthAccounts,
    );

    this.updateNanoNym(nanoNymIndex, {
      stealthAccounts: updatedStealthAccounts,
      balance: aggregatedBalance,
    });
  }

  /**
   * Calculate total balance across all stealth accounts
   * Uses amountRaw (payment amount) instead of balance (on-chain balance)
   * since stealth addresses are typically unopened until spent
   */
  private calculateAggregatedBalance(
    stealthAccounts: StealthAccount[],
  ): BigNumber {
    return stealthAccounts.reduce(
      (sum, sa) => sum.plus(sa.amountRaw || sa.balance || 0),
      new BigNumber(0),
    );
  }

  /**
   * Get next available NanoNym index
   */
  getNextIndex(): number {
    const current = this.nanonymsSubject.value;
    if (current.length === 0) return 0;
    const maxIndex = Math.max(...current.map((nn) => nn.index));
    return maxIndex + 1;
  }

  /**
   * Clear all NanoNyms (for wallet reset)
   */
  clearAll(): void {
    this.nanonymsSubject.next([]);
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Load NanoNyms from localStorage
   */
  private async loadFromStorage(): Promise<void> {
    if (this.loaded) {
      return;
    }
    return new Promise((resolve) => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
          console.log(
            "[NanoNymStorage] No stored NanoNyms found in localStorage",
          );
          this.nanonymsSubject.next([]); // Ensure it's empty
          this.loaded = true;
          resolve();
          return;
        }
  
        const parsed: StoredNanoNym[] = JSON.parse(stored);
        const nanonyms = parsed.map((stored) => this.deserializeNanoNym(stored));
        // Recalculate aggregated balances from stealth accounts
        nanonyms.forEach(nn => {
          nn.balance = this.calculateAggregatedBalance(nn.stealthAccounts);
        });
        this.nanonymsSubject.next(nanonyms);
        console.log(
          `[NanoNymStorage] Loaded ${nanonyms.length} NanoNyms from localStorage`,
        );
      } catch (error) {
        console.error("Failed to load NanoNyms from storage:", error);
        this.nanonymsSubject.next([]); // Reset on error
      }
      this.loaded = true;
      resolve();
    });
  }

  /**
   * Save NanoNyms to localStorage
   */
  private saveToStorage(nanonyms: NanoNym[]): void {
    try {
      const serialized = nanonyms.map((nn) => this.serializeNanoNym(nn));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
      console.log(
        `[NanoNymStorage] Saved ${nanonyms.length} NanoNyms to localStorage`,
      );
    } catch (error) {
      console.error("Failed to save NanoNyms to storage:", error);
    }
  }

  /**
   * Convert NanoNym to storable format (Uint8Array -> base64)
   */
  private serializeNanoNym(nn: NanoNym): StoredNanoNym {
    return {
      index: nn.index,
      label: nn.label,
      nnymAddress: nn.nnymAddress,
      fallbackAddress: nn.fallbackAddress,
      status: nn.status,
      createdAt: nn.createdAt,
      keys: {
        spendPublic: this.uint8ToBase64(nn.keys.spendPublic),
        spendPrivate: this.uint8ToBase64(nn.keys.spendPrivate),
        viewPublic: this.uint8ToBase64(nn.keys.viewPublic),
        viewPrivate: this.uint8ToBase64(nn.keys.viewPrivate),
        nostrPublic: this.uint8ToBase64(nn.keys.nostrPublic),
        nostrPrivate: this.uint8ToBase64(nn.keys.nostrPrivate),
      },
      stealthAccounts: nn.stealthAccounts.map((sa) =>
        this.serializeStealthAccount(sa),
      ),
    };
  }

  /**
   * Convert StoredNanoNym back to NanoNym (base64 -> Uint8Array)
   */
  private deserializeNanoNym(stored: StoredNanoNym): NanoNym {
    return {
      index: stored.index,
      label: stored.label,
      nnymAddress: stored.nnymAddress,
      fallbackAddress: stored.fallbackAddress,
      status: stored.status,
      createdAt: stored.createdAt,
      keys: {
        spendPublic: this.base64ToUint8(stored.keys.spendPublic),
        spendPrivate: this.base64ToUint8(stored.keys.spendPrivate),
        viewPublic: this.base64ToUint8(stored.keys.viewPublic),
        viewPrivate: this.base64ToUint8(stored.keys.viewPrivate),
        nostrPublic: this.base64ToUint8(stored.keys.nostrPublic),
        nostrPrivate: this.base64ToUint8(stored.keys.nostrPrivate),
      },
      balance: new BigNumber(0), // Will be calculated
      paymentCount: stored.stealthAccounts.length,
      stealthAccounts: stored.stealthAccounts.map((sa) =>
        this.deserializeStealthAccount(sa),
      ),
    };
  }

  /**
   * Convert StealthAccount to storable format
   */
  private serializeStealthAccount(sa: StealthAccount): StoredStealthAccount {
    return {
      address: sa.address,
      publicKey: this.uint8ToBase64(sa.publicKey),
      privateKey: this.uint8ToBase64(sa.privateKey),
      ephemeralPublicKey: this.uint8ToBase64(sa.ephemeralPublicKey),
      txHash: sa.txHash,
      amountRaw: sa.amountRaw,
      memo: sa.memo,
      receivedAt: sa.receivedAt,
      parentNanoNymIndex: sa.parentNanoNymIndex,
    };
  }

  /**
   * Convert StoredStealthAccount back to StealthAccount
   */
  private deserializeStealthAccount(
    stored: StoredStealthAccount,
  ): StealthAccount {
    return {
      address: stored.address,
      publicKey: this.base64ToUint8(stored.publicKey),
      privateKey: this.base64ToUint8(stored.privateKey),
      ephemeralPublicKey: this.base64ToUint8(stored.ephemeralPublicKey),
      txHash: stored.txHash,
      amountRaw: stored.amountRaw,
      memo: stored.memo,
      receivedAt: stored.receivedAt,
      parentNanoNymIndex: stored.parentNanoNymIndex,
      balance: new BigNumber(0), // Will be queried from node
    };
  }

  /**
   * Convert Uint8Array to base64 string
   */
  private uint8ToBase64(arr: Uint8Array): string {
    return btoa(String.fromCharCode.apply(null, Array.from(arr)));
  }

  /**
   * Convert base64 string to Uint8Array
   */
  private base64ToUint8(base64: string): Uint8Array {
    const binary = atob(base64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      arr[i] = binary.charCodeAt(i);
    }
    return arr;
  }
}
