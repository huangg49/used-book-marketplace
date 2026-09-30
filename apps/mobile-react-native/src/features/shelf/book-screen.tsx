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
  BookTradeBar,
  Button,
  Notice,
  Screen,
  Sheet,
  StatePanel,
  colors,
  space,
  presentError,
} from "../../core/ui";
import { publicListing } from "./contracts";
import { BookPresentation } from "./book-presentation";
import { BookGallery } from "./book-gallery";
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
      compactFooter
      footer={
        item && !result.isError ? (
          <BookTradeBar
            sale={item.salePrice ?? undefined}
            exchange={item.exchangeValue ?? undefined}
          >
            <AppText kind="annotation" color={colors.muted}>
              Tiệm chưa nhận đơn ở bản này.
            </AppText>
          </BookTradeBar>
        ) : undefined
      }
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
              <BookPresentation
                key={item.revisionId}
                item={item}
                gallery={(summary) => (
                  <BookGallery
                    summary={summary}
                    count={item.photos.length}
                    selected={selected}
                    onSelect={setSelected}
                    onEnlarge={() => setLarge(true)}
                    disabled={result.isError}
                    caption="Ảnh do người đăng cung cấp. Kiểm duyệt nội dung không chứng nhận sách chính hãng."
                    photo={
                      <PublicPhoto
                        key={`${item.revisionId}/${selected}`}
                        listingId={id}
                        revisionId={item.revisionId}
                        mediaId={item.photos[selected]?.id || item.photos[0].id}
                        label={`Ảnh ${selected + 1} của ${item.book.title}`}
                        active={active && !result.isError}
                        large
                        compact
                      />
                    }
                  />
                )}
              >
                <Button
                  title="Cập nhật tình trạng sách"
                  secondary
                  busy={result.isFetching}
                  onPress={() => void result.refetch()}
                />
              </BookPresentation>
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
                    expanded
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
