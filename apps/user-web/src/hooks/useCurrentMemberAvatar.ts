import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  readMemberProfile,
  profileAvatarReadSchema,
} from "@used-books/session-client";
import { session } from "../lib/session";
import { useSession } from "./useSession";

export function useCurrentMemberAvatar() {
  const auth = useSession();
  const [failedSource, setFailedSource] = useState<{ ownerId: string; avatarId: string; url: string }>();
  const ownerId = auth.status === "authenticated" ? auth.user.id : undefined;

  const profileQuery = useQuery({
    queryKey: ["member-profile", ownerId],
    queryFn: () => readMemberProfile(session),
    enabled: !!ownerId,
    staleTime: 60_000,
  });

  const avatarId = profileQuery.data?.avatarId;

  const avatarQuery = useQuery({
    queryKey: ["profile-avatar", ownerId, avatarId],
    queryFn: () =>
      session.request(
        `/me/profile/avatar-uploads/${avatarId}/read`,
        profileAvatarReadSchema,
      ),
    enabled: Boolean(ownerId && avatarId),
    staleTime: 60_000,
  });

  const displayName =
    profileQuery.data?.displayName ??
    (auth.status === "authenticated" ? auth.user.displayName : "");

  const initial =
    Array.from(displayName.trim())[0]?.toLocaleUpperCase("vi-VN") || "L";

  const sourceUrl = avatarQuery.data?.url;
  // Renewing a signed URL does not change the avatar ID.
  const failed = failedSource?.ownerId === ownerId &&
    failedSource?.avatarId === avatarId && failedSource?.url === sourceUrl;
  const avatarUrl = avatarId && sourceUrl && !failed ? sourceUrl : null;

  return {
    avatarUrl,
    avatarId,
    displayName,
    initial,
    isLoading:
      profileQuery.isPending || (Boolean(avatarId) && avatarQuery.isPending),
    onImageError: () => {
      if (ownerId && avatarId && sourceUrl) setFailedSource({ ownerId, avatarId, url: sourceUrl });
    },
  };
}
