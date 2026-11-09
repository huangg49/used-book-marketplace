import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  BackAction,
  Button,
  Chip,
  Icon,
  Notice,
  Screen,
  StatePanel,
  colors,
  formatVnd,
  presentError,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import { MemberNavigation } from "../navigation/member-navigation";
import {
  canReschedule,
  closeReasonText,
  isSealedFormat,
  isScheduled,
  myAuctionsOptions,
  openTimeOf,
  waitingTime,
  type MyAuctionView,
} from "./auctions-model";
import { ScheduleAuctionSheet } from "./components";
import { AuctionCover } from "./components/auction-cover";
import type { MyAuctionItem } from "./contracts";

const VIEWS: { value: MyAuctionView; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "active", label: "Đang diễn ra" },
  { value: "upcoming", label: "Sắp mở" },
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
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<MyAuctionItem | null>(null);
  // Scheduled/editable states follow the clock without reading it in render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const edited = editing?.auction;
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
          <Row key={item.auction.id} item={item} now={now} onEdit={() => setEditing(item)} />
        ))}
      </View>
      <ScheduleAuctionSheet
        key={edited ? `${edited.id}:${edited.version}` : "none"}
        visible={!!edited}
        title={edited?.title ?? ""}
        target={
          edited
            ? {
                kind: "reschedule",
                auctionId: edited.id,
                version: edited.version!,
                live: !isScheduled(edited, now),
                // ADR 0081: a waiting registration auction edits its open time.
                startAt: openTimeOf(edited),
                endAt: new Date(Date.parse(openTimeOf(edited)) + Date.parse(edited.endAt) - Date.parse(edited.startAt)).toISOString(),
                latestStartAt: edited.latestStartAt ?? null,
              }
            : null
        }
        onClose={() => setEditing(null)}
        onDone={() => void queryClient.invalidateQueries({ queryKey: ["my-auctions", userId] })}
      />
      {result.hasNextPage && (
        <Button secondary title="Xem thêm" busy={result.isFetchingNextPage} onPress={() => void result.fetchNextPage()} />
      )}
    </Screen>
  );
}

