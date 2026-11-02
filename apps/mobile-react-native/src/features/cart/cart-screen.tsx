import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  accountErrorMessage,
  cartSchema,
  readCart,
  changeCart,
  pendingCartCommand,
} from "@used-books/session-client";
import * as Crypto from "expo-crypto";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  BackAction,
  Button,
  Notice,
  Screen,
  StatePanel,
  colors,
  space,
} from "../../core/ui";
import { publicListing, type Listing } from "../shelf/contracts";
import { PublicPhoto } from "../shelf/public-photo";
import { BuyNowModal } from "../orders/buy-now-modal";
const schema = cartSchema(publicListing),
  money = (v: number) =>
    new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(v);
export function CartScreen({ owner }: { owner: string }) {
  const { client } = useSession(),
    cache = useQueryClient();
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
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [needsRead, setNeedsRead] = useState(false),
    [selected, setSelected] = useState<Listing | null>(null);
  const pending = pendingCartCommand(client),
    disabled = busy || pending || needsRead;
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
    <Screen
      header={
        <BackAction
          title="Về Tài khoản"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/account")
          }
        />
      }
    >
      <AppText kind="title" accessibilityRole="header">
        Giỏ sách
      </AppText>
      <AppText>
        Tối đa 50 bài đăng, mỗi bài một dòng. Thêm giỏ chưa giữ chỗ; chọn một
        bài để mua và kiểm lại giá ở bước thanh toán.
      </AppText>
      <Button
        secondary
        title="Cập nhật giỏ sách"
        busy={query.isFetching}
        disabled={busy}
        onPress={() =>
          void refresh().catch((e) => setError(accountErrorMessage(e)))
        }
      />
      <Button
        secondary
        title="Đơn hàng của tôi"
        onPress={() => router.push("/orders")}
      />
      {query.isPending && <StatePanel loading title="Đang tải giỏ sách…" />}
      {query.error && (
        <Notice tone="error">
          Chưa tải được giỏ. {accountErrorMessage(query.error)}
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {needsRead && (
        <Notice>
          Lệnh đã ghi nhận. Tải lại giỏ để xem trạng thái mới trước khi chọn
          tiếp.
        </Notice>
      )}
      {pending && (
        <View style={styles.group}>
          <Notice>
            Chưa xác nhận được thao tác giỏ trước. Giữ nguyên yêu cầu khi thử
            lại.
          </Notice>
          <Button
            title="Xác minh thao tác giỏ trước"
            busy={busy}
            onPress={() => void remove()}
          />
        </View>
      )}
      {query.data && (
        <>
          <AppText>
            {query.data.items.length}/50 bài đăng trong giỏ. Mỗi lần chỉ mua một
            bài.
          </AppText>
          {!query.data.items.length && !query.error && (
            <StatePanel
              title="Giỏ sách đang trống"
              message="Mở một bài đăng bán để thêm vào giỏ."
              action={{ label: "Xem sách", onPress: () => router.push("/") }}
            />
          )}
          {query.data.items.map((item) => (
            <View key={item.listingId} style={styles.item}>
              {item.listing ? (
                <>
                  <View style={{ width: 96 }}>
                    <PublicPhoto
                      listingId={item.listingId}
                      revisionId={item.listing.revisionId}
                      mediaId={item.listing.photos[0].id}
                      label={(item.listing.bundle?.title || item.listing.book.title)}
                      active
                      compact
                    />
                  </View>
                  <AppText kind="bookHeading" accessibilityRole="header">
                    {(item.listing.bundle?.title || item.listing.book.title)}
                  </AppText>
                  <AppText>
                    {item.listing.seller.displayName} · Số lượng: 1
                  </AppText>
                  <AppText>
                    Giá hiện tại:{" "}
                    {item.listing.salePrice !== null
                      ? money(item.listing.salePrice)
                      : "Không bán"}
                  </AppText>
                  {item.priceAtAdd !== item.listing.salePrice && (
                    <Notice>
                      Giá khi thêm: {money(item.priceAtAdd)}. Giá đã thay đổi;
                      kiểm tra giá mới trước khi mua.
                    </Notice>
                  )}
                  {!item.canBuy && (
                    <Notice>
                      Hiện chưa thể mua: sách có thể đang được giữ, tài khoản bị
                      hạn chế hoặc thông tin giao hàng cần cập nhật.
                    </Notice>
                  )}
                  <Button
                    secondary
                    title="Xem bài đăng"
                    onPress={() =>
                      router.push({
                        pathname: "/book",
                        params: { id: item.listingId },
                      })
                    }
                  />
                  {item.canBuy && (
                    <Button
                      wine
                      title="Mua bài đăng này"
                      disabled={disabled || !!query.error}
                      onPress={() => setSelected(item.listing)}
                    />
                  )}
                </>
              ) : (
                <>
                  <AppText kind="bookHeading" accessibilityRole="header">
                    Bài đăng không còn công khai
                  </AppText>
                  <AppText>
                    Nội dung hiện không thể xem. Bạn có thể xóa dòng này khỏi
                    giỏ.
                  </AppText>
                </>
              )}
              <Button
                secondary
                title="Xóa khỏi giỏ"
                disabled={disabled}
                onPress={() => void remove(item.listingId)}
              />
            </View>
          ))}
        </>
      )}
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
    </Screen>
  );
}
const styles = StyleSheet.create({
  group: { gap: space.md },
  item: {
    gap: space.md,
    paddingVertical: space.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
});
