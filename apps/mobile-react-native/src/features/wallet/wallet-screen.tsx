import { useState } from "react";
import { View, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
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
  stitchTokens,
} from "../../core/ui";
import { MemberNavigation } from "../navigation/member-navigation";
import {
  accessDenied,
  historyLabels,
  historyOptions,
  queryVNPayTopup,
  signedAmount,
  summaryOptions,
  topupLabels,
  topupsOptions,
  walletDate,
} from "./wallet-model";
import { TopupModal } from "./topup-modal";
import type { TopupState } from "./contracts";

const FILTER_TABS = [
  { key: "all", label: "Tất cả" },
  { key: "Topup", label: "Nạp tiền" },
  { key: "OrderPayment", label: "Giữ tiền mua sách" },
  { key: "OrderSettlement", label: "Nhận tiền bán" },
  { key: "OrderRefund", label: "Hoàn tiền" },
  { key: "ListingFeeCharge", label: "Phí bài đăng" },
] as const;

export function WalletScreen({ ownerId }: { ownerId: string }) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const foreground = useForeground();

  const [topupModalVisible, setTopupModalVisible] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [checkingTopupId, setCheckingTopupId] = useState<string | null>(null);

  const summary = useQuery({
    ...summaryOptions(client, ownerId),
    enabled: foreground,
  });

  const history = useInfiniteQuery({
    ...historyOptions(client, ownerId, typeFilter),
    enabled: foreground,
  });

  const topups = useQuery({
    ...topupsOptions(client, ownerId),
    enabled: foreground,
  });

  const denied = accessDenied(summary.error) || accessDenied(history.error);
  const deniedError = accessDenied(summary.error)
    ? summary.error
    : history.error;

  const entries = history.data?.pages.flatMap((page) => page.items) ?? [];
  const recentTopups = topups.data?.items ?? [];

  const refresh = () => {
    void summary.refetch();
    void history.refetch();
    void topups.refetch();
  };

  async function handleCheckTopup(id: string) {
    setCheckingTopupId(id);
    try {
      await queryVNPayTopup(client, id);
      void queryClient.invalidateQueries({
        queryKey: ["wallet", ownerId, "summary"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["wallet", ownerId, "history"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["wallet", ownerId, "topups"],
      });
    } catch {
      // Handled silently or refreshed
    } finally {
      setCheckingTopupId(null);
    }
  }

  function renderTopupBadge(state: TopupState, credited: boolean) {
    if (credited || state === "Succeeded") {
      return (
        <View
          style={{
            backgroundColor: stitchTokens.likeNewGreenBg,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 6,
          }}
        >
          <AppText
            kind="small"
            color={stitchTokens.likeNewGreen}
            style={{ fontWeight: "700", fontSize: 11 }}
          >
            Đã nạp
          </AppText>
        </View>
      );
    }
    if (state === "Pending" || state === "Processing") {
      return (
        <View
          style={{
            backgroundColor: stitchTokens.goldLight,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 6,
          }}
        >
          <AppText
            kind="small"
            color={stitchTokens.goldDark}
            style={{ fontWeight: "700", fontSize: 11 }}
          >
            Đang xử lý
          </AppText>
        </View>
      );
    }
    return (
      <View
        style={{
          backgroundColor: stitchTokens.roseWarmSurface,
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 6,
        }}
      >
        <AppText
          kind="small"
          color={stitchTokens.wine}
          style={{ fontWeight: "700", fontSize: 11 }}
        >
          {topupLabels[state] ?? "Thất bại"}
        </AppText>
      </View>
    );
  }

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
            <View
              style={{
                backgroundColor: stitchTokens.warmIvory,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: stitchTokens.peachBorder,
                padding: space.lg,
                gap: space.md,
              }}
            >
              <View style={{ gap: 4 }}>
                <AppText kind="bold" color={stitchTokens.wineDark}>
                  Số dư có thể dùng
                </AppText>
                <AppText
                  kind="price"
                  color={stitchTokens.wine}
                  selectable
                  style={{
                    fontSize: 28,
                    fontWeight: "800",
                    lineHeight: 34,
                  }}
                >
                  {formatVnd(summary.data.available)}
                </AppText>
              </View>

              <View
                style={{
                  borderTopWidth: 1,
                  borderColor: stitchTokens.peachBorder,
                  paddingTop: space.md,
                  gap: space.xs,
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
                    <AppText color={stitchTokens.subtleGray} style={{ flexGrow: 1 }}>
                      {label}
                    </AppText>
                    <AppText kind="bold" color={stitchTokens.wineDark} selectable>
                      {formatVnd(amount)}
                    </AppText>
                  </View>
                ))}
              </View>

              {/* Action Buttons */}
              <View style={{ gap: space.sm, paddingTop: space.xs }}>
                <Button
                  wine
                  title="Nạp tiền vào ví (VNPay)"
                  onPress={() => setTopupModalVisible(true)}
                />
                <Button
                  title="Cập nhật số dư"
                  secondary
                  busy={summary.isFetching || history.isFetching}
                  onPress={refresh}
                />
              </View>

              <AppText kind="small" color={stitchTokens.subtleGray}>
                Máy chủ ghi nhận lúc {walletDate(summary.data.serverTime)}.
              </AppText>
            </View>
          ) : null}

          {/* Recent Topup Requests (VNPay) */}
          {recentTopups.length > 0 && (
            <View style={{ gap: space.sm, paddingTop: space.md }}>
              <AppText
                kind="bold"
                color={stitchTokens.wineDark}
                style={{ fontSize: 16 }}
              >
                Yêu cầu nạp gần đây
              </AppText>

              <View
                style={{
                  backgroundColor: stitchTokens.white,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: stitchTokens.peachBorder,
                  overflow: "hidden",
                }}
              >
                {recentTopups.slice(0, 5).map((topupItem, index) => {
                  const isPending =
                    topupItem.state === "Pending" ||
                    topupItem.state === "Processing";
                  const isChecking = checkingTopupId === topupItem.id;

                  return (
                    <View
                      key={topupItem.id}
                      style={{
                        padding: space.md,
                        borderTopWidth: index === 0 ? 0 : 1,
                        borderColor: stitchTokens.parchment,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <View style={{ gap: 2, flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <AppText
                            kind="bold"
                            color={stitchTokens.likeNewGreen}
                            selectable
                          >
                            +{formatVnd(topupItem.amount)}
                          </AppText>
                          {renderTopupBadge(topupItem.state, topupItem.credited)}
                        </View>
                        <AppText kind="small" color={stitchTokens.subtleGray}>
                          {walletDate(topupItem.updatedAt)}
                        </AppText>
                      </View>

                      {isPending && !topupItem.credited ? (
                        <Pressable
                          onPress={() => void handleCheckTopup(topupItem.id)}
                          disabled={isChecking}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 8,
                            backgroundColor: stitchTokens.parchment,
                            borderWidth: 1,
                            borderColor: stitchTokens.peachBorder,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          {isChecking ? (
                            <ActivityIndicator size="small" color={stitchTokens.wine} />
                          ) : (
                            <AppText
                              kind="small"
                              color={stitchTokens.wine}
                              style={{ fontWeight: "700" }}
                            >
                              Kiểm tra
                            </AppText>
                          )}
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Transaction History Section */}
          <View style={{ gap: space.sm, paddingTop: space.lg }}>
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

            {/* Filter Tabs / Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, paddingVertical: 4 }}
            >
              {FILTER_TABS.map((tab) => {
                const isActive = typeFilter === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    onPress={() => setTypeFilter(tab.key)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 10,
                      backgroundColor: isActive
                        ? stitchTokens.wine
                        : stitchTokens.warmIvory,
                      borderWidth: 1,
                      borderColor: isActive
                        ? stitchTokens.wine
                        : stitchTokens.peachBorder,
                    }}
                  >
                    <AppText
                      kind="small"
                      color={
                        isActive ? stitchTokens.white : stitchTokens.wineDark
                      }
                      style={{ fontWeight: isActive ? "700" : "500" }}
                    >
                      {tab.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
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
              message={
                typeFilter === "all"
                  ? "Khi có khoản nạp ví, thanh toán hoặc hoàn tiền đã hoàn tất, bạn có thể xem lại ở đây."
                  : "Không có giao dịch nào khớp với bộ lọc đã chọn."
              }
              icon="wallet"
            />
          ) : null}

          {entries.map((item) => (
            <View
              key={item.journalId}
              style={{
                backgroundColor: stitchTokens.white,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: stitchTokens.peachBorder,
                padding: space.md,
                gap: 4,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  gap: space.sm,
                  alignItems: "center",
                }}
              >
                <AppText kind="bold" color={stitchTokens.wineDark} style={{ flexGrow: 1 }}>
                  {historyLabels[item.type]}
                </AppText>
                <AppText
                  kind="bold"
                  color={item.amount >= 0 ? stitchTokens.likeNewGreen : stitchTokens.wine}
                  selectable
                >
                  {signedAmount(item.amount)}
                </AppText>
              </View>
              <AppText kind="small" color={stitchTokens.subtleGray}>
                {walletDate(item.postedAt)}
              </AppText>
              <AppText kind="small" color={stitchTokens.subtleGray}>
                Số dư sau ghi nhận: {formatVnd(item.balanceAfter)}
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

      {/* VNPay Topup Modal */}
      <TopupModal
        visible={topupModalVisible}
        onClose={() => setTopupModalVisible(false)}
        ownerId={ownerId}
        onSuccess={() => {
          refresh();
        }}
      />
    </Screen>
  );
}
