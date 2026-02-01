import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { config } from './config.js';

/**
 * NanoNyms Relay - Simplified HTTP-only version
 *
 * The IPFS/OrbitDB approach has been archived due to browser compatibility issues.
 * This is a placeholder HTTP relay ready for the next Tier2 implementation.
 *
 * TODO: Replace with new Tier2 backend (Waku, Gun.js, or simple REST API)
 */

interface Notification {
  id: string;
  recipient: string;
  type: 'nip59';
  event: any;
  timestamp: number;
}

interface RelayState {
  peerId: string;
  dbAddress: string;
  notifications: Map<string, Notification[]>; // recipient -> notifications
}

let state: RelayState | null = null;

function log(level: string, message: string, ...args: unknown[]): void {
  const levels = ['debug', 'info', 'warn', 'error'];
  const configLevel = levels.indexOf(config.logLevel);
  const messageLevel = levels.indexOf(level);

  if (messageLevel >= configLevel) {
    const prefix = `[Relay] [${level.toUpperCase()}]`;
    console.log(prefix, message, ...args);
  }
}

export async function startRelay(): Promise<RelayState> {
  if (state) {
    log('warn', 'Relay already running');
    return state;
  }

  log('info', 'Starting NanoNyms Relay (HTTP-only, Tier2 archived)...');

  const dataPath = join(config.dataDir, 'notifications');
  await mkdir(dataPath, { recursive: true });

  log('debug', 'Storage directory created');

  // Generate a simple peer ID for identification
  const peerId = `relay-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const dbAddress = '/archived/orbitdb/placeholder';

  state = {
    peerId,
    dbAddress,
    notifications: new Map(),
  };

  log('info', 'NanoNyms Relay started successfully (HTTP-only)');
  log('info', `PeerID: ${peerId}`);
  log('info', 'Note: Tier2 (OrbitDB) has been archived, awaiting new implementation');

  return state;
}

export async function stopRelay(): Promise<void> {
  if (!state) {
    log('warn', 'Relay not running');
    return;
  }

  log('info', 'Stopping relay...');

  state = null;
  log('info', 'Relay stopped');
}

export function getState(): RelayState | null {
  return state;
}

export async function getStats(): Promise<{
  peerId: string;
  dbAddress: string;
  peers: number;
  entries: number;
  addresses: string[];
}> {
  if (!state) {
    throw new Error('Relay not running');
  }

  // Count total notifications
  let totalEntries = 0;
  for (const notifications of state.notifications.values()) {
    totalEntries += notifications.length;
  }

  return {
    peerId: state.peerId,
    dbAddress: state.dbAddress,
    peers: 0, // No P2P connections in HTTP-only mode
    entries: totalEntries,
    addresses: [`http://localhost:${config.ports.health}`],
  };
}

/**
 * Store a notification for a recipient
 * TODO: Implement with new Tier2 backend
 */
export async function storeNotification(
  recipient: string,
  notification: Omit<Notification, 'id'>
): Promise<string> {
  if (!state) {
    throw new Error('Relay not running');
  }

  const id = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const fullNotification: Notification = {
    ...notification,
    id,
  };

  if (!state.notifications.has(recipient)) {
    state.notifications.set(recipient, []);
  }

  state.notifications.get(recipient)!.push(fullNotification);

  log('info', `Stored notification ${id} for recipient ${recipient.substring(0, 16)}...`);

  return id;
}

/**
 * Get notifications for a recipient
 * TODO: Implement with new Tier2 backend
 */
export async function getNotificationsForRecipient(
  recipient: string,
  since?: number
): Promise<Notification[]> {
  if (!state) {
    throw new Error('Relay not running');
  }

  const notifications = state.notifications.get(recipient) || [];

  if (since) {
    return notifications.filter((n) => n.timestamp >= since);
  }

  return notifications;
}
