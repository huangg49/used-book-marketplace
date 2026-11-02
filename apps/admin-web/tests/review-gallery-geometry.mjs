import assert from "node:assert/strict";

// Page overflow alone cannot detect a tall thumbnail painting over its caption.
// Check the actual image, caption and next section rectangles after bytes load.
export async function assertReviewThumbnailGeometry(page, expectedCount) {
  const strip = page.locator('[aria-label="Chọn ảnh người đăng gửi"]');
  const metrics = await strip.evaluate((element) => {
    const photos = [...element.querySelectorAll("figure")].map((figure) => {
      const image = figure.querySelector("img");
      const button = figure.querySelector("button");
      const caption = figure.querySelector("figcaption");
      if (!image?.complete || !image.naturalWidth || !button || !caption)
        return { loaded: false, contained: false, captionClear: false };
      const i = image.getBoundingClientRect();
      const b = button.getBoundingClientRect();
      const c = caption.getBoundingClientRect();
      return {
        loaded: true,
        contained: i.top >= b.top - 1 && i.bottom <= b.bottom + 1 &&
          i.left >= b.left - 1 && i.right <= b.right + 1,
        captionClear: c.top >= Math.max(i.bottom, b.bottom) + 4,
      };
    });
    const next = element.closest("section")?.nextElementSibling;
    return {
      photos,
      nextSectionClear: !next || element.getBoundingClientRect().bottom <= next.getBoundingClientRect().top,
    };
  });
  assert.equal(metrics.photos.length, expectedCount);
  assert(metrics.photos.every((p) => p.loaded), "Wait for real image load before checking geometry");
  assert(metrics.photos.every((p) => p.contained), "Thumbnail extends outside its button");
  assert(metrics.photos.every((p) => p.captionClear), "Thumbnail overlaps its caption");
  assert(metrics.nextSectionClear, "Thumbnail strip overlaps the next section");
  return metrics;
}
