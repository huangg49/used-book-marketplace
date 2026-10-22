import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import { AppText, Button, Icon, colors } from "../../core/ui";
import { mediaRead, type Media } from "./contracts";
import { signedMediaRemainingMs } from "@used-books/session-client";

export function DraftCoverPhoto({
  listingId,
  mediaId,
  label = "Ảnh bìa",
  resizeMode = "cover",
  mediaStatus,
}: {
  listingId: string;
  mediaId?: string | null;
  label?: string;
  resizeMode?: "cover" | "contain";
  mediaStatus?: Media["status"];
}) {
  const { client } = useSession();
  const foreground = useForeground();
  const [expired, setExpired] = useState("");
  const [failed, setFailed] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const ready = !mediaStatus || mediaStatus === "Ready";

  const preview = useQuery({
    queryKey: ["media-read", listingId, mediaId],
    queryFn: async () => {
      const signed = await client.request(
        `/me/listings/${listingId}/media/${mediaId}/read`,
        mediaRead,
      );
      if (signedMediaRemainingMs(signed.expiresAt) <= 0)
        throw new Error("Signed image expired before display");
      return signed;
    },
    enabled: !!mediaId && foreground && ready,
    staleTime: 60_000,
    gcTime: 120_000,
    refetchInterval: foreground && ready ? 60_000 : false,
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
    foreground &&
    ready &&
    !preview.error &&
    preview.data &&
    preview.data.expiresAt !== expired;

  const retry = !!mediaId && ready && foreground && (
    preview.isError ||
    (!!failed && failed === preview.data?.url) ||
    (!!preview.data && !available)
  );
  return (
    <View style={{ width: "100%", height: "100%" }}>
      {available && preview.data?.url && failed !== preview.data.url ? (
        <Image
          key={`${preview.data.url}/${attempt}`}
          source={{ uri: preview.data.url }}
          accessibilityLabel={label}
          style={{ width: "100%", flex: 1 }}
          resizeMode={resizeMode}
          onError={() => setFailed(preview.data?.url)}
        />
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Icon name="book" size={24} color={colors.muted} />
        </View>
      )}
      {mediaStatus ? (
        <AppText kind="small">{{
          Pending: "Chưa tải xong",
          Processing: "Đang kiểm tra ảnh",
          Ready: "Ảnh đã sẵn sàng",
          Failed: "Ảnh chưa xử lý được",
        }[mediaStatus]}</AppText>
      ) : null}
      {retry ? (
        <>
          <AppText kind="small">Chưa tải được ảnh xem trước.</AppText>
          <Button
            secondary
            title="Tải lại ảnh"
            busy={preview.isFetching}
            onPress={() => {
              setFailed(undefined);
              setAttempt((value) => value + 1);
              void preview.refetch();
            }}
          />
        </>
      ) : null}
    </View>
  );
}
