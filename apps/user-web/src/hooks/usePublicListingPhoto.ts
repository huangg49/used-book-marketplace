import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PUBLIC_MEDIA_GC_MS,
  signedMediaRemainingMs,
  signedMediaStaleTime,
} from "@used-books/session-client";
import { getPublicPhoto } from "../services/public-listings";

const subscribeVisibility = (notify: () => void) => {
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
};

export function publicListingPhotoOptions(
  listingId: string,
  revisionId: string,
  photoId: string,
) {
  return {
    queryKey: ["public-listing-photo", listingId, revisionId, photoId],
    queryFn: () => getPublicPhoto(listingId, photoId),
    staleTime: (query: {
      state: { data?: { expiresAt: string }; dataUpdatedAt: number };
    }) =>
      signedMediaStaleTime(
        query.state.data?.expiresAt,
        query.state.dataUpdatedAt,
      ),
    gcTime: PUBLIC_MEDIA_GC_MS,
    retry: false as const,
  };
}

export function usePublicListingPhoto(
  listingId: string,
  revisionId: string,
  photoId: string | undefined,
  active: boolean,
) {
  const [expired, setExpired] = useState("");
  const visible = useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== "hidden",
    () => true,
  );
  const enabled = active && visible;
  const photo = useQuery({
    ...publicListingPhotoOptions(listingId, revisionId, photoId ?? ""),
    enabled: enabled && !!photoId,
  });
  const expiry = photo.data?.expiresAt;
  const refetch = photo.refetch;
  useEffect(() => {
    if (!enabled || !expiry) return;
    const remaining = signedMediaRemainingMs(expiry);
    if (!remaining) return;
    const timer = setTimeout(() => {
      setExpired(expiry);
      void refetch({ cancelRefetch: false });
    }, remaining);
    return () => clearTimeout(timer);
  }, [enabled, expiry, refetch]);
  const usable =
    !photo.isError && expiry !== expired && signedMediaRemainingMs(expiry) > 0;
  return { ...photo, url: usable ? photo.data?.url : undefined };
}
