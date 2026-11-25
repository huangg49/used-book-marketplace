import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import * as Crypto from "expo-crypto";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  Button,
  ConfirmDialog,
  Icon,
  Notice,
  colors,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import { auctionReceipt, type PublicAuctionSummary } from "./contracts";
import {
  AUCTION_MAX_OPEN_CHANGES,
  AUCTION_MIN_BIDDERS_CAP,
  AUCTION_MIN_BIDDERS_FLOOR,
  AUCTION_RESCHEDULE_FREEZE_MS,
  auctionErrorText,
  createSellerCommand,
  lateOpenText,
  openRuleText,
  openTimeOf,
  outcomeUnknown,
  type SellerCommand,
} from "./auctions-model";
import { ScheduleAuctionSheet } from "./components";

const DONE: Record<SellerCommand["kind"], string> = {
  LowerMin: "Đã giảm số người tối thiểu.",
  RaiseMin: "Đã tăng số người tối thiểu.",
  Close: "Đã đóng phiên; người đăng ký được hoàn cọc.",
};

/**
 * ADR 0079/0081: the seller's controls while the auction waits for
 * registrants: move the open time (2 changes, before it and never in its last
 * 30 minutes, within publish + 30 days), lower the minimum (never below 4,
 * locked once reached) and close before the start.
 */
