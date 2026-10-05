import { View, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  BackAction,
  Screen,
  StatePanel,
  colors,
  space,
  BookCover,
  radius,
  Icon,
  Notice,
  presentError,
  Checkbox,
} from "../../core/ui";
import { wishlistOptions, useSaveWishlist } from "./wishlist-model";
import type { WishlistItem } from "./contracts";
import { PublicPhoto } from "../shelf/public-photo";

export function WishlistScreen() {
  const { client } = useSession();
  const foreground = useForeground();
  const query = useInfiniteQuery({
    ...wishlistOptions(client),
    enabled: foreground,
  });

  const saveMutation = useSaveWishlist(client);

  const entries = query.data?.pages.flatMap((page) => page.items) ?? [];
  const denied = query.error && "status" in query.error && [401, 403].includes((query.error as any).status);

  return (
    <Screen>
      <BackAction
        title="Quay lại"
        onPress={() => router.back()}
      />
      <View style={{ gap: space.sm }}>
        <AppText kind="label" color={colors.rustText}>
          TÀI KHOẢN
        </AppText>
        <AppText
          kind="heading"
          color={colors.forest}
          accessibilityRole="header"
        >
          Sách đã lưu
        </AppText>
        <AppText color={colors.muted}>
          Những đầu sách và bài đăng bạn đang quan tâm.
        </AppText>
      </View>

      {denied ? (
        <StatePanel
          title="Chưa xem được"
          message={presentError(query.error).message}
          icon="info"
        />
      ) : query.isPending ? (
        <StatePanel loading title="Đang tải danh sách..." />
      ) : query.error ? (
        <Notice tone="error">
          {query.data ? "Danh sách đang hiển thị chưa được cập nhật. " : ""}
          {presentError(query.error).message}
        </Notice>
      ) : entries.length === 0 ? (
        <StatePanel
          title="Chưa lưu sách nào"
          message="Bạn có thể đánh dấu lưu sách khi xem chi tiết sách hoặc bài đăng."
          icon="bookmark"
        />
      ) : (
        <View style={{ gap: space.lg, paddingVertical: space.lg }}>
          {entries.map((item) => (
            <WishlistItemCard
              key={item.id}
              item={item}
              onToggleExchange={(val) => {
                saveMutation.mutate({
                  subjectType: item.subjectType,
                  subjectId: item.subjectId,
                  wantsToExchange: val,
                  receiveNotifications: item.receiveNotifications,
                });
              }}
              onToggleNotifications={(val) => {
                saveMutation.mutate({
                  subjectType: item.subjectType,
                  subjectId: item.subjectId,
                  wantsToExchange: item.wantsToExchange,
                  receiveNotifications: val,
                });
              }}
            />
          ))}
          {query.isFetchingNextPage && (
            <AppText color={colors.muted} style={{ textAlign: "center", marginVertical: space.md }}>
              Đang tải thêm...
            </AppText>
          )}
          {query.hasNextPage && !query.isFetchingNextPage && (
            <TouchableOpacity onPress={() => query.fetchNextPage()} style={{ padding: space.md, alignItems: "center" }}>
              <AppText color={colors.forest}>Tải thêm</AppText>
            </TouchableOpacity>
          )}
        </View>
      )}
    </Screen>
  );
}

function WishlistItemCard({
  item,
  onToggleExchange,
  onToggleNotifications,
}: {
  item: WishlistItem;
  onToggleExchange: (val: boolean) => void;
  onToggleNotifications: (val: boolean) => void;
}) {
  const isBook = item.subjectType === "CATALOG_BOOK";
  const title = isBook ? item.book?.title : item.listing?.book?.title;
  const authors = isBook ? item.book?.authors?.join(", ") : item.listing?.book?.authors?.join(", ");

  return (
    <View style={{ gap: space.md, padding: space.md, backgroundColor: colors.surface, borderRadius: radius.card }}>
      <TouchableOpacity
        style={{ flexDirection: "row", gap: space.md }}
        onPress={() => {
          if (isBook && item.book) {
            router.push(`/showcase-book?id=${item.book.id}` as any);
          } else if (item.listing) {
            router.push(`/book?id=${item.listing.id}` as any);
          }
        }}
        accessibilityRole="button"
      >
        {isBook || !item.listing?.photos?.[0] ? (
          <BookCover label={title || ""} missing={true} style={{ width: 60, height: 80 }} />
        ) : (
          <View style={{ width: 60, height: 80 }}>
            <PublicPhoto
              listingId={item.listing.id}
              revisionId={item.listing.revisionId}
              mediaId={item.listing.photos[0].id}
              label={title || ""}
              active={true}
              compact
            />
          </View>
        )}
        <View style={{ flex: 1, gap: space.xs }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <Icon name={isBook ? "book" : "bookmark"} size={16} color={colors.rustText} />
            <AppText kind="annotation" color={colors.rustText}>
              {isBook ? "Đầu sách chung" : "Bài đăng"}
            </AppText>
          </View>
          <AppText kind="bold" numberOfLines={2}>{title}</AppText>
          {authors ? <AppText color={colors.muted} numberOfLines={1}>{authors}</AppText> : null}
        </View>
      </TouchableOpacity>

      <View style={{ gap: space.sm, marginTop: space.sm }}>
        <Checkbox
          checked={item.wantsToExchange}
          onPress={() => onToggleExchange(!item.wantsToExchange)}
          title="Muốn đổi sách này"
        />
        <Checkbox
          checked={item.receiveNotifications}
          onPress={() => onToggleNotifications(!item.receiveNotifications)}
          title="Nhận thông báo khi có người đăng bán/đổi"
        />
      </View>
    </View>
  );
}
