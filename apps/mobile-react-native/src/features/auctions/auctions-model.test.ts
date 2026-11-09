import { describe, expect, it } from "vitest";
import {
  canWithdrawRegistration,
  amountError,
  autoFloor,
  bidOptions,
  createAuctionCommand,
  createOrderCommand,
  auctionEligible,
  canReschedule,
  createScheduleCommand,
  durationAllowed,
  durationLabel,
  intakePriceErrors,
  isOpen,
  isScheduled,
  startChoices,
  fundsHint,
  fundsShortfall,
  receiptMessage,
  standingOf,
  closeReasonText,
  createSellerCommand,
  openRuleText,
  waitingTime,
  waitingForRegistrants,
} from "./auctions-model";
import type { Participation, PublicAuctionSummary } from "./contracts";

const auction = (over: Partial<PublicAuctionSummary> = {}): PublicAuctionSummary => ({
  id: "11111111-1111-4111-8111-111111111111",
  listingId: "22222222-2222-4222-8222-222222222222",
  title: "Sách",
  state: "Active",
  startPrice: 200_000,
  step: 50_000,
  buyNowPrice: null,
  currentPrice: 300_000,
  minimumBid: 350_000,
  bidderCount: 2,
  startAt: "2026-10-13T00:00:00Z",
  endAt: "2026-10-14T00:00:00Z",
  pointName: "Điểm A",
  ...over,
});
const me = (over: Partial<Participation> = {}): Participation => ({
  auctionId: "11111111-1111-4111-8111-111111111111",
  alias: 2,
  mode: "Manual",
  ownLevel: 300_000,
  boughtNow: false,
  leading: false,
  state: "Active",
  currentPrice: 300_000,
  minimumBid: 350_000,
  won: false,
  orderId: null,
  finalPrice: null,
  paymentDeadline: null,
  serverTime: "2026-10-13T00:00:00Z",
  ...over,
});

describe("auction amounts", () => {
  it("keeps bids on the start + n·step grid from the floor up", () => {
    expect(amountError(null, 350_000, 200_000, 50_000)).toMatch(/Nhập/);
    expect(amountError(300_000, 350_000, 200_000, 50_000)).toMatch(/Tối thiểu/);
    expect(amountError(370_000, 350_000, 200_000, 50_000)).toMatch(/400\.000/);
    expect(amountError(1_050_000, 350_000, 200_000, 50_000)).toBeNull();
    expect(amountError(Number.MAX_SAFE_INTEGER + 1, 350_000, 200_000, 50_000)).toMatch(/vượt mức/);
    expect(amountError(400_000, 350_000, 200_000, 50_000)).toBeNull();
  });
  it("offers quick picks from the minimum, past the old 1,000,000 cap", () => {
    expect(bidOptions(350_000, 50_000)).toEqual([350_000, 400_000, 450_000]);
    expect(bidOptions(950_000, 50_000)).toEqual([950_000, 1_000_000, 1_050_000]);
  });
  it("lets a leader raise a ceiling above their own level only", () => {
    expect(autoFloor(auction(), null)).toBe(350_000);
    expect(autoFloor(auction(), me({ leading: true, ownLevel: 400_000 }))).toBe(450_000);
    expect(autoFloor(auction(), me({ ownLevel: 250_000 }))).toBe(350_000);
  });
});

describe("standing (FR-AU04)", () => {
  it("calls an equal level that does not lead a tie, not an outbid", () => {
    // Bidder 1 Auto 300k first; bidder 2 bids 300k and stays behind.
    expect(standingOf(auction(), me({ ownLevel: 300_000 }))).toBe("tied");
    expect(standingOf(auction(), me({ ownLevel: 250_000 }))).toBe("outbid");
    expect(standingOf(auction(), me({ leading: true }))).toBe("lead");
    expect(standingOf(auction(), null)).toBeNull();
  });
  it("explains a tied receipt as an earlier commitment", () => {
    expect(receiptMessage("Manual", 300_000, { currentPrice: 300_000, leading: false })).toMatch(/trước bạn/);
    expect(receiptMessage("Manual", 300_000, { currentPrice: 350_000, leading: false })).toMatch(/cao hơn/);
    expect(receiptMessage("Auto", 500_000, { currentPrice: 350_000, leading: true })).toMatch(/dẫn giá ở 350\.000/);
    // ADR 0071: balance hints come from the member's own available balance.
    expect(fundsShortfall(300_000, 100_000)).toBe(200_000);
    expect(fundsShortfall(300_000, null)).toBe(0);
    expect(fundsHint(300_000, 100_000)).toMatch(/cần nạp thêm 200\.000/);
    expect(fundsHint(50_000, 100_000)).toMatch(/Số dư khả dụng 100\.000/);
    // ADR 0070: a non-leader's Buy Now gives others 5 minutes, the leader's 60 seconds.
    expect(receiptMessage("BuyNow", 600_000, { currentPrice: 600_000, leading: true })).toMatch(/5 phút/);
    expect(receiptMessage("BuyNow", 600_000, { currentPrice: 600_000, leading: true }, true)).toMatch(/60 giây/);
  });
});

