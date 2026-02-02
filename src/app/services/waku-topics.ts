import { blake2b } from "blakejs";

/**
 * Waku Content Topic Scheme for NanoNym
 *
 * Implements a 256-bucket content topic scheme with daily partitioning
 * to distribute traffic and improve privacy through k-anonymity.
 *
 * Format: /nanoNym/1/{bucket}/{date}/proto
 * - bucket: 0-255 (derived from first byte of BLAKE2b hash of pubkey)
 * - date: YYYY-MM-DD (daily partitioning)
 *
 * Reference: https://docs.waku.org/learn/concepts/content-topics
 */

/**
 * Derive a bucket (0-255) from a public key using BLAKE2b hashing
 *
 * The bucket is determined by the first byte of the BLAKE2b-256 hash
 * of the public key. This distributes keys uniformly across 256 buckets
 * for traffic distribution and k-anonymity.
 *
 * @param pubkey - Public key as Uint8Array (32 bytes)
 * @returns Bucket number (0-255)
 */
export function deriveBucket(pubkey: Uint8Array): number {
  // Hash the public key with BLAKE2b-256
  const hash = blake2b(pubkey, undefined, 32);

  // Return the first byte as the bucket (0-255)
  return hash[0];
}

/**
 * Derive a Waku content topic for a given public key and date
 *
 * Format: /nanoNym/1/{bucket}/{date}/proto
 *
 * @param pubkey - Public key as Uint8Array (32 bytes)
 * @param date - Date for daily partitioning (defaults to today)
 * @returns Content topic string
 */
export function deriveContentTopic(
  pubkey: Uint8Array,
  date: Date = new Date(),
): string {
  // Derive bucket from public key
  const bucket = deriveBucket(pubkey);

  // Format date as YYYY-MM-DD
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;

  // Return formatted content topic
  return `/nanoNym/1/${bucket}/${dateStr}/proto`;
}
