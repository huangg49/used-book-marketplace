import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./public-listings", () => ({ getPublicListings: vi.fn() }));
import { getPublicListings } from "./public-listings";
import {
  getHomeShelf,
  homeShelfUrl,
  isCatalogPreview,
  previewShelf,
} from "./home-shelves";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("explicit Home catalog preview boundary", () => {
  it("requires explicit opt-in and never runs in a production build", () => {
    vi.stubEnv("VITE_CATALOG_PREVIEW", "false");
    expect(isCatalogPreview("")).toBe(false);
    expect(isCatalogPreview("?data=preview")).toBe(true);
    vi.stubEnv("VITE_CATALOG_PREVIEW", "true");
    expect(isCatalogPreview("")).toBe(true);
    expect(isCatalogPreview("?data=live")).toBe(false);
    vi.stubEnv("DEV", false);
    expect(isCatalogPreview("?data=preview")).toBe(false);
  });
  it("keeps backend failures visible rather than falling back to samples", async () => {
    vi.mocked(getPublicListings).mockRejectedValue(new Error("offline"));
    await expect(getHomeShelf(new URLSearchParams(), false)).rejects.toThrow(
      "offline",
    );
  });
  it("shows preview without calling listings or inventing seller/media IDs", async () => {
    const result = await getHomeShelf(new URLSearchParams(), true);
    expect(result.items).toHaveLength(48);
    expect(getPublicListings).not.toHaveBeenCalled();
    expect(
      result.items.every(
        (book) =>
          "preview" in book &&
          book.preview &&
          !("seller" in book) &&
          !("photos" in book),
      ),
    ).toBe(true);
    expect(new Set(result.items.map((book) => book.id)).size).toBe(48);
    expect(
      result.items.every(
        (book) =>
          !/sword art|one piece|apothecary|alice|lord of the rings/i.test(
            book.book.title,
          ),
      ),
    ).toBe(true);
  });
  it("filters sample modes, price and searches including ISBN", () => {
    const all = previewShelf(new URLSearchParams()).items;
    const sale = previewShelf(
      new URLSearchParams({ mode: "Sale", maxSalePrice: "50000" }),
    ).items;
    expect(sale.length).toBeGreaterThan(0);
    expect(
      sale.every(
        (book) =>
          book.mode !== "Exchange" &&
          book.salePrice !== null &&
          book.salePrice <= 50000,
      ),
    ).toBe(true);
    const exchange = previewShelf(
      new URLSearchParams({ mode: "Exchange" }),
    ).items;
    expect(
      exchange.every(
        (book) => book.mode !== "Sale" && book.exchangeValue !== null,
      ),
    ).toBe(true);
    const isbn = all.find((book) => book.book.isbn)?.book.isbn;
    expect(previewShelf(new URLSearchParams({ q: isbn! })).items).toHaveLength(
      1,
    );
    expect(
      previewShelf(new URLSearchParams({ q: "not-a-real-book-xyz" })).items,
    ).toHaveLength(0);
  });
  it("never routes preview editions to real listing detail IDs", () => {
    expect(homeShelfUrl({ mode: "Sale" }, true)).toBe(
      "/?data=preview&mode=Sale#latest-title",
    );
    expect(homeShelfUrl({ mode: "Sale" }, false)).toBe("/books?mode=Sale");
  });
});
