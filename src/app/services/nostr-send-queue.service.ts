import { Injectable } from "@angular/core";
import { BehaviorSubject, Observable, interval, Subscription } from "rxjs";
import { NanoNymNotification } from "./nostr-notification.service";

const STORAGE_KEY = "nostr_send_queue";
const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;
const PROCESS_INTERVAL_MS = 10000;

export interface QueuedNotification {
  id: string; // UUID
  notification: NanoNymNotification;
  senderNostrPrivateHex: string; // Hex-encoded for storage
  receiverNostrPublicHex: string;
  status: "pending" | "sending" | "partial" | "complete" | "failed";
  createdAt: number; // Unix timestamp
  attempts: number;
  maxRetries: number;
  relayResults: Record<string, "pending" | "ok" | "error">;
  lastAttemptAt?: number;
  nextRetryAt?: number;
}

export interface QueueStatus {
  pending: number;
  sending: number;
  partial: number;
  complete: number;
  failed: number;
  total: number;
}

@Injectable({
  providedIn: "root",
})
export class NostrSendQueueService {
  private queueSubject = new BehaviorSubject<QueuedNotification[]>([]);
  public queue$: Observable<QueuedNotification[]> =
    this.queueSubject.asObservable();

  private statusSubject = new BehaviorSubject<QueueStatus>(
    this.calculateStatus([]),
  );
  public status$: Observable<QueueStatus> = this.statusSubject.asObservable();

  private processingTimer: Subscription | null = null;
  private loaded = false;
  private loadPromise: Promise<void>;

  constructor() {
    this.loadPromise = this.loadFromStorage();
    this.startPeriodicProcessing();
  }

  /**
   * Wait for the queue to be loaded
   */
  public whenLoaded(): Promise<void> {
    return this.loadPromise;
  }

  /**
   * Add a notification to the queue
   */
  enqueue(
    notification: NanoNymNotification,
    senderNostrPrivateHex: string,
    receiverNostrPublicHex: string,
    relayUrls: string[],
  ): QueuedNotification {
    const now = Date.now();
    const item: QueuedNotification = {
      id: this.generateUUID(),
      notification,
      senderNostrPrivateHex,
      receiverNostrPublicHex,
      status: "pending",
      createdAt: now,
      attempts: 0,
      maxRetries: MAX_RETRIES,
      relayResults: relayUrls.reduce(
        (acc, url) => {
          acc[url] = "pending";
          return acc;
        },
        {} as Record<string, "pending" | "ok" | "error">,
      ),
    };

    const current = this.queueSubject.value;
    const updated = [...current, item];
    this.updateQueue(updated);

    console.log(
      `[NostrSendQueue] Enqueued notification ${item.id} to ${relayUrls.length} relays`,
    );

    return item;
  }

  async processQueue(): Promise<void> {
    const now = Date.now();
    const queue = this.queueSubject.value;

    const itemsToProcess = queue.filter((item) => {
      if (item.status === "complete" || item.status === "failed") {
        return false;
      }
      if (item.status === "sending") {
        return false;
      }
      if (item.nextRetryAt && item.nextRetryAt > now) {
        return false;
      }
      return true;
    });

    if (itemsToProcess.length === 0) {
      return;
    }

    console.log(
      `[NostrSendQueue] Processing ${itemsToProcess.length} items...`,
    );

    for (const item of itemsToProcess) {
      await this.processItem(item);
    }
  }

  retryFailed(): void {
    const queue = this.queueSubject.value;
    const updated = queue.map((item) => {
      if (item.status === "failed") {
        const resetRelayResults = Object.keys(item.relayResults).reduce(
          (acc, url) => {
            acc[url] = "pending";
            return acc;
          },
          {} as Record<string, "pending" | "ok" | "error">,
        );

        return {
          ...item,
          status: "pending" as const,
          attempts: 0,
          nextRetryAt: undefined,
          relayResults: resetRelayResults,
        };
      }
      return item;
    });

    this.updateQueue(updated);
    console.log(`[NostrSendQueue] Reset failed items for retry`);
  }

  getQueueStatus(): QueueStatus {
    return this.statusSubject.value;
  }

  getQueue(): QueuedNotification[] {
    return this.queueSubject.value;
  }

  getItem(id: string): QueuedNotification | undefined {
    return this.queueSubject.value.find((item) => item.id === id);
  }