describe("auction commands", () => {
  it("freezes the body and key at creation", () => {
    const c = createAuctionCommand("a1", "Manual", 350_000, "k1");
    expect(c).toMatchObject({ path: "/auctions/a1/bids", method: "POST", key: "k1" });
    expect(JSON.parse(c.body)).toEqual({ amount: 350_000, fulfillmentMethod: "SelfCollect" });
    expect(createAuctionCommand("a1", "Auto", 500_000, "k2")).toMatchObject({
      path: "/auctions/a1/auto-bid",
      method: "PUT",
      body: JSON.stringify({ maxAmount: 500_000, fulfillmentMethod: "SelfCollect" }),
    });
    expect(createAuctionCommand("a1", "Disable", 0, "k3").body).toBe("{}");
  });
});

describe("point order commands", () => {
  it("sends only the fields each step takes", () => {
    expect(JSON.parse(createOrderCommand("o1", "pay", 1, "k").body)).toEqual({ expectedVersion: 1 });
    // ADR 0044: delivery carries the address version and the fee the buyer saw.
    expect(
      JSON.parse(
        createOrderCommand("o1", "pay", 1, "k", undefined, { addressId: "a1", addressVersion: 2, fee: 30000 }).body,
      ),
    ).toEqual({
      expectedVersion: 1,
      fulfillmentMethod: "CarrierOutbound",
      destinationAddressId: "a1",
      expectedDestinationAddressVersion: 2,
      expectedOutboundFee: 30000,
    });
    expect(JSON.parse(createOrderCommand("o1", "reject-report", 2, "k", "Gáy nứt không nêu").body)).toEqual({
      expectedVersion: 2,
      reason: "Gáy nứt không nêu",
    });
    expect(createOrderCommand("o1", "claim", 4, "k", "x".repeat(30))).toMatchObject({
      path: "/point-orders/o1/claim",
      body: JSON.stringify({ expectedVersion: 4, description: "x".repeat(30) }),
    });
  });
});

describe("seller intake (POL-39, FR-AU01)", () => {
  it("keeps start, step and buy-now on one grid", () => {
    expect(intakePriceErrors(null, 50_000, null).startPrice).toMatch(/Nhập/);
    expect(intakePriceErrors(5_000, 10_000, null).startPrice).toMatch(/10\.000/);
    expect(intakePriceErrors(200_000, 50_000, 200_000).buyNowPrice).toMatch(/lớn hơn/);
    expect(intakePriceErrors(200_000, 50_000, 320_000).buyNowPrice).toMatch(/350\.000/);
    expect(intakePriceErrors(200_000, 50_000, 600_000)).toEqual({});
  });
  it("only lets an approved, visible, available Auction listing in", () => {
    const listing = (over: Partial<{ moderation: string; visibility: string; trade: string; mode: string; channel: string }>) => ({
      channel: over.channel ?? "Auction",
      state: { moderation: "Approved", visibility: "Visible", trade: "Available", deletedAt: null, ...over },
      currentRevision: { content: { mode: over.mode ?? "Sale" } },
    });
    expect(auctionEligible(listing({}))).toBe(true);
    // ADR 0042: a marketplace listing is never an auction source.
    expect(auctionEligible(listing({ channel: "Marketplace" }))).toBe(false);
    expect(auctionEligible(listing({ mode: "Both" }))).toBe(false);
    expect(auctionEligible(listing({ trade: "Reserved" }))).toBe(false);
    expect(auctionEligible(listing({ visibility: "Hidden" }))).toBe(false);
  });
});

