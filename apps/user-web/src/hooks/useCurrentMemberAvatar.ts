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
  const [failedAvatarId, setFailedAvatarId] = useState<string | null>(null);
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

  const avatarUrl =
    avatarId && failedAvatarId !== avatarId && avatarQuery.data?.url
      ? avatarQuery.data.url
      : null;

  return {
    avatarUrl,
    avatarId,
    displayName,
    initial,
    isLoading:
      profileQuery.isPending || (Boolean(avatarId) && avatarQuery.isPending),
    onImageError: () => {
      if (avatarId) setFailedAvatarId(avatarId);
    },
  };
}
