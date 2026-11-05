import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
vi.mock('../lib/session', () => ({ session: { request: vi.fn(), publicRequest: vi.fn() } }));
import { session } from '../lib/session';
import { getAuction, getMyAuctionIntake, getMyAuctionIntakes, listAuctions, listMyAuctions } from './auctions';

const id = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const now = '2026-11-05T08:00:00.000Z';
function responses(step: unknown) {
  const auction = { id: id(100), listingId: id(200), title: 'Phiên QA', state: 'Active',
    startPrice: 100000, step, buyNowPrice: null, currentPrice: null, minimumBid: 100000,
    bidderCount: 0, startAt: now, endAt: '2026-11-06T08:00:00.000Z', pointName: 'Điểm QA', demoOnly: true };
  const intake = { id: id(300), auctionId: null, state: 'AwaitingDropoff', version: 1,
    listingId: id(200), title: 'Lần gửi QA', pointId: id(20), startPrice: 100000, step,
    buyNowPrice: null, protectiveValue: 100000, createdAt: now, dropoffDeadline: now,
    receivedAt: null, inspectedAt: null, inspectionOutcome: null, inspectionNote: null,
    reclaimReason: null, closedAt: null, evidenceDeadline: null, evidenceNote: null, evidenceSubmittedAt: null };
  const fixtures: Record<string, unknown> = {
    '/auctions': { items: [auction], serverTime: now },
    '/auctions?phase=upcoming': { items: [{ ...auction, phase: 'Scheduled' }], serverTime: now },
    ['/auctions/' + id(100)]: { auction, leaderAlias: null, history: [], serverTime: now },
    '/me/auctions?limit=12&view=all': { items: [{ auction, role: 'Seller', leading: false, won: false, needsPayment: false, paymentDeadline: null }], nextCursor: null, serverTime: now },
    '/me/auction-intakes': { items: [intake] },
    ['/me/auction-intakes/' + id(300)]: intake,
  };
  for (const method of [session.request, session.publicRequest]) {
    vi.mocked(method).mockImplementation(async (path, schema) => {
      expect(Object.hasOwn(fixtures, path)).toBe(true);
      return (schema as z.ZodType).parse(fixtures[path]);
    });
  }
}
const reads = [() => listAuctions(), () => listAuctions('upcoming'), () => getAuction(id(100)),
  () => listMyAuctions(), () => getMyAuctionIntakes(), () => getMyAuctionIntake(id(300))];

describe('ADR0068 auction step read contract', () => {
  it.each([1000, 10000, 20000, 37000, 50000, 100000, 10000000])('accepts legacy/preset/custom step %s through every read consumer', async step => {
    responses(step);
    const [live, upcoming, detail, mine, intakes, intake] = await Promise.all([
      listAuctions(), listAuctions('upcoming'), getAuction(id(100)), listMyAuctions(), getMyAuctionIntakes(), getMyAuctionIntake(id(300)),
    ]);
    expect([live.items[0].step, upcoming.items[0].step, detail.auction.step,
      mine.items[0].auction.step, intakes.items[0].step, intake.step]).toEqual(Array(6).fill(step));
  });
  it.each([0, 999, 1001, 1500, 10000001, 11000000, 1000.5, '20000', NaN, Infinity])('rejects invalid step %s at read boundaries', async step => {
    responses(step);
    await Promise.all(reads.map(read => expect(read()).rejects.toBeInstanceOf(z.ZodError)));
  });
});
