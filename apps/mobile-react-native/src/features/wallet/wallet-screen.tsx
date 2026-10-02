import { View } from "react-native";
import { router } from "expo-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  BackAction,
  Button,
  Notice,
  Screen,
  StatePanel,
  colors,
  formatVnd,
  presentError,
  space,
  typography,
} from "../../core/ui";
import { MemberNavigation } from "../navigation/member-navigation";
import {
  accessDenied,
  historyLabels,
  historyOptions,
  signedAmount,
  summaryOptions,
  walletDate,
} from "./wallet-model";

export function WalletScreen({ ownerId }: { ownerId: string }) {
  const { client } = useSession();
  const foreground = useForeground();
  const summary = useQuery({
    ...summaryOptions(client, ownerId),
    enabled: foreground,
  });
  const history = useInfiniteQuery({
    ...historyOptions(client, ownerId),
    enabled: foreground,
  });
  const denied = accessDenied(summary.error) || accessDenied(history.error);
  const deniedError = accessDenied(summary.error)
    ? summary.error
    : history.error;
  const entries = history.data?.pages.flatMap((page) => page.items) ?? [];
  const refresh = () => {
    void summary.refetch();
    void history.refetch();
  };
  return (
    <Screen
      footer={<MemberNavigation current="/account" />}
      footerAppearance="navigation"
    >
      <BackAction
        title="Về tài khoản"
        onPress={() => router.replace("./account")}
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
          Ví của bạn
        </AppText>
        <AppText color={colors.muted}>
          Tiền có thể dùng và các khoản đang giữ cho đơn sách.
        </AppText>
      </View>
      <Notice>Mô phỏng đồ án. Số liệu thử nghiệm, không phải tiền thật.</Notice>
      {denied ? (
        <StatePanel
          title="Chưa xem được ví"
          message={presentError(deniedError).message}
          icon="info"
        />
      ) : (
        <>
          {summary.isPending ? (
            <StatePanel loading title="Đang tải số dư" />
          ) : null}
          {summary.error ? (
            <Notice tone="error">
              {summary.data ? "Số dư đang hiển thị chưa được cập nhật. " : ""}
              {presentError(summary.error).message}
            </Notice>
          ) : null}
          {summary.data ? (
            <View style={{ gap: space.xl, paddingVertical: space.lg }}>
              <View style={{ gap: space.sm }}>
                <AppText kind="bold">Có thể dùng</AppText>
                <AppText
                  kind="price"
                  color={colors.forest}
                  selectable
                  style={{
                    fontSize: typography.title[0],
                    lineHeight: typography.title[1],
                  }}
                >
                  {formatVnd(summary.data.available)}
                </AppText>
              </View>
              <View
                style={{
                  borderTopWidth: 1,
                  borderColor: colors.rule,
                  paddingTop: space.lg,
                  gap: space.md,
                }}
              >
                {(
                  [
                    ["Đang giữ cho đơn sách", summary.data.transactionHeld],
                    ["Tổng số dư", summary.data.total],
                  ] as const
                ).map(([label, amount]) => (
                  <View
                    key={label}
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      justifyContent: "space-between",
                      gap: space.sm,
                    }}
                  >
                    <AppText color={colors.muted} style={{ flexGrow: 1 }}>
                      {label}
                    </AppText>
                    <AppText kind="bold" selectable>
                      {formatVnd(amount)}
                    </AppText>
                  </View>
                ))}
              </View>
              <AppText kind="small" color={colors.muted}>
                Máy chủ ghi nhận lúc {walletDate(summary.data.serverTime)}.
              </AppText>
            </View>
          ) : null}
          <Button
            title="Cập nhật ví"
            secondary
            busy={summary.isFetching || history.isFetching}
            onPress={refresh}
          />
          <View style={{ gap: space.md, paddingTop: space.lg }}>
            <AppText
              kind="heading"
              color={colors.forest}
              accessibilityRole="header"
            >
              Lịch sử ghi nhận
            </AppText>
            <AppText kind="small" color={colors.muted}>
              Mới nhất trước. Chỉ các khoản đã ghi nhận xuất hiện ở đây.
            </AppText>
          </View>
          {history.isPending ? (
            <StatePanel loading title="Đang tải lịch sử" />
          ) : null}
          {history.error && !history.isFetchNextPageError ? (
            <>
              <Notice tone="error">
                {history.data ? "Chưa tải được đầy đủ lịch sử. " : ""}
                {presentError(history.error).message}
              </Notice>
              <Button
                title="Thử lại lịch sử"
                secondary
                busy={history.isFetching}
                onPress={() => {
                  void history.refetch();
                }}
              />
            </>
          ) : null}
          {history.data && entries.length === 0 ? (
            <StatePanel
              title="Chưa có khoản ghi nhận"
              message="Khi có khoản nạp mô phỏng, giữ tiền hoặc hoàn tiền đã hoàn tất, bạn có thể xem lại ở đây."
              icon="wallet"
            />
          ) : null}
          {entries.map((item) => (
            <View
              key={item.journalId}
              style={{
                borderTopWidth: 1,
                borderColor: colors.rule,
                paddingTop: space.lg,
                gap: space.sm,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  gap: space.sm,
                }}
              >
                <AppText kind="bold" style={{ flexGrow: 1 }}>
                  {historyLabels[item.type]}
                </AppText>
                <AppText kind="bold" color={colors.forest} selectable>
                  {signedAmount(item.amount)}
                </AppText>
              </View>
              <AppText kind="small" color={colors.muted}>
                {walletDate(item.postedAt)}
              </AppText>
              <AppText kind="small" color={colors.muted}>
                Có thể dùng sau ghi nhận: {formatVnd(item.balanceAfter)}
              </AppText>
            </View>
          ))}
          {history.isFetchNextPageError ? (
            <>
              <Notice tone="error">
                Chưa tải thêm được lịch sử.{" "}
                {presentError(history.error).message}
              </Notice>
              <Button
                title="Thử tải thêm"
                secondary
                busy={history.isFetching}
                onPress={() => void history.fetchNextPage()}
              />
            </>
          ) : null}
          {history.hasNextPage && !history.isFetchNextPageError ? (
            <Button
              title="Xem thêm lịch sử"
              secondary
              busy={history.isFetchingNextPage}
              disabled={history.isFetching && !history.isFetchingNextPage}
              onPress={() => void history.fetchNextPage()}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}
