#!/bin/bash
#
# Stop Development Environment
# Stops both relay daemon and wallet dev server
#

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELAY_PID_FILE="$PROJECT_ROOT/.relay.pid"
WALLET_PID_FILE="$PROJECT_ROOT/.wallet.pid"

echo "🛑 Stopping NanoNymNault Development Environment"
echo ""

# Stop relay
if [ -f "$RELAY_PID_FILE" ]; then
    RELAY_PID=$(cat "$RELAY_PID_FILE")
    if kill -0 "$RELAY_PID" 2>/dev/null; then
        echo "📡 Stopping relay (PID: $RELAY_PID)..."
        kill "$RELAY_PID"
        rm "$RELAY_PID_FILE"
        echo "   ✅ Relay stopped"
    else
        echo "   ℹ️  Relay not running (stale PID file removed)"
        rm "$RELAY_PID_FILE"
    fi
else
    echo "   ℹ️  Relay not running"
fi

# Stop wallet
if [ -f "$WALLET_PID_FILE" ]; then
    WALLET_PID=$(cat "$WALLET_PID_FILE")
    if kill -0 "$WALLET_PID" 2>/dev/null; then
        echo "🌐 Stopping wallet (PID: $WALLET_PID)..."
        kill "$WALLET_PID"
        rm "$WALLET_PID_FILE"
        echo "   ✅ Wallet stopped"
    else
        echo "   ℹ️  Wallet not running (stale PID file removed)"
        rm "$WALLET_PID_FILE"
    fi
else
    echo "   ℹ️  Wallet not running"
fi

echo ""
echo "✅ Development environment stopped"
