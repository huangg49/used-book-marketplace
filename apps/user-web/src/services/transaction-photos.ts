import { queryOptions } from "@tanstack/react-query";
import { PUBLIC_MEDIA_GC_MS, signedMediaRemainingMs, signedMediaStaleTime } from "@used-books/session-client";
import { z } from "zod";
import { session } from "./api";

const photoSchema = z.object({
  url: z.string().url(),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});

export function transactionPhotoOptions(queryKey: readonly unknown[], path: string) {
  return queryOptions({
    queryKey,
    queryFn: async () => {
      const photo = await session.request(path, photoSchema);
      if (photo.expiresAt && !signedMediaRemainingMs(photo.expiresAt)) {
        throw new Error("The transaction image link expired before it arrived.");
      }
      return photo;
    },
    staleTime: query => signedMediaStaleTime(query.state.data?.expiresAt, query.state.dataUpdatedAt),
    refetchInterval: query => query.state.status === "success"
      ? signedMediaRemainingMs(query.state.data?.expiresAt) || false
      : false,
    gcTime: PUBLIC_MEDIA_GC_MS,
    retry: false,
  });
}