export function WaitingSellerBlock({
  auction,
  now,
  refresh,
}: {
  auction: PublicAuctionSummary;
  now: number;
  refresh: () => Promise<unknown>;
}) {
  const { client } = useSession();
  const need = auction.minBidders ?? AUCTION_MIN_BIDDERS_FLOOR;
  const count = auction.registeredCount ?? 0;
  const reached = count >= need;
  const version = auction.version ?? 0;
  const openTime = openTimeOf(auction);
  const passed = Date.parse(openTime) <= now;
  const frozen = Date.parse(openTime) - now <= AUCTION_RESCHEDULE_FREEZE_MS;
  const length = Date.parse(auction.endAt) - Date.parse(auction.startAt);
  const editsLeft = Math.max(0, AUCTION_MAX_OPEN_CHANGES - (auction.scheduleRevision ?? 0));
  const defaultLower = Math.max(AUCTION_MIN_BIDDERS_FLOOR, need - 1);
  const canRaise = count === 0 && need < AUCTION_MIN_BIDDERS_CAP;
  const [selectedMin, setSelectedMin] = useState<number | null>(null);
  const targetMin = selectedMin ?? defaultLower;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<SellerCommand | null>(null);
  const [closing, setClosing] = useState(false);
  const [editing, setEditing] = useState(false);

  const progressPct = Math.min(100, Math.round((count / Math.max(1, need)) * 100));

  const lowerChoices: number[] = [];
  for (let n = AUCTION_MIN_BIDDERS_FLOOR; n < need; n++) {
    lowerChoices.push(n);
  }

  const send = async (command: SellerCommand) => {
    setBusy(true);
    setError(null);
    try {
      await client.request(command.path, auctionReceipt, {
        method: "POST",
        body: command.body,
        headers: { "Idempotency-Key": command.key },
      });
      setPending(null);
      setNotice(DONE[command.kind]);
    } catch (caught) {
      setPending(outcomeUnknown(caught) ? command : null);
      setError(auctionErrorText(caught));
    } finally {
      setBusy(false);
      setClosing(false);
      void refresh();
    }
  };
  const run = (kind: SellerCommand["kind"], minBidders?: number) =>
    void send(createSellerCommand(auction.id, kind, version, Crypto.randomUUID(), minBidders));

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Icon name="tune" size={17} color={stitchTokens.wineDark} />
          </View>
          <View style={styles.headerText}>
            <AppText kind="bold" style={styles.title}>Quản lý phiên của bạn</AppText>
            <AppText kind="small" color={colors.muted}>
              {reached ? "Đã đủ người đăng ký mở phiên" : "Đang chờ đủ người đăng ký đặt cọc"}
            </AppText>
          </View>
        </View>

        <View style={[styles.countPill, reached && styles.countPillReached]}>
          <AppText style={[styles.countPillText, reached && styles.countPillTextReached]}>
            {`${count}/${need} người`}
          </AppText>
        </View>
      </View>

      {/* Progress Section (flat, no nested card) */}
      <View style={styles.progressSection}>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: need, now: count }}
          style={styles.progressTrack}
        >
          <View
            style={[
              styles.progressFill,
              { width: `${progressPct}%` },
              reached && styles.progressFillReached,
            ]}
          />
        </View>
        <AppText kind="small" color={colors.ink} style={styles.ruleText}>
          {openRuleText(auction, now)}
        </AppText>
      </View>

      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {pending ? (
        <Button wine title="Thử lại đúng lệnh vừa rồi" busy={busy} onPress={() => void send(pending)} />
      ) : (
        <View style={styles.sections}>
          {/* 1. Open Time */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Icon name="clock" size={15} color={stitchTokens.wine} />
                <AppText kind="bold" style={styles.sectionTitle}>Giờ hẹn mở phiên</AppText>
              </View>
              <View style={styles.editsBadge}>
                <AppText style={styles.editsBadgeText}>
                  {`Còn ${editsLeft}/${AUCTION_MAX_OPEN_CHANGES} lần đổi`}
                </AppText>
              </View>
            </View>

            <AppText kind="small" color={colors.muted} style={styles.helper}>
              {passed
                ? `Đã qua giờ mở nên không đổi giờ được nữa. Phiên ${lateOpenText(need)}.`
                : frozen
                  ? "Không đổi giờ trong 30 phút cuối trước giờ mở."
                  : editsLeft <= 0
                    ? "Đã dùng hết 2 lần đổi giờ mở."
                    : `Còn ${editsLeft} lần đổi giờ mở trong 30 ngày kể từ lúc đăng.${reached ? " Phiên đã đủ người nên chỉ dời sớm hơn." : ""}`}
            </AppText>

            <Button
              wine
              secondary
              title="Đổi giờ mở"
              disabled={busy || frozen || editsLeft <= 0}
              onPress={() => setEditing(true)}
            />
          </View>

          {/* 2. Minimum Registrants */}
          {!reached && need > AUCTION_MIN_BIDDERS_FLOOR ? (
            <View style={styles.section}>
              <AppText kind="bold" style={styles.sectionTitle}>Hạ số người đăng ký tối thiểu</AppText>
              <AppText kind="small" color={colors.muted} style={styles.helper}>
                Chọn mức thấp hơn (tối thiểu 4 người) để phiên dễ đủ điều kiện mở hơn.
              </AppText>

              {lowerChoices.length > 1 ? (
                <View style={styles.minChoices}>
                  {lowerChoices.map((n) => {
                    const selected = targetMin === n;
                    return (
                      <Pressable
                        key={n}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected, disabled: busy }}
                        disabled={busy}
                        onPress={() => setSelectedMin(n)}
                        style={({ pressed }) => [
                          styles.minPill,
                          selected && styles.minPillSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <AppText kind="bold" style={[styles.minPillText, selected && styles.minPillTextSelected]}>
                          {`${n} người`}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {count >= targetMin ? (
                <AppText kind="small" style={styles.enoughHint}>
                  {`Hiện đã có ${count} người — hạ xuống ${targetMin} người là đủ điều kiện mở phiên.`}
                </AppText>
              ) : null}

              <Button
                wine
                secondary
                title={`Giảm tối thiểu còn ${targetMin} người`}
                disabled={busy}
                onPress={() => run("LowerMin", targetMin)}
              />
            </View>
          ) : reached ? (
            <View style={styles.section}>
              <AppText kind="small" color={colors.muted} style={styles.helper}>
                Đã đủ người đăng ký nên số người tối thiểu được giữ nguyên.
              </AppText>
            </View>
          ) : null}

          {canRaise ? (
            <View style={styles.section}>
              <Button
                wine
                secondary
                title={`Tăng tối thiểu lên ${need + 1} người`}
                disabled={busy}
                onPress={() => run("RaiseMin", need + 1)}
              />
              <AppText kind="small" color={colors.muted} style={styles.helper}>
                Chưa có ai đăng ký nên còn tăng được số người tối thiểu; khi đã có người đăng ký thì chỉ giảm được.
              </AppText>
            </View>
          ) : null}

          {/* 3. Close Auction */}
          <View style={styles.section}>
            <Button
              destructive
              secondary
              title="Đóng phiên trước giờ mở"
              disabled={busy}
              onPress={() => setClosing(true)}
            />
          </View>
        </View>
      )}

      <ScheduleAuctionSheet
        key={`${auction.id}:${version}`}
        visible={editing}
        title={auction.title}
        target={{
          kind: "reschedule",
          auctionId: auction.id,
          version,
          live: false,
          startAt: openTime,
          endAt: new Date(Date.parse(openTime) + length).toISOString(),
          latestStartAt: reached
            ? new Date(Date.parse(openTime) - 60_000).toISOString()
            : auction.latestStartAt ?? null,
        }}
        onClose={() => setEditing(false)}
        onDone={() => void refresh()}
      />
      <ConfirmDialog
        visible={closing}
        title="Đóng phiên trước giờ mở?"
        message={`Phiên bị hủy ngay, ${count} người đăng ký được hoàn cọc và nhận thông báo, sách được trả lại cho bạn tại ${auction.pointName}. Sau khi phiên mở, bạn không đóng được nữa.`}
        confirmLabel="Đóng phiên"
        destructive
        busy={busy}
        onCancel={() => !busy && setClosing(false)}
        onConfirm={() => run("Close")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: 16,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.sm,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: stitchTokens.roseWarmSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 16, color: stitchTokens.wineDark },
  countPill: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  countPillReached: { backgroundColor: stitchTokens.likeNewGreenBg },
  countPillText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  countPillTextReached: { color: stitchTokens.likeNewGreen },

  progressSection: { gap: 8 },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: stitchTokens.parchment,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: stitchTokens.wine,
  },
  progressFillReached: { backgroundColor: stitchTokens.likeNewGreen },
  ruleText: { lineHeight: 19 },

  sections: { gap: space.md },
  section: {
    borderTopWidth: 1,
    borderTopColor: stitchTokens.borderWarm,
    paddingTop: space.md,
    gap: space.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.sm,
    flexWrap: "wrap",
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontSize: 14, color: stitchTokens.wineDark },
  editsBadge: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  editsBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  helper: { lineHeight: 19 },
  minChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  minPill: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.parchment,
  },
  minPillSelected: {
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.wine,
  },
  minPillText: { fontSize: 13, color: stitchTokens.wineDark },
  minPillTextSelected: { color: stitchTokens.warmIvory },
  enoughHint: { color: stitchTokens.likeNewGreen, fontWeight: "700", lineHeight: 19 },
  pressed: { opacity: 0.78 },
});
