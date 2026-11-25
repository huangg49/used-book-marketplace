import { useEffect, useRef, useState } from "react";
import {
  emptyWalletHistoryFilters,
  walletHistoryFilters,
  type WalletHistoryFilters,
  type Withdrawal,
} from "@used-books/session-client";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { router } from "expo-router";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  Button,
  Icon,
  Notice,
  Screen,
  Sheet,
  StatePanel,
  TextField,
  colors,
  formatVnd,
  presentError,
  radius,
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
import { SaleFeeBreakdown } from "../../core/ui/sale-fee-breakdown";

const FILTER_TABS = [
  { key: "all", label: "Tất cả" },
  { key: "Topup", label: "Nạp tiền" },
  { key: "OrderPayment", label: "Giữ tiền mua sách" },
  { key: "OrderSettlement", label: "Nhận tiền bán" },
  { key: "OrderRefund", label: "Hoàn tiền" },
  { key: "ListingFeeCharge", label: "Phí bài đăng" },
] as const;

function WalletBackdrop() {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 400 860"
      preserveAspectRatio="xMidYMin slice"
    >
      <Defs>
        <LinearGradient id="walletPaperGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={stitchTokens.parchment} />
          <Stop offset="55%" stopColor={stitchTokens.creamBg} />
          <Stop offset="100%" stopColor={stitchTokens.linenBg} />
        </LinearGradient>
        <LinearGradient id="walletWineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={stitchTokens.wineMid} />
          <Stop offset="55%" stopColor={stitchTokens.wine} />
          <Stop offset="100%" stopColor={stitchTokens.wineDark} />
        </LinearGradient>
        <RadialGradient id="walletGoldGlow" cx="86%" cy="10%" r="44%">
          <Stop offset="0%" stopColor={stitchTokens.gold} stopOpacity="0.32" />
          <Stop
            offset="60%"
            stopColor={stitchTokens.goldAccent}
            stopOpacity="0.08"
          />
          <Stop offset="100%" stopColor={stitchTokens.wine} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="walletBottomHalo" cx="12%" cy="90%" r="45%">
          <Stop
            offset="0%"
            stopColor={stitchTokens.goldAccent}
            stopOpacity="0.2"
          />
          <Stop offset="100%" stopColor={stitchTokens.linenBg} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="400" height="860" fill="url(#walletPaperGrad)" />
      <Rect x="0" y="0" width="400" height="860" fill="url(#walletBottomHalo)" />
      <Path d="M0 0 H400 V214 Q200 250 0 214 Z" fill="url(#walletWineGrad)" />
      <Path d="M0 0 H400 V214 Q200 250 0 214 Z" fill="url(#walletGoldGlow)" />
      <Circle
        cx="362"
        cy="38"
        r="84"
        fill="none"
        stroke={stitchTokens.gold}
        strokeOpacity="0.18"
        strokeWidth="1.2"
      />
      <Circle
        cx="362"
        cy="38"
        r="52"
        fill="none"
        stroke={stitchTokens.gold}
        strokeOpacity="0.14"
        strokeWidth="1"
      />
      <Circle
        cx="32"
        cy="172"
        r="58"
        fill="none"
        stroke={stitchTokens.gold}
        strokeOpacity="0.11"
        strokeWidth="1"
      />
      <Path
        d="M0 214 Q200 250 400 214"
        fill="none"
        stroke={stitchTokens.gold}
        strokeOpacity="0.45"
        strokeWidth="1.5"
      />
    </Svg>
  );
}

