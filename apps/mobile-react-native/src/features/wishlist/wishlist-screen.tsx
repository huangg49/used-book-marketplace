import React, { useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  BookCover,
  Button,
  Icon,
  Notice,
  Screen,
  StatePanel,
  formatVnd,
  presentError,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import {
  useRemoveWishlist,
  useSaveWishlist,
  wishlistOptions,
} from "./wishlist-model";
import type { WishlistItem } from "./contracts";
import { PublicPhoto } from "../shelf/public-photo";
import { conditionLabels } from "../drafts/book-condition";

type FilterTab = "all" | "listing" | "catalog" | "exchange";

export function WishlistScreen() {
  const { client, state } = useSession();
  const foreground = useForeground();
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  const query = useInfiniteQuery({
    ...wishlistOptions(client),
    enabled: state.status === "authenticated" && foreground,
  });

  const saveMutation = useSaveWishlist(client);
  const removeMutation = useRemoveWishlist(client);

  if (state.status !== "authenticated") {
    return (
      <Screen
        appearance="browse"
        header={
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quay lại"
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace("/account");
              }}
              style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            >
              <Icon name="back" size={20} color={stitchTokens.wineDark} />
              <AppText style={styles.backLabel}>Quay lại</AppText>
            </Pressable>
            <AppText style={styles.headerTitle}>Sách đã lưu</AppText>
            <View style={{ width: 40 }} />
          </View>
        }
      >
        <StatePanel
          title="Yêu cầu đăng nhập"
          message="Vui lòng đăng nhập để xem danh sách các đầu sách và bài đăng bạn đã lưu."
          action={{
            label: "Đăng nhập ngay",
            onPress: () => router.push("/account"),
          }}
        />
      </Screen>
    );
  }

  const entries = query.data?.pages.flatMap((page) => page.items) ?? [];
  const denied =
    query.error &&
    "status" in query.error &&
    [401, 403].includes((query.error as any).status);

  // Filter items
  const filteredEntries = entries.filter((item) => {
    if (activeTab === "listing") return item.subjectType === "LISTING";
    if (activeTab === "catalog") return item.subjectType === "CATALOG_BOOK";
    if (activeTab === "exchange") return item.wantsToExchange;
    return true;
  });

  const counts = {
    all: entries.length,
    listing: entries.filter((i) => i.subjectType === "LISTING").length,
    catalog: entries.filter((i) => i.subjectType === "CATALOG_BOOK").length,
    exchange: entries.filter((i) => i.wantsToExchange).length,
  };

  return (
    <Screen
      appearance="browse"
      header={
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/account");
            }}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Icon name="back" size={20} color={stitchTokens.wineDark} />
            <AppText style={styles.backLabel}>Quay lại</AppText>
          </Pressable>

          <AppText style={styles.headerTitle}>Sách đã lưu</AppText>

          {entries.length > 0 ? (
            <View style={styles.headerCountBadge}>
              <AppText style={styles.headerCountText}>{entries.length}</AppText>
            </View>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>
      }
    >
      <View style={styles.container}>
        {/* Filter Tabs */}
        {entries.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsRow}
            style={styles.tabsScrollView}
          >
            {[
              { id: "all" as FilterTab, label: `Tất cả (${counts.all})` },
              { id: "listing" as FilterTab, label: `Ấn bản bán (${counts.listing})` },
              { id: "catalog" as FilterTab, label: `Đầu sách (${counts.catalog})` },
              { id: "exchange" as FilterTab, label: `Muốn đổi (${counts.exchange})` },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id)}
                  style={[styles.tabItem, isActive && styles.tabItemActive]}
                >
                  <AppText
                    numberOfLines={1}
                    style={[
                      styles.tabItemText,
                      isActive && styles.tabItemTextActive,
                    ]}
                  >
                    {tab.label}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Content States */}
        {denied ? (
          <StatePanel
            title="Chưa xem được"
            message={presentError(query.error).message}
            icon="info"
          />
        ) : query.isPending ? (
          <StatePanel loading title="Đang mở tủ sách đã lưu của bạn…" />
        ) : query.error ? (
          <View style={{ gap: space.sm, marginVertical: space.md }}>
            <Notice tone="error">
              {query.data ? "Danh sách đang hiển thị chưa được cập nhật. " : ""}
              {presentError(query.error).message}
            </Notice>
            <Button
              title="Tải lại danh sách"
              secondary
              onPress={() => void query.refetch()}
            />
          </View>
        ) : entries.length === 0 ? (
          /* Empty state when user has no saved items at all */
          <View style={styles.emptyStateCard}>
            <View style={styles.emptyIconCircle}>
              <Icon
                name="bookmark"
                size={34}
                color={stitchTokens.wineDark}
                filled
              />
            </View>
            <AppText style={styles.emptyTitle}>Chưa lưu cuốn sách nào</AppText>
            <AppText style={styles.emptySubtitle}>
              Khi dạo xem kệ sách cộng đồng hoặc chi tiết ấn bản, hãy bấm Lưu sách để dễ dàng tìm lại, nhận thông báo giá và đề xuất đổi sách.
            </AppText>
            <Button
              title="Khám phá kệ sách ngay"
              wine
              onPress={() => router.replace("/")}
            />
          </View>
        ) : filteredEntries.length === 0 ? (
          /* Empty state for the selected filter tab */
          <View style={styles.emptyFilterCard}>
            <Icon name="bookmark" size={28} color={stitchTokens.roseBrown} />
            <AppText style={styles.emptyFilterTitle}>
              Không có sách nào trong mục này
            </AppText>
            <Pressable
              onPress={() => setActiveTab("all")}
              style={styles.resetFilterBtn}
            >
              <AppText style={styles.resetFilterText}>Xem tất cả ({entries.length})</AppText>
            </Pressable>
          </View>
        ) : (
          /* List of saved items */
          <View style={styles.listContent}>
            {filteredEntries.map((item) => (
              <WishlistItemCard
                key={item.id}
                item={item}
                onRemove={() => {
                  removeMutation.mutate({
                    subjectType: item.subjectType,
                    subjectId: item.subjectId,
                  });
                }}
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

            {query.hasNextPage ? (
              <View style={{ paddingVertical: space.md, alignItems: "center" }}>
                <Button
                  title={
                    query.isFetchingNextPage
                      ? "Đang tải thêm…"
                      : "Tải thêm sách đã lưu"
                  }
                  secondary
                  busy={query.isFetchingNextPage}
                  onPress={() => void query.fetchNextPage()}
                />
              </View>
            ) : null}
          </View>
        )}
      </View>
    </Screen>
  );
}

function WishlistItemCard({
  item,
  onRemove,
  onToggleExchange,
  onToggleNotifications,
}: {
  item: WishlistItem;
  onRemove?: () => void;
  onToggleExchange: (val: boolean) => void;
  onToggleNotifications: (val: boolean) => void;
}) {
  const isBook = item.subjectType === "CATALOG_BOOK";
  const title = isBook ? item.book?.title : item.listing?.book?.title;
  const authors = isBook
    ? item.book?.authors?.join(", ")
    : item.listing?.book?.authors?.join(", ");
  const price = item.listing?.price ?? item.listing?.salePrice;
  const condition = item.listing?.condition as
    | keyof typeof conditionLabels
    | undefined;

  const handleOpenDetail = () => {
    if (isBook && item.book) {
      router.push(`/showcase-book?id=${item.book.id}` as any);
    } else if (item.listing) {
      router.push(`/book?id=${item.listing.id}` as any);
    }
  };

  return (
    <View style={styles.cardContainer}>
      {/* Top Header of Card: Category Badge + Condition + Remove Button */}
      <View style={styles.cardHeaderRow}>
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.typeBadge,
              isBook ? styles.typeBadgeBook : styles.typeBadgeListing,
            ]}
          >
            <Icon
              name={isBook ? "book" : "bookmark"}
              size={13}
              color={stitchTokens.wineDark}
            />
            <AppText style={styles.typeBadgeText}>
              {isBook ? "ĐẦU SÁCH CHUNG" : "BẢN SÁCH BÁN"}
            </AppText>
          </View>

          {condition && conditionLabels[condition] ? (
            <View style={styles.conditionBadge}>
              <AppText style={styles.conditionBadgeText}>
                {conditionLabels[condition]}
              </AppText>
            </View>
          ) : null}
        </View>

        {onRemove && (
          <Pressable
            onPress={onRemove}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Bỏ lưu ${title || "sách"}`}
            style={({ pressed }) => [
              styles.removeBookmarkBtn,
              pressed && styles.pressed,
            ]}
          >
            <Icon name="bookmark" size={17} color={stitchTokens.wine} filled />
            <AppText style={styles.removeBookmarkText}>Đã lưu</AppText>
          </Pressable>
        )}
      </View>

      {/* Main Body: Cover + Details */}
      <Pressable
        style={styles.cardBody}
        onPress={handleOpenDetail}
        accessibilityRole="button"
        accessibilityLabel={`Mở chi tiết ${title || "sách"}`}
      >
        <View style={styles.coverBox}>
          {item.listing?.coverUrl ? (
            <Image
              source={{ uri: item.listing.coverUrl }}
              style={styles.coverImage}
              resizeMode="cover"
            />
          ) : isBook || !item.listing?.photos?.[0] ? (
            <BookCover
              label={title || ""}
              missing={true}
              style={styles.coverImage}
            />
          ) : (
            <View style={styles.coverImage}>
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
        </View>

        <View style={styles.detailColumn}>
          <AppText style={styles.bookTitle} numberOfLines={2}>
            {title || "Ấn bản chưa rõ tên"}
          </AppText>

          {authors ? (
            <AppText style={styles.bookAuthors} numberOfLines={1}>
              {authors}
            </AppText>
          ) : null}

          {/* Pricing or Availability */}
          <View style={styles.priceRow}>
            {price != null ? (
              <View style={styles.priceContainer}>
                <AppText style={styles.priceLabel}>GIÁ BÁN</AppText>
                <AppText style={styles.priceText}>{formatVnd(price)}</AppText>
              </View>
            ) : (
              <View style={styles.priceContainer}>
                <AppText style={styles.priceLabel}>HÌNH THỨC</AppText>
                <AppText style={styles.exchangeOnlyText}>
                  {isBook ? "Xem ấn bản sẵn có" : "Sẵn sàng đổi sách"}
                </AppText>
              </View>
            )}
          </View>
        </View>
      </Pressable>

      {/* Preferences & Quick Action Row */}
      <View style={styles.cardFooter}>
        <View style={styles.preferencesRow}>
          {/* Want to exchange pill */}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="Muốn đổi sách này"
            accessibilityState={{ checked: item.wantsToExchange }}
            style={[
              styles.prefPill,
              item.wantsToExchange ? styles.prefPillActive : styles.prefPillInactive,
            ]}
            onPress={() => onToggleExchange(!item.wantsToExchange)}
          >
            <Icon
              name={item.wantsToExchange ? "check" : "swap"}
              size={13}
              color={
                item.wantsToExchange
                  ? stitchTokens.white
                  : stitchTokens.wineDark
              }
            />
            <AppText
              style={[
                styles.prefPillText,
                item.wantsToExchange && styles.prefPillTextActive,
              ]}
            >
              Muốn đổi sách
            </AppText>
          </Pressable>

          {/* Receive notifications pill */}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="Nhận thông báo khi có người đăng sách"
            accessibilityState={{ checked: item.receiveNotifications }}
            style={[
              styles.prefPill,
              item.receiveNotifications
                ? styles.prefPillNotifActive
                : styles.prefPillInactive,
            ]}
            onPress={() => onToggleNotifications(!item.receiveNotifications)}
          >
            <Icon
              name="bell"
              size={13}
              color={
                item.receiveNotifications
                  ? stitchTokens.wineDark
                  : stitchTokens.subtleGray
              }
            />
            <AppText
              style={[
                styles.prefPillText,
                item.receiveNotifications && styles.prefPillTextNotifActive,
              ]}
            >
              Thông báo
            </AppText>
          </Pressable>
        </View>

        {/* Detail Arrow Link */}
        <Pressable
          style={({ pressed }) => [styles.viewDetailBtn, pressed && styles.pressed]}
          onPress={handleOpenDetail}
        >
          <AppText style={styles.viewDetailText}>Xem chi tiết</AppText>
          <Icon name="chevronRight" size={14} color={stitchTokens.wineDark} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    gap: space.md,
    paddingBottom: space.section,
  },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    backgroundColor: stitchTokens.parchment,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.peachBorder,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  backLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  headerCountBadge: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
  },
  headerCountText: {
    fontSize: 12,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  tabsScrollView: {
    flexGrow: 0,
    marginBottom: space.xs,
  },
  tabsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  tabItem: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: stitchTokens.white,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    flexShrink: 0,
  },
  tabItemActive: {
    backgroundColor: stitchTokens.wineDark,
    borderColor: stitchTokens.wineDark,
  },
  tabItemText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineMid,
  },
  tabItemTextActive: {
    color: stitchTokens.white,
  },
  listContent: {
    gap: space.md,
    paddingBottom: space.xl,
  },
  /* Empty state card */
  emptyStateCard: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: stitchTokens.roseWarmSurface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    padding: space.xl,
    gap: space.sm,
    marginTop: space.sm,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: stitchTokens.terracottaSoft,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xs,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    color: stitchTokens.wineMid,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: space.sm,
    paddingHorizontal: space.sm,
  },
  /* Filter empty card */
  emptyFilterCard: {
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    backgroundColor: stitchTokens.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: space.xs,
    marginTop: space.sm,
  },
  emptyFilterTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.wineMid,
  },
  resetFilterBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  resetFilterText: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    textDecorationLine: "underline",
  },
  /* Saved Item Card */
  cardContainer: {
    backgroundColor: stitchTokens.white,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    padding: 14,
    gap: 12,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  typeBadgeListing: {
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  typeBadgeBook: {
    backgroundColor: stitchTokens.terracottaSoft,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    letterSpacing: 0.4,
  },
  conditionBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  conditionBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
  },
  removeBookmarkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  removeBookmarkText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  cardBody: {
    flexDirection: "row",
    gap: 12,
  },
  coverBox: {
    width: 72,
    height: 100,
    borderRadius: radius.record,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    backgroundColor: stitchTokens.parchment,
  },
  coverImage: {
    width: "100%",
    height: "100%",
    borderRadius: radius.record,
  },
  detailColumn: {
    flex: 1,
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  bookTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    lineHeight: 20,
  },
  bookAuthors: {
    fontSize: 13,
    color: stitchTokens.subtleGray,
    marginTop: 2,
  },
  priceRow: {
    marginTop: 6,
  },
  priceContainer: {
    gap: 1,
  },
  priceLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: stitchTokens.wineMid,
    letterSpacing: 0.5,
  },
  priceText: {
    fontSize: 16,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  exchangeOnlyText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineMid,
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: stitchTokens.peachBorder,
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  preferencesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  prefPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  prefPillInactive: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderColor: stitchTokens.peachBorder,
  },
  prefPillActive: {
    backgroundColor: stitchTokens.wineDark,
    borderColor: stitchTokens.wineDark,
  },
  prefPillNotifActive: {
    backgroundColor: stitchTokens.terracottaSoft,
    borderColor: stitchTokens.peachBorder,
  },
  prefPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  prefPillTextActive: {
    color: stitchTokens.white,
  },
  prefPillTextNotifActive: {
    color: stitchTokens.wineDark,
  },
  viewDetailBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  viewDetailText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  pressed: {
    opacity: 0.8,
  },
});
