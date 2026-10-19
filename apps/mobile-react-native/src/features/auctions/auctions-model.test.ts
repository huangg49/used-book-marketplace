import { describe, expect, it } from "vitest";
import {
  amountError,
  autoFloor,
  bidOptions,
  createAuctionCommand,
  createOrderCommand,
  auctionEligible,
  intakePriceErrors,
  receiptMessage,
  standingOf,
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
  it("keeps bids on the start + n·step grid between the floor and the cap", () => {
    expect(amountError(null, 350_000, 200_000, 50_000)).toMatch(/Nhập/);
    expect(amountError(300_000, 350_000, 200_000, 50_000)).toMatch(/Tối thiểu/);
    expect(amountError(370_000, 350_000, 200_000, 50_000)).toMatch(/400\.000/);
    expect(amountError(1_050_000, 350_000, 200_000, 50_000)).toMatch(/Tối đa/);
    expect(amountError(400_000, 350_000, 200_000, 50_000)).toBeNull();
  });
  it("offers quick picks from the minimum and stops at the cap", () => {
    expect(bidOptions(350_000, 50_000)).toEqual([350_000, 400_000, 450_000]);
    expect(bidOptions(950_000, 50_000)).toEqual([950_000, 1_000_000]);
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

describe("DauGia-App Curated Auctions Data", () => {
  it("ensures all curated auctions strictly satisfy the publicAuctionSummary Zod schema", async () => {
    const { CURATED_SAIGON_AUCTIONS } = await import("./auctions-data");
    const { publicAuctionSummary } = await import("./contracts");

    expect(CURATED_SAIGON_AUCTIONS.length).toBeGreaterThanOrEqual(5);

    for (const item of CURATED_SAIGON_AUCTIONS) {
      const parsed = publicAuctionSummary.safeParse(item);
      expect(parsed.success).toBe(true);
      expect(item.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(item.listingId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(item.coverUrl).toBeTruthy();
      expect(item.currentPrice).toBeGreaterThan(0);
      expect(item.startPrice).toBeGreaterThan(0);
    }
  });
});
