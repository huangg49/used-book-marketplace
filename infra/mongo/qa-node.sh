#!/bin/bash
# QA-only single-node replica set with authentication. The keyfile is generated
# inside the container volume; credentials are local test values, never app .env.
set -euo pipefail
PORT="${TEST_MONGO_PORT:-57017}"
KEYFILE=/data/db/qa-keyfile
chown mongodb:mongodb /data/db
if [ ! -f "$KEYFILE" ]; then
  openssl rand -base64 756 > "$KEYFILE"
fi
chmod 400 "$KEYFILE"
chown mongodb:mongodb "$KEYFILE"
exec gosu mongodb mongod --replSet rs-test --bind_ip_all --port "$PORT" \
  --auth --keyFile "$KEYFILE" --setParameter enableTestCommands=1
