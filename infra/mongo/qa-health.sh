#!/bin/bash
# Healthy once the replica set has a writable primary and the QA root user exists.
# First run uses the localhost exception to initiate the set and create that user.
set -uo pipefail
PORT="${TEST_MONGO_PORT:-57017}"
ROOT_USER=latlai_qa_root
ROOT_PASSWORD=local_test_only
auth=(-u "$ROOT_USER" -p "$ROOT_PASSWORD" --authenticationDatabase admin)
if mongosh --quiet --port "$PORT" "${auth[@]}" --eval 'quit(db.hello().isWritablePrimary ? 0 : 1)' >/dev/null 2>&1; then
  exit 0
fi
mongosh --quiet --port "$PORT" --eval "
  try { rs.status(); } catch (e) {
    rs.initiate({ _id: 'rs-test', members: [{ _id: 0, host: '127.0.0.1:$PORT' }] });
  }
  if (!db.hello().isWritablePrimary) quit(1);
  db.getSiblingDB('admin').createUser({ user: '$ROOT_USER', pwd: '$ROOT_PASSWORD', roles: ['root'] });
" >/dev/null 2>&1
exit 1
