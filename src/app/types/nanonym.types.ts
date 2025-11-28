import BigNumber from 'bignumber.js';

/**
 * Represents a NanoNym - a reusable pseudonym for receiving private payments
 */
export interface NanoNym {
  /** Derivation index (m/44'/165'/0'/1000'/<index>') */
  index: number;

  /** User-provided label (e.g., "Donations Q1 2025") */
  label: string;

  /** The nnym_ address */
  nnymAddress: string;

  /** Active (monitoring Nostr) or Archived (not monitoring) */
  status: 'active' | 'archived';

  /** Unix timestamp of creation */
  createdAt: number;

  /** Public and private keys for this NanoNym */
  keys: {
    spendPublic: Uint8Array;
    spendPrivate: Uint8Array;
    viewPublic: Uint8Array;
    viewPrivate: Uint8Array;
    nostrPublic: Uint8Array;
    nostrPrivate: Uint8Array;
  };

  /** Aggregated balance across all stealth accounts */
  balance: BigNumber;

  /** Number of payments received */
  paymentCount: number;

  /** All stealth accounts derived from notifications */
  stealthAccounts: StealthAccount[];
}

/**
 * Represents a single stealth account derived from a notification
 */
export interface StealthAccount {
  /** The one-time stealth address (nano_...) */
  address: string;

  /** Stealth address public key */
  publicKey: Uint8Array;

  /** Private key for spending (p_masked = b_spend + t) */
  privateKey: Uint8Array;

  /** Ephemeral public key R from notification */
  ephemeralPublicKey: Uint8Array;

  /** Nano transaction hash */
  txHash: string;

  /** Amount in raw */
  amountRaw: string;

  /** Optional encrypted memo */
  memo?: string;

  /** Unix timestamp when notification received */
  receivedAt: number;

  /** Index of parent NanoNym */
  parentNanoNymIndex: number;

  /** Account balance (queried from node) */
  balance: BigNumber;
}

/**
 * Notification payload from Nostr (NIP-17 decrypted content)
 */
export interface NanoNymNotification {
  version: number;
  protocol: string;
  R: string; // Hex-encoded ephemeral public key
  tx_hash: string;
  amount?: string;
  amount_raw?: string;
  memo?: string;
}

/**
 * Serializable version of NanoNym for storage (Uint8Array -> base64)
 */
export interface StoredNanoNym {
  index: number;
  label: string;
  nnymAddress: string;
  status: 'active' | 'archived';
  createdAt: number;
  keys: {
    spendPublic: string;
    spendPrivate: string;
    viewPublic: string;
    viewPrivate: string;
    nostrPublic: string;
    nostrPrivate: string;
  };
  stealthAccounts: StoredStealthAccount[];
}

/**
 * Serializable version of StealthAccount for storage
 */
export interface StoredStealthAccount {
  address: string;
  publicKey: string;
  privateKey: string;
  ephemeralPublicKey: string;
  txHash: string;
  amountRaw: string;
  memo?: string;
  receivedAt: number;
  parentNanoNymIndex: number;
  balance: string; // Stored as string for JSON serialization
}
