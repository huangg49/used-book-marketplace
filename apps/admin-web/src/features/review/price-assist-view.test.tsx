import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { priceAssistReview } from "./contracts";
import { PriceAssistView } from "./price-assist-view";

const value = priceAssistReview.parse({
  suggestionId: "3f1c2a7e-9b1d-4c2e-8f3a-1b2c3d4e5f60",
  range: { low: 42000, high: 63000 },
  evidenceLevel: "Limited",
  model: "gemini-3.8-flash",
  input: { condition: "Good", readable: true, hasMissingPages: false, missingEssentialContent: false },
  applied: true,
  chosenSalePrice: 50000,
  withinRange: true,
  decidedAt: "2026-10-06T03:00:00.000Z",
  sources: [
    {
      ref: "s1",
      kind: "OnlineRetail",
      label: "fahasa.com",
      amount: 105000,
      condition: null,
      observedAt: "2026-10-05T03:00:00.000Z",
      url: "https://www.fahasa.com/de-men.html",
      excluded: null,
    },
    {
      ref: "s2",
      kind: "InternalAsking",
      label: "Giá rao trên Lật lại",
      amount: 300000,
      condition: "Good",
      observedAt: "2026-10-01T03:00:00.000Z",
      url: null,
      excluded: "AskingPrice",
    },
  ],
});

describe("price assist review block", () => {
  it("shows the applied suggestion, the declared condition and linked sources", () => {
    const html = renderToStaticMarkup(<PriceAssistView value={value} />);
    expect(html).toContain("Người bán đã dùng gợi ý");
    expect(html).toContain("Còn tốt");
    expect(html).toContain('href="https://www.fahasa.com/de-men.html"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("không dùng tính khoảng giá");
  });

  it("flags a manual price outside the range", () => {
    const html = renderToStaticMarkup(
      <PriceAssistView value={{ ...value, applied: false, chosenSalePrice: 90000, withinRange: false }} />,
    );
    expect(html).toContain("Người bán tự đặt giá");
    expect(html).toContain("nằm ngoài khoảng gợi ý");
  });
});
