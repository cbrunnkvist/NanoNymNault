#!/bin/bash
#
# Watch Development Logs
# Displays both relay and wallet logs with color coding
#

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELAY_LOG="$PROJECT_ROOT/relay.log"
WALLET_LOG="$PROJECT_ROOT/wallet.log"

echo "📊 Watching development logs (Ctrl+C to exit)"
echo "   🟦 Relay logs"
echo "   🟩 Wallet logs"
echo ""

# Use tail with color coding
(tail -f "$RELAY_LOG" 2>/dev/null | sed 's/^/\x1b[34m[RELAY]\x1b[0m /' &
 tail -f "$WALLET_LOG" 2>/dev/null | sed 's/^/\x1b[32m[WALLET]\x1b[0m /' &
 wait)
