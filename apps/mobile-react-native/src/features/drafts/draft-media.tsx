import { View } from "react-native";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  BookCover,
  Button,
  Checkbox,
  Notice,
  colors,
  space,
  presentError,
} from "../../core/ui";
import { ApiError } from "../../core/api/session-client";
import { mediaRead, type Media } from "./contracts";
export { useForeground } from "../../core/hooks/use-foreground";
export function photoError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "MEDIA_FAILED")
      return "Ảnh chưa đạt yêu cầu. Hãy chọn lại ảnh JPEG, PNG hoặc WebP rõ nét.";
    if (error.code === "MediaQuotaExceeded")
      return "Kho ảnh đang đầy hoặc bạn đã tải nhiều ảnh. Hãy thử lại sau.";
    if (error.code === "UploadExpired")
      return "Lượt tải ảnh đã hết hạn. Hãy chọn lại ảnh.";
    if (error.status === 413) return "Ảnh quá lớn. Chọn ảnh không quá 10 MB.";
  }
  return presentError(error).message;
}
export function Photo({
  item,
  selected,
  onToggle,
  disabled,
  foreground,
}: {
  item: Media;
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
  foreground: boolean;
}) {
  const { client } = useSession();
  const [expired, setExpired] = useState("");
  const [failed, setFailed] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const preview = useQuery({
    queryKey: ["media-read", item.listingId, item.id],
    queryFn: () =>
      client.request(
        `/me/listings/${item.listingId}/media/${item.id}/read`,
        mediaRead,
      ),
    enabled: item.status === "Ready" && foreground,
    staleTime: 90_000,
    refetchInterval: foreground ? 90_000 : false,
    gcTime: 0,
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
    !preview.error &&
    preview.data &&
    preview.data.expiresAt !== expired;
  const label = {
    Pending: "Chưa tải xong",
    Processing: "Đang kiểm tra ảnh",
    Ready: "Ảnh đã sẵn sàng",
    Failed: "Ảnh chưa xử lý được",
  }[item.status];
  return (
    <View
      style={{
        gap: space.sm,
        paddingVertical: space.lg,
        borderBottomWidth: 1,
        borderColor: colors.rule,
      }}
    >
      {item.status === "Ready" ? (
        <BookCover
          key={`${preview.data?.url}/${attempt}`}
          label="Ảnh bản sách của bạn"
          source={available ? { uri: preview.data.url } : undefined}
          cachePolicy="none"
          onError={() => setFailed(preview.data?.url)}
          style={{ width: "100%", height: 220 }}
        />
      ) : null}
      <AppText kind="small">{label}</AppText>
      {preview.error ||
      (failed && failed === preview.data?.url) ||
      (preview.data && preview.data.expiresAt === expired) ? (
        <>
          <Notice tone="error">Chưa tải được ảnh xem trước.</Notice>
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
      {item.status === "Failed" ? (
        <AppText kind="small">
          Hãy chọn lại ảnh rõ nét, không quá 10 MB.
        </AppText>
      ) : null}
      <Checkbox
        title="Dùng ảnh này cho bài đăng"
        checked={selected}
        disabled={disabled || (!selected && item.status === "Failed")}
        onPress={onToggle}
      />
    </View>
  );
}
