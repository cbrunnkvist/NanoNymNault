import { Injectable } from "@angular/core";
import { Subject } from "rxjs";
import { debounceTime } from "rxjs/operators";

/**
 * Persistent sync state for receiver tracking
 * Stores last-seen timestamp and processed event IDs per NanoNym
 */
export interface NostrSyncState {
  lastSeenTimestamp: number;      // Unix timestamp of newest processed event
  lastSeenEventId: string;        // For debugging/logging
  processedEventIds: string[];    // Rolling window of last 1000 event IDs
  updatedAt: number;              // When state was last persisted
}

const STORAGE_KEY_PREFIX = "nostr_sync_";
const MAX_PROCESSED_EVENT_IDS = 1000;
const DEBOUNCE_MS = 1000;

@Injectable({
  providedIn: "root",
})
export class NostrSyncStateService {
  private stateCache = new Map<number, NostrSyncState>();
  private persistSubject = new Subject<number>();

  constructor() {
    this.persistSubject
      .pipe(debounceTime(DEBOUNCE_MS))
      .subscribe({
        next: (nanoNymIndex) => this.persistState(nanoNymIndex),
        error: (err) => console.error('[NostrSyncState] debounce persist error', err),
        complete: () => {
          // no-op
        },
      });
  }

  /**
   * Get sync state for a NanoNym
   * Returns null if no state exists (fresh/restored wallet)
   */
  getState(nanoNymIndex: number): NostrSyncState | null {
    if (this.stateCache.has(nanoNymIndex)) {
      return this.stateCache.get(nanoNymIndex)!;
    }

    const key = this.getStorageKey(nanoNymIndex);
    try {
      const stored = localStorage.getItem(key);
      if (!stored) {
        console.log(`[NostrSyncState] No stored state found for NanoNym ${nanoNymIndex}`);
        return null;
      }

      const state: NostrSyncState = JSON.parse(stored);
      this.stateCache.set(nanoNymIndex, state);
      console.log(`[NostrSyncState] Loaded state for NanoNym ${nanoNymIndex}: lastSeen=${state.lastSeenTimestamp}, eventIds=${state.processedEventIds.length}`);
      return state;
    } catch (error) {
      console.error(`[NostrSyncState] Failed to load state for NanoNym ${nanoNymIndex}:`, error);
      return null;
    }
  }

  /**
   * Update sync state after processing an event
   * Automatically handles rolling window and debounced persistence
   */
  updateState(nanoNymIndex: number, eventId: string, timestamp: number): void {
    let state = this.stateCache.get(nanoNymIndex);

    if (!state) {
      state = {
        lastSeenTimestamp: timestamp,
        lastSeenEventId: eventId,
        processedEventIds: [eventId],
        updatedAt: Date.now(),
      };
    } else {
      if (timestamp > state.lastSeenTimestamp) {
        state.lastSeenTimestamp = timestamp;
        state.lastSeenEventId = eventId;
      }

      if (!state.processedEventIds.includes(eventId)) {
        state.processedEventIds.push(eventId);

        while (state.processedEventIds.length > MAX_PROCESSED_EVENT_IDS) {
          state.processedEventIds.shift();
        }
      }

      state.updatedAt = Date.now();
    }

    this.stateCache.set(nanoNymIndex, state);
    this.persistSubject.next(nanoNymIndex);

    console.log(`[NostrSyncState] Updated state for NanoNym ${nanoNymIndex}: eventId=${eventId.substring(0, 8)}..., timestamp=${timestamp}`);
  }

  /**
   * Check if an event has already been processed
   */
  isEventProcessed(nanoNymIndex: number, eventId: string): boolean {
    const state = this.getState(nanoNymIndex);
    if (!state) {
      return false;
    }
    return state.processedEventIds.includes(eventId);
  }

  /**
   * Get the last seen timestamp for a NanoNym
   * Returns null if no state exists
   */
  getLastSeenTimestamp(nanoNymIndex: number): number | null {
    const state = this.getState(nanoNymIndex);
    return state?.lastSeenTimestamp ?? null;
  }

  /**
   * Clear state for a NanoNym (e.g., on delete)
   */
  clearState(nanoNymIndex: number): void {
    this.stateCache.delete(nanoNymIndex);
    const key = this.getStorageKey(nanoNymIndex);
    try {
      localStorage.removeItem(key);
      console.log(`[NostrSyncState] Cleared state for NanoNym ${nanoNymIndex}`);
    } catch (error) {
      console.error(`[NostrSyncState] Failed to clear state for NanoNym ${nanoNymIndex}:`, error);
    }
  }

  /**
   * Clear all sync states (e.g., on wallet reset)
   */
  clearAll(): void {
    const indices = Array.from(this.stateCache.keys());
    this.stateCache.clear();

    for (const index of indices) {
      const key = this.getStorageKey(index);
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error(`[NostrSyncState] Failed to clear state for NanoNym ${index}:`, error);
      }
    }

    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
      console.log(`[NostrSyncState] Cleared all sync states (${keysToRemove.length} keys)`);
    } catch (error) {
      console.error("[NostrSyncState] Failed to clear all states:", error);
    }
  }

  /**
   * Force immediate persistence (e.g., on EOSE)
   */
  persistNow(nanoNymIndex: number): void {
    this.persistState(nanoNymIndex);
  }

  /**
   * Persist state to localStorage
   */
  private persistState(nanoNymIndex: number): void {
    const state = this.stateCache.get(nanoNymIndex);
    if (!state) {
      return;
    }

    const key = this.getStorageKey(nanoNymIndex);
    try {
      localStorage.setItem(key, JSON.stringify(state));
      console.log(`[NostrSyncState] Persisted state for NanoNym ${nanoNymIndex}: ${state.processedEventIds.length} event IDs`);
    } catch (error) {
      console.error(`[NostrSyncState] Failed to persist state for NanoNym ${nanoNymIndex}:`, error);
    }
  }

  /**
   * Get localStorage key for a NanoNym
   */
  private getStorageKey(nanoNymIndex: number): string {
    return `${STORAGE_KEY_PREFIX}${nanoNymIndex}`;
  }
}
