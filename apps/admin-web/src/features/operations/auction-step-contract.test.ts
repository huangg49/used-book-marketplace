import { describe, expect, it } from 'vitest';
import { intake, intakeList, operationsAuction, operationsAuctionList } from './contracts';
const id = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const time = '2026-11-05T08:00:00.000Z';
const auction = (step: unknown) => ({ id: id(1), version: 1, title: 'Phiên QA', state: 'Active',
  startPrice: 100000, step, currentPrice: null, bidderCount: 0, startAt: time, endAt: time, pointName: 'Điểm QA' });
const row = (step: unknown) => ({ id: id(2), contextId: id(3), listingId: id(4), listingRevisionId: id(5),
  title: 'Lần gửi QA', pointId: id(6), startPrice: 100000, step, buyNowPrice: null, protectiveValue: 100000,
  state: 'AwaitingDropoff', version: 1, createdAt: time, dropoffDeadline: time, receivedAt: null,
  shelfCode: null, inspectedAt: null, inspectionOutcome: null, inspectionNote: null, auctionId: null,
  reclaimReason: null, closedAt: null, evidenceRequestedBy: null, evidenceDeadline: null,
  evidenceNote: null, evidenceSubmittedAt: null, reclaimRequiredAt: null, inspectionDueAt: null,
  reclaimDueAt: null, reports: [] });
describe('ADR0068 Staff/Admin step read contracts', () => {
  it.each([1000,10000,20000,37000,50000,100000,10000000])('accepts valid step %s in both queues and detail schemas', step => {
    expect(intake.parse(row(step)).step).toBe(step);
    expect(intakeList.parse({items:[row(step)]}).items[0].step).toBe(step);
    expect(operationsAuction.parse(auction(step)).step).toBe(step);
    expect(operationsAuctionList.parse({items:[auction(step)],serverTime:time}).items[0].step).toBe(step);
  });
  it.each([0,999,1001,1500,10000001,11000000,1000.5,'20000',NaN,Infinity])('rejects invalid step %s in both queues', step => {
    expect(intakeList.safeParse({items:[row(step)]}).success).toBe(false);
    expect(operationsAuctionList.safeParse({items:[auction(step)],serverTime:time}).success).toBe(false);
  });
});
