import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ListingTitle } from "./ListingTitle";
import type { Listing } from "./contracts";

describe("listing title after main integration", () => {
  it.each([true, false])("keeps confirmed=%s titles in separate reference caches", (confirmed) => {
    const bookId = crypto.randomUUID();
    const client = new QueryClient();
    client.setQueryData(["book-title", confirmed, bookId], { title: "Correct reference" });
    client.setQueryData(["book-title", !confirmed, bookId], { title: "Wrong reference" });
    const value = {
      id: crypto.randomUUID(),
      catalogStatus: confirmed ? "Confirmed" : "Pending",
      currentRevision: { content: { bookId } },
    } as Listing;
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}><ListingTitle value={value} /></QueryClientProvider>,
    );
    expect(html).toContain("Correct reference");
    expect(html).not.toContain("Wrong reference");
    client.clear();
  });
});