  clearCompleted(): void {
    const queue = this.queueSubject.value;
    const updated = queue.filter((item) => item.status !== "complete");
    this.updateQueue(updated);
    console.log(`[NostrSendQueue] Cleared completed items`);
  }

  clearAll(): void {
    this.updateQueue([]);
    console.log(`[NostrSendQueue] Cleared all items`);
  }

  private async processItem(item: QueuedNotification): Promise<void> {
    this.updateItem(item.id, {
      status: "sending",
      lastAttemptAt: Date.now(),
      attempts: item.attempts + 1,
    });

    console.log(
      `[NostrSendQueue] Processing item ${item.id} (attempt ${item.attempts + 1}/${item.maxRetries})`,
    );

    const currentItem = this.getItem(item.id);
    if (currentItem) {
      const nextDelay = this.calculateBackoff(currentItem.attempts);
      this.updateItem(item.id, {
        status: "pending",
        nextRetryAt: Date.now() + nextDelay,
      });
    }
  }

  updateItem(id: string, updates: Partial<QueuedNotification>): void {
    const queue = this.queueSubject.value;
    const updated = queue.map((item) =>
      item.id === id ? { ...item, ...updates } : item,
    );
    this.updateQueue(updated);
  }

  updateRelayResult(
    id: string,
    relayUrl: string,
    result: "ok" | "error",
  ): void {
    const item = this.getItem(id);
    if (!item) return;

    const updatedResults = { ...item.relayResults, [relayUrl]: result };
    const values = Object.values(updatedResults);

    let newStatus: QueuedNotification["status"] = item.status;

    if (values.every((v) => v === "ok")) {
      newStatus = "complete";
    } else if (values.some((v) => v === "ok") && values.some((v) => v === "pending")) {
      newStatus = "partial";
    } else if (values.every((v) => v === "error")) {
      if (item.attempts >= item.maxRetries) {
        newStatus = "failed";
      } else {
        newStatus = "pending";
      }
    }

    this.updateItem(id, {
      relayResults: updatedResults,
      status: newStatus,
    });
  }

  private calculateBackoff(attempts: number): number {
    const delay = Math.min(
      BASE_DELAY_MS * Math.pow(2, attempts - 1),
      MAX_DELAY_MS,
    );
    return delay;
  }

  private updateQueue(queue: QueuedNotification[]): void {
    this.queueSubject.next(queue);
    this.statusSubject.next(this.calculateStatus(queue));
    this.saveToStorage(queue);
  }

  private calculateStatus(queue: QueuedNotification[]): QueueStatus {
    return {
      pending: queue.filter((i) => i.status === "pending").length,
      sending: queue.filter((i) => i.status === "sending").length,
      partial: queue.filter((i) => i.status === "partial").length,
      complete: queue.filter((i) => i.status === "complete").length,
      failed: queue.filter((i) => i.status === "failed").length,
      total: queue.length,
    };
  }

  private generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      },
    );
  }

  private startPeriodicProcessing(): void {
    this.loadPromise.then(() => {
      this.processingTimer = interval(PROCESS_INTERVAL_MS).subscribe(() => {
        this.processQueue();
      });
      this.processQueue();
    });
  }

  stopPeriodicProcessing(): void {
    if (this.processingTimer) {
      this.processingTimer.unsubscribe();
      this.processingTimer = null;
    }
  }

  private async loadFromStorage(): Promise<void> {
    if (this.loaded) {
      return;
    }
    return new Promise((resolve) => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
          console.log("[NostrSendQueue] No stored queue found in localStorage");
          this.queueSubject.next([]);
          this.statusSubject.next(this.calculateStatus([]));
          this.loaded = true;
          resolve();
          return;
        }

        const parsed: QueuedNotification[] = JSON.parse(stored);
        this.queueSubject.next(parsed);
        this.statusSubject.next(this.calculateStatus(parsed));
        console.log(
          `[NostrSendQueue] Loaded ${parsed.length} items from localStorage`,
        );
      } catch (error) {
        console.error("[NostrSendQueue] Failed to load from storage:", error);
        this.queueSubject.next([]);
        this.statusSubject.next(this.calculateStatus([]));
      }
      this.loaded = true;
      resolve();
    });
  }

  private saveToStorage(queue: QueuedNotification[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
      console.log(
        `[NostrSendQueue] Saved ${queue.length} items to localStorage`,
      );
    } catch (error) {
      console.error("[NostrSendQueue] Failed to save to storage:", error);
    }
  }
}