export function WalletScreen({
  ownerId,
  saleOrderId,
  showHistory = false,
}: {
  ownerId: string;
  saleOrderId?: string;
  showHistory?: boolean;
}) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const foreground = useForeground();
  const scrollRef = useRef<ScrollView>(null);
  const historyOpened = useRef(false);
  const [historyY, setHistoryY] = useState<number>();

  const [topupModalVisible, setTopupModalVisible] = useState(false);
  const [withdrawalModalVisible, setWithdrawalModalVisible] = useState(false);
  const [selectedWithdrawalId, setSelectedWithdrawalId] = useState<
    string | null
  >(null);
  const [selectedWithdrawalData, setSelectedWithdrawalData] =
    useState<Withdrawal | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>(
    saleOrderId ? "OrderSettlement" : "all",
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState({
    ...emptyWalletHistoryFilters,
    reference: saleOrderId ?? "",
  });
  const [historyFilters, setHistoryFilters] = useState<WalletHistoryFilters>(
    saleOrderId ? { reference: saleOrderId } : {},
  );
  const [openSaleReceipt, setOpenSaleReceipt] = useState<string | null>(
    saleOrderId ? "linked-order" : null,
  );
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

  useEffect(() => {
    if (
      !showHistory ||
      historyOpened.current ||
      historyY === undefined ||
      summary.isPending ||
      topups.isPending
    )
      return;
    const frame = requestAnimationFrame(() => {
      historyOpened.current = true;
      scrollRef.current?.scrollTo({ y: historyY + space.xl, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [historyY, showHistory, summary.isPending, topups.isPending]);

  const denied = accessDenied(summary.error) || accessDenied(history.error);
  const deniedError = accessDenied(summary.error)
    ? summary.error
    : history.error;

  const entries = history.data?.pages.flatMap((page) => page.items) ?? [];
  const saleReceipt = denied
    ? undefined
    : entries.find(
        (item) =>
          item.saleSettlement &&
          (openSaleReceipt === "linked-order"
            ? item.orderId === saleOrderId
            : item.journalId === openSaleReceipt),
      );
  const recentTopups = topups.data?.items ?? [];
  const isRefreshing =
    summary.isFetching || history.isFetching || topups.isFetching;

  const totalHeld = summary.data
    ? summary.data.transactionHeld +
      summary.data.withdrawalHeld +
      (summary.data.auctionHeld ?? 0)
    : 0;

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
        <View style={[styles.statusBadge, styles.statusBadgeSuccess]}>
          <AppText kind="small" style={styles.statusBadgeTextSuccess}>
            Đã nạp
          </AppText>
        </View>
      );
    }
    if (state === "Pending" || state === "Processing") {
      return (
        <View style={[styles.statusBadge, styles.statusBadgePending]}>
          <AppText kind="small" style={styles.statusBadgeTextPending}>
            Đang xử lý
          </AppText>
        </View>
      );
    }
    return (
      <View style={[styles.statusBadge, styles.statusBadgeFailed]}>
        <AppText kind="small" style={styles.statusBadgeTextFailed}>
          {topupLabels[state] ?? "Thất bại"}
        </AppText>
      </View>
    );
  }

  return (
    <Screen
      scrollRef={scrollRef}
      footer={<MemberNavigation current="/account" />}
      footerAppearance="navigation"
      background={<WalletBackdrop />}
      canvasColor={stitchTokens.creamBg}
    >
      {/* Top Bar over Wine Arch */}
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Về tài khoản"
          onPress={() => router.replace("./account")}
          style={({ pressed }) => [
            styles.backBtn,
            pressed && styles.btnPressed,
          ]}
        >
          <Icon name="back" size={18} color={stitchTokens.white} />
          <AppText kind="bold" style={styles.backBtnText}>
            Về tài khoản
          </AppText>
        </Pressable>

        {!denied ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cập nhật số dư"
            disabled={isRefreshing}
            onPress={refresh}
            style={({ pressed }) => [
              styles.syncPill,
              pressed && styles.btnPressed,
              isRefreshing && styles.btnDisabled,
            ]}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color={stitchTokens.gold} />
            ) : (
              <Icon name="sync" size={13} color={stitchTokens.gold} />
            )}
            <AppText kind="small" style={styles.syncPillText}>
              Cập nhật
            </AppText>
          </Pressable>
        ) : null}
      </View>

      {/* Hero Header */}
      <View style={styles.heroHeader}>
        <AppText style={styles.heroTitle} accessibilityRole="header">
          Ví của bạn
        </AppText>
        <AppText kind="small" style={styles.heroSub}>
          Tiền có thể dùng và các khoản đang giữ cho đơn sách.
        </AppText>
      </View>

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
            <>
              {/* Signature Wine-Gold Balance Pass */}
              <View style={styles.balanceHeroCard}>
                <View style={styles.balanceTopRow}>
                  <View style={styles.balanceLabelRow}>
                    <Icon name="wallet" size={15} color={stitchTokens.gold} />
                    <AppText kind="small" style={styles.balanceLabelText}>
                      Số dư có thể dùng
                    </AppText>
                  </View>
                  <View style={styles.simPill}>
                    <AppText kind="small" style={styles.simPillText}>
                      Mô phỏng
                    </AppText>
                  </View>
                </View>

                <AppText
                  style={styles.balanceAmount}
                  selectable
                  accessibilityLabel={`Số dư có thể dùng ${formatVnd(summary.data.available)}`}
                >
                  {formatVnd(summary.data.available)}
                </AppText>

                <View style={styles.totalInlineRow}>
                  <AppText kind="small" style={styles.totalInlineLabel}>
                    Tổng số dư
                  </AppText>
                  <AppText
                    kind="bold"
                    style={styles.totalInlineValue}
                    selectable
                  >
                    {formatVnd(summary.data.total)}
                  </AppText>
                </View>

                {/* Primary & Secondary Quick Actions Side-by-Side */}
                <View style={styles.heroActionsRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Nạp tiền vào ví qua VNPay"
                    onPress={() => setTopupModalVisible(true)}
                    style={({ pressed }) => [
                      styles.topupBtn,
                      pressed && styles.btnPressed,
                    ]}
                  >
                    <Icon name="plus" size={16} color={stitchTokens.wineDark} />
                    <AppText kind="bold" style={styles.topupBtnText}>
                      Nạp tiền
                    </AppText>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Rút tiền về ngân hàng"
                    disabled={!summary.data.withdrawalsEnabled}
                    onPress={() => setWithdrawalModalVisible(true)}
                    style={({ pressed }) => [
                      styles.withdrawBtn,
                      pressed && styles.btnPressed,
                      !summary.data.withdrawalsEnabled && styles.btnDisabled,
                    ]}
                  >
                    <Icon name="arrow" size={16} color={stitchTokens.white} />
                    <AppText kind="bold" style={styles.withdrawBtnText}>
                      Rút tiền
                    </AppText>
                  </Pressable>
                </View>

                {!summary.data.withdrawalsEnabled ? (
                  <AppText kind="small" style={styles.withdrawLockedText}>
                    Tính năng rút tiền hiện đang tạm khóa.
                  </AppText>
                ) : null}
              </View>

              {/* Simulation Disclosure Strip */}
              <View style={styles.simStrip}>
                <Icon name="info" size={14} color={stitchTokens.warmUmber} />
                <AppText kind="small" style={styles.simStripText}>
                  Mô phỏng đồ án. Số liệu thử nghiệm, không phải tiền thật.
                </AppText>
              </View>

              {/* Held Funds Breakdown Card */}
              <View style={styles.heldCard}>
                <View style={styles.heldCardHeader}>
                  <AppText kind="bold" style={styles.heldCardTitle}>
                    Các khoản đang tạm giữ
                  </AppText>
                  <AppText
                    kind="bold"
                    style={styles.heldCardTotal}
                    selectable
                  >
                    {formatVnd(totalHeld)}
                  </AppText>
                </View>

                <View style={styles.heldList}>
                  {(
                    [
                      [
                        "bag",
                        "Đang giữ cho đơn sách",
                        summary.data.transactionHeld,
                      ],
                      [
                        "gavel",
                        "Đang giữ cho đấu giá",
                        summary.data.auctionHeld ?? 0,
                      ],
                      [
                        "clock",
                        "Đang giữ chờ rút tiền",
                        summary.data.withdrawalHeld,
                      ],
                    ] as const
                  ).map(([iconName, label, amount], idx) => (
                    <View
                      key={label}
                      style={[
                        styles.heldRow,
                        idx > 0 && styles.heldRowBorder,
                      ]}
                    >
                      <View style={styles.heldRowLeft}>
                        <View style={styles.heldIconCircle}>
                          <Icon
                            name={iconName}
                            size={15}
                            color={stitchTokens.wine}
                          />
                        </View>
                        <AppText style={styles.heldRowLabel}>{label}</AppText>
                      </View>
                      <AppText
                        kind="bold"
                        style={[
                          styles.heldRowAmount,
                          amount > 0 && styles.heldRowAmountActive,
                        ]}
                        selectable
                      >
                        {formatVnd(amount)}
                      </AppText>
                    </View>
                  ))}
                </View>

                <View style={styles.serverTimeRow}>
                  <Icon
                    name="clock"
                    size={12}
                    color={stitchTokens.subtleGray}
                  />
                  <AppText kind="small" style={styles.serverTimeText}>
                    Máy chủ ghi nhận lúc {walletDate(summary.data.serverTime)}
                  </AppText>
                </View>
              </View>
            </>
          ) : null}

          {/* Recent Topup Requests (VNPay) */}
          {recentTopups.length > 0 ? (
            <View style={styles.sectionWrap}>
              <View style={styles.sectionHeaderRow}>
                <AppText kind="bold" style={styles.sectionTitle}>
                  Yêu cầu nạp gần đây
                </AppText>
                <View style={styles.sectionCountPill}>
                  <AppText kind="small" style={styles.sectionCountText}>
                    {Math.min(recentTopups.length, 5)}
                  </AppText>
                </View>
              </View>

              <View style={styles.whiteCardList}>
                {recentTopups.slice(0, 5).map((topupItem, index) => {
                  const isPending =
                    topupItem.state === "Pending" ||
                    topupItem.state === "Processing";
                  const isChecking = checkingTopupId === topupItem.id;

                  return (
                    <View
                      key={topupItem.id}
                      style={[
                        styles.topupRow,
                        index > 0 && styles.topupRowBorder,
                      ]}
                    >
                      <View style={styles.topupIconCircle}>
                        <Icon
                          name="plus"
                          size={15}
                          color={stitchTokens.likeNewGreen}
                        />
                      </View>

                      <View style={styles.topupInfo}>
                        <View style={styles.topupAmountLine}>
                          <AppText
                            kind="bold"
                            style={styles.topupAmount}
                            selectable
                          >
                            +{formatVnd(topupItem.amount)}
                          </AppText>
                          {renderTopupBadge(
                            topupItem.state,
                            topupItem.credited,
                          )}
                        </View>
                        <AppText kind="small" style={styles.mutedMeta}>
                          VNPay · {walletDate(topupItem.updatedAt)}
                        </AppText>
                      </View>

                      {isPending && !topupItem.credited ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => void handleCheckTopup(topupItem.id)}
                          disabled={isChecking}
                          style={({ pressed }) => [
                            styles.checkTopupBtn,
                            pressed && styles.btnPressed,
                          ]}
                        >
                          {isChecking ? (
                            <ActivityIndicator
                              size="small"
                              color={stitchTokens.wine}
                            />
                          ) : (
                            <AppText kind="small" style={styles.checkTopupText}>
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
          ) : null}

          {/* Transaction History Section */}
          <View
            style={styles.sectionWrap}
            onLayout={
              showHistory
                ? (event) => setHistoryY(event.nativeEvent.layout.y)
                : undefined
            }
          >
            <View style={styles.historyHeaderRow}>
              <View style={styles.historyHeaderLeft}>
                <AppText
                  kind="bold"
                  style={styles.sectionTitle}
                  accessibilityRole="header"
                >
                  Lịch sử ghi nhận
                </AppText>
                <AppText kind="small" style={styles.mutedMeta}>
                  Mới nhất trước · Chỉ các khoản đã ghi nhận.
                </AppText>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: filterOpen }}
                onPress={() => setFilterOpen((open) => !open)}
                style={({ pressed }) => [
                  styles.filterTogglePill,
                  (filterOpen || hasHistoryFilters) &&
                    styles.filterTogglePillActive,
                  pressed && styles.btnPressed,
                ]}
              >
                <Icon
                  name="tune"
                  size={14}
                  color={
                    filterOpen || hasHistoryFilters
                      ? stitchTokens.gold
                      : stitchTokens.wine
                  }
                />
                <AppText
                  kind="small"
                  style={[
                    styles.filterToggleText,
                    (filterOpen || hasHistoryFilters) &&
                      styles.filterToggleTextActive,
                  ]}
                >
                  {hasHistoryFilters ? "Đang lọc" : "Bộ lọc"}
                </AppText>
              </Pressable>
            </View>

            {/* Filter Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipsRow}
            >
              {FILTER_TABS.map((tab) => {
                const isActive = typeFilter === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    onPress={() => setTypeFilter(tab.key)}
                    style={({ pressed }) => [
                      styles.filterChip,
                      isActive && styles.filterChipActive,
                      pressed && styles.btnPressed,
                    ]}
                  >
                    <AppText
                      kind="small"
                      style={[
                        styles.filterChipText,
                        isActive && styles.filterChipTextActive,
                      ]}
                    >
                      {tab.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Collapsible Filter Panel */}
            {filterOpen ? (
              <View style={styles.filterPanelCard}>
                <View style={styles.filterDateRow}>
                  <View style={styles.filterDateCol}>
                    <TextField
                      label="Từ ngày"
                      placeholder="YYYY-MM-DD"
                      maxLength={10}
                      value={filterDraft.from}
                      onChangeText={(from) =>
                        setFilterDraft({ ...filterDraft, from })
                      }
                    />
                  </View>
                  <View style={styles.filterDateCol}>
                    <TextField
                      label="Đến ngày"
                      placeholder="YYYY-MM-DD"
                      maxLength={10}
                      value={filterDraft.to}
                      onChangeText={(to) =>
                        setFilterDraft({ ...filterDraft, to })
                      }
                    />
                  </View>
                </View>

                <TextField
                  label="Mã giao dịch"
                  placeholder="Ví dụ: ĐƠN-4A2B1C"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={42}
                  value={filterDraft.reference}
                  onChangeText={(reference) =>
                    setFilterDraft({ ...filterDraft, reference })
                  }
                />

                {filterError ? (
                  <Notice tone="error">{filterError}</Notice>
                ) : null}

                <View style={styles.filterBtnRow}>
                  <View style={styles.filterBtnFlex}>
                    <Button
                      wine
                      title="Áp dụng"
                      onPress={() => {
                        const result = walletHistoryFilters(filterDraft);
                        if (result.error !== undefined) {
                          setFilterError(result.error);
                        } else {
                          setHistoryFilters(result.filters);
                          setFilterError(undefined);
                        }
                      }}
                    />
                  </View>
                  <View style={styles.filterBtnFlex}>
                    <Button
                      title="Xóa bộ lọc"
                      secondary
                      onPress={() => {
                        setFilterDraft(emptyWalletHistoryFilters);
                        setHistoryFilters({});
                        setFilterError(undefined);
                      }}
                    />
                  </View>
                </View>
              </View>
            ) : null}

            {history.isPending ? (
              <StatePanel loading title="Đang tải lịch sử" />
            ) : null}

            {history.error && !history.isFetchNextPageError ? (
              <View style={{ gap: space.sm }}>
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
              </View>
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

            {/* History Entry Cards */}
            {entries.length > 0 ? (
              <View style={styles.entriesStack}>
                {entries.map((item) => {
                  const isCredit = item.amount >= 0;
                  const refCode = item.withdrawalId
                    ? `RÚT-${item.withdrawalId.slice(0, 6).toUpperCase()}`
                    : item.orderId
                      ? `ĐƠN-${item.orderId.slice(0, 6).toUpperCase()}`
                      : item.topupId
                        ? `NẠP-${item.topupId.slice(0, 6).toUpperCase()}`
                        : `SỔ-${item.journalId.slice(0, 6).toUpperCase()}`;

                  return (
                    <View key={item.journalId} style={styles.entryCard}>
                      <View style={styles.entryTopRow}>
                        <View
                          style={[
                            styles.entryIconCircle,
                            isCredit
                              ? styles.entryIconCredit
                              : styles.entryIconDebit,
                          ]}
                        >
                          <Icon
                            name={isCredit ? "plus" : "wallet"}
                            size={15}
                            color={
                              isCredit
                                ? stitchTokens.likeNewGreen
                                : stitchTokens.wine
                            }
                          />
                        </View>

                        <View style={styles.entryMain}>
                          <AppText kind="bold" style={styles.entryTitle}>
                            {historyLabels[item.type]}
                          </AppText>
                          <AppText kind="small" style={styles.mutedMeta}>
                            {walletDate(item.postedAt)}
                          </AppText>
                        </View>

                        <View style={styles.entryAmountCol}>
                          <AppText
                            kind="bold"
                            style={[
                              styles.entryAmount,
                              isCredit
                                ? styles.entryAmountCredit
                                : styles.entryAmountDebit,
                            ]}
                            selectable
                          >
                            {signedAmount(item.amount)}
                          </AppText>
                          <AppText kind="small" style={styles.entryBalanceAfter}>
                            Số dư: {formatVnd(item.balanceAfter)}
                          </AppText>
                        </View>
                      </View>

                      <View style={styles.entryFooterRow}>
                        <View style={styles.refPill}>
                          <AppText
                            kind="small"
                            style={styles.refPillText}
                            selectable
                          >
                            {refCode}
                          </AppText>
                        </View>

                        {item.withdrawalId ? (
                          <Pressable
                            accessibilityRole="button"
                            hitSlop={6}
                            style={({ pressed }) => [
                              styles.entryActionPill,
                              pressed && styles.btnPressed,
                            ]}
                            onPress={() => {
                              setSelectedWithdrawalData(null);
                              setSelectedWithdrawalId(item.withdrawalId!);
                            }}
                          >
                            <AppText
                              kind="small"
                              style={styles.entryActionText}
                            >
                              Xem chứng từ
                            </AppText>
                            <Icon
                              name="chevronRight"
                              size={13}
                              color={stitchTokens.wine}
                            />
                          </Pressable>
                        ) : item.saleSettlement ? (
                          <Pressable
                            accessibilityRole="button"
                            hitSlop={6}
                            style={({ pressed }) => [
                              styles.entryActionPill,
                              pressed && styles.btnPressed,
                            ]}
                            onPress={() => setOpenSaleReceipt(item.journalId)}
                          >
                            <AppText
                              kind="small"
                              style={styles.entryActionText}
                            >
                              Chi tiết quyết toán
                            </AppText>
                            <Icon
                              name="chevronRight"
                              size={13}
                              color={stitchTokens.wine}
                            />
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {history.isFetchNextPageError ? (
              <View style={{ gap: space.sm }}>
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
              </View>
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
          </View>
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

      {/* Sale Settlement Receipt Sheet */}
      <Sheet
        visible={openSaleReceipt !== null}
        onClose={() => setOpenSaleReceipt(null)}
        title="Biên nhận tiền bán sách"
      >
        {saleReceipt?.saleSettlement ? (
          <View style={{ gap: space.sm }}>
            <AppText kind="small" color={colors.muted} selectable>
              {saleReceipt.orderId
                ? `#ĐƠN-${saleReceipt.orderId.slice(0, 6).toUpperCase()} · `
                : ""}
              {walletDate(saleReceipt.postedAt)}
            </AppText>
            <SaleFeeBreakdown amounts={saleReceipt.saleSettlement} settled />
          </View>
        ) : history.isPending ? (
          <StatePanel loading title="Đang tải biên nhận" />
        ) : history.isError ? (
          <StatePanel
            title="Chưa tải được biên nhận"
            action={{
              label: "Thử lại",
              onPress: () => void history.refetch(),
            }}
          />
        ) : (
          <StatePanel
            title="Không tìm thấy biên nhận"
            message="Chỉ các khoản đã ghi vào ví của bạn mới có biên nhận quyết toán."
          />
        )}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingVertical: 2,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingVertical: 6,
    paddingRight: 12,
  },
  backBtnText: {
    color: stitchTokens.white,
  },
  syncPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.whiteAlpha14,
    borderWidth: 1,
    borderColor: stitchTokens.goldAlpha40,
  },
  syncPillText: {
    color: stitchTokens.gold,
    fontWeight: "700",
    fontSize: 12,
  },
  heroHeader: {
    gap: 4,
    marginBottom: space.sm,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: stitchTokens.white,
  },
  heroSub: {
    color: stitchTokens.gold,
  },

  /* Signature Wine-Gold Balance Hero Card */
  balanceHeroCard: {
    backgroundColor: stitchTokens.wine,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: stitchTokens.goldAlpha40,
    padding: 18,
    gap: 12,
    shadowColor: stitchTokens.wineDark,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  balanceTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  balanceLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  balanceLabelText: {
    color: stitchTokens.goldLight,
    fontWeight: "600",
    fontSize: 13,
  },
  simPill: {
    backgroundColor: stitchTokens.whiteAlpha14,
    borderWidth: 1,
    borderColor: stitchTokens.goldAlpha40,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  simPillText: {
    color: stitchTokens.gold,
    fontWeight: "700",
    fontSize: 11,
  },
  balanceAmount: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
    color: stitchTokens.gold,
    fontVariant: ["tabular-nums"],
  },
  totalInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.whiteAlpha14,
  },
  totalInlineLabel: {
    color: stitchTokens.goldLight,
    opacity: 0.85,
  },
  totalInlineValue: {
    color: stitchTokens.white,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  heroActionsRow: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 4,
  },
  topupBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: stitchTokens.gold,
    paddingHorizontal: 14,
  },
  topupBtnText: {
    color: stitchTokens.wineDark,
    fontSize: 14.5,
  },
  withdrawBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: stitchTokens.whiteAlpha14,
    borderWidth: 1,
    borderColor: stitchTokens.goldAlpha40,
    paddingHorizontal: 14,
  },
  withdrawBtnText: {
    color: stitchTokens.white,
    fontSize: 14.5,
  },
  withdrawLockedText: {
    color: stitchTokens.goldLight,
    textAlign: "center",
  },

  /* Compact Simulation Disclosure Strip */
  simStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: stitchTokens.warmIvory,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  simStripText: {
    color: stitchTokens.warmUmber,
    flex: 1,
    fontSize: 12,
  },

  /* Held Funds Breakdown Card */
  heldCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 16,
    gap: 12,
    shadowColor: stitchTokens.wineDark,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  heldCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  heldCardTitle: {
    fontSize: 15,
    color: stitchTokens.wineDark,
  },
  heldCardTotal: {
    fontSize: 15,
    color: stitchTokens.wine,
    fontVariant: ["tabular-nums"],
  },
  heldList: {
    borderTopWidth: 1,
    borderTopColor: stitchTokens.creamBg,
  },
  heldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingVertical: 11,
  },
  heldRowBorder: {
    borderTopWidth: 1,
    borderTopColor: stitchTokens.creamBg,
  },
  heldRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  heldIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: stitchTokens.wineAlpha08,
    alignItems: "center",
    justifyContent: "center",
  },
  heldRowLabel: {
    fontSize: 13.5,
    color: colors.ink,
    flexShrink: 1,
  },
  heldRowAmount: {
    fontSize: 14,
    color: stitchTokens.subtleGray,
    fontVariant: ["tabular-nums"],
  },
  heldRowAmountActive: {
    color: stitchTokens.wineDark,
  },
  serverTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.creamBg,
  },
  serverTimeText: {
    color: stitchTokens.subtleGray,
    fontSize: 11.5,
  },

  /* Sections */
  sectionWrap: {
    gap: space.md,
    paddingTop: space.sm,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  sectionTitle: {
    fontSize: 17,
    color: stitchTokens.wineDark,
  },
  sectionCountPill: {
    backgroundColor: stitchTokens.wineAlpha08,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  sectionCountText: {
    color: stitchTokens.wine,
    fontWeight: "700",
    fontSize: 11.5,
  },

  /* Recent Topups Card */
  whiteCardList: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    overflow: "hidden",
    shadowColor: stitchTokens.wineDark,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  topupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  topupRowBorder: {
    borderTopWidth: 1,
    borderTopColor: stitchTokens.creamBg,
  },
  topupIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: stitchTokens.likeNewGreenBg,
    alignItems: "center",
    justifyContent: "center",
  },
  topupInfo: {
    flex: 1,
    gap: 2,
  },
  topupAmountLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  topupAmount: {
    color: stitchTokens.likeNewGreen,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusBadgeSuccess: {
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  statusBadgeTextSuccess: {
    color: stitchTokens.likeNewGreen,
    fontWeight: "700",
    fontSize: 11,
  },
  statusBadgePending: {
    backgroundColor: stitchTokens.goldLight,
  },
  statusBadgeTextPending: {
    color: stitchTokens.goldDark,
    fontWeight: "700",
    fontSize: 11,
  },
  statusBadgeFailed: {
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  statusBadgeTextFailed: {
    color: stitchTokens.wine,
    fontWeight: "700",
    fontSize: 11,
  },
  checkTopupBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.wineAlpha08,
    borderWidth: 1,
    borderColor: stitchTokens.wineAlpha20,
    minHeight: 34,
    justifyContent: "center",
  },
  checkTopupText: {
    color: stitchTokens.wine,
    fontWeight: "700",
    fontSize: 12,
  },

  /* History Header & Filter Controls */
  historyHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.sm,
  },
  historyHeaderLeft: {
    flex: 1,
    gap: 2,
  },
  filterTogglePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  filterTogglePillActive: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wine,
  },
  filterToggleText: {
    color: stitchTokens.wine,
    fontWeight: "700",
    fontSize: 12,
  },
  filterToggleTextActive: {
    color: stitchTokens.gold,
  },
  filterChipsRow: {
    gap: 8,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    minHeight: 36,
    justifyContent: "center",
  },
  filterChipActive: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wine,
  },
  filterChipText: {
    color: stitchTokens.wineDark,
    fontWeight: "600",
    fontSize: 12.5,
  },
  filterChipTextActive: {
    color: stitchTokens.gold,
    fontWeight: "700",
  },
  filterPanelCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 16,
    gap: space.md,
    shadowColor: stitchTokens.wineDark,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  filterDateRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  filterDateCol: {
    flex: 1,
  },
  filterBtnRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  filterBtnFlex: {
    flex: 1,
  },

  /* History Entries */
  entriesStack: {
    gap: 10,
  },
  entryCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 14,
    gap: 10,
    shadowColor: stitchTokens.wineDark,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  entryTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  entryIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  entryIconCredit: {
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  entryIconDebit: {
    backgroundColor: stitchTokens.wineAlpha08,
  },
  entryMain: {
    flex: 1,
    gap: 2,
  },
  entryTitle: {
    fontSize: 14,
    color: stitchTokens.wineDark,
  },
  entryAmountCol: {
    alignItems: "flex-end",
    gap: 2,
  },
  entryAmount: {
    fontSize: 14.5,
    fontVariant: ["tabular-nums"],
  },
  entryAmountCredit: {
    color: stitchTokens.likeNewGreen,
  },
  entryAmountDebit: {
    color: stitchTokens.wine,
  },
  entryBalanceAfter: {
    color: stitchTokens.subtleGray,
    fontSize: 11.5,
    fontVariant: ["tabular-nums"],
  },
  entryFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.creamBg,
  },
  refPill: {
    backgroundColor: stitchTokens.creamBg,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  refPillText: {
    color: stitchTokens.warmUmber,
    fontWeight: "600",
    fontSize: 11.5,
  },
  entryActionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.wineAlpha08,
  },
  entryActionText: {
    color: stitchTokens.wine,
    fontWeight: "700",
    fontSize: 12,
  },
  mutedMeta: {
    color: stitchTokens.subtleGray,
    fontSize: 12,
  },
  btnPressed: {
    opacity: 0.78,
  },
  btnDisabled: {
    opacity: 0.45,
  },
});
