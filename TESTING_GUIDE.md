# Phase 2B Testing Guide: Wallet-to-Relay Connectivity

**Goal:** Verify that the browser wallet successfully connects to the relay daemon and syncs OrbitDB notifications.

---

## Prerequisites

- Node v22 (for wallet - check .nvmrc)
- Node v20+ available (for relay - uses separate environment)
- Python 3.11
- Brave Browser (for Karma tests)

---

## Quick Start

### 1. Start Development Environment

```bash
./scripts/start-dev-env.sh
```

This starts:
- **Relay daemon** → ws://localhost:8081, http://localhost:3000
- **Wallet dev server** → http://localhost:4200/

Logs are written to `relay.log` and `wallet.log`.

### 2. Watch Logs (Optional)

```bash
./scripts/watch-logs.sh
```

Or manually:
```bash
# Relay logs
tail -f relay.log

# Wallet logs  
tail -f wallet.log

# Both combined
tail -f relay.log wallet.log
```

### 3. Open Wallet in Browser

```
http://localhost:4200/
```

---

## Test Scenarios

### Scenario 1: Verify Relay Connectivity

**Expected console logs (Browser Dev Tools):**
```
[OrbitDB] Relay info: {dbAddress: "/orbitdb/zdpu...", peerId: "12D3Koo...", ...}
[OrbitDB] Connecting to relay peer: /ip4/127.0.0.1/tcp/8081/ws/p2p/12D3Koo...
[OrbitDB] Connected to relay peer
[OrbitDB] Opening database: /orbitdb/zdpu... (remote: true)
[OrbitDB] Database opened: /orbitdb/zdpu...
```

**If relay unavailable:**
```
[OrbitDB] Could not fetch relay info, running in standalone mode
[OrbitDB] Opening database: nano-nym-alerts-v2 (remote: false)
```

### Scenario 2: Send Payment with T2 Notification

**Steps:**
1. Create/import a wallet in browser
2. Generate a NanoNym (Accounts page → "Generate NanoNym")
3. Copy NanoNym address (`nnym_...`)
4. Send XNO to that NanoNym from another wallet/account

**Expected browser console:**
```
[OrbitDB] 📤 Notification posted: zdpuAqKX...
[Nostr] Published to 3/5 relays
```

**Expected relay.log:**
```
OrbitDB sync event: new entry from <peer>
Database entries: 1 → 2
```

### Scenario 3: Seed Recovery Simulation

**Using test scripts (requires relay running):**

```bash
cd nanonyms-relay

# Test basic connectivity
node test-connectivity.mjs

# Test seed recovery scenario
node test-seed-recovery.mjs
```

**Expected output:**
```
✅ Relay info fetched
✅ Connected to relay
✅ OrbitDB opened: /orbitdb/zdpu...
✅ Notification added
✅ Entry synced to relay
✅ Seed recovery successful
```

---

## Troubleshooting

### Relay won't start

**Check:**
```bash
# Verify Node version
node --version  # Should be 20+

# Check if relay dependencies installed
cd nanonyms-relay && ls node_modules/
```

**Fix:**
```bash
cd nanonyms-relay
npm install
```

### Wallet can't connect to relay

**Check relay health:**
```bash
curl http://localhost:3000/health
```

**Expected response:**
```json
{
  "status": "ok",
  "dbAddress": "/orbitdb/zdpu...",
  "peerId": "12D3KooW..."
}
```

**If health check fails:**
- Check `relay.log` for errors
- Verify ports 3000, 4001, 8081 are available
- Restart relay: `./scripts/stop-dev-env.sh && ./scripts/start-dev-env.sh`

### OrbitDB database address mismatch

**Symptom:** Wallet and relay show different database addresses in logs.

**Cause:** Relay created a new database, wallet is using old address.

**Fix:**
```bash
# Stop everything
./scripts/stop-dev-env.sh

# Clear relay data
rm -rf nanonyms-relay/orbitdb_data/

# Restart
./scripts/start-dev-env.sh
```

### Browser console shows "Failed to fetch relay info"

**Cause:** Relay not running or CORS issue.

**Check:**
1. Relay is running: `curl http://localhost:3000/health`
2. No firewall blocking localhost:3000
3. Browser console shows actual fetch error

---

## Clean Shutdown

```bash
./scripts/stop-dev-env.sh
```

This stops both relay and wallet gracefully.

---

## What to Report

When testing, please capture:

1. **Browser console logs** (entire OrbitDB initialization sequence)
2. **relay.log excerpt** (last 50 lines around the test)
3. **Specific test scenario** (which of the 3 above)
4. **Unexpected behavior** or errors

Example:
```
Scenario 2: Send Payment with T2 Notification
Expected: Notification posted to OrbitDB
Actual: Browser console shows "OrbitDB not initialized"
Browser console: [paste relevant logs]
relay.log: [paste last 50 lines]
```

---

## Success Criteria

- ✅ Wallet fetches relay database address via HTTP
- ✅ Wallet connects to relay via WebSocket
- ✅ Wallet opens relay's OrbitDB database (same address)
- ✅ Sending payment creates OrbitDB entry visible in relay logs
- ✅ Test scripts pass (test-connectivity.mjs, test-seed-recovery.mjs)
- ✅ Graceful fallback if relay unavailable (standalone mode)
