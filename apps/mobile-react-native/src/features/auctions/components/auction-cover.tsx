import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../../core/session/session-provider";
import { Icon, stitchTokens } from "../../../core/ui";
import { publicMedia } from "../../shelf/contracts";

// Cover from the inspected intake revision. No photo or an expired/failed read
// shows the placeholder; nothing stands in for the real book.
export function AuctionCover({
  auctionId,
  mediaId,
  label,
  iconSize = 24,
}: {
  auctionId: string;
  mediaId?: string | null;
  label: string;
  iconSize?: number;
}) {
  const { client } = useSession();
  const [expired, setExpired] = useState("");
  const photo = useQuery({
    queryKey: ["auction-photo", auctionId, mediaId],
    queryFn: () =>
      client.publicRequest(
        `/auctions/${auctionId}/photos/${mediaId}`,
        publicMedia,
      ),
    enabled: !!mediaId,
    staleTime: 60_000,
    gcTime: 0,
    refetchInterval: mediaId ? 60_000 : false,
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

  const url =
    !photo.error && photo.data && photo.data.expiresAt !== expired
      ? photo.data.url
      : null;

  if (!url) {
    return (
      <View style={styles.placeholder}>
        <Icon name="book" size={iconSize} color={stitchTokens.wine} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: url }}
      accessibilityLabel={`Ảnh bìa ${label}`}
      style={styles.image}
      resizeMode="cover"
      onError={() => { if (photo.data) setExpired(photo.data.expiresAt); }}
    />
  );
}

const styles = StyleSheet.create({
  image: { width: "100%", height: "100%" },
  placeholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});
