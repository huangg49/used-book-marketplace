import { useEffect, useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  BookCover,
  Button,
  colors,
  space,
  presentError,
} from "../../core/ui";
import { publicMedia } from "./contracts";
export function PublicPhoto({
  listingId,
  mediaId,
  revisionId,
  label,
  active,
  large = false,
}: {
  listingId: string;
  mediaId: string;
  revisionId: string;
  label: string;
  active: boolean;
  large?: boolean;
}) {
  const { client } = useSession();
  const [expired, setExpired] = useState("");
  const [failed, setFailed] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const photo = useQuery({
    queryKey: ["public-media", listingId, revisionId, mediaId],
    queryFn: () =>
      client.publicRequest(
        `/listings/${listingId}/media/${mediaId}/read`,
        publicMedia,
      ),
    enabled: active,
    staleTime: 60_000,
    gcTime: 0,
    refetchInterval: active ? 90_000 : false,
    retry: false,
  });
  useEffect(() => {
    if (!photo.data) return;
    const expiry = photo.data.expiresAt;
    const timer = setTimeout(
      () => setExpired(expiry),
      Math.max(0, Date.parse(expiry) - Date.now()) + 10,
    );
    return () => clearTimeout(timer);
  }, [photo.data]);
  const available =
    active && !photo.error && photo.data && photo.data.expiresAt !== expired;
  return (
    <View style={{ gap: space.sm }}>
      <BookCover
        key={`${photo.data?.url}/${attempt}`}
        source={available ? { uri: photo.data.url } : undefined}
        label={label}
        missing={!available}
        cachePolicy="none"
        onError={() => setFailed(photo.data?.url)}
        style={{ width: "100%", height: large ? 350 : 210 }}
      />
      {photo.isPending && (
        <AppText kind="small" color={colors.muted}>
          Đang tải ảnh…
        </AppText>
      )}
      {photo.error || (failed && failed === photo.data?.url) ? (
        <>
          <AppText kind="small" color={colors.muted}>
            {photo.error
              ? presentError(photo.error).message
              : "Ảnh chưa tải được."}
          </AppText>
          <Button
            secondary
            title="Tải lại ảnh"
            busy={photo.isFetching}
            onPress={() => {
              setFailed(undefined);
              setAttempt((value) => value + 1);
              void photo.refetch();
            }}
          />
        </>
      ) : null}
    </View>
  );
}
