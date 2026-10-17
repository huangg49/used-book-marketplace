import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import { Icon } from "../../core/ui";
import { mediaRead } from "./contracts";

export function DraftCoverPhoto({
  listingId,
  mediaId,
  label = "Ảnh bìa",
}: {
  listingId: string;
  mediaId?: string | null;
  label?: string;
}) {
  const { client } = useSession();
  const foreground = useForeground();
  const [expired, setExpired] = useState("");

  const preview = useQuery({
    queryKey: ["media-read", listingId, mediaId],
    queryFn: () =>
      client.request(
        `/me/listings/${listingId}/media/${mediaId}/read`,
        mediaRead,
      ),
    enabled: !!mediaId,
    staleTime: 60_000,
    gcTime: 120_000,
    refetchInterval: foreground ? 60_000 : false,
    retry: false,
  });

  useEffect(() => {
    if (!preview.data) return;
    const expiry = preview.data.expiresAt;
    const timer = setTimeout(
      () => setExpired(expiry),
      Math.max(0, Date.parse(expiry) - Date.now()) + 10,
    );
    return () => clearTimeout(timer);
  }, [preview.data]);

  const available =
    !preview.error &&
    preview.data &&
    preview.data.expiresAt !== expired;

  if (!mediaId || !available || !preview.data?.url) {
    return (
      <View
        style={{
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="book" size={24} color="#9E928E" />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: preview.data.url }}
      accessibilityLabel={label}
      style={{ width: "100%", height: "100%" }}
      resizeMode="cover"
    />
  );
}
