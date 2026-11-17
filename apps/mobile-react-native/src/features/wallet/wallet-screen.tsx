import { useState } from "react";
import {
  emptyWalletHistoryFilters,
  walletHistoryFilters,
  type WalletHistoryFilters,
  type Withdrawal,
} from "@used-books/session-client";
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
  TextField,
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
import { WithdrawalModal } from "./withdrawal-modal";
import { WithdrawalDetailModal } from "./withdrawal-detail-modal";
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
  const [withdrawalModalVisible, setWithdrawalModalVisible] = useState(false);
  const [selectedWithdrawalId, setSelectedWithdrawalId] = useState<string | null>(null);
  const [selectedWithdrawalData, setSelectedWithdrawalData] = useState<Withdrawal | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState(emptyWalletHistoryFilters);
  const [historyFilters, setHistoryFilters] = useState<WalletHistoryFilters>({});
  const [filterError, setFilterError] = useState<string>();
  const hasHistoryFilters = Object.keys(historyFilters).length > 0;
  const [checkingTopupId, setCheckingTopupId] = useState<string | null>(null);

  const summary = useQuery({
    ...summaryOptions(client, ownerId),
    enabled: foreground,
  });

  const history = useInfiniteQuery({
    ...historyOptions(client, ownerId, typeFilter, historyFilters),
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
                    ["Đang giữ chờ rút tiền", summary.data.withdrawalHeld],
                    ["Đang giữ cho đấu giá", summary.data.auctionHeld ?? 0],
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
                  secondary
                  title="Rút tiền về ngân hàng"
                  disabled={!summary.data.withdrawalsEnabled}
                  onPress={() => setWithdrawalModalVisible(true)}
                />
                {!summary.data.withdrawalsEnabled ? (
                  <AppText kind="small" color={stitchTokens.wine}>
                    Tính năng rút tiền hiện đang tạm khóa.
                  </AppText>
                ) : null}
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

          <View style={{ gap: space.sm }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: filterOpen }}
              onPress={() => setFilterOpen((open) => !open)}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <AppText kind="bold" color={stitchTokens.wineDark}>
                Lọc theo ngày hoặc mã giao dịch{hasHistoryFilters ? " · Đang áp dụng" : ""}
              </AppText>
            </Pressable>
            {filterOpen && (
              <View style={{ gap: space.sm }}>
                <TextField label="Từ ngày" placeholder="YYYY-MM-DD" maxLength={10}
                  value={filterDraft.from}
                  onChangeText={(from) => setFilterDraft({ ...filterDraft, from })} />
                <TextField label="Đến ngày" placeholder="YYYY-MM-DD" maxLength={10}
                  value={filterDraft.to}
                  onChangeText={(to) => setFilterDraft({ ...filterDraft, to })} />
                <TextField label="Mã giao dịch" placeholder="Ví dụ: ĐƠN-4A2B1C"
                  autoCapitalize="characters" autoCorrect={false} maxLength={42}
                  value={filterDraft.reference}
                  onChangeText={(reference) => setFilterDraft({ ...filterDraft, reference })} />
                {filterError && <Notice tone="error">{filterError}</Notice>}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                  <Button title="Áp dụng bộ lọc" onPress={() => {
                    const result = walletHistoryFilters(filterDraft);
                    if (result.error !== undefined) setFilterError(result.error);
                    else {
                      setHistoryFilters(result.filters);
                      setFilterError(undefined);
                    }
                  }} />
                  <Button title="Xóa bộ lọc" secondary onPress={() => {
                    setFilterDraft(emptyWalletHistoryFilters);
                    setHistoryFilters({});
                    setFilterError(undefined);
                  }} />
                </View>
              </View>
            )}
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
                typeFilter === "all" && !hasHistoryFilters
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
              <AppText kind="small" color={stitchTokens.subtleGray} selectable>
                Mã giao dịch {item.withdrawalId
                  ? `RÚT-${item.withdrawalId.slice(0, 6).toUpperCase()}`
                  : item.orderId ? `ĐƠN-${item.orderId.slice(0, 6).toUpperCase()}`
                    : item.topupId ? `NẠP-${item.topupId.slice(0, 6).toUpperCase()}`
                      : `SỔ-${item.journalId.slice(0, 6).toUpperCase()}`}
              </AppText>
              {item.withdrawalId ? (
                <Pressable
                  hitSlop={6}
                  style={{ alignSelf: "flex-start", paddingTop: 2 }}
                  onPress={() => {
                    setSelectedWithdrawalData(null);
                    setSelectedWithdrawalId(item.withdrawalId!);
                  }}
                >
                  <AppText kind="small" color={stitchTokens.wine} style={{ textDecorationLine: "underline" }}>
                    Xem chi tiết đơn rút & chứng từ →
                  </AppText>
                </Pressable>
              ) : null}
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

      {/* Withdrawal Modal */}
      <WithdrawalModal
        visible={withdrawalModalVisible}
        available={summary.data?.available ?? 0}
        enabled={Boolean(summary.data?.withdrawalsEnabled)}
        onClose={() => setWithdrawalModalVisible(false)}
        onSuccess={(created) => {
          setWithdrawalModalVisible(false);
          refresh();
          setSelectedWithdrawalData(created);
          setSelectedWithdrawalId(created.id);
        }}
      />

      {/* Withdrawal Detail Modal */}
      <WithdrawalDetailModal
        withdrawalId={selectedWithdrawalId}
        initialData={selectedWithdrawalData}
        onClose={() => {
          setSelectedWithdrawalId(null);
          setSelectedWithdrawalData(null);
        }}
      />
    </Screen>
  );
}
