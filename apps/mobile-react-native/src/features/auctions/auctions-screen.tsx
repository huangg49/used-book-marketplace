import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  Button,
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
import { formatRemaining, usePublicAuctions } from "./auctions-model";
import type { PublicAuctionSummary } from "./contracts";

// Open auctions, ending soonest first (the API's order). Each row opens the
// auction; the price shown is the server's, never a client estimate.
export function AuctionsScreen() {
  const { client } = useSession();
  const foreground = useForeground();
  const result = usePublicAuctions(client, foreground);
  const items = result.data?.items ?? [];
  // Rows render only with data, so the server time is always there.
  const now = result.data ? Date.parse(result.data.serverTime) : 0;
  return (
    <Screen
      footer={<MemberNavigation current="/auctions" />}
      footerAppearance="navigation"
    >
      <View style={{ gap: space.sm }}>
        <AppText kind="label" color={colors.rustText}>
          ĐẤU GIÁ
        </AppText>
        <AppText kind="heading" color={colors.forest} accessibilityRole="header">
          Phiên đang mở
        </AppText>
        <AppText color={colors.muted}>
          Sách đã được nhận và kiểm tra tình trạng tại điểm giao nhận trước khi
          mở phiên. Mỗi phiên kéo dài 24 giờ, không gia hạn.
        </AppText>
      </View>
      <Notice>Mô phỏng đồ án. Giá và ví là dữ liệu thử nghiệm.</Notice>
      {result.isPending && <StatePanel loading title="Đang tải phiên đấu giá" />}
      {result.error && (
        <>
          <Notice tone="error">
            {result.data ? "Danh sách dưới đây chưa được cập nhật. " : ""}
            {presentError(result.error).message}
          </Notice>
          <Button
            secondary
            title="Thử tải lại"
            busy={result.isFetching}
            onPress={() => void result.refetch()}
          />
        </>
      )}
      {result.isSuccess && items.length === 0 && (
        <StatePanel
          title="Chưa có phiên nào đang mở"
          message="Phiên mới xuất hiện sau khi sách được kiểm tra tại điểm giao nhận."
          icon="info"
        />
      )}
      <View style={{ gap: space.md }}>
        {items.map((item) => (
          <AuctionRow key={item.id} item={item} now={now} />
        ))}
      </View>
    </Screen>
  );
}

function AuctionRow({ item, now }: { item: PublicAuctionSummary; now: number }) {
  const price = item.currentPrice ?? item.startPrice;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.currentPrice === null ? "Giá khởi điểm" : "Giá hiện tại"} ${formatVnd(price)}. Còn ${formatRemaining(Date.parse(item.endAt) - now)}.`}
      onPress={() => router.push({ pathname: "/auction", params: { id: item.id } })}
      style={({ pressed }) => ({
        gap: space.xs,
        padding: space.lg,
        borderWidth: 1,
        borderColor: colors.rule,
        borderRadius: radius.card,
        backgroundColor: pressed ? colors.paper : colors.surface,
      })}
    >
      <AppText kind="shelfTitle" color={colors.forest} numberOfLines={2}>
        {item.title}
      </AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md, alignItems: "baseline" }}>
        <AppText kind="shelfPrice" color={colors.ink}>
          {formatVnd(price)}
        </AppText>
        <AppText kind="small" color={colors.muted}>
          {item.currentPrice === null ? "giá khởi điểm" : `${item.bidderCount} người trả giá`}
        </AppText>
      </View>
      <AppText kind="small" color={colors.muted}>
        Còn {formatRemaining(Date.parse(item.endAt) - now)} · {item.pointName}
        {item.buyNowPrice !== null ? ` · mua ngay ${formatVnd(item.buyNowPrice)}` : ""}
      </AppText>
    </Pressable>
  );
}
