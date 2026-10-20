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
import {
  PUBLIC_MEDIA_GC_MS,
  signedMediaRemainingMs,
  signedMediaStaleTime,
} from "@used-books/session-client";
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
  result = false,
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
  result?: boolean;
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
    staleTime: (query) =>
      signedMediaStaleTime(
        query.state.data?.expiresAt,
        query.state.dataUpdatedAt,
      ),
    gcTime: PUBLIC_MEDIA_GC_MS,
    retry: false,
  });
  const expiry = photo.data?.expiresAt;
  const refetch = photo.refetch;
  useEffect(() => {
    if (!active || !expiry) return;
    const remaining = signedMediaRemainingMs(expiry);
    if (!remaining) return;
    const timer = setTimeout(() => {
      setExpired(expiry);
      void refetch({ cancelRefetch: false });
    }, remaining);
    return () => clearTimeout(timer);
  }, [expiry, refetch, active]);
  const available =
    active &&
    !photo.error &&
    photo.data &&
    photo.data.expiresAt !== expired &&
    signedMediaRemainingMs(photo.data.expiresAt) > 0;
  const requestKey = `${photo.data?.url}/${attempt}`;
  const cover = (
    <BookCover
      key={attempt}
      source={available ? { uri: photo.data.url } : undefined}
      label={label}
      missing={!available}
      cachePolicy="memory"
      loading={active && photo.isPending}
      fadeIn
      onError={() => setFailed(requestKey)}
      onLoad={() => setFailed(undefined)}
      style={{
        width: "100%",
        height: result
          ? undefined
          : expanded
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
        ...(compact || shelf || rail || result
          ? {
              ...((compact && !shelf && !rail) || result
                ? { aspectRatio: 2 / 3 }
                : {}),
              backgroundColor:
                rail || shelf || result ? colors.surface : colors.paper,
              borderRadius: radius.book,
            }
          : {}),
      }}
    />
  );
  return (
    <View style={{ width: "100%", gap: space.sm }}>
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
            { width: "100%" },
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
