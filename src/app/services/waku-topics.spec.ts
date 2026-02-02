import { deriveBucket, deriveContentTopic } from "./waku-topics";

describe("Waku Content Topics", () => {
  describe("deriveBucket", () => {
    it("should return a number between 0 and 255", () => {
      const pubkey = new Uint8Array(32).fill(0xab);
      const bucket = deriveBucket(pubkey);

      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThanOrEqual(255);
      expect(Number.isInteger(bucket)).toBe(true);
    });

    it("should be deterministic for the same pubkey", () => {
      const pubkey = new Uint8Array(32).fill(0xcd);
      const bucket1 = deriveBucket(pubkey);
      const bucket2 = deriveBucket(pubkey);

      expect(bucket1).toBe(bucket2);
    });

    it("should produce different buckets for different pubkeys", () => {
      const pubkey1 = new Uint8Array(32).fill(0x11);
      const pubkey2 = new Uint8Array(32).fill(0x22);

      const bucket1 = deriveBucket(pubkey1);
      const bucket2 = deriveBucket(pubkey2);

      // While theoretically possible to collide, extremely unlikely with different inputs
      expect(bucket1).not.toBe(bucket2);
    });

    it("should handle all-zero pubkey", () => {
      const pubkey = new Uint8Array(32).fill(0x00);
      const bucket = deriveBucket(pubkey);

      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThanOrEqual(255);
    });

    it("should handle all-ones pubkey", () => {
      const pubkey = new Uint8Array(32).fill(0xff);
      const bucket = deriveBucket(pubkey);

      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThanOrEqual(255);
    });

    it("should produce consistent bucket for real-world pubkey", () => {
      // Example: a real 32-byte public key
      const pubkey = new Uint8Array([
        0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
        0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0x01, 0x23, 0x45,
        0x67, 0x89, 0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89,
      ]);
      const bucket = deriveBucket(pubkey);

      // Should be consistent
      expect(deriveBucket(pubkey)).toBe(bucket);
    });
  });

  describe("deriveContentTopic", () => {
    it("should return a string in the correct format", () => {
      const pubkey = new Uint8Array(32).fill(0xab);
      const date = new Date("2025-02-01");
      const topic = deriveContentTopic(pubkey, date);

      expect(typeof topic).toBe("string");
      expect(topic).toMatch(/^\/nanoNym\/1\/\d+\/\d{4}-\d{2}-\d{2}\/proto$/);
    });

    it("should include bucket in the topic", () => {
      const pubkey = new Uint8Array(32).fill(0xab);
      const date = new Date("2025-02-01");
      const topic = deriveContentTopic(pubkey, date);
      const bucket = deriveBucket(pubkey);

      expect(topic).toContain(`/${bucket}/`);
    });

    it("should format date as YYYY-MM-DD", () => {
      const pubkey = new Uint8Array(32).fill(0xab);
      const date = new Date("2025-02-01");
      const topic = deriveContentTopic(pubkey, date);

      expect(topic).toContain("/2025-02-01/");
    });

    it("should pad month and day with zeros", () => {
      const pubkey = new Uint8Array(32).fill(0xab);
      const date = new Date("2025-01-05");
      const topic = deriveContentTopic(pubkey, date);

      expect(topic).toContain("/2025-01-05/");
    });

    it("should use UTC date, not local date", () => {
      const pubkey = new Uint8Array(32).fill(0xab);
      const date = new Date("2025-02-01T00:00:00Z");
      const topic = deriveContentTopic(pubkey, date);

      expect(topic).toContain("/2025-02-01/");
    });

    it("should be deterministic for the same inputs", () => {
      const pubkey = new Uint8Array(32).fill(0xcd);
      const date = new Date("2025-02-01");

      const topic1 = deriveContentTopic(pubkey, date);
      const topic2 = deriveContentTopic(pubkey, date);

      expect(topic1).toBe(topic2);
    });

    it("should produce different topics for different dates", () => {
      const pubkey = new Uint8Array(32).fill(0xab);
      const date1 = new Date("2025-02-01");
      const date2 = new Date("2025-02-02");

      const topic1 = deriveContentTopic(pubkey, date1);
      const topic2 = deriveContentTopic(pubkey, date2);

      expect(topic1).not.toBe(topic2);
    });

    it("should produce different topics for different pubkeys", () => {
      const pubkey1 = new Uint8Array(32).fill(0x11);
      const pubkey2 = new Uint8Array(32).fill(0x22);
      const date = new Date("2025-02-01");

      const topic1 = deriveContentTopic(pubkey1, date);
      const topic2 = deriveContentTopic(pubkey2, date);

      expect(topic1).not.toBe(topic2);
    });

    it("should default to today's date when not provided", () => {
      const pubkey = new Uint8Array(32).fill(0xab);
      const topic = deriveContentTopic(pubkey);

      // Should contain a date in YYYY-MM-DD format
      expect(topic).toMatch(/\/\d{4}-\d{2}-\d{2}\/proto$/);
    });

    it("should handle leap year dates", () => {
      const pubkey = new Uint8Array(32).fill(0xab);
      const date = new Date("2024-02-29");
      const topic = deriveContentTopic(pubkey, date);

      expect(topic).toContain("/2024-02-29/");
    });

    it("should handle year-end dates", () => {
      const pubkey = new Uint8Array(32).fill(0xab);
      const date = new Date("2025-12-31");
      const topic = deriveContentTopic(pubkey, date);

      expect(topic).toContain("/2025-12-31/");
    });

    it("should have correct format structure", () => {
      const pubkey = new Uint8Array(32).fill(0xab);
      const date = new Date("2025-02-01");
      const topic = deriveContentTopic(pubkey, date);

      const parts = topic.split("/");
      expect(parts.length).toBe(6); // ["", "nanoNym", "1", bucket, date, "proto"]
      expect(parts[1]).toBe("nanoNym");
      expect(parts[2]).toBe("1");
      expect(parts[5]).toBe("proto");
    });
  });

  describe("Integration: bucket and topic derivation", () => {
    it("should derive consistent bucket and topic for same pubkey", () => {
      const pubkey = new Uint8Array(32).fill(0xef);
      const date = new Date("2025-02-01");

      const bucket = deriveBucket(pubkey);
      const topic = deriveContentTopic(pubkey, date);

      expect(topic).toContain(`/${bucket}/`);
      expect(topic).toContain("/2025-02-01/");
    });

    it("should distribute buckets across the range", () => {
      // Generate multiple pubkeys and check bucket distribution
      const buckets = new Set<number>();

      for (let i = 0; i < 256; i++) {
        const pubkey = new Uint8Array(32).fill(i);
        const bucket = deriveBucket(pubkey);
        buckets.add(bucket);
      }

      // Should have multiple different buckets (not all the same)
      expect(buckets.size).toBeGreaterThan(1);
    });
  });
});
