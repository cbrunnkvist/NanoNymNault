#!/usr/bin/env node
/**
 * Test seed recovery scenario:
 * 1. Client A adds a notification
 * 2. Client A disconnects  
 * 3. Client B connects (simulating wallet restore)
 * 4. Client B should discover historical notification from relay
 */

import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { createHelia } from 'helia';
import { createOrbitDB } from '@orbitdb/core';
import { multiaddr } from '@multiformats/multiaddr';

const RELAY_HTTP = 'http://localhost:3000';

async function createClient(name) {
  const libp2p = await createLibp2p({
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      pubsub: gossipsub({ allowPublishToZeroTopicPeers: true, emitSelf: true })
    }
  });
  
  const helia = await createHelia({ libp2p });
  const orbitdb = await createOrbitDB({ ipfs: helia });
  
  console.log(`[${name}] Created with PeerId: ${libp2p.peerId.toString().slice(0, 20)}...`);
  
  return { libp2p, helia, orbitdb, name };
}

async function cleanup(client) {
  if (client.db) await client.db.close();
  await client.orbitdb.stop();
  await client.helia.stop();
  console.log(`[${client.name}] Disconnected`);
}

async function main() {
  console.log('=== Seed Recovery Test ===\n');

  // Get relay info
  const response = await fetch(`${RELAY_HTTP}/health`);
  const relayInfo = await response.json();
  const wsAddr = relayInfo.addresses.find(a => a.includes('/ws/'));
  
  console.log('Relay database:', relayInfo.dbAddress);
  console.log('Relay entries before test:', relayInfo.entries);
  console.log('');

  // === PHASE 1: Client A sends payment notification ===
  console.log('--- PHASE 1: Sender sends payment ---');
  
  const clientA = await createClient('Sender');
  await clientA.libp2p.dial(multiaddr(wsAddr));
  console.log('[Sender] Connected to relay');
  
  clientA.db = await clientA.orbitdb.open(relayInfo.dbAddress);
  console.log('[Sender] Opened database');
  
  const notification = {
    type: 'nip59',
    event: {
      kind: 1059,
      content: 'encrypted_payment_notification_simulated',
      created_at: Math.floor(Date.now() / 1000),
      pubkey: 'sender_pubkey_hex',
      tags: [['p', 'receiver_pubkey_hex']]
    },
    timestamp: Date.now()
  };
  
  const hash = await clientA.db.add(notification);
  console.log('[Sender] Added payment notification:', hash.slice(0, 30) + '...');
  
  // Wait for sync to relay
  await new Promise(r => setTimeout(r, 2000));
  
  // Verify relay has the entry
  const afterSend = await fetch(`${RELAY_HTTP}/health`);
  const afterSendInfo = await afterSend.json();
  console.log('[Relay] Entries after send:', afterSendInfo.entries);
  
  // Disconnect sender
  await cleanup(clientA);
  console.log('');

  // === PHASE 2: Client B discovers historical payment (seed recovery) ===
  console.log('--- PHASE 2: Receiver restores from seed ---');
  
  // Wait a moment to simulate time passing
  await new Promise(r => setTimeout(r, 1000));
  
  const clientB = await createClient('Receiver');
  await clientB.libp2p.dial(multiaddr(wsAddr));
  console.log('[Receiver] Connected to relay');
  
  clientB.db = await clientB.orbitdb.open(relayInfo.dbAddress);
  console.log('[Receiver] Opened database');
  
  // Read all entries (seed recovery scenario)
  const entries = await clientB.db.all();
  console.log('[Receiver] Found', entries.length, 'historical notifications');
  
  if (entries.length > 0) {
    const lastEntry = entries[entries.length - 1];
    console.log('[Receiver] Latest notification:');
    console.log('   - Type:', lastEntry.value.type);
    console.log('   - Event kind:', lastEntry.value.event?.kind);
    console.log('   - Timestamp:', new Date(lastEntry.value.timestamp).toISOString());
    console.log('   - Hash:', lastEntry.hash.slice(0, 30) + '...');
  }
  
  await cleanup(clientB);
  
  console.log('\n=== Test Complete ===');
  if (entries.length > 0) {
    console.log('✅ Seed recovery successful! Historical payment discovered.');
  } else {
    console.log('❌ Seed recovery failed - no entries found');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
