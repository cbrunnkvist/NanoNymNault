/**
 * Configuration for the NanoNyms Event Relay daemon.
 * 
 * ORBITDB_DATA_DIR is REQUIRED - the relay will not start without it.
 * This ensures explicit control over where persistent data is stored.
 */

const dataDir = process.env.ORBITDB_DATA_DIR;
if (!dataDir) {
  console.error('ERROR: ORBITDB_DATA_DIR environment variable is required');
  console.error('');
  console.error('Set it to the directory where OrbitDB should store its data:');
  console.error('  export ORBITDB_DATA_DIR=/path/to/storage');
  console.error('');
  console.error('For development, use:');
  console.error('  npm run dev  (automatically sets to ./orbitdb_data/)');
  process.exit(1);
}

export interface Config {
  dataDir: string;
  ports: {
    libp2p: number;
    websocket: number;
    health: number;
  };
  orbitdb: {
    name: string;
  };
  bootstrap: string[];
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export const config: Config = {
  dataDir,
  ports: {
    libp2p: parseInt(process.env.LIBP2P_PORT || '4001', 10),
    websocket: parseInt(process.env.WEBSOCKET_PORT || '8081', 10),
    health: parseInt(process.env.HEALTH_PORT || '3000', 10),
  },
  orbitdb: {
    // Deterministic name - all relays and wallets use the same log
    // v2: OrbitDB 3.x compatible (migrated from OrbitDB 2.x)
    name: process.env.ORBITDB_NAME || 'nano-nym-alerts-v2',
  },
  // Bootstrap peers for relay-to-relay discovery
  // Format: /dns4/relay.nanonym.org/tcp/4001/p2p/<peer-id>
  bootstrap: process.env.BOOTSTRAP_PEERS?.split(',').filter(Boolean) || [],
  logLevel: (process.env.LOG_LEVEL || 'info') as Config['logLevel'],
};

export function logConfig(): void {
  console.log('[Config] NanoNyms Event Relay Configuration:');
  console.log(`[Config]   Data directory: ${config.dataDir}`);
  console.log(`[Config]   libp2p port: ${config.ports.libp2p}`);
  console.log(`[Config]   WebSocket port: ${config.ports.websocket}`);
  console.log(`[Config]   Health port: ${config.ports.health}`);
  console.log(`[Config]   OrbitDB name: ${config.orbitdb.name}`);
  console.log(`[Config]   Bootstrap peers: ${config.bootstrap.length || 'none (standalone mode)'}`);
  console.log(`[Config]   Log level: ${config.logLevel}`);
}
