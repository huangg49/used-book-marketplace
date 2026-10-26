import { session } from "./api";
import { z } from "zod";
import { rememberCommands, upload } from "./listing-submission";
import type { RevisionContent } from "../lib/owner-listing-edit";

const receipt = z.object({
  entityId: z.string().uuid(),
  version: z.number().int(),
});

export type RevisionPhoto =
  | { kind: "existing"; id: string }
  | { kind: "new"; file: File };

export type ListingRevisionInput = {
  listingId: string;
  version: number;
  photos: RevisionPhoto[];
  content: Omit<RevisionContent, "mediaIds">;
};

// Edit of an Approved listing (SRS §7.2): creates one PendingReview revision.
// Reuse the returned runner for retries: acknowledged stages and the
// Idempotency-Key of a lost response are kept, so no second revision appears.
// Uploads and revise both use the listing's current version; a stale version
// is answered by the server with a conflict and is never rebased here.
export function createListingRevision(value: ListingRevisionInput) {
  const input = { ...value, content: structuredClone(value.content), photos: value.photos.map(photo => ({ ...photo })) };
  const remember = rememberCommands();
  return async () => {
    if (!input.photos.length) throw new Error("Cần ít nhất một ảnh sách.");
    const mediaIds: string[] = [];
    let index = 0;
    for (const photo of input.photos.slice(0, 8)) {
      if (photo.kind === "existing") mediaIds.push(photo.id);
      else {
        mediaIds.push(
          await upload(
            input.listingId,
            input.version,
            photo.file,
            remember,
            index,
          ),
        );
      }
      index += 1;
    }
    return remember("revise", (key) =>
      session.request(`/listings/${input.listingId}/revision`, receipt, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({
          expectedVersion: input.version,
          content: { ...input.content, mediaIds },
          ownershipDeclared: true,
        }),
      }),
    );
  };
}
