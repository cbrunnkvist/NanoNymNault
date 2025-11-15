import BigNumber from 'bignumber.js';
import { WalletAccount } from '../services/wallet.service';
import { NanoNym } from './nanonym.types';

/**
 * Discriminated union type for spendable accounts
 * Can be either a regular wallet account or a NanoNym
 */
export type SpendableAccount = RegularAccount | NanoNymAccount;

/**
 * Regular wallet account wrapper
 */
export interface RegularAccount {
  type: 'regular';
  id: string;
  label: string;
  balance: BigNumber;
  balanceRaw: BigNumber;
  pending: BigNumber;
  balanceFiat: number;
  index: number;
  walletAccount: WalletAccount;
}

/**
 * NanoNym account wrapper (aggregates stealth accounts)
 */
export interface NanoNymAccount {
  type: 'nanonym';
  id: string; // nnym_ address
  label: string; // Custom label or "NanoNym #0"
  balance: BigNumber; // Aggregated balance
  balanceRaw: BigNumber;
  pending: BigNumber; // Always 0 for now (stealth accounts auto-receive)
  balanceFiat: number;
  index: number; // NanoNym index
  nanoNym: NanoNym;
  truncatedAddress: string; // "nnym_12345...67890" for display
}

/**
 * Helper to format NanoNym address for display
 * Format: "nnym_12345...67890"
 */
export function truncateNanoNymAddress(address: string): string {
  if (!address || !address.startsWith('nnym_')) {
    return address;
  }

  // Show first 10 chars (nnym_ + 5) and last 5 chars
  const start = address.substring(0, 10);
  const end = address.substring(address.length - 5);
  return `${start}...${end}`;
}

/**
 * Helper to format account label for Send component dropdown
 *
 * Regular account: "Account #0 (10.5 XNO)"
 * NanoNym account: "Donations - nnym_12345...67890 (2.5 XNO)"
 */
export function formatSpendableAccountLabel(
  account: SpendableAccount,
  rawToXNO: (raw: BigNumber) => string
): string {
  if (account.type === 'regular') {
    const xno = rawToXNO(account.balance);
    return `${account.label} (${xno} XNO)`;
  } else {
    // NanoNym format: "Label - nnym_12345...67890 (X XNO)"
    const xno = rawToXNO(account.balance);
    return `${account.label} - ${account.truncatedAddress} (${xno} XNO)`;
  }
}
