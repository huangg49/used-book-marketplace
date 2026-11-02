import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ListingTitle } from "./ListingTitle";
import type { Listing } from "./contracts";

describe("listing title after main integration", () => {
  it.each([true, false])("keeps confirmed=%s titles in separate reference caches", (confirmed) => {
    const bookId = crypto.randomUUID();
    const client = new QueryClient();
    client.setQueryData(["book-title", confirmed, bookId, true], { title: "Correct reference" });
    client.setQueryData(["book-title", !confirmed, bookId, true], { title: "Wrong reference" });
    const value = {
      id: crypto.randomUUID(),
      catalogStatus: confirmed ? "Confirmed" : "Pending",
      currentRevision: { content: { bookId } },
    } as Listing;
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}><ListingTitle value={value} canReadPendingCatalog /></QueryClientProvider>,
    );
    expect(html).toContain("Correct reference");
    expect(html).not.toContain("Wrong reference");
    client.clear();
  });
  it("does not expose a pending catalog title or author from a privileged cache to Staff", () => {
    const bookId = crypto.randomUUID();
    const client = new QueryClient();
    const metadata = { title: "Private catalog title", authors: ["Private catalog author"] };
    client.setQueryData(["book-title", false, bookId, true], metadata);
    // Even accidentally populated disabled-query data must never be displayed.
    client.setQueryData(["book-title", false, bookId, false], metadata);
    const value = {
      id: crypto.randomUUID(),
      catalogStatus: "Pending",
      currentRevision: { content: { bookId } },
    } as Listing;
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}><ListingTitle value={value} showAuthor /></QueryClientProvider>,
    );
    expect(html).toContain("Sách chờ xác nhận đầu sách");
    expect(html).not.toContain(metadata.title);
    expect(html).not.toContain(metadata.authors[0]);
    client.clear();
  });
});
