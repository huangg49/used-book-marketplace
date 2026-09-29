#!/bin/bash
# Healthy once the replica set has a writable primary and the root user
# exists. The first run uses the localhost exception to initiate the set and
# create that user from MONGO_ROOT_USER / MONGO_ROOT_PASSWORD.
set -uo pipefail
PORT="${MONGO_PORT:-27017}"
REPLSET="${MONGO_REPLSET:-rs-dev}"
ROOT_USER="${MONGO_ROOT_USER:?set MONGO_ROOT_USER}"
ROOT_PASSWORD="${MONGO_ROOT_PASSWORD:?set MONGO_ROOT_PASSWORD}"
auth=(-u "$ROOT_USER" -p "$ROOT_PASSWORD" --authenticationDatabase admin)
if mongosh --quiet --port "$PORT" "${auth[@]}" --eval 'quit(db.hello().isWritablePrimary ? 0 : 1)' >/dev/null 2>&1; then
  exit 0
fi
MONGO_INIT_USER="$ROOT_USER" MONGO_INIT_PASSWORD="$ROOT_PASSWORD" mongosh --quiet --port "$PORT" --eval "
  try { rs.status(); } catch (e) {
    rs.initiate({ _id: '$REPLSET', members: [{ _id: 0, host: '127.0.0.1:$PORT' }] });
  }
  if (!db.hello().isWritablePrimary) quit(1);
  db.getSiblingDB('admin').createUser({ user: process.env.MONGO_INIT_USER, pwd: process.env.MONGO_INIT_PASSWORD, roles: ['root'] });
" >/dev/null 2>&1
exit 1
