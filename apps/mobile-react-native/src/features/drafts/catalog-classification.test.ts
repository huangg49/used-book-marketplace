import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  catalogClassificationFields,
  classificationForResubmit,
} from "./catalog-classification";
describe("catalog classification across clients", () => {
  const schema = z.object({
    category: z.string(),
    ...catalogClassificationFields,
  });
  it("retains reviewed web fields when RN edits and resubmits a rejected request", () => {
    const parsed = schema.parse({
      category: "Marketing / bán hàng",
      categoryId: "business.marketing",
      attributes: { businessTopic: ["branding"] },
      series: null,
    });
    const next = classificationForResubmit(parsed);
    expect(next).toEqual({
      categoryId: "business.marketing",
      attributes: { businessTopic: ["branding"] },
      series: null,
    });
    parsed.attributes!.businessTopic.push("sales");
    expect(next.attributes!.businessTopic).toEqual(["branding"]);
  });
  it("keeps old requests valid and rejects unknown classification IDs", () => {
    expect(
      classificationForResubmit(schema.parse({ category: "Văn học" })),
    ).toEqual({});
    expect(() =>
      schema.parse({ category: "Sách mới", categoryId: "invented" }),
    ).toThrow();
  });
});
