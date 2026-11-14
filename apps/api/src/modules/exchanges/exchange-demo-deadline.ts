import type { ConfigService } from '@nestjs/config';
import type { ExchangeDoc } from '../../database/mongo/documents.js';
import type { Wire } from '../commands/domain-error.js';
import { hasExchangeDispute, inspectionDeadlines } from './exchange-inspection.js';
import { oneSidedReturn } from './exchange-return-resolution.js';

type Deadline = Wire['DemoExchangeDeadline'];

export function demoExchangeDeadlineEnabled(config: ConfigService, row: ExchangeDoc) {
  if (!['development', 'test'].includes(config.get<string>('NODE_ENV', 'development')) ||
    !config.get<string>('PAYMENT_SIMULATOR_SECRET') ||
    config.get<string>('DEMO_EXCHANGE_DEADLINES_ENABLED') !== 'true' || row.demoArchivedAt) return false;

  const mongo = URL.parse(config.get<string>('MONGODB_URL', ''));
  if (mongo?.protocol !== 'mongodb:' || !['localhost', '127.0.0.1', '[::1]'].includes(mongo.hostname)) return false;

  const ids = config.get<string>('DEMO_EXCHANGE_MEMBER_IDS', '').split(',').map(id => id.trim()).filter(Boolean);
  return row.initiatorId !== row.recipientId && [row.initiatorId, row.recipientId].every(id => ids.includes(id));
}

export function currentDemoDeadline(row: ExchangeDoc, now: Date, operations: boolean): Deadline | undefined {
  if (!operations) {
    switch (row.status) {
      case 'Proposed': return row.proposalExpiresAt ? 'Proposal' : undefined;
      case 'AcceptedAwaitingFunding': return row.fundingDeadline ? 'Funding' : undefined;
      case 'Preparing': return row.shippingDeadline && !hasExchangeDispute(row) ? 'Shipping' : undefined;
      case 'InTransit': return !row.initiatorReceivedAt || !row.recipientReceivedAt ? 'Transit' : undefined;
      case 'Delivered': return !hasExchangeDispute(row) && inspectionDeadlines(row).all ? 'Inspection' : undefined;
    }
    return;
  }
  const r = row.returnResolution;
  if (row.status !== 'ResolutionPending' || !r || !oneSidedReturn(row)) return;
  const open = (at: Date | null) => Boolean(at && at > now);
  if (r.phase === 'Evidence' && open(r.evidenceDueAt)) return 'Evidence';
  if (['ReturnOrdered', 'CompensationOrdered'].includes(r.phase) && !r.effectiveAt && open(r.appealDueAt)) return 'Appeal';
  if (r.phase === 'ReturnOrdered' && open(r.returnDueAt) &&
    (r.effectiveAt || (r.appealDueAt && r.appealDueAt <= now && !r.appeals.length))) return 'Return';
  if (r.phase === 'CheckingReturn' && open(r.checkDueAt)) return 'ReturnCheck';
}

export function closeDemoDisputeWindow(row: ExchangeDoc, deadline: Deadline, now: Date) {
  const r = row.returnResolution;
  if (!r || currentDemoDeadline(row, now, true) !== deadline) return null;
  switch (deadline) {
    case 'Evidence': return { ...r, evidenceDueAt: now };
    case 'Appeal': return {
      ...r,
      appealDueAt: now,
      ...(r.phase === 'ReturnOrdered' ? { returnDueAt: new Date(+now + 72 * 3_600_000) } : {}),
    };
    case 'Return': return { ...r, returnDueAt: now };
    case 'ReturnCheck': return { ...r, checkDueAt: now };
    default: return null;
  }
}
