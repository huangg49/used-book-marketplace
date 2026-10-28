import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { moderationOverview, overviewSeries, type Overview } from "./overview";
import { ModerationChart } from "./ModerationChart";
const fixture = (): Overview => ({ days: 7, timezone: "Asia/Ho_Chi_Minh", startAt: "2026-10-20T17:00:00Z", serverTime: "2026-10-27T08:00:00Z", pending: { listings: 41, catalog: 3 }, daily: Array.from({ length: 7 }, (_, i) => ({ date: "2026-10-" + String(21 + i), listingSubmitted: i, listingApproved: 1, listingRejected: 2, catalogSubmitted: 2, catalogConfirmed: 3, catalogRejected: 1 })) });
describe("moderation dashboard arithmetic and chart alternatives", () => {
  it("aggregates disjoint revision events while keeping current pending independent", () => {
    const value = fixture(), rows = overviewSeries(value, "all");
    expect(rows[6]).toMatchObject({ submitted: 8, approved: 4, rejected: 3, processed: 7 });
    expect(rows.reduce((sum, row) => sum + row.submitted, 0)).toBe(35);
    expect(value.pending).toEqual({ listings: 41, catalog: 3 });
  });
  it("filters series without mixing catalog decisions into listing counts", () => {
    expect(overviewSeries(fixture(), "listings")[6]).toMatchObject({ submitted: 6, approved: 1, rejected: 2, processed: 3 });
    expect(overviewSeries(fixture(), "catalog")[6]).toMatchObject({ submitted: 2, approved: 3, rejected: 1, processed: 4 });
  });
  it("keeps unauthorized catalog metrics null, without displaying a catalog filter", () => {
    const data = fixture(); data.pending.catalog = null;
    data.daily = data.daily.map(row => ({ ...row, catalogSubmitted: null, catalogConfirmed: null, catalogRejected: null }));
    expect(overviewSeries(data, "all")).toEqual(overviewSeries(data, "listings"));
    expect(renderToStaticMarkup(<ModerationChart data={data} />)).not.toContain("Loại hồ sơ");
  });
  it("rejects mismatched periods and malformed data rather than drawing fake zeroes", () => {
    expect(moderationOverview.safeParse({ ...fixture(), days: 30 }).success).toBe(false);
    const data = fixture(); data.daily[0].listingSubmitted = -1;
    expect(moderationOverview.safeParse(data).success).toBe(false);
  });
  it("provides a full data table and keyboard day controls, and an honest zero state", () => {
    const data = fixture(); data.daily = data.daily.map(row => ({ ...row, listingSubmitted: 0, listingApproved: 0, listingRejected: 0, catalogSubmitted: 0, catalogConfirmed: 0, catalogRejected: 0 }));
    const html = renderToStaticMarkup(<ModerationChart data={data} />);
    expect(html).toContain("Chưa có lượt gửi hoặc quyết định");
    expect(html).toContain("Xem bảng số liệu");
    expect(html.match(/<tbody><tr>|<\/tr><tr>/g)).toHaveLength(7);
    expect(html).toContain('aria-label="Xem ngày trước"');
    expect(html).not.toContain("% tăng");
  });
});