function Row({ item, now, onEdit }: { item: MyAuctionItem; now: number; onEdit: () => void }) {
  const { auction } = item;
  const scheduled = isScheduled(auction, now);
  const waiting = waitingTime(auction, now);
  const formatType = auction.auctionType ?? "English";
  const isDutch = formatType === "Dutch";
  const isSealed = isSealedFormat(auction);

  const status = item.needsPayment
    ? `Cần thanh toán trước ${item.paymentDeadline ? time(item.paymentDeadline) : "hạn"}`
    : scheduled
      ? `${waiting.label} ${time(waiting.at)}`
      : item.won
        ? "Bạn đã thắng phiên"
        : item.role === "Seller"
          ? auction.state === "Active"
            ? "Phiên của bạn đang mở"
            : closeReasonText(auction) ?? "Sách bạn bán"
          : auction.state === "Active"
            ? isSealed
              ? "Đã gửi giá kín"
              : item.leading
                ? "Bạn đang dẫn giá"
                : "Bạn chưa dẫn giá"
            : closeReasonText(auction) ?? "Phiên đã kết thúc";

  const isLeadOrWon = item.won || (auction.state === "Active" && item.leading);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${auction.title}. ${status}.`}
      onPress={() => router.push({ pathname: "/auction", params: { id: auction.id } })}
      style={({ pressed }) => ({
        gap: space.md,
        padding: space.md,
        borderWidth: 1.5,
        borderColor: item.needsPayment
          ? colors.terracotta
          : isLeadOrWon
            ? stitchTokens.greenBorderSoft
            : stitchTokens.cardBorder,
        borderRadius: radius.card * 2,
        backgroundColor: pressed ? stitchTokens.parchment : stitchTokens.whiteSurface,
        shadowColor: stitchTokens.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
      })}
    >
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        {/* Book Cover Thumbnail */}
        <View
          style={{
            width: 68,
            height: 86,
            borderRadius: 8,
            overflow: "hidden",
            backgroundColor: stitchTokens.parchment,
            borderWidth: 1,
            borderColor: stitchTokens.cardBorder,
          }}
        >
          <AuctionCover
            auctionId={auction.id}
            mediaId={auction.book?.photos[0]?.id}
            label={auction.title}
            iconSize={20}
          />
        </View>

        {/* Info Column */}
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <View
              style={{
                backgroundColor: item.needsPayment
                  ? stitchTokens.flashRedBg
                  : isLeadOrWon
                    ? stitchTokens.likeNewGreenBg
                    : item.role === "Seller"
                      ? stitchTokens.goldLight
                      : stitchTokens.parchment,
                borderWidth: 1,
                borderColor: item.needsPayment
                  ? stitchTokens.redBorderSoft
                  : isLeadOrWon
                    ? stitchTokens.greenBorderSoft
                    : item.role === "Seller"
                      ? stitchTokens.goldBorder
                      : stitchTokens.cardBorder,
                borderRadius: radius.pill,
                paddingHorizontal: 8,
                paddingVertical: 2,
              }}
            >
              <AppText
                kind="small"
                style={{
                  fontSize: 10,
                  fontWeight: "800",
                  color: item.needsPayment
                    ? colors.rustText
                    : isLeadOrWon
                      ? stitchTokens.likeNewGreen
                      : stitchTokens.wineDark,
                }}
              >
                {item.role === "Seller" ? "NGƯỜI BÁN" : item.won ? "ĐÃ THẮNG" : "NGƯỜI MUA"}
              </AppText>
            </View>

            {(isDutch || isSealed) && (
              <View
                style={{
                  backgroundColor: stitchTokens.roseWarmSurface,
                  borderRadius: 4,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderWidth: 1,
                  borderColor: stitchTokens.peachBorder,
                }}
              >
                <AppText kind="small" style={{ fontSize: 10, fontWeight: "700", color: stitchTokens.wineDark }}>
                  {isDutch ? "Kiểu Hà Lan" : formatType === "SealedSecond" ? "Kín #2" : "Kín #1"}
                </AppText>
              </View>
            )}

            {auction.minBidders != null && scheduled && (
              <View
                style={{
                  backgroundColor: stitchTokens.parchment,
                  borderRadius: 4,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderWidth: 1,
                  borderColor: stitchTokens.cardBorder,
                }}
              >
                <AppText kind="small" style={{ fontSize: 10, fontWeight: "700", color: stitchTokens.deepCocoa }}>
                  {`ĐK: ${auction.registeredCount ?? 0}/${auction.minBidders}`}
                </AppText>
              </View>
            )}
          </View>

          <AppText kind="shelfTitle" color={colors.forest} numberOfLines={2}>
            {auction.title}
          </AppText>

          <AppText
            kind="small"
            color={item.needsPayment ? colors.rustText : isLeadOrWon ? colors.success : colors.muted}
            style={{ fontWeight: "700" }}
          >
            {status}
          </AppText>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
            <AppText kind="bold" style={{ color: stitchTokens.wineDark, fontSize: 15 }}>
              {/* A Buy Now win has no bid price; never show the start price as paid. */}
              {auction.currentPrice !== null
                ? formatVnd(auction.currentPrice)
                : item.won
                  ? "Mua ngay"
                  : `Khởi điểm ${formatVnd(auction.startPrice)}`}
            </AppText>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Icon name="pin" size={11} color={stitchTokens.subtleGray} />
              <AppText kind="small" color={colors.muted} style={{ fontSize: 11 }}>
                {auction.pointName}
              </AppText>
            </View>
          </View>
        </View>
      </View>

      {item.role === "Seller" && canReschedule(auction, now) && (
        <Button wine secondary title="Đổi thời gian phiên" onPress={onEdit} />
      )}
    </Pressable>
  );
}
