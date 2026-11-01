import { describe, expect, it } from "vitest";
import { ApiError, type SessionClient } from "../../core/api/session-client";
import {
  appendBundleRange,
  bundleCondition,
  bundleError,
  type BookBundle,
} from "./book-bundle";
import { draftContent, emptyContent } from "../drafts/contracts";
import {
  fromContent,
  toContent,
  validateForm,
  errorStep,
} from "../drafts/listing-form";
import { listingIntent, runListingIntent } from "../drafts/listing-command";
const bundle = (): BookBundle => ({
  title: "Bộ tập 1 và 3",
  wholeOnly: true,
  exclusiveOwnershipDeclared: true,
  items: [
    { label: "Tập 1", condition: "Good", notes: "Bút chì trang 4" },
    { label: "Tập 3", condition: "Fair", notes: "Sờn gáy" },
  ],
});

describe("whole bundle editing and frozen listing intent", () => {
  it("retains every component and defect through owner schema and form round trip", () => {
    const source = {
      ...emptyContent,
      mode: "Sale" as const,
      condition: "Fair" as const,
      bundle: bundle(),
    };
    const form = fromContent(draftContent.parse(source));
    form.bundle!.items[1].notes = "Ghi chú mới";
    expect(source.bundle.items[1].notes).toBe("Sờn gáy");
    expect(toContent(form).bundle).toEqual(form.bundle);
    expect(toContent(form).bundle?.items.map((i) => i.label)).toEqual([
      "Tập 1",
      "Tập 3",
    ]);
  });
  it("appends a range without dropping noncontiguous books or resetting their defects", () => {
    const source = bundle();
    source.items.push({
      label: "Ngoại truyện",
      condition: "Worn",
      notes: "Thiếu áo bìa",
    });
    const next = appendBundleRange(source, "1", "4");
    expect(next.items.map((i) => i.label)).toEqual([
      "Tập 1",
      "Tập 3",
      "Ngoại truyện",
      "Tập 2",
      "Tập 4",
    ]);
    expect(next.items.slice(0, 3)).toEqual(source.items);
    expect(source.items).toHaveLength(3);
    expect(bundleCondition(next)).toBe("Worn");
    expect(bundleError(next)).toBeUndefined();
  });
  it("recognizes equivalent labels, keeps incomplete edits, and rejects an overflowing range atomically", () => {
    const source = bundle();
    source.items[0].label = " TẬP 1 ";
    source.items.push({
      label: "",
      condition: "Good",
      notes: "Ghi chú cần đặt tên",
    });
    const next = appendBundleRange(source, "1", "2");
    expect(
      next.items.filter((i) => i.label.trim().toLowerCase() === "tập 1"),
    ).toHaveLength(1);
    expect(next.items.some((i) => i.notes === "Ghi chú cần đặt tên")).toBe(
      true,
    );
    const before = JSON.stringify(source);
    expect(() => appendBundleRange(source, "1", "50")).toThrow("50");
    expect(JSON.stringify(source)).toBe(before);
  });
  it.each([
    ["", "2"],
    ["1", "1"],
    ["1e1", "20"],
    ["0", "2"],
    ["1", "51"],
  ])("rejects invalid range %s..%s", (from, to) => {
    expect(() => appendBundleRange(bundle(), from, to)).toThrow();
  });
  it("flags invalid manifest on the first step and prevents mode/condition mismatch even for draft save", () => {
    const form = fromContent({
      ...emptyContent,
      bundle: bundle(),
      mode: "Both",
      condition: "LikeNew",
    });
    const errors = validateForm(form, [], false, false);
    expect(errors.mode).toBeDefined();
    expect(errors.condition).toBeDefined();
    form.bundle!.items[1].label = " tập 1 ";
    const invalid = validateForm(form, [], false, false);
    expect(invalid.bundle).toBeDefined();
    expect(errorStep(invalid)).toBe(0);
  });
  it("replays an exact bundle after lost save ACK even if the editor has changed", async () => {
    const content = {
      ...emptyContent,
      bundle: bundle(),
      mode: "Sale" as const,
      condition: "Fair" as const,
    };
    const command = listingIntent(
      "listing",
      5,
      content,
      false,
      () => "same-key",
    );
    const calls: RequestInit[] = [];
    const client = {
      request: async (path: string, _schema: unknown, init: RequestInit) => {
        if (path.endsWith("/draft")) {
          calls.push(init);
          throw new ApiError(0, "NETWORK_ERROR", "Lost ACK");
        }
      },
    } as unknown as Pick<SessionClient, "request">;
    await expect(runListingIntent(client, command)).rejects.toThrow();
    content.bundle.items.pop();
    content.bundle.title = "Đã thay đổi";
    await expect(runListingIntent(client, command)).rejects.toThrow();
    expect(calls[0]).toEqual(calls[1]);
    expect(JSON.parse(calls[1].body as string).content.bundle).toEqual(
      bundle(),
    );
  });
});