describe("ADR 0047 scheduled auctions", () => {
  const start = Date.parse("2026-10-13T00:00:00Z");
  it("is scheduled before startAt and open only between start and end", () => {
    const a = auction({ bidderCount: 0, currentPrice: null });
    expect(isScheduled(a, start - 1)).toBe(true);
    expect(isOpen(a, start - 1)).toBe(false);
    expect(isOpen(a, start)).toBe(true);
    expect(isOpen(a, Date.parse(a.endAt))).toBe(false);
  });
  it("lets the seller edit only before bids, Buy Now and five edits", () => {
    const fresh = auction({ bidderCount: 0, currentPrice: null, version: 1, scheduleRevision: 0 });
    expect(canReschedule(fresh, start - 1)).toBe(true);
    expect(canReschedule(fresh, start + 1)).toBe(true);
    expect(canReschedule({ ...fresh, bidderCount: 1 }, start)).toBe(false);
    expect(canReschedule({ ...fresh, buyNowAt: "2026-10-13T01:00:00Z" }, start)).toBe(false);
    expect(canReschedule({ ...fresh, scheduleRevision: 5 }, start)).toBe(false);
    expect(canReschedule({ ...fresh, version: undefined }, start)).toBe(false);
  });
  it("offers start choices inside the 5-minute lead and 7-day horizon", () => {
    const choices = startChoices(start);
    expect(choices[0]).toEqual({ label: "Mở ngay", at: null });
    for (const c of choices.slice(1)) {
      expect(c.at!).toBeGreaterThanOrEqual(start + 5 * 60_000);
      expect(c.at!).toBeLessThanOrEqual(start + 7 * 24 * 3_600_000);
    }
  });
  it("labels second-precision lengths (ADR 0069)", () => {
    expect(durationLabel(24 * 3600)).toBe("1 ngày");
    expect(durationLabel(5415)).toBe("1 giờ 30 phút 15 giây");
    expect(durationLabel(26 * 3600 + 60)).toBe("1 ngày 2 giờ 1 phút");
  });
  it("keeps a live auction open at least one more hour", () => {
    expect(durationAllowed(3 * 3600, start, start + 2 * 3_600_000)).toBe(true);
    expect(durationAllowed(2 * 3600, start, start + 2 * 3_600_000)).toBe(false);
  });
  it("freezes publish and reschedule requests", () => {
    const body = { expectedVersion: 4, startAt: null, durationSeconds: 24 * 3600 };
    expect(createScheduleCommand({ kind: "publish", intakeId: "i" }, body, "k")).toEqual({
      path: "/auction-intakes/i/publish",
      body: JSON.stringify(body),
      key: "k",
    });
    expect(createScheduleCommand({ kind: "reschedule", auctionId: "a" }, body, "k").path).toBe(
      "/auctions/a/schedule",
    );
  });
  it("matches auction filters correctly", async () => {
    const { matchesAuctionFilters, activeFilterCount, DEFAULT_AUCTION_FILTERS } = await import(
      "./auctions-model"
    );
    const item = auction({
      title: "Dế Mèn Phiêu Lưu Ký",
      pointName: "Điểm Thủ Đức",
      buyNowPrice: 500_000,
      currentPrice: 200_000,
      bidderCount: 1,
      endAt: new Date(start + 2 * 3600_000).toISOString(),
      book: {
        revisionId: "33333333-3333-4333-8333-333333333333",
        authors: ["Tô Hoài"],
        condition: "Good",
        photos: [],
      },
    });

    // Default filters match
    expect(matchesAuctionFilters(item, DEFAULT_AUCTION_FILTERS, start)).toBe(true);

    // Diacritic-insensitive search
    expect(matchesAuctionFilters(item, { ...DEFAULT_AUCTION_FILTERS, q: "de men" }, start)).toBe(true);
    expect(matchesAuctionFilters(item, { ...DEFAULT_AUCTION_FILTERS, q: "to hoai" }, start)).toBe(true);
    expect(matchesAuctionFilters(item, { ...DEFAULT_AUCTION_FILTERS, q: "nam cao" }, start)).toBe(false);

    // Filter by point
    expect(matchesAuctionFilters(item, { ...DEFAULT_AUCTION_FILTERS, point: "Điểm Thủ Đức" }, start)).toBe(true);
    expect(matchesAuctionFilters(item, { ...DEFAULT_AUCTION_FILTERS, point: "Điểm Quận 1" }, start)).toBe(false);

    // Filter by buy now
    expect(matchesAuctionFilters(item, { ...DEFAULT_AUCTION_FILTERS, buyNow: true }, start)).toBe(true);
    const noBuyNow = auction({ buyNowPrice: null });
    expect(matchesAuctionFilters(noBuyNow, { ...DEFAULT_AUCTION_FILTERS, buyNow: true }, start)).toBe(false);

    // Filter by condition
    expect(matchesAuctionFilters(item, { ...DEFAULT_AUCTION_FILTERS, conditions: ["Good"] }, start)).toBe(true);
    expect(matchesAuctionFilters(item, { ...DEFAULT_AUCTION_FILTERS, conditions: ["LikeNew"] }, start)).toBe(false);

    // Filter by price
    expect(matchesAuctionFilters(item, { ...DEFAULT_AUCTION_FILTERS, price: "100-300" }, start)).toBe(true);
    expect(matchesAuctionFilters(item, { ...DEFAULT_AUCTION_FILTERS, price: "lt100" }, start)).toBe(false);

    // Filter by ending time
    expect(matchesAuctionFilters(item, { ...DEFAULT_AUCTION_FILTERS, ending: "6h" }, start)).toBe(true);
    expect(matchesAuctionFilters(item, { ...DEFAULT_AUCTION_FILTERS, ending: "1h" }, start)).toBe(false);

    // Active filter count
    expect(activeFilterCount(DEFAULT_AUCTION_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_AUCTION_FILTERS, point: "A", buyNow: true })).toBe(2);
  });
});

