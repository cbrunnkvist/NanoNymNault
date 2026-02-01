import { createHelia } from 'helia';
import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { generateKeyPair, privateKeyToProtobuf } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import { FsBlockstore } from 'blockstore-fs';
import { FsDatastore } from 'datastore-fs';
import { createOrbitDB } from '@orbitdb/core';
// @ts-ignore - IPFSAccessController types may be incomplete in OrbitDB 3.x
import { IPFSAccessController } from '@orbitdb/core';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { Helia } from 'helia';
import type { Libp2p } from 'libp2p';
import { config } from './config.js';

type OrbitDBType = any;
type EventsDBType = any;

export interface RelayState {
  libp2p: Libp2p;
  helia: Helia;
  orbitdb: OrbitDBType;
  db: EventsDBType;
  peerId: string;
  dbAddress: string;
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

  log('info', 'Starting NanoNyms Event Relay...');

  const blockstorePath = join(config.dataDir, 'blockstore');
  const datastorePath = join(config.dataDir, 'datastore');
  const orbitdbPath = join(config.dataDir, 'orbitdb');

  await mkdir(blockstorePath, { recursive: true });
  await mkdir(datastorePath, { recursive: true });
  await mkdir(orbitdbPath, { recursive: true });

  log('debug', 'Storage directories created');

  const blockstore = new FsBlockstore(blockstorePath);
  const datastore = new FsDatastore(datastorePath);

  log('info', 'Generating PeerID with private key for gossipsub signing...');
  
  // Generate Ed25519 keypair (gossipsub v13 requires privateKey on PeerID)
  const privateKey = await generateKeyPair('Ed25519');
  const peerId = await peerIdFromPrivateKey(privateKey);
  
  // Patch peerId to include privateKey in protobuf format (gossipsub v13 expects this)
  const privKeyProto = privateKeyToProtobuf(privateKey);
  (peerId as any).privateKey = privKeyProto;
  
  // Ensure toBytes() method exists (OrbitDB publishing requires this)
  if (!(peerId as any).toBytes || typeof (peerId as any).toBytes !== 'function') {
    (peerId as any).toBytes = () => peerId.toMultihash().bytes;
  }
  
  log('debug', `PeerID created: ${peerId.toString()}`);
  log('debug', `PeerID privateKey present: ${!!(peerId as any).privateKey}`);

  log('info', 'Initializing libp2p with gossipsub...');

  // Wrap gossipsub factory to patch components.peerId with privateKey
  const originalGossipSub = gossipsub({
    allowPublishToZeroTopicPeers: true,
    emitSelf: true,
  });

  const patchedGossipSub = (components: any) => {
    // Patch components.peerId to include privateKey for message signing
    if (components.peerId && !components.peerId.privateKey) {
      log('debug', 'Patching components.peerId with privateKey...');
      components.peerId.privateKey = privKeyProto;
      
      // Also ensure toBytes() method exists
      if (!components.peerId.toBytes || typeof components.peerId.toBytes !== 'function') {
        components.peerId.toBytes = () => components.peerId.toMultihash().bytes;
      }
    }
    return originalGossipSub(components);
  };

  const libp2pConfig: any = {
    peerId,
    addresses: {
      listen: [
        `/ip4/0.0.0.0/tcp/${config.ports.libp2p}`,
        `/ip4/0.0.0.0/tcp/${config.ports.websocket}/ws`,
      ],
    },
    transports: [tcp(), webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    datastore,
    services: {
      identify: identify(),
      pubsub: patchedGossipSub,
    },
  };

  const libp2p = await createLibp2p(libp2pConfig);

  const peerIdString = libp2p.peerId.toString();
  log('info', `libp2p started with PeerID: ${peerIdString}`);

  const addresses = libp2p.getMultiaddrs().map((addr: any) => addr.toString());
  log('info', 'Listening on:');
  addresses.forEach((addr: string) => log('info', `  ${addr}`));

  log('info', 'Initializing Helia (IPFS)...');

  const helia = await createHelia({
    libp2p,
    blockstore,
    datastore,
  });

  log('info', 'Helia initialized');

  log('info', 'Initializing OrbitDB...');

  const orbitdb = await createOrbitDB({
    ipfs: helia,
    directory: orbitdbPath,
  });

  log('info', 'Opening events database with open access...');

  const db = await orbitdb.open(config.orbitdb.name, {
    type: 'events',
    create: true,
    AccessController: IPFSAccessController({ write: ['*'] }),
  });

  const dbAddress = db.address.toString();
  log('info', `Database opened: ${dbAddress}`);

  const existingEntries = await db.all();
  log('info', `Existing entries in database: ${existingEntries.length}`);

  db.events.on('update', async (entry: any) => {
    log('debug', 'Database update received:', entry.hash);
  });

  libp2p.addEventListener('peer:connect', (event: any) => {
    log('info', `Peer connected: ${event.detail.toString()}`);
  });

  libp2p.addEventListener('peer:disconnect', (event: any) => {
    log('info', `Peer disconnected: ${event.detail.toString()}`);
  });

  state = {
    libp2p,
    helia,
    orbitdb,
    db,
    peerId: peerIdString,
    dbAddress,
  };

  log('info', 'NanoNyms Event Relay started successfully');
  log('info', `Database address for wallets: ${dbAddress}`);

  return state!;
}

export async function stopRelay(): Promise<void> {
  if (!state) {
    log('warn', 'Relay not running');
    return;
  }

  log('info', 'Stopping relay...');

  await state.db.close();
  log('debug', 'Database closed');

  await state.orbitdb.stop();
  log('debug', 'OrbitDB stopped');

  await state.helia.stop();
  log('debug', 'Helia stopped');

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

  const entries = await state.db.all();
  
  return {
    peerId: state.peerId,
    dbAddress: state.dbAddress,
    peers: state.libp2p.getPeers().length,
    entries: entries.length,
    addresses: state.libp2p.getMultiaddrs().map((addr: any) => addr.toString()),
  };
}
