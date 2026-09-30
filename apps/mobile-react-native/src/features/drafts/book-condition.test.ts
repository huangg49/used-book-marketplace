import type { components } from "@used-books/api-contract";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import { bookCondition, conditionOptions } from "./book-condition";
import {
  draftContent,
  draftPage,
  emptyContent,
  privateDraft,
} from "./contracts";
import { fromContent, toContent, validateForm } from "./listing-form";

const response = (condition: unknown) => ({
  id: "00000000-0000-4000-8000-000000000001",
  version: 1,
  createdAt: "2026-09-30T03:20:00.000Z",
  catalogStatus: null,
  latestDecision: null,
  removalReason: null,
  state: {
    moderation: "Draft",
    visibility: "Hidden",
    trade: "Available",
    deletedAt: null,
  },
  currentRevision: {
    id: "00000000-0000-4000-8000-000000000002",
    content: { ...emptyContent, condition },
  },
});

describe("draft book conditions", () => {
  it("keeps the accepted values equal to the generated API contract", () => {
    expectTypeOf<z.infer<typeof bookCondition>>().toEqualTypeOf<
      components["schemas"]["BookCondition"]
    >();
  });

  it.each(["LikeNew", "Good", "Fair", "Worn"])(
    "reads and round-trips a %s draft without replacing its condition",
    (condition) => {
      const draft = privateDraft.parse(response(condition));
      const form = fromContent(draft.currentRevision.content);
      expect(form.condition).toBe(condition);
      expect(toContent(form).condition).toBe(condition);
      expect(validateForm(form, [], false, false)).toEqual({});
      expect(
        conditionOptions.find((item) => item.value === condition)?.label,
      ).toBeTruthy();
    },
  );

  it("reads a page containing Worn alongside other conditions", () => {
    const page = draftPage.parse({
      items: [response("Good"), response("Worn")],
      nextCursor: null,
    });
    expect(
      page.items.map((item) => item.currentRevision.content.condition),
    ).toEqual(["Good", "Worn"]);
  });

  it.each(["Unknown", "worn", "", 4])(
    "rejects unsupported condition %s instead of changing it silently",
    (condition) => {
      expect(privateDraft.safeParse(response(condition)).success).toBe(false);
    },
  );

  it("still accepts an incomplete draft with no condition", () => {
    expect(draftContent.parse(emptyContent).condition).toBeNull();
  });
});
