#!/bin/bash
# Single-node MongoDB replica set with authentication (transactions need a
# replica set). The keyfile is generated inside the data volume. Used by the
# dev compose (persistent volume) and the QA compose (tmpfs).
set -euo pipefail
PORT="${MONGO_PORT:-27017}"
REPLSET="${MONGO_REPLSET:-rs-dev}"
KEYFILE=/data/db/replica-keyfile
chown mongodb:mongodb /data/db
if [ ! -f "$KEYFILE" ]; then
  openssl rand -base64 756 > "$KEYFILE"
fi
chmod 400 "$KEYFILE"
chown mongodb:mongodb "$KEYFILE"
extra=()
# Fault-injection commands are for the QA database only, never development data.
if [ "${MONGO_TEST_COMMANDS:-0}" = "1" ]; then
  extra=(--setParameter enableTestCommands=1)
fi
exec gosu mongodb mongod --replSet "$REPLSET" --bind_ip_all --port "$PORT" \
  --auth --keyFile "$KEYFILE" "${extra[@]}"
