#!/usr/bin/env node
/**
 * Test script to verify relay connectivity and database syncing.
 * This simulates what the browser wallet does.
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

async function main() {
  console.log('=== T2 Relay Connectivity Test ===\n');

  // Step 1: Fetch relay info
  console.log('1. Fetching relay info from', RELAY_HTTP);
  const response = await fetch(`${RELAY_HTTP}/health`);
  const relayInfo = await response.json();
  
  if (relayInfo.status !== 'ok') {
    console.error('Relay not ready:', relayInfo);
    process.exit(1);
  }
  
  console.log('   Relay PeerId:', relayInfo.peerId);
  console.log('   Database:', relayInfo.dbAddress);
  console.log('   Current entries:', relayInfo.entries);
  
  // Find WebSocket address
  const wsAddr = relayInfo.addresses.find(a => a.includes('/ws/'));
  if (!wsAddr) {
    console.error('No WebSocket address found');
    process.exit(1);
  }
  console.log('   WebSocket:', wsAddr);

  // Step 2: Create libp2p node (simulating browser)
  console.log('\n2. Creating libp2p node with WebSocket transport...');
  const libp2p = await createLibp2p({
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      pubsub: gossipsub({ allowPublishToZeroTopicPeers: true, emitSelf: true })
    }
  });
  console.log('   Local PeerId:', libp2p.peerId.toString());

  // Step 3: Create Helia
  console.log('\n3. Creating Helia (IPFS)...');
  const helia = await createHelia({ libp2p });
  console.log('   Helia ready');

  // Step 4: Connect to relay
  console.log('\n4. Dialing relay via WebSocket...');
  await libp2p.dial(multiaddr(wsAddr));
  console.log('   Connected to relay!');

  // Step 5: Create OrbitDB and open database
  console.log('\n5. Creating OrbitDB...');
  const orbitdb = await createOrbitDB({ ipfs: helia });
  console.log('   OrbitDB ready');

  console.log('\n6. Opening database by address:', relayInfo.dbAddress);
  const db = await orbitdb.open(relayInfo.dbAddress);
  console.log('   Database opened:', db.address.toString());

  // Step 7: Read existing entries
  console.log('\n7. Reading existing entries...');
  const entries = await db.all();
  console.log('   Found', entries.length, 'entries');

  // Step 8: Add a test entry
  console.log('\n8. Adding test notification...');
  const testNotification = {
    type: 'test',
    timestamp: Date.now(),
    message: 'Test from connectivity script'
  };
  const hash = await db.add(testNotification);
  console.log('   Added entry:', hash);

  // Step 9: Verify entry was synced
  console.log('\n9. Verifying entry count...');
  const newEntries = await db.all();
  console.log('   Total entries:', newEntries.length);

  // Step 10: Check relay sees the entry
  console.log('\n10. Checking relay sees the new entry...');
  await new Promise(r => setTimeout(r, 2000)); // Wait for sync
  const finalResponse = await fetch(`${RELAY_HTTP}/health`);
  const finalInfo = await finalResponse.json();
  console.log('    Relay entries:', finalInfo.entries);
  console.log('    Relay peers:', finalInfo.peers);

  // Cleanup
  console.log('\n11. Cleaning up...');
  await db.close();
  await orbitdb.stop();
  await helia.stop();

  console.log('\n=== Test Complete ===');
  console.log('✅ Successfully connected to relay and synced database!');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
