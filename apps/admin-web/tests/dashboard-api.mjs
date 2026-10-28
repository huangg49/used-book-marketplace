import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createTestApi, password, base, root } from './test-api.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const require = createRequire(path.join(root, 'apps/api/package.json'));
const { Ajv2020 } = require('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: false });
require('ajv-formats')(ajv);
const contract = require('yaml').parse(readFileSync(path.join(root, 'packages/api-contract/openapi.yaml'), 'utf8'));
ajv.addSchema({ $id: 'contract', components: contract.components });
const validate = ajv.compile({ $ref: 'contract#/components/schemas/ModerationOverview' });
const fixture = await createTestApi({ listingCount: 3 });
try {
  const login = email => fixture.api('/auth/login', null, { email, password });
  const admin = await login('admin@operations.test'), staff = await login('staff@operations.test');
  const get = (days, bearer) => fetch(base + '/operations/moderation-overview?days=' + days, { headers: bearer ? { Authorization: 'Bearer ' + bearer } : {} });
  assert.equal((await get(7)).status, 401);
  assert.equal((await get(7, fixture.member.accessToken)).status, 403);
  assert.equal((await get(8, admin.accessToken)).status, 400); // Contract query validation.
  const first = await fixture.api('/operations/moderation-overview?days=7', admin.accessToken);
  assert.ok(validate(first), JSON.stringify(validate.errors));
  assert.equal(first.daily.length, 7);
  assert.deepEqual(first.pending, { listings: 3, catalog: 2 });
  assert.equal(first.daily.reduce((sum, day) => sum + day.listingSubmitted, 0), 3);
  const staffData = await fixture.api('/operations/moderation-overview?days=30', staff.accessToken);
  assert.equal(staffData.daily.length, 30);
  assert.equal(staffData.pending.catalog, null);
  assert.ok(staffData.daily.every(day => day.catalogSubmitted === null && day.catalogConfirmed === null && day.catalogRejected === null));
  // Use isolated fixtures to prove exact start inclusion, previous-day exclusion and future exclusion.
  const revisions = await fixture.db.collection('listing_revisions').find({ listingId: { $in: fixture.listings } }).toArray();
  const start = new Date(first.startAt);
  const dates = [start, new Date(start.getTime() - 1), new Date(Date.now() + 86400000)];
  for (let i = 0; i < 3; i++) await fixture.db.collection('listing_revisions').updateOne({ _id: revisions[i]._id }, { $set: { submittedAt: dates[i] } });
  const bounded = await fixture.api('/operations/moderation-overview?days=7', admin.accessToken);
  assert.equal(bounded.daily.reduce((sum, day) => sum + day.listingSubmitted, 0), 1);
  assert.equal(bounded.daily[0].listingSubmitted, 1);
  assert.equal(bounded.pending.listings, 3); // Current stock is independent of chart period.
  const detail = await fixture.api('/operations/catalog-requests/' + fixture.extraId, admin.accessToken);
  await fixture.api('/operations/catalog-requests/' + fixture.extraId + '/decision', admin.accessToken, { expectedVersion: detail.version, revisionId: detail.currentRevision.id, decision: 'Reject', reason: 'Dữ liệu QA cần bổ sung thông tin.' });
  await fixture.api('/catalog/requests/' + fixture.extraId + '/resubmit', fixture.member.accessToken, { expectedVersion: detail.version + 1, metadata: { ...fixture.metadata, title: 'Đầu sách gửi lại trong QA' } });
  const flow = await fixture.api('/operations/moderation-overview?days=7', admin.accessToken);
  assert.equal(flow.daily.reduce((sum, day) => sum + day.catalogSubmitted, 0), 3);
  assert.equal(flow.daily.reduce((sum, day) => sum + day.catalogRejected, 0), 1);
  assert.equal(flow.pending.catalog, 2);
  await fixture.db.collection('listings').updateOne({ _id: fixture.listings[0] }, { $set: { visibility: 'Removed', removalReason: 'Chỉ thử loại khỏi hàng chờ QA' } });
  const removed = await fixture.api('/operations/moderation-overview?days=7', admin.accessToken);
  assert.equal(removed.pending.listings, 2);
  assert.equal(removed.daily.reduce((sum, day) => sum + day.listingSubmitted, 0), 1);
  const staffUser = await fixture.db.collection('users').findOne({ emailNormalized: 'staff@operations.test' });
  await fixture.setUserStatus(staffUser._id, 'RESTRICTED');
  assert.equal((await get(7, staff.accessToken)).status, 403);
  await fixture.db.collection('users').updateOne({ emailNormalized: 'admin@operations.test' }, { $set: { roles: [{ role: 'MEMBER', grantedAt: new Date() }] }, $inc: { lockSeq: 1 } });
  assert.equal((await get(7, admin.accessToken)).status, 403);
  console.log('PASS dashboard HTTP/Mongo: exact counts, 7/30 calendar, boundaries/future, resubmission/decision dates, removed history, current status/role and contract. QA storage fake.');
} finally { await fixture.close(); console.log('QA fixture database, users and roles removed.'); }