describe("ADR 0079 bounded registration lifecycle", () => {
  const H = 3_600_000;
  const now = Date.parse("2026-10-13T00:00:00Z");
  const waiting = (over: Partial<PublicAuctionSummary> = {}) =>
    auction({
      openMode: "WhenReady",
      minBidders: 4,
      registeredCount: 1,
      bidderCount: 0,
      currentPrice: null,
      phase: "Scheduled",
      version: 3,
      scheduleRevision: 0,
      startAt: new Date(now + 20 * H).toISOString(),
      endAt: new Date(now + 44 * H).toISOString(),
      latestStartAt: new Date(now + 68 * H).toISOString(),
      ...over,
    });
  it("knows a waiting auction and is never open once the server says Ended", () => {
    expect(waitingForRegistrants(waiting(), now)).toBe(true);
    expect(waitingForRegistrants(waiting({ openMode: null }), now)).toBe(false);
    const expired = waiting({ phase: "Ended", startAt: new Date(now - H).toISOString() });
    expect(isOpen(expired, now)).toBe(false);
  });
  it("ADR 0081: publishing and rescheduling only offer times within the ceiling, never now", () => {
    const publish = startChoices(now, { ceiling: now + 72 * H });
    expect(publish.some((c) => c.at === null)).toBe(false);
    expect(publish.every((c) => c.at! <= now + 72 * H)).toBe(true);
    // ADR 0082: a month-long ceiling offers choices weeks ahead.
    const month = startChoices(now, { ceiling: now + 30 * 24 * H });
    expect(month.some((c) => c.at! > now + 20 * 24 * H)).toBe(true);
    expect(month.every((c) => c.at! <= now + 30 * 24 * H)).toBe(true);
    const move = startChoices(now, { ceiling: now + 4 * H });
    expect(move.some((c) => c.at === null)).toBe(false);
    expect(move.every((c) => c.at! <= now + 4 * H)).toBe(true);
  });
  it("reschedule: only while waiting, under 5 changes and outside the last 30 minutes", () => {
    expect(canReschedule(waiting(), now)).toBe(true);
    // ADR 0082: the open time changes at most twice.
    expect(canReschedule(waiting({ scheduleRevision: 1 }), now)).toBe(true);
    expect(canReschedule(waiting({ scheduleRevision: 2 }), now)).toBe(false);
    expect(canReschedule(waiting({ startAt: new Date(now + 20 * 60_000).toISOString() }), now)).toBe(false);
    expect(canReschedule(waiting({ phase: "Live", startAt: new Date(now - H).toISOString() }), now)).toBe(false);
    // ADR 0081: the open time counts, not the deadline; past it there is no move.
    const grace = { openMode: "ScheduledGrace" as const, startAt: new Date(now + 26 * H).toISOString() };
    expect(canReschedule(waiting({ ...grace, opensAt: new Date(now + 2 * H).toISOString() }), now)).toBe(true);
    expect(canReschedule(waiting({ ...grace, opensAt: new Date(now + 20 * 60_000).toISOString() }), now)).toBe(false);
    expect(canReschedule(waiting({ ...grace, opensAt: new Date(now - H).toISOString() }), now)).toBe(false);
  });
  it("ADR 0081: shows the open time, then the deadline once it passed with too few", () => {
    const opensAt = new Date(now + 2 * H).toISOString();
    const deadline = new Date(now + 26 * H).toISOString();
    const a = waiting({ openMode: "ScheduledGrace", opensAt, startAt: deadline });
    expect(waitingTime(a, now)).toEqual({ label: "Mở lúc", at: opensAt, endKnown: false });
    expect(waitingTime(a, now + 3 * H)).toEqual({ label: "Hạn đăng ký", at: deadline, endKnown: false });
    expect(waitingTime({ ...a, registeredCount: 4, startAt: opensAt }, now)).toEqual({ label: "Mở lúc", at: opensAt, endKnown: true });
    expect(openRuleText(a, now)).toMatch(/chờ thêm tới/);
    expect(openRuleText(a, now + 3 * H)).toMatch(/Đã qua giờ mở/);
    expect(closeReasonText({ ...a, closeReason: "RegistrationExpired" })).toMatch(/trong 24 giờ sau giờ mở/);
  });
  it("explains the open rule and every close reason", () => {
    expect(openRuleText(waiting())).toMatch(/tự mở ngay khi đủ 4 người/);
    expect(openRuleText(waiting({ openMode: "Scheduled" }))).toMatch(/nếu đủ 4 người/);
    expect(closeReasonText(waiting({ closeReason: "RegistrationExpired" }))).toMatch(/không đủ 4 người/);
    expect(closeReasonText(waiting({ closeReason: "SellerClosed" }))).toMatch(/Người bán đã đóng/);
    expect(closeReasonText(waiting({ closeReason: "HoldExpired" }))).toMatch(/hết thời gian tạm dừng/);
    expect(closeReasonText(waiting({ closeReason: "Reported" }))).toMatch(/báo cáo/);
    expect(closeReasonText(waiting())).toBeNull();
  });
  it("freezes seller commands with their version and key", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(JSON.parse(createSellerCommand(id, "LowerMin", 3, "k", 4).body)).toEqual({ expectedVersion: 3, minBidders: 4 });
    expect(createSellerCommand(id, "Close", 3, "k").path).toBe(`/auctions/${id}/close`);
  });
});

