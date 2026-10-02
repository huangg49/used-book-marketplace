import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  BookCover,
  Button,
  colors,
  space,
  presentError,
  layout,
  radius,
  metrics,
} from "../../core/ui";
import { publicMedia } from "./contracts";
export function PublicPhoto({
  listingId,
  mediaId,
  revisionId,
  label,
  active,
  large = false,
  onOpen,
  expanded = false,
  compact = false,
  shelf = false,
  rail = false,
  onCoverFocus,
}: {
  listingId: string;
  mediaId: string;
  revisionId: string;
  label: string;
  active: boolean;
  large?: boolean;
  onOpen?: () => void;
  expanded?: boolean;
  compact?: boolean;
  shelf?: boolean;
  rail?: boolean;
  onCoverFocus?: () => void;
}) {
  const { client } = useSession();
  const [expired, setExpired] = useState("");
  const [failed, setFailed] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [focused, setFocused] = useState(false);
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
  const requestKey = `${photo.data?.url}/${attempt}`;
  const cover = (
    <BookCover
      key={attempt}
      source={available ? { uri: photo.data.url } : undefined}
      label={label}
      missing={!available}
      cachePolicy="none"
      loading={active && photo.isPending}
      fadeIn
      onError={() => setFailed(requestKey)}
      onLoad={() => setFailed(undefined)}
      style={{
        width: "100%",
        height: expanded
          ? 420
          : rail
            ? metrics.shelfCover
            : shelf
              ? 180
              : compact
                ? undefined
                : large
                  ? 286
                  : 210,
        ...(compact || shelf || rail
          ? {
              ...(compact && !shelf && !rail ? { aspectRatio: 2 / 3 } : {}),
              backgroundColor: rail || shelf ? colors.surface : colors.paper,
              borderRadius: radius.book,
            }
          : {}),
      }}
    />
  );
  return (
    <View style={{ gap: space.sm }}>
      {onOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Mở ${label}`}
          onPress={onOpen}
          onFocus={() => {
            setFocused(true);
            onCoverFocus?.();
          }}
          onBlur={() => setFocused(false)}
          style={({ pressed }) => [
            focused && layout.focus,
            { opacity: pressed ? 0.8 : 1 },
          ]}
        >
          {cover}
        </Pressable>
      ) : (
        cover
      )}
      {photo.error || failed === requestKey ? (
        <>
          {photo.error && (
            <AppText kind="small" color={colors.muted}>
              {presentError(photo.error).message}
            </AppText>
          )}
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
