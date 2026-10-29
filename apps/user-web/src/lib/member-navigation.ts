/** Select the destination by the current task, preserving search/filter URLs. */
export function memberNavigationSection(pathname: string, search: string) {
  if (pathname === "/auctions" || pathname.startsWith("/auctions/")) return "auction";
  if (pathname === "/exchange" || pathname.startsWith("/exchange/")) return "exchange";
  if (pathname === "/books")
    return new URLSearchParams(search).get("mode") === "Exchange" ? "exchange" : "books";
  if (pathname.startsWith("/books/")) return "books";
  return undefined;
}
