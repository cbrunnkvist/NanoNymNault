#!/bin/sh

set -e

echo "Starting nwaku node with Store, Filter, and LightPush protocols"

# Get external IP for NAT configuration
MY_EXT_IP=$(wget -qO- https://api4.ipify.org 2>/dev/null || echo "127.0.0.1")
echo "Detected external IP: ${MY_EXT_IP}"

# Calculate retention policy from days
STORE_RETENTION_POLICY="--store-message-retention-policy=time:${STORE_RETENTION_DAYS:-30}d"

if [ -n "${STORAGE_SIZE}" ]; then
    STORE_RETENTION_POLICY="--store-message-retention-policy=size:${STORAGE_SIZE}"
fi

echo "Store retention policy: ${STORE_RETENTION_POLICY}"

# Set nodekey if provided
NODEKEY_ARG=""
if [ -n "${NODEKEY}" ]; then
    NODEKEY_ARG="--nodekey=${NODEKEY}"
fi

# Build the command
exec /usr/bin/wakunode \
    --relay=true \
    --filter=true \
    --lightpush=true \
    --store=true \
    --keep-alive=true \
    --max-connections=${MAX_CONNECTIONS:-150} \
    --cluster-id=${CLUSTER_ID:-1} \
    --discv5-discovery=${DISCV5_ENABLED:-true} \
    --discv5-udp-port=${DISCV5_UDP_PORT:-9005} \
    --discv5-enr-auto-update=${DISCV5_ENR_AUTO_UPDATE:-true} \
    --log-level=${LOG_LEVEL:-DEBUG} \
    --tcp-port=${TCP_PORT:-30304} \
    --metrics-server=${METRICS_ENABLED:-true} \
    --metrics-server-port=${METRICS_PORT:-8003} \
    --metrics-server-address=0.0.0.0 \
    --rest=${REST_ENABLED:-true} \
    --rest-admin=${REST_ADMIN:-true} \
    --rest-address=${REST_ADDRESS:-0.0.0.0} \
    --rest-port=${REST_PORT:-8645} \
    --rest-allow-origin="localhost:*" \
    --nat=extip:"${MY_EXT_IP}" \
    --store-message-db-url="postgres://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-test123}@postgres:5432/${POSTGRES_DB:-waku}" \
    ${STORE_RETENTION_POLICY} \
    ${NODEKEY_ARG}
