import { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  accountErrorMessage,
  cartSchema,
  changeCart,
  pendingCartCommand,
  readCart,
} from "@used-books/session-client";
import * as Crypto from "expo-crypto";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  Button,
  Icon,
  Notice,
  StatePanel,
  WineHeader,
  colors,
  formatVnd,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import { publicListing, type Listing } from "../shelf/contracts";
import { PublicPhoto } from "../shelf/public-photo";
import { BuyNowModal } from "../orders/buy-now-modal";

const schema = cartSchema(publicListing);

export function CartScreen({ owner }: { owner: string }) {
  const { client } = useSession();
  const cache = useQueryClient();
  const insets = useSafeAreaInsets();

  const query = useQuery({
    queryKey: ["member-cart", owner],
    queryFn: () => readCart(client, schema),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });

  useFocusEffect(
    useCallback(() => {
      void cache.invalidateQueries({ queryKey: ["member-cart", owner] });
    }, [cache, owner]),
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [needsRead, setNeedsRead] = useState(false);
  const [selected, setSelected] = useState<Listing | null>(null);

  const pending = pendingCartCommand(client);
  const disabled = busy || pending || needsRead;
  const items = query.data?.items ?? [];

  async function refresh() {
    const r = await query.refetch();
    if (r.error) throw r.error;
    setError("");
    setNeedsRead(false);
  }

  async function remove(listingId?: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await changeCart(
        client,
        listingId ? { action: "remove", listingId } : null,
        () => Crypto.randomUUID(),
      );
      setNeedsRead(true);
      setMessage("Đã cập nhật giỏ sách.");
      await refresh();
    } catch (e) {
      setError(accountErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screenRoot}>
      <WineHeader
        title="Giỏ sách"
        subtitle={
          query.data
            ? `${items.length}/50 bài đăng · Chọn từng cuốn để mua`
            : "Tối đa 50 bài đăng"
        }
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/account")
        }
        rightIcon="bag"
        rightLabel="Mở đơn hàng của tôi"
        onRightPress={() => router.push("/orders")}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 16) + 12 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() =>
              void refresh().catch((e) => setError(accountErrorMessage(e)))
            }
            tintColor={stitchTokens.wineDark}
          />
        }
      >
        <View style={styles.policyStrip}>
          <Icon name="info" size={16} color={stitchTokens.wine} />
          <AppText style={styles.policyText}>
            Sách trong giỏ chưa được giữ chỗ. Chọn từng bài đăng để kiểm tra lại giá và đặt mua.
          </AppText>
        </View>

        {query.isPending && (
          <View style={styles.centerWrap}>
            <StatePanel wine loading title="Đang tải giỏ sách…" />
          </View>
        )}

        {query.error && (
          <View style={styles.noticeStack}>
            <Notice tone="error">
              Chưa tải được giỏ. {accountErrorMessage(query.error)}
            </Notice>
            <Button
              wine
              secondary
              title="Thử tải lại giỏ"
              busy={query.isFetching}
              disabled={busy}
              onPress={() =>
                void refresh().catch((e) => setError(accountErrorMessage(e)))
              }
            />
          </View>
        )}

        {Boolean(error) && <Notice tone="error">{error}</Notice>}
        {Boolean(message) && <Notice tone="success">{message}</Notice>}

        {needsRead && (
          <View style={styles.noticeStack}>
            <Notice>
              Lệnh đã ghi nhận. Tải lại giỏ để xem trạng thái mới trước khi chọn
              tiếp.
            </Notice>
            <Button
              wine
              secondary
              title="Cập nhật giỏ sách"
              busy={query.isFetching}
              onPress={() =>
                void refresh().catch((e) => setError(accountErrorMessage(e)))
              }
            />
          </View>
        )}

        {pending && (
          <View style={styles.noticeStack}>
            <Notice tone="warning">
              Chưa xác nhận được thao tác giỏ trước. Giữ nguyên yêu cầu khi thử
              lại.
            </Notice>
            <Button
              wine
              title="Xác minh thao tác giỏ trước"
              busy={busy}
              onPress={() => void remove()}
            />
          </View>
        )}

        {query.data && !items.length && !query.error && (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Icon name="bag" size={28} color={stitchTokens.wine} />
            </View>
            <AppText style={styles.emptyTitle}>Giỏ sách đang trống</AppText>
            <AppText style={styles.emptySubtitle}>
              Mở một bài đăng bán trên kệ sách và chọn Mua ngay.
            </AppText>
            <View style={styles.emptyAction}>
              <Button
                wine
                title="Khám phá kệ sách"
                onPress={() => router.push("/")}
              />
            </View>
          </View>
        )}

        {items.map((item) => {
          const listing = item.listing;
          const title = listing
            ? listing.bundle?.title || listing.book.title
            : "Bài đăng không còn công khai";
          const priceChanged =
            listing != null && item.priceAtAdd !== listing.salePrice;

          return (
            <View key={item.listingId} style={styles.cartCard}>
              {listing ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Xem bài đăng ${title}`}
                    onPress={() =>
                      router.push({
                        pathname: "/book",
                        params: { id: item.listingId },
                      })
                    }
                    style={({ pressed }) => [
                      styles.cardMainRow,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.coverFrame}>
                      <PublicPhoto
                        listingId={item.listingId}
                        revisionId={listing.revisionId}
                        mediaId={listing.photos[0].id}
                        label={title}
                        active
                        compact
                      />
                    </View>

                    <View style={styles.cardInfo}>
                      <AppText numberOfLines={2} style={styles.bookTitle}>
                        {title}
                      </AppText>
                      <AppText numberOfLines={1} style={styles.sellerLine}>
                        Người bán · {listing.seller.displayName} · SL: 1
                      </AppText>
                      <View style={styles.priceRow}>
                        <AppText style={styles.priceValue}>
                          {listing.salePrice !== null
                            ? formatVnd(listing.salePrice)
                            : "Không bán"}
                        </AppText>
                        {!item.canBuy && (
                          <View style={styles.unavailablePill}>
                            <AppText style={styles.unavailableText}>
                              Tạm chưa mua được
                            </AppText>
                          </View>
                        )}
                      </View>
                    </View>
                  </Pressable>

                  {priceChanged && (
                    <Notice tone="warning">
                      Giá khi thêm: {formatVnd(item.priceAtAdd)}. Giá đã thay
                      đổi; kiểm tra giá mới trước khi mua.
                    </Notice>
                  )}

                  {!item.canBuy && (
                    <Notice>
                      Hiện chưa thể mua: sách có thể đang được giữ, tài khoản bị
                      hạn chế hoặc thông tin giao hàng cần cập nhật.
                    </Notice>
                  )}

                  <View style={styles.cardFooter}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Xóa ${title} khỏi giỏ`}
                      disabled={disabled}
                      onPress={() => void remove(item.listingId)}
                      style={({ pressed }) => [
                        styles.removeBtn,
                        disabled && styles.disabledBtn,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Icon name="trash" size={16} color={colors.muted} />
                      <AppText style={styles.removeBtnText}>Xóa</AppText>
                    </Pressable>

                    <View style={styles.footerActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Xem chi tiết ${title}`}
                        onPress={() =>
                          router.push({
                            pathname: "/book",
                            params: { id: item.listingId },
                          })
                        }
                        style={({ pressed }) => [
                          styles.outlineBtn,
                          pressed && styles.pressed,
                        ]}
                      >
                        <AppText style={styles.outlineBtnText}>
                          Xem sách
                        </AppText>
                      </Pressable>

                      {item.canBuy && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Mua bài đăng ${title}`}
                          disabled={disabled || !!query.error}
                          onPress={() => setSelected(listing)}
                          style={({ pressed }) => [
                            styles.buyBtn,
                            (disabled || !!query.error) && styles.disabledBtn,
                            pressed && styles.pressed,
                          ]}
                        >
                          <AppText style={styles.buyBtnText}>Mua ngay</AppText>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.unavailableHeader}>
                    <View style={styles.coverFallback}>
                      <Icon name="book" size={22} color={colors.muted} />
                    </View>
                    <View style={styles.cardInfo}>
                      <AppText style={styles.bookTitle}>{title}</AppText>
                      <AppText style={styles.sellerLine}>
                        Nội dung hiện không thể xem. Bạn có thể xóa dòng này
                        khỏi giỏ.
                      </AppText>
                    </View>
                  </View>
                  <View style={styles.cardFooter}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Xóa bài đăng không còn công khai khỏi giỏ"
                      disabled={disabled}
                      onPress={() => void remove(item.listingId)}
                      style={({ pressed }) => [
                        styles.removeBtn,
                        disabled && styles.disabledBtn,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Icon name="trash" size={16} color={stitchTokens.wine} />
                      <AppText
                        style={[
                          styles.removeBtnText,
                          { color: stitchTokens.wine },
                        ]}
                      >
                        Xóa khỏi giỏ
                      </AppText>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          );
        })}
      </ScrollView>

      <BuyNowModal
        visible={!!selected}
        listing={selected ?? undefined}
        onClose={() => {
          setSelected(null);
          void query.refetch();
        }}
        onSuccess={(orderId) => {
          setSelected(null);
          void query.refetch();
          router.push({ pathname: "/orders", params: { orderId } });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: stitchTokens.creamBg,
  },
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: 12,
    flexGrow: 1,
  },
  policyStrip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  policyText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: stitchTokens.deepCocoa,
    includeFontPadding: false,
  },
  centerWrap: {
    paddingVertical: space.section,
  },
  noticeStack: {
    gap: 8,
  },
  cartCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 14,
    gap: 12,
  },
  cardMainRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  unavailableHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  coverFrame: {
    width: 66,
    height: 99,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
  },
  coverFallback: {
    width: 56,
    height: 76,
    borderRadius: 8,
    backgroundColor: stitchTokens.canvasMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  bookTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
    color: colors.ink,
    includeFontPadding: false,
  },
  sellerLine: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    includeFontPadding: false,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  priceValue: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
    color: stitchTokens.wine,
    includeFontPadding: false,
  },
  unavailablePill: {
    backgroundColor: stitchTokens.canvasMuted,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  unavailableText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: colors.muted,
    includeFontPadding: false,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.warmBorder,
    gap: 10,
  },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 38,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  removeBtnText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: colors.muted,
    includeFontPadding: false,
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  outlineBtn: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    backgroundColor: stitchTokens.parchment,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineBtnText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
    includeFontPadding: false,
  },
  buyBtn: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: stitchTokens.wineDark,
    alignItems: "center",
    justifyContent: "center",
  },
  buyBtnText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
    color: stitchTokens.gold,
    includeFontPadding: false,
  },
  disabledBtn: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.8,
  },
  emptyCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
    gap: 8,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyAction: {
    marginTop: 8,
    width: "100%",
  },
});
