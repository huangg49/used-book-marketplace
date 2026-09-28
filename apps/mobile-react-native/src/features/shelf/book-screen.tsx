import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../core/api/session-client";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  BackAction,
  BookCondition,
  BookPrice,
  Button,
  Chip,
  Notice,
  Screen,
  Sheet,
  StatePanel,
  colors,
  space,
  presentError,
} from "../../core/ui";
import { conditions, modes, publicListing } from "./contracts";
import { PublicPhoto } from "./public-photo";

export function BookScreen({ id }: { id: string }) {
  const { client } = useSession(),
    active = useForeground();
  const [selected, setSelected] = useState(0),
    [large, setLarge] = useState(false);
  const [shownRevision, setShownRevision] = useState<string>();
  const valid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
  const result = useQuery({
    queryKey: ["public-listing", id],
    queryFn: () => client.publicRequest(`/listings/${id}`, publicListing),
    enabled: active && valid,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: active ? 30_000 : false,
  });
  if (shownRevision !== result.data?.revisionId) {
    setShownRevision(result.data?.revisionId);
    setSelected(0);
    setLarge(false);
  }
  if (large && (result.error || !active)) setLarge(false);
  const unavailable =
    !valid || (result.error instanceof ApiError && result.error.status === 404);
  const item = unavailable ? undefined : result.data;
  return (
    <Screen
      header={
        <View
          style={{ paddingHorizontal: space.xl, paddingVertical: space.xs }}
        >
          <BackAction
            title="Về kệ sách"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/");
            }}
          />
        </View>
      }
    >
      {unavailable ? (
        <StatePanel
          title="Cuốn sách này không còn trên kệ."
          message="Người đăng hoặc trạng thái cuốn sách có thể đã thay đổi. Bạn có thể quay lại tìm một cuốn khác."
        />
      ) : (
        <>
          {result.isPending && <StatePanel loading title="Đang mở cuốn sách" />}
          {result.error && (
            <>
              <Notice tone="error">
                {item ? "Chưa kiểm tra được tình trạng hiện tại. " : ""}
                {presentError(result.error).message}
              </Notice>
              <Button
                secondary
                title="Thử tải lại sách"
                busy={result.isFetching}
                onPress={() => void result.refetch()}
              />
            </>
          )}
          {item && (
            <>
              <PublicPhoto
                key={`${item.revisionId}/${selected}`}
                listingId={id}
                revisionId={item.revisionId}
                mediaId={item.photos[selected]?.id || item.photos[0].id}
                label={`Ảnh ${selected + 1} của ${item.book.title}`}
                active={active && !result.isError}
                large
              />
              <View style={{ gap: space.md }}>
                <BookCondition
                  condition={conditions[item.condition]}
                  mode={modes[item.mode]}
                />
                <AppText
                  kind="heading"
                  accessibilityRole="header"
                  color={colors.forest}
                >
                  {item.book.title}
                </AppText>
                <AppText color={colors.muted}>
                  {item.book.authors.join(" · ")}
                </AppText>
              </View>
              <View
                style={{
                  borderTopWidth: 1,
                  borderBottomWidth: 1,
                  borderColor: colors.rule,
                  paddingVertical: space.lg,
                }}
              >
                <BookPrice
                  sale={item.salePrice ?? undefined}
                  exchange={item.exchangeValue ?? undefined}
                />
              </View>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: space.sm,
                }}
              >
                {item.photos.map((photo, index) => (
                  <Chip
                    key={photo.id}
                    title={`Ảnh ${index + 1}`}
                    selected={selected === index}
                    onPress={() => setSelected(index)}
                  />
                ))}
              </View>
              <Button
                title="Xem ảnh lớn"
                secondary
                disabled={result.isError}
                onPress={() => setLarge(true)}
              />
              <AppText kind="small" color={colors.muted}>
                Ảnh do người đăng cung cấp. Kiểm duyệt nội dung không chứng nhận
                sách chính hãng.
              </AppText>
              <View
                style={{
                  paddingVertical: space.xl,
                  borderTopWidth: 1,
                  borderBottomWidth: 1,
                  borderColor: colors.rule,
                  gap: space.md,
                }}
              >
                <AppText kind="label" color={colors.rustText}>
                  TỪ KỆ CỦA
                </AppText>
                <AppText kind="heading" color={colors.forest}>
                  {item.seller.displayName}
                </AppText>
                <AppText>{item.description}</AppText>
              </View>
              <AppText
                kind="heading"
                accessibilityRole="header"
                color={colors.forest}
              >
                Dấu đọc còn lại
              </AppText>
              {(
                [
                  ["Ruột sách", item.pages],
                  ["Bìa và gáy", item.coverNote],
                  ["Ghi chú / đánh dấu", item.notes],
                  ["Phụ kiện", item.accessories],
                  [
                    "Trang thiếu",
                    item.hasMissingPages
                      ? "Người đăng khai báo có thiếu trang; xem mô tả ruột sách."
                      : "Người đăng khai báo không thiếu trang.",
                  ],
                ] as const
              ).map(([label, value]) => (
                <View key={label} style={{ gap: space.xs }}>
                  <AppText kind="bold">{label}</AppText>
                  <AppText color={colors.muted}>{value}</AppText>
                </View>
              ))}
              <Notice tone="info">
                Người đăng khai báo sách còn đọc được và không thiếu nội dung
                trọng yếu. Hãy đối chiếu ảnh và mô tả tình trạng.
              </Notice>
              <AppText
                kind="heading"
                accessibilityRole="header"
                color={colors.forest}
              >
                Về đầu sách
              </AppText>
              {(
                [
                  ["Nhà xuất bản", item.book.publisher],
                  ["Năm xuất bản", item.book.publicationYear?.toString()],
                  ["Ấn bản", item.book.edition],
                  ["Thể loại", item.book.category],
                  ["Ngôn ngữ", item.book.language],
                  ["ISBN", item.book.isbn],
                ] as const
              ).map(([label, value]) => (
                <View key={label} style={{ gap: space.xs }}>
                  <AppText kind="small" color={colors.muted}>
                    {label}
                  </AppText>
                  <AppText>{value || "Chưa cung cấp"}</AppText>
                </View>
              ))}
              <Button
                title="Cập nhật tình trạng sách"
                secondary
                busy={result.isFetching}
                onPress={() => void result.refetch()}
              />
              <AppText kind="heading">Cách sách đến tay bạn</AppText>
              <AppText>
                {item.fulfillment
                  ? "Người đăng chọn giao trực tiếp trong TP.HCM. Vùng phục vụ đang dùng dữ liệu mô phỏng."
                  : "Người đăng chưa hoàn thiện thông tin giao nhận."}
              </AppText>
              <AppText kind="small" color={colors.muted}>
                Lật lại phục vụ TP.HCM. Đặt mua, đề nghị đổi và giao nhận chưa
                mở trong phiên bản này.
              </AppText>
              <Sheet
                visible={large && !result.isError}
                title={`Ảnh ${selected + 1} / ${item.photos.length}`}
                onClose={() => setLarge(false)}
              >
                <AppText kind="card" color={colors.forest}>
                  {item.book.title}
                </AppText>
                {large && (
                  <PublicPhoto
                    listingId={id}
                    revisionId={item.revisionId}
                    mediaId={item.photos[selected]?.id || item.photos[0].id}
                    label={`Ảnh chi tiết ${selected + 1}`}
                    active={active && !result.isError}
                    large
                  />
                )}
              </Sheet>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