// ADR 0085 (N1): withdrawing is allowed below the minimum, or from a full
// auction until 72 h before its open time; never after the member bid.
describe("canWithdrawRegistration", () => {
  const now = Date.parse("2026-11-09T03:00:00.000Z");
  const auction = (over: Partial<PublicAuctionSummary> = {}) =>
    ({ state: "Active", phase: "Scheduled", minBidders: 4, registeredCount: 3, fullWithdrawUntil: null, ...over }) as PublicAuctionSummary;
  const me = (over: Partial<Participation> = {}) => ({ registrationState: "Registered", alias: null, ...over }) as Participation;
  it("is allowed below the minimum", () => {
    expect(canWithdrawRegistration(auction(), me(), now)).toBe(true);
  });
  it("is allowed from a full auction only before fullWithdrawUntil", () => {
    const full = auction({ registeredCount: 4, fullWithdrawUntil: new Date(now + 60_000).toISOString() });
    expect(canWithdrawRegistration(full, me(), now)).toBe(true);
    expect(canWithdrawRegistration(full, me(), now + 60_000)).toBe(false);
    expect(canWithdrawRegistration(auction({ registeredCount: 4 }), me(), now)).toBe(false);
  });
  it("is refused after a bid, when not registered, or once ended", () => {
    expect(canWithdrawRegistration(auction(), me({ alias: 1 }), now)).toBe(false);
    expect(canWithdrawRegistration(auction(), me({ registrationState: "Withdrawn" }), now)).toBe(false);
    expect(canWithdrawRegistration(auction(), null, now)).toBe(false);
    expect(canWithdrawRegistration(auction({ phase: "Ended" }), me(), now)).toBe(false);
  });
});
