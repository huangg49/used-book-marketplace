import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PointCapacity } from "./PointCapacity";

const point = { id: "qa", name: "Điểm giao nhận", capacity: 20, heldSlots: 0, status: "Active" };
describe("point capacity as a truthful visual measurement", () => {
  it("shows zero occupancy rather than invented filled places", () => {
    const html = renderToStaticMarkup(<PointCapacity point={point} />);
    expect(html).toContain('aria-label="Điểm giao nhận: 0 trên 20 chỗ đang giữ"');
    expect(html).toContain('<rect width="0" height="16"');
    expect(html).toContain("Đang hoạt động");
  });
  it("keeps exact fractional occupancy and bounded geometry for large capacities", () => {
    const html = renderToStaticMarkup(<PointCapacity point={{ ...point, capacity: 1000, heldSlots: 125 }} />);
    expect(html).toContain('<rect width="40" height="16"');
    expect(html.match(/<rect /g)).toHaveLength(81); // 40 divisions × 2 + one clip
    expect(html).toContain("125 trên 1000 chỗ đang giữ");
  });
  it("retains over-capacity counts and paused status while bounding the graphic", () => {
    const html = renderToStaticMarkup(<PointCapacity point={{ ...point, heldSlots: 23, status: "Paused" }} />);
    expect(html).toContain("23 trên 20 chỗ đang giữ");
    expect(html).toContain("Tạm dừng · Vượt sức chứa");
    expect(html).toContain('<rect width="320" height="16"');
  });
});
