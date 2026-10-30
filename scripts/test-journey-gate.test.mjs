import assert from 'node:assert/strict';
import test from 'node:test';
import { overallStatus, requireQaMongo, selectSuites, suites } from './test-journey-gate.mjs';

test('the fixed suite allowlist excludes carrier/fulfillment suites and preserves serial order', () => {
  assert.equal(selectSuites([]).length, 10);
  assert.deepEqual(selectSuites(['--only=operations,chat']).map(s => s.id), ['chat', 'operations']);
  assert.deepEqual(selectSuites(['--list']), []);
  assert.ok(suites.every(s => !/buy-now|carrier-adapter|transit/.test(s.script)));
  for (const args of [['--only='], ['--only=chat,chat'], ['--only=carrier'], ['--only=chat', '--list'], ['--foo']]) {
    assert.throws(() => selectSuites(args));
  }
});

test('Mongo preflight accepts only the dedicated local QA replica set and test namespace', () => {
  for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
    assert.doesNotThrow(() => requireQaMongo(`mongodb://user:secret@${host}:57017/journey_test?replicaSet=rs-test&authSource=admin`));
  }
  for (const raw of [undefined, '', 'mongodb://127.0.0.1:27017/main?replicaSet=rs0',
    'mongodb://127.0.0.1:57017/main?replicaSet=rs-test',
    'mongodb://remote:57017/journey_test?replicaSet=rs-test',
    'mongodb://127.0.0.1:57017/journey_test?replicaSet=other',
    'mongodb://127.0.0.1:57017/journey_test?replicaSet=rs-test&replicaSet=other',
    'mongodb://127.0.0.1:57017/journey_test?replicaSet=rs-test&directConnection=true',
    'mongodb://127.0.0.1:57017/journey_test?replicaSet=rs-test&loadBalanced=true',
    'mongodb://127.0.0.1:57017/journey_test?replicaSet=rs-test&proxyHost=remote',
    'mongodb://127.0.0.1:57017/journey_test?replicaSet=rs-test&replicaset=other',
    'mongodb://127.0.0.1:57017/journey_test?replicaSet=rs-test&authSource=main',
    'mongodb+srv://remote/journey_test?replicaSet=rs-test',
    'mongodb://127.0.0.1:57017/journey_test%2fmain?replicaSet=rs-test']) {
    assert.throws(() => requireQaMongo(raw));
  }
});

test('preflight errors never include supplied credentials or URL', () => {
  const raw = 'mongodb://private-user:private-secret@remote:27017/private_db';
  assert.throws(() => requireQaMongo(raw), error => !error.message.includes('private-') && !error.message.includes(raw));
});

test('partial selection or interruption cannot produce a whole-gate PASS', () => {
  assert.equal(overallStatus([{ status: 'PASS' }, { status: 'NOT_RUN' }]), 'PARTIAL');
  assert.equal(overallStatus([{ status: 'PASS' }, { status: 'RUNNING' }]), 'PARTIAL');
  assert.equal(overallStatus([{ status: 'PASS' }, { status: 'FAIL' }]), 'FAIL');
  assert.equal(overallStatus([{ status: 'PASS' }, { status: 'PASS' }]), 'PASS');
});
