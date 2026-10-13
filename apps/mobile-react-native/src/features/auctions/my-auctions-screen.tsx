import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  BackAction,
  Button,
  Chip,
  Notice,
  Screen,
  StatePanel,
  colors,
  formatVnd,
  presentError,
  radius,
  space,
} from "../../core/ui";
import { MemberNavigation } from "../navigation/member-navigation";
import { myAuctionsOptions, type MyAuctionView } from "./auctions-model";
import type { MyAuctionItem } from "./contracts";

const VIEWS: { value: MyAuctionView; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "active", label: "Đang diễn ra" },
  { value: "payment", label: "Cần thanh toán" },
  { value: "selling", label: "Sách tôi bán" },
];
const time = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

// The member's own auctions: bids, wins to pay and books they sell.
export function MyAuctionsScreen({ userId }: { userId: string }) {
  const { client } = useSession();
  const foreground = useForeground();
  const [view, setView] = useState<MyAuctionView>("all");
  const result = useInfiniteQuery({ ...myAuctionsOptions(client, userId, view), enabled: foreground });
  const items = result.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Screen footer={<MemberNavigation current="/auctions" />} footerAppearance="navigation">
      <BackAction title="Về phiên đang mở" onPress={() => router.replace("/auctions")} />
      <View style={{ gap: space.sm }}>
        <AppText kind="label" color={colors.rustText}>
          ĐẤU GIÁ
        </AppText>
        <AppText kind="heading" color={colors.forest} accessibilityRole="header">
          Phiên của tôi
        </AppText>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {VIEWS.map((option) => (
          <Chip key={option.value} wine title={option.label} selected={view === option.value} onPress={() => setView(option.value)} />
        ))}
      </View>
      {result.isPending && <StatePanel loading title="Đang tải phiên của bạn" />}
      {result.error && (
        <>
          <Notice tone="error">{presentError(result.error).message}</Notice>
          <Button secondary title="Thử tải lại" busy={result.isFetching} onPress={() => void result.refetch()} />
        </>
      )}
      {result.isSuccess && items.length === 0 && (
        <StatePanel title="Chưa có phiên nào ở mục này" message="Phiên bạn trả giá, thắng hoặc bán sẽ hiện ở đây." icon="info" />
      )}
      <View style={{ gap: space.md }}>
        {items.map((item) => (
          <Row key={item.auction.id} item={item} />
        ))}
      </View>
      {result.hasNextPage && (
        <Button secondary title="Xem thêm" busy={result.isFetchingNextPage} onPress={() => void result.fetchNextPage()} />
      )}
    </Screen>
  );
}

function Row({ item }: { item: MyAuctionItem }) {
  const { auction } = item;
  const status = item.needsPayment
    ? `Cần thanh toán trước ${item.paymentDeadline ? time(item.paymentDeadline) : "hạn"}`
    : item.won
      ? "Bạn đã thắng"
      : item.role === "Seller"
        ? "Sách bạn bán"
        : auction.state === "Active"
          ? item.leading
            ? "Bạn đang dẫn giá"
            : "Bạn chưa dẫn giá"
          : "Phiên đã kết thúc";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${auction.title}. ${status}.`}
      onPress={() => router.push({ pathname: "/auction", params: { id: auction.id } })}
      style={({ pressed }) => ({
        gap: space.xs,
        padding: space.lg,
        borderWidth: 1,
        borderColor: item.needsPayment ? colors.terracotta : colors.rule,
        borderRadius: radius.card,
        backgroundColor: pressed ? colors.paper : colors.surface,
      })}
    >
      <AppText kind="label" color={item.needsPayment ? colors.rustText : colors.muted}>
        {status.toUpperCase()}
      </AppText>
      <AppText kind="shelfTitle" color={colors.forest} numberOfLines={2}>
        {auction.title}
      </AppText>
      <AppText kind="small" color={colors.muted}>
        {/* A Buy Now win has no bid price; never show the start price as paid. */}
        {auction.currentPrice !== null
          ? formatVnd(auction.currentPrice)
          : item.won
            ? "Mua ngay"
            : `Khởi điểm ${formatVnd(auction.startPrice)}`}{" "}
        · {auction.pointName}
      </AppText>
    </Pressable>
  );
}
