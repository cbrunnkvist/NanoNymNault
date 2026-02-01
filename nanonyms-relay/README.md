# NanoNyms Event Relay

Tier-2 persistent storage relay for NanoNym payment notifications.

## Purpose

Wallet browsers connect to this relay via WebSocket to post and fetch encrypted payment notifications. The relay stores these in an OrbitDB append-only log, providing permanent storage for seed recovery.

## Quick Start (Development)

```bash
cd nanonyms-relay
npm install
npm run dev
```

This starts the relay with:
- libp2p TCP: `tcp://0.0.0.0:4001` (relay-to-relay)
- libp2p WebSocket: `ws://0.0.0.0:8081` (browser-to-relay)
- Health HTTP: `http://0.0.0.0:3000/health`

Data is stored in `./orbitdb_data/` (gitignored).

## Docker

Build and run:

```bash
npm run docker:build
docker-compose up -d
```

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ORBITDB_DATA_DIR` | Yes | - | Directory for persistent storage |
| `LIBP2P_PORT` | No | 4001 | TCP port for relay-to-relay |
| `WEBSOCKET_PORT` | No | 8081 | WebSocket port for browsers |
| `HEALTH_PORT` | No | 3000 | HTTP health endpoint |
| `ORBITDB_NAME` | No | nano-nym-alerts-v1 | Database name (must match all nodes) |
| `BOOTSTRAP_PEERS` | No | - | Comma-separated peer addresses |
| `LOG_LEVEL` | No | info | debug, info, warn, error |

## Health Check

```bash
curl http://localhost:3000/health
```

Returns:
```json
{
  "status": "ok",
  "peerId": "12D3Koo...",
  "dbAddress": "/orbitdb/zdpu...",
  "peers": 0,
  "entries": 42,
  "addresses": [
    "/ip4/0.0.0.0/tcp/4001/p2p/12D3Koo...",
    "/ip4/0.0.0.0/tcp/8081/ws/p2p/12D3Koo..."
  ]
}
```

## Architecture

```
Sender Wallet (Browser)
    | WebSocket (wss://)
    v
Event Relay (this daemon)
    | OrbitDB append-only log
    v
Persistent Storage (filesystem)
    ^
    | WebSocket (wss://)
Receiver Wallet (comes online later)
```

The relay is always-on infrastructure. Browsers are ephemeral. Notifications persist for seed recovery.
