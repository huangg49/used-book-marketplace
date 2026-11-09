import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createDraftAttempt } from "../../services/listing-submission";
import { PhotoAutofill } from ".";

vi.mock("../../services/api", () => ({ session: { request: vi.fn() } }));

describe("photo autofill panel", () => {
  it("starts with a labelled photo picker and reveals read actions only after adding photos", () => {
    const onUseField = vi.fn();
    const onPickBook = vi.fn();
    const html = renderToStaticMarkup(
      <PhotoAutofill
        attempt={createDraftAttempt()}
        onUseField={onUseField}
        onPickBook={onPickBook}
      />,
    );
    expect(html).toContain('aria-labelledby="photo-autofill-title"');
    expect(html).toContain("Điền nhanh từ ảnh");
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(html).toContain("Chọn ảnh");
    expect(html).not.toContain("Đọc thông tin");
    expect(html).not.toContain("Gợi ý từ ảnh");
    expect(onUseField).not.toHaveBeenCalled();
    expect(onPickBook).not.toHaveBeenCalled();
  });

  it("locks every control while the listing is being submitted", () => {
    const html = renderToStaticMarkup(
      <PhotoAutofill
        attempt={createDraftAttempt()}
        disabled
        onUseField={() => undefined}
        onPickBook={() => undefined}
      />,
    );
    expect(html).toContain('aria-disabled="true"');
    expect(html).toMatch(/<input[^>]*type="file"[^>]*disabled=""/);
  });
});
