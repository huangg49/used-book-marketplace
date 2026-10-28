import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AquariumMetric } from "./AquariumMetric";

describe("aquarium metric data remains independent of illustration", () => {
  it("distinguishes unavailable and zero, retaining staff scope", () => {
    const missing = renderToStaticMarkup(<AquariumMetric value={null} catalog={false} />);
    const zero = renderToStaticMarkup(<AquariumMetric value={0} catalog={false} />);
    expect(missing).toMatch(/<dd[^>]*>—<\/dd>/); expect(zero).toMatch(/<dd[^>]*>0<\/dd>/);
    expect(zero).not.toContain("và đầu sách");
    expect(zero).toContain("Cá là hình trang trí, không biểu thị số hồ sơ.");
  });
  it("renders the supplied count as readable DOM text while assets are unavailable", () => {
    const html = renderToStaticMarkup(<AquariumMetric value={123456} catalog />);
    expect(html).toMatch(/<dd[^>]*>123456<\/dd>/);
    expect(html).toContain("Bài đăng sách và đầu sách");
    expect(html).toContain('aria-label="Tạm dừng chuyển động bể cá"');
    expect(html).toContain('aria-hidden="true"');
  });
});
