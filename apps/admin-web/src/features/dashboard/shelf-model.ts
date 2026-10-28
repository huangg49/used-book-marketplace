import type { Listing, Metadata } from "../review/contracts";

export function shelfTitle(item: Listing, metadata?: Metadata) {
  return (
    item.currentRevision.content.bundle?.title ||
    metadata?.title ||
    `Bài đăng #${item.id.slice(0, 8)}`
  );
}

export function selectedShelfItem(items: Listing[], id: string | null) {
  return items.find((item) => item.id === id) ?? items[0];
}

// Pending catalog requests are private to ADMIN. A Staff shelf must never
// attempt that read, even if its listing already contains a book reference.
export function shelfReference(item: Listing, admin: boolean) {
  const id = item.currentRevision.content.bookId;
  if (!id || item.currentRevision.content.bundle) return null;
  if (item.catalogStatus === "Confirmed")
    return { id, confirmed: true, path: `/catalog/books/${id}` };
  if (admin && item.catalogStatus === "Pending")
    return { id, confirmed: false, path: `/operations/catalog-requests/${id}` };
  return null;
}
