// Checks the auto review evaluation dataset offline. Calls no provider and
// writes nothing. Exit 0 means the files are consistent, not that the dataset
// is big enough or reviewed: the readiness lines below report that separately.
// Usage: node qa-data/listing-auto-review/validate.mjs
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const incoming = join(root, 'incoming');
const dataset = JSON.parse(readFileSync(join(root, 'cases.draft.json'), 'utf8'));
const provenance = JSON.parse(readFileSync(join(incoming, 'provenance.json'), 'utf8'));
const byFile = new Map(provenance.map((row) => [row.file, row]));

const FREE_LICENSE = /^(CC0|Public domain|No restrictions|CC BY(-SA)? [0-9.]+)/i;
const EXPECTED = ['Approvable', 'MustEscalate', 'Ambiguous'];
const CONDITIONS = ['LikeNew', 'Good', 'Fair', 'Worn'];
const KINDS = ['Natural', 'ConstructedMismatch', 'ConstructedOverstated', 'ConstructedInjection'];
const errors = [];
const fail = (id, message) => errors.push(`${id}: ${message}`);
const ids = new Set();

for (const c of dataset.cases) {
  if (ids.has(c.id)) fail(c.id, 'duplicate id');
  ids.add(c.id);
  if (!EXPECTED.includes(c.expected)) fail(c.id, `bad expected ${c.expected}`);
  if (!KINDS.includes(c.kind)) fail(c.id, `bad kind ${c.kind}`);
  if (c.humanReviewed !== false && !c.reviewedBy)
    fail(c.id, 'humanReviewed needs a reviewedBy name');
  if (!c.rationale?.trim()) fail(c.id, 'missing rationale');
  if (c.expected === 'MustEscalate' && !c.escalationReasons?.length)
    fail(c.id, 'MustEscalate needs escalationReasons');
  if (!CONDITIONS.includes(c.listing?.condition)) fail(c.id, 'bad listing.condition');
  if (!c.listing?.title?.trim()) fail(c.id, 'missing listing.title');
  if (!c.photos?.length) fail(c.id, 'no photos');
  for (const file of c.photos ?? []) {
    const row = byFile.get(file);
    if (!row) { fail(c.id, `${file} has no provenance`); continue; }
    if (!FREE_LICENSE.test(row.license ?? '')) fail(c.id, `${file} licence ${row.license}`);
    const path = join(incoming, 'images', file);
    if (!existsSync(path)) { fail(c.id, `${file} is missing`); continue; }
    const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (hash !== row.sha256) fail(c.id, `${file} hash differs from provenance`);
  }
}

const count = (filter) => dataset.cases.filter(filter).length;
const scored = (c) => c.expected !== 'Ambiguous';
const natural = (c) => c.kind === 'Natural';
const photos = new Set(dataset.cases.flatMap((c) => c.photos ?? []));
console.log(`cases ${dataset.cases.length}; distinct photos ${photos.size}; provenance rows ${provenance.length}`);
console.log(`Approvable ${count((c) => c.expected === 'Approvable')} (natural ${count((c) => c.expected === 'Approvable' && natural(c))})`);
console.log(`MustEscalate ${count((c) => c.expected === 'MustEscalate')} (natural ${count((c) => c.expected === 'MustEscalate' && natural(c))})`);
console.log(`Ambiguous, not scored ${count((c) => c.expected === 'Ambiguous')}`);
console.log(`Vietnamese-language books ${count((c) => c.listing?.language === 'vi')}`);

const reasons = {};
for (const c of dataset.cases)
  for (const r of c.escalationReasons ?? []) reasons[r] = (reasons[r] ?? 0) + 1;
console.log(`escalation reasons ${JSON.stringify(reasons)}`);

if (errors.length) {
  console.error(`\nFAIL ${errors.length} problem(s):\n${errors.join('\n')}`);
  process.exit(1);
}
console.log('\nFiles: PASS (ids, labels, licences, photo hashes)');

// Reported, not enforced: a small or unreviewed set is still a usable pilot.
const reviewed = count((c) => scored(c) && c.humanReviewed === true);
const ready = reviewed >= dataset.gate.minReviewedApprovable + dataset.gate.minReviewedMustEscalate;
console.log(`Human reviewed: ${reviewed}/${count(scored)} scored cases`);
console.log(`Enablement gate evidence: ${ready ? 'size reached, confirm split and sources' : 'NOT MET'}`);
