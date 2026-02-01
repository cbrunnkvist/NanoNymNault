import { config, logConfig } from './config.js';
import { startRelay, stopRelay } from './relay.js';
import { startHealthServer, stopHealthServer } from './health.js';

console.log('');
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║           NanoNyms Event Relay - Tier 2 Storage           ║');
console.log('╚═══════════════════════════════════════════════════════════╝');
console.log('');

logConfig();
console.log('');

async function main(): Promise<void> {
  try {
    await startRelay();
    await startHealthServer();

    console.log('');
    console.log('[Main] Relay is ready to accept connections');
    console.log(`[Main] Browsers connect via: ws://localhost:${config.ports.websocket}`);
    console.log(`[Main] Health check: http://localhost:${config.ports.health}/health`);
    console.log('');
  } catch (error) {
    console.error('[Main] Failed to start relay:', error);
    process.exit(1);
  }
}

async function shutdown(): Promise<void> {
  console.log('');
  console.log('[Main] Shutting down...');
  
  try {
    await stopHealthServer();
    await stopRelay();
    console.log('[Main] Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[Main] Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main();
