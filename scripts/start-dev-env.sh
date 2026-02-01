#!/bin/bash
#
# Start Development Environment
# Runs both relay daemon and wallet dev server in background
#

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELAY_DIR="$PROJECT_ROOT/nanonyms-relay"
RELAY_LOG="$PROJECT_ROOT/relay.log"
WALLET_LOG="$PROJECT_ROOT/wallet.log"
RELAY_PID_FILE="$PROJECT_ROOT/.relay.pid"
WALLET_PID_FILE="$PROJECT_ROOT/.wallet.pid"

echo "🚀 Starting NanoNymNault Development Environment"
echo ""

# Check if processes are already running
if [ -f "$RELAY_PID_FILE" ] && kill -0 $(cat "$RELAY_PID_FILE") 2>/dev/null; then
    echo "⚠️  Relay already running (PID: $(cat "$RELAY_PID_FILE"))"
    echo "   Use ./scripts/stop-dev-env.sh to stop it first"
    exit 1
fi

if [ -f "$WALLET_PID_FILE" ] && kill -0 $(cat "$WALLET_PID_FILE") 2>/dev/null; then
    echo "⚠️  Wallet already running (PID: $(cat "$WALLET_PID_FILE"))"
    echo "   Use ./scripts/stop-dev-env.sh to stop it first"
    exit 1
fi

# Get Node binary paths
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Switch to Node 20 (from .nvmrc)
nvm use 20 > /dev/null 2>&1 || nvm install 20

NODE_BIN=$(which node)
NPM_BIN=$(which npm)

echo "📦 Using Node: $NODE_BIN"
echo "📦 Using npm: $NPM_BIN"
echo ""

# Start relay daemon
echo "📡 Starting relay daemon..."
cd "$RELAY_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "   Installing relay dependencies..."
    $NPM_BIN install
fi

# Start relay in background using subshell with proper environment
(
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm use 20 > /dev/null 2>&1
  export ORBITDB_DATA_DIR="$RELAY_DIR/orbitdb_data"
  $NPM_BIN run dev
) > "$RELAY_LOG" 2>&1 &

RELAY_PID=$!
echo $RELAY_PID > "$RELAY_PID_FILE"
echo "   ✅ Relay started (PID: $RELAY_PID)"
echo "   📝 Logs: $RELAY_LOG"
echo "   🔗 WebSocket: ws://localhost:8081"
echo "   🔗 Health: http://localhost:3000/health"
echo ""

# Wait for relay to initialize
echo "⏳ Waiting for relay to initialize..."
sleep 4

# Check relay health
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "   ✅ Relay healthy"
    curl -s http://localhost:3000/health | jq -r '"     Database: \(.dbAddress)"' 2>/dev/null || true
else
    echo "   ⚠️  Relay health check failed (may still be starting)"
fi
echo ""

# Start wallet dev server
echo "🌐 Starting wallet dev server..."
cd "$PROJECT_ROOT"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "   Installing wallet dependencies..."
    $NPM_BIN ci
fi

# Start wallet in background using subshell with proper environment
(
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm use 20 > /dev/null 2>&1
  $NPM_BIN start
) > "$WALLET_LOG" 2>&1 &

WALLET_PID=$!
echo $WALLET_PID > "$WALLET_PID_FILE"
echo "   ✅ Wallet started (PID: $WALLET_PID)"
echo "   📝 Logs: $WALLET_LOG"
echo "   🔗 http://localhost:4200/"
echo ""

echo "✅ Development environment ready!"
echo ""
echo "📊 Monitor logs:"
echo "   Relay:  tail -f $RELAY_LOG"
echo "   Wallet: tail -f $WALLET_LOG"
echo "   Both:   ./scripts/watch-logs.sh"
echo ""
echo "🛑 Stop servers:"
echo "   ./scripts/stop-dev-env.sh"
echo ""
echo "🧪 Test connectivity:"
echo "   cd nanonyms-relay && node test-connectivity.mjs"
echo ""
