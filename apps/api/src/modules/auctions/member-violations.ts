import { randomUUID } from 'node:crypto';
import type { MemberViolationDoc } from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import { DomainError } from '../commands/domain-error.js';

// POL-17: 3 verified violations within 720 h restrict new transactions for
// 168 h after the third. FR-AU08: record only after the deadline/actor is
// verified (a late worker or an Admin "no fault" finding records nothing).
// Scope: new auction participation, Buy Now and auction intake; DirectDelivery
// and Exchange checkouts do not read this record yet.
const WINDOW_MS = 720 * 3_600_000;
const RESTRICTION_MS = 168 * 3_600_000;
const THRESHOLD = 3;

export function recordViolation(tx: Tx, v: Omit<MemberViolationDoc, '_id'>) {
  return tx.c.member_violations.insertOne({ _id: randomUUID(), ...v });
}

export async function restrictedUntil(tx: Tx, userId: string, now: Date) {
  const rows = await tx.c.member_violations
    .find(
      {
        userId,
        recordedAt: {
          $gt: new Date(now.getTime() - RESTRICTION_MS - WINDOW_MS),
          $lte: now,
        },
      },
      { sort: { recordedAt: 1 } },
    )
    .toArray();
  let until: Date | null = null;
  rows.forEach((v, i) => {
    const end = new Date(v.recordedAt.getTime() + RESTRICTION_MS);
    if (end <= now) return;
    const from = v.recordedAt.getTime() - WINDOW_MS;
    const inWindow = rows
      .slice(0, i + 1)
      .filter((r) => r.recordedAt.getTime() > from).length;
    if (inWindow >= THRESHOLD && (!until || end > until)) until = end;
  });
  return until as Date | null;
}

export async function requireUnrestricted(tx: Tx, userId: string, now: Date) {
  const until = await restrictedUntil(tx, userId, now);
  if (until)
    throw new DomainError(
      403,
      'AccountIneligible',
      `Tài khoản đang bị hạn chế giao dịch mới do vi phạm lặp lại, đến ${until.toISOString()}.`,
    );
}
