import { TestBed, fakeAsync, tick } from "@angular/core/testing";
import {
  NostrSendQueueService,
  QueuedNotification,
} from "./nostr-send-queue.service";
import { NanoNymNotification } from "./nostr-notification.service";

describe("NostrSendQueueService", () => {
  let service: NostrSendQueueService;

  const mockNotification: NanoNymNotification = {
    version: 1,
    protocol: "nnym",
    R: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
    tx_hash:
      "ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234",
    amount: "1.5",
    amount_raw: "1500000000000000000000000000000",
  };

  const mockRelays = [
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.primal.net",
  ];

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [NostrSendQueueService],
    });
    service = TestBed.inject(NostrSendQueueService);
    service.stopPeriodicProcessing();
    service.clearAll();
  });

  afterEach(() => {
    service.stopPeriodicProcessing();
    localStorage.clear();
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  describe("enqueue()", () => {
    it("should add notification to queue with pending status", () => {
      const item = service.enqueue(
        mockNotification,
        "senderPrivateHex123",
        "receiverPublicHex456",
        mockRelays,
      );

      expect(item.id).toBeTruthy();
      expect(item.status).toBe("pending");
      expect(item.notification).toEqual(mockNotification);
      expect(item.senderNostrPrivateHex).toBe("senderPrivateHex123");
      expect(item.receiverNostrPublicHex).toBe("receiverPublicHex456");
      expect(item.attempts).toBe(0);
      expect(item.maxRetries).toBe(10);
      expect(Object.keys(item.relayResults).length).toBe(3);
      expect(item.relayResults["wss://relay.damus.io"]).toBe("pending");
    });

    it("should generate unique UUIDs for each item", () => {
      const item1 = service.enqueue(
        mockNotification,
        "sender1",
        "receiver1",
        mockRelays,
      );
      const item2 = service.enqueue(
        mockNotification,
        "sender2",
        "receiver2",
        mockRelays,
      );

      expect(item1.id).not.toBe(item2.id);
    });

    it("should persist to localStorage", () => {
      service.enqueue(
        mockNotification,
        "senderPrivateHex123",
        "receiverPublicHex456",
        mockRelays,
      );

      const stored = localStorage.getItem("nostr_send_queue");
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed.length).toBe(1);
      expect(parsed[0].notification).toEqual(mockNotification);
    });

    it("should update queue status observable", () => {
      let status = service.getQueueStatus();
      expect(status.total).toBe(0);

      service.enqueue(
        mockNotification,
        "senderPrivateHex123",
        "receiverPublicHex456",
        mockRelays,
      );

      status = service.getQueueStatus();
      expect(status.pending).toBe(1);
      expect(status.total).toBe(1);
    });
  });

  describe("getQueueStatus()", () => {
    it("should return correct counts for each status", () => {
      service.enqueue(mockNotification, "s1", "r1", mockRelays);
      service.enqueue(mockNotification, "s2", "r2", mockRelays);

      const item3 = service.enqueue(mockNotification, "s3", "r3", mockRelays);
      service.updateItem(item3.id, { status: "complete" });

      const item4 = service.enqueue(mockNotification, "s4", "r4", mockRelays);
      service.updateItem(item4.id, { status: "failed" });

      const status = service.getQueueStatus();
      expect(status.pending).toBe(2);
      expect(status.complete).toBe(1);
      expect(status.failed).toBe(1);
      expect(status.total).toBe(4);
    });
  });

  describe("getQueue()", () => {
    it("should return all queued items", () => {
      service.enqueue(mockNotification, "s1", "r1", mockRelays);
      service.enqueue(mockNotification, "s2", "r2", mockRelays);

      const queue = service.getQueue();
      expect(queue.length).toBe(2);
    });
  });

  describe("getItem()", () => {
    it("should return item by ID", () => {
      const item = service.enqueue(
        mockNotification,
        "sender",
        "receiver",
        mockRelays,
      );
      const retrieved = service.getItem(item.id);
      expect(retrieved).toEqual(item);
    });

    it("should return undefined for non-existent ID", () => {
      const retrieved = service.getItem("non-existent-id");
      expect(retrieved).toBeUndefined();
    });
  });

  describe("updateItem()", () => {
    it("should update item properties", () => {
      const item = service.enqueue(
        mockNotification,
        "sender",
        "receiver",
        mockRelays,
      );
      service.updateItem(item.id, { status: "sending", attempts: 1 });

      const updated = service.getItem(item.id);
      expect(updated?.status).toBe("sending");
      expect(updated?.attempts).toBe(1);
    });
  });

  describe("updateRelayResult()", () => {
    it("should mark item complete when all relays succeed", () => {
      const item = service.enqueue(
        mockNotification,
        "sender",
        "receiver",
        mockRelays,
      );

      service.updateRelayResult(item.id, "wss://relay.damus.io", "ok");
      service.updateRelayResult(item.id, "wss://nos.lol", "ok");
      service.updateRelayResult(item.id, "wss://relay.primal.net", "ok");

      const updated = service.getItem(item.id);
      expect(updated?.status).toBe("complete");
    });

    it("should mark item partial when some relays succeed", () => {
      const item = service.enqueue(
        mockNotification,
        "sender",
        "receiver",
        mockRelays,
      );

      service.updateRelayResult(item.id, "wss://relay.damus.io", "ok");

      const updated = service.getItem(item.id);
      expect(updated?.status).toBe("partial");
    });

    it("should mark item failed when all relays fail and max retries reached", () => {
      const item = service.enqueue(
        mockNotification,
        "sender",
        "receiver",
        mockRelays,
      );
      service.updateItem(item.id, { attempts: 10 });

      service.updateRelayResult(item.id, "wss://relay.damus.io", "error");
      service.updateRelayResult(item.id, "wss://nos.lol", "error");
      service.updateRelayResult(item.id, "wss://relay.primal.net", "error");

      const updated = service.getItem(item.id);
      expect(updated?.status).toBe("failed");
    });

    it("should keep item pending when all relays fail but retries remain", () => {
      const item = service.enqueue(
        mockNotification,
        "sender",
        "receiver",
        mockRelays,
      );
      service.updateItem(item.id, { attempts: 3 });

      service.updateRelayResult(item.id, "wss://relay.damus.io", "error");
      service.updateRelayResult(item.id, "wss://nos.lol", "error");
      service.updateRelayResult(item.id, "wss://relay.primal.net", "error");

      const updated = service.getItem(item.id);
      expect(updated?.status).toBe("pending");
    });
  });

  describe("retryFailed()", () => {
    it("should reset failed items to pending with 0 attempts", () => {
      const item = service.enqueue(
        mockNotification,
        "sender",
        "receiver",
        mockRelays,
      );
      service.updateItem(item.id, { status: "failed", attempts: 10 });

      service.retryFailed();

      const updated = service.getItem(item.id);
      expect(updated?.status).toBe("pending");
      expect(updated?.attempts).toBe(0);
      expect(updated?.relayResults["wss://relay.damus.io"]).toBe("pending");
    });

    it("should not affect non-failed items", () => {
      const pending = service.enqueue(
        mockNotification,
        "s1",
        "r1",
        mockRelays,
      );
      const complete = service.enqueue(
        mockNotification,
        "s2",
        "r2",
        mockRelays,
      );
      service.updateItem(complete.id, { status: "complete" });

      service.retryFailed();

      expect(service.getItem(pending.id)?.status).toBe("pending");
      expect(service.getItem(complete.id)?.status).toBe("complete");
    });
  });

  describe("clearCompleted()", () => {
    it("should remove only completed items", () => {
      const pending = service.enqueue(
        mockNotification,
        "s1",
        "r1",
        mockRelays,
      );
      const complete = service.enqueue(
        mockNotification,
        "s2",
        "r2",
        mockRelays,
      );
      service.updateItem(complete.id, { status: "complete" });

      service.clearCompleted();

      expect(service.getItem(pending.id)).toBeTruthy();
      expect(service.getItem(complete.id)).toBeUndefined();
      expect(service.getQueueStatus().total).toBe(1);
    });
  });

  describe("clearAll()", () => {
    it("should remove all items", () => {
      service.enqueue(mockNotification, "s1", "r1", mockRelays);
      service.enqueue(mockNotification, "s2", "r2", mockRelays);

      service.clearAll();

      expect(service.getQueue().length).toBe(0);
      expect(service.getQueueStatus().total).toBe(0);
    });
  });

  describe("processQueue()", () => {
    it("should not process completed items", async () => {
      const item = service.enqueue(
        mockNotification,
        "sender",
        "receiver",
        mockRelays,
      );
      service.updateItem(item.id, { status: "complete" });

      await service.processQueue();

      const updated = service.getItem(item.id);
      expect(updated?.status).toBe("complete");
      expect(updated?.attempts).toBe(0);
    });

    it("should not process failed items", async () => {
      const item = service.enqueue(
        mockNotification,
        "sender",
        "receiver",
        mockRelays,
      );
      service.updateItem(item.id, { status: "failed" });

      await service.processQueue();

      const updated = service.getItem(item.id);
      expect(updated?.status).toBe("failed");
    });

    it("should not process items before nextRetryAt", async () => {
      const item = service.enqueue(
        mockNotification,
        "sender",
        "receiver",
        mockRelays,
      );
      service.updateItem(item.id, {
        nextRetryAt: Date.now() + 60000,
      });

      await service.processQueue();

      const updated = service.getItem(item.id);
      expect(updated?.attempts).toBe(0);
    });

    it("should process pending items ready for retry", async () => {
      const item = service.enqueue(
        mockNotification,
        "sender",
        "receiver",
        mockRelays,
      );

      await service.processQueue();

      const updated = service.getItem(item.id);
      expect(updated?.attempts).toBeGreaterThan(0);
      expect(updated?.lastAttemptAt).toBeTruthy();
    });
  });

  describe("localStorage persistence", () => {
    it("should load queue from localStorage on init", async () => {
      const storedItem: QueuedNotification = {
        id: "test-id",
        notification: mockNotification,
        senderNostrPrivateHex: "sender",
        receiverNostrPublicHex: "receiver",
        status: "complete",
        createdAt: Date.now(),
        attempts: 3,
        maxRetries: 10,
        relayResults: {
          "wss://relay.damus.io": "ok",
          "wss://nos.lol": "ok",
        },
      };

      localStorage.setItem("nostr_send_queue", JSON.stringify([storedItem]));

      const newService = new NostrSendQueueService();
      newService.stopPeriodicProcessing();
      await newService.whenLoaded();

      const queue = newService.getQueue();
      expect(queue.length).toBe(1);
      expect(queue[0].id).toBe("test-id");
      expect(queue[0].attempts).toBe(3);
      expect(queue[0].status).toBe("complete");
    });
  });

  describe("exponential backoff", () => {
    it("should calculate increasing delays with max cap", async () => {
      const item = service.enqueue(
        mockNotification,
        "sender",
        "receiver",
        mockRelays,
      );

      const delays: number[] = [];
      for (let i = 0; i < 7; i++) {
        await service.processQueue();
        const updated = service.getItem(item.id);
        if (updated?.nextRetryAt && updated?.lastAttemptAt) {
          delays.push(updated.nextRetryAt - updated.lastAttemptAt);
        }
        service.updateItem(item.id, { nextRetryAt: 0 });
      }

      expect(delays[0]).toBeCloseTo(1000, -2);
      expect(delays[1]).toBeCloseTo(2000, -2);
      expect(delays[2]).toBeCloseTo(4000, -2);
      expect(delays[3]).toBeCloseTo(8000, -2);
      expect(delays[4]).toBeCloseTo(16000, -2);
      expect(delays[5]).toBe(30000);
      expect(delays[6]).toBe(30000);
    });
  });

  describe("observable streams", () => {
    it("should emit queue updates", (done) => {
      const emissions: QueuedNotification[][] = [];

      service.queue$.subscribe((queue) => {
        emissions.push([...queue]);
        if (emissions.length === 2) {
          expect(emissions[0].length).toBe(0);
          expect(emissions[1].length).toBe(1);
          done();
        }
      });

      service.enqueue(mockNotification, "sender", "receiver", mockRelays);
    });

    it("should emit status updates", (done) => {
      let emissionCount = 0;

      service.status$.subscribe((status) => {
        emissionCount++;
        if (emissionCount === 2) {
          expect(status.pending).toBe(1);
          expect(status.total).toBe(1);
          done();
        }
      });

      service.enqueue(mockNotification, "sender", "receiver", mockRelays);
    });
  });

  describe("Integration: Failure and Retry Flow", () => {
    it("should persist queue to localStorage and survive service restart", async () => {
      // Enqueue item in first service instance
      const item = service.enqueue(
        mockNotification,
        "senderPrivateHex123",
        "receiverPublicHex456",
        mockRelays,
      );

      // Verify it's in localStorage
      const storedBefore = localStorage.getItem("nostr_send_queue");
      expect(storedBefore).toBeTruthy();
      const parsedBefore = JSON.parse(storedBefore!);
      expect(parsedBefore.length).toBe(1);
      expect(parsedBefore[0].id).toBe(item.id);

      // Create new service instance (simulates restart)
      service.stopPeriodicProcessing();
      const newService = new NostrSendQueueService();
      newService.stopPeriodicProcessing();
      await newService.whenLoaded();

      // Verify queue was restored
      const restoredQueue = newService.getQueue();
      expect(restoredQueue.length).toBe(1);
      expect(restoredQueue[0].id).toBe(item.id);
      expect(restoredQueue[0].notification).toEqual(mockNotification);
      expect(restoredQueue[0].status).toBe("pending");
    });

    it("should track retry attempts with exponential backoff through multiple failures", fakeAsync(() => {
      const item = service.enqueue(
        mockNotification,
        "sender",
        "receiver",
        mockRelays,
      );

      // First attempt
      service.processQueue();
      tick(0);

      let updated = service.getItem(item.id);
      expect(updated?.attempts).toBe(1);
      expect(updated?.lastAttemptAt).toBeTruthy();
      expect(updated?.nextRetryAt).toBeTruthy();

      // Simulate all relays failing
      mockRelays.forEach((relay) => {
        service.updateRelayResult(item.id, relay, "error");
      });

      updated = service.getItem(item.id);
      expect(updated?.status).toBe("pending"); // Still pending, has retries left

      // Clear nextRetryAt to allow immediate retry
      service.updateItem(item.id, { nextRetryAt: 0 });

      // Second attempt
      service.processQueue();
      tick(0);

      updated = service.getItem(item.id);
      expect(updated?.attempts).toBe(2);

      // Continue failing relays
      mockRelays.forEach((relay) => {
        service.updateRelayResult(item.id, relay, "error");
      });

      // Status should still be pending (only 2 attempts, max is 10)
      updated = service.getItem(item.id);
      expect(updated?.status).toBe("pending");
    }));

    it("should mark item as failed after exhausting all retries", fakeAsync(() => {
      const item = service.enqueue(
        mockNotification,
        "sender",
        "receiver",
        mockRelays,
      );

      // Simulate reaching max retries
      service.updateItem(item.id, { attempts: 10 });

      // Mark all relays as error
      mockRelays.forEach((relay) => {
        service.updateRelayResult(item.id, relay, "error");
      });

      const updated = service.getItem(item.id);
      expect(updated?.status).toBe("failed");
    }));

    it("should mark item as complete when all relays succeed after initial failures", fakeAsync(() => {
      const item = service.enqueue(
        mockNotification,
        "sender",
        "receiver",
        mockRelays,
      );

      // First attempt: some relays fail
      service.updateRelayResult(item.id, mockRelays[0], "ok");
      service.updateRelayResult(item.id, mockRelays[1], "error");

      let updated = service.getItem(item.id);
      expect(updated?.status).toBe("partial");

      // Reset for retry - remaining relays succeed
      service.updateRelayResult(item.id, mockRelays[1], "ok");
      service.updateRelayResult(item.id, mockRelays[2], "ok");

      updated = service.getItem(item.id);
      expect(updated?.status).toBe("complete");
    }));

    it("should allow retryFailed to reset failed items for reprocessing", fakeAsync(() => {
      const item = service.enqueue(
        mockNotification,
        "sender",
        "receiver",
        mockRelays,
      );

      // Exhaust retries and mark as failed
      service.updateItem(item.id, { attempts: 10 });
      mockRelays.forEach((relay) => {
        service.updateRelayResult(item.id, relay, "error");
      });

      let updated = service.getItem(item.id);
      expect(updated?.status).toBe("failed");

      // User triggers retry
      service.retryFailed();

      updated = service.getItem(item.id);
      expect(updated?.status).toBe("pending");
      expect(updated?.attempts).toBe(0);
      expect(updated?.relayResults[mockRelays[0]]).toBe("pending");
      expect(updated?.relayResults[mockRelays[1]]).toBe("pending");
      expect(updated?.relayResults[mockRelays[2]]).toBe("pending");

      // Now it can be processed again
      service.processQueue();
      tick(0);

      updated = service.getItem(item.id);
      expect(updated?.attempts).toBe(1);
    }));
  });
});
