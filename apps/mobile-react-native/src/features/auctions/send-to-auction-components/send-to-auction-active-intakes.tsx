import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AppText, Button, Icon, TextField, formatVnd, radius, space, stitchTokens } from "../../../core/ui";
import type { MyIntake } from "../contracts";
import { EVIDENCE_MIN_LENGTH, withdrawable } from "../auctions-model";

export interface SendToAuctionActiveIntakesProps {
  readonly intakes: MyIntake[];
  readonly isLoading?: boolean;
  readonly onWithdraw: (intake: MyIntake) => void;
  readonly onPublish: (intake: MyIntake) => void;
  readonly onOpenAuction: (auctionId: string) => void;
  readonly includeClosed?: boolean;
  readonly onSubmitEvidence: (intake: MyIntake, note: string) => void;
  readonly evidenceTextMap: Record<string, string>;
  readonly onChangeEvidenceText: (id: string, text: string) => void;
  readonly evidenceError?: { id: string; text: string } | null;
  readonly disabled?: boolean;
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });

const intakeLabels: Record<MyIntake["state"], string> = {
  AwaitingDropoff: "Chờ bạn mang sách tới",
  Received: "Điểm đã nhận, chờ kiểm tra",
  NeedsEvidence: "Cần bổ sung bằng chứng",
  Passed: "Đạt kiểm tra, chờ người bán đăng phiên",
  Auctioning: "Đã tạo phiên đấu giá",
  Sold: "Người thắng đã thanh toán",
  ReclaimRequired: "Mời bạn tới nhận lại sách",
  Reclaimed: "Bạn đã nhận lại sách",
  Cancelled: "Đã hủy lần gửi sách",
};

export function SendToAuctionActiveIntakes({
  intakes,
  isLoading = false,
  onWithdraw,
  onPublish,
  onOpenAuction,
  includeClosed = false,
  onSubmitEvidence,
  evidenceTextMap,
  onChangeEvidenceText,
  evidenceError,
  disabled = false,
}: SendToAuctionActiveIntakesProps) {
  const activeList = intakes.filter((i) => includeClosed || (i.state !== "Cancelled" && i.state !== "Reclaimed"));

  return (
    <View style={styles.root}>
      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color={stitchTokens.wine} />
          <AppText kind="small" color={stitchTokens.brownMuted}>Đang tải danh sách hồ sơ…</AppText>
        </View>
      ) : activeList.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Icon name="book" size={24} color={stitchTokens.wine} />
          </View>
          <AppText kind="bold" style={styles.emptyTitle}>Chưa có hồ sơ gửi sách nào</AppText>
          <AppText kind="small" style={styles.emptyDesc}>
            Khi bạn tạo đơn gửi sách tới điểm TP.HCM, tiến độ kiểm định và đăng phiên sẽ hiển thị tại đây.
          </AppText>
        </View>
      ) : (
        <View style={styles.cards}>
          {activeList.map((item) => {
            const isWithdrawable = withdrawable(item.state);
            const isNeedsEvidence = item.state === "NeedsEvidence";
            const currentEvidenceText = evidenceTextMap[item.id] ?? "";
            const currentError = evidenceError?.id === item.id ? evidenceError.text : null;

            return (
              <View key={item.id} style={styles.intakeCard}>
                {/* 1. Status & Ref */}
                <View style={styles.cardHeader}>
                  <View
                    style={[
                      styles.statusPill,
                      item.state === "AwaitingDropoff" && styles.pillWarn,
                      item.state === "NeedsEvidence" && styles.pillError,
                      item.state === "Passed" && styles.pillSuccess,
                    ]}
                  >
                    <Icon
                      name={
                        item.state === "Passed"
                          ? "check"
                          : item.state === "NeedsEvidence"
                            ? "info"
                            : "clock"
                      }
                      size={12}
                      color={
                        item.state === "NeedsEvidence"
                          ? stitchTokens.flashRed
                          : item.state === "Passed"
                            ? stitchTokens.likeNewGreen
                            : stitchTokens.wineDark
                      }
                    />
                    <AppText
                      style={[
                        styles.statusText,
                        item.state === "NeedsEvidence" && styles.statusTextError,
                        item.state === "Passed" && styles.statusTextSuccess,
                      ]}
                    >
                      {intakeLabels[item.state]}
                    </AppText>
                  </View>
                  <AppText kind="small" style={styles.refCode}>#{item.id.slice(0, 6).toUpperCase()}</AppText>
                </View>

                {/* 2. Title & Pricing */}
                <View style={styles.infoBlock}>
                  <AppText kind="bold" style={styles.intakeTitle}>{item.title}</AppText>
                  <AppText kind="small" color={stitchTokens.brownMuted} style={styles.metaText}>
                    Khởi điểm {formatVnd(item.startPrice)} · Bước {formatVnd(item.step)}
                  </AppText>
                  {item.state === "AwaitingDropoff" ? (
                    <View style={styles.deadlineRow}>
                      <Icon name="clock" size={13} color={stitchTokens.flashRed} />
                      <AppText kind="small" style={styles.deadlineText}>
                        Mang sách tới điểm trước {formatDateTime(item.dropoffDeadline)}
                      </AppText>
                    </View>
                  ) : null}
                </View>

                {/* 3. Examiner Note */}
                {Boolean(item.inspectionNote) ? (
                  <View style={styles.noteBox}>
                    <AppText kind="bold" style={styles.noteTitle}>Ghi chú kiểm tra tại điểm</AppText>
                    <AppText kind="small" color={stitchTokens.deepCocoa} style={styles.noteBody}>
                      {item.inspectionNote}
                    </AppText>
                  </View>
                ) : null}

                {/* 4. Evidence Submission */}
                {isNeedsEvidence && !item.evidenceSubmittedAt ? (
                  <View style={styles.evidenceBox}>
                    <TextField
                      label="Bằng chứng / Giải trình bổ sung"
                      multiline
                      value={currentEvidenceText}
                      editable={!disabled}
                      maxLength={2000}
                      placeholder="Mô tả nguồn gốc, dấu riêng hoặc giấy tờ bạn có để đối chiếu…"
                      onChangeText={(text) => onChangeEvidenceText(item.id, text)}
                      hint={`Tối thiểu ${EVIDENCE_MIN_LENGTH} ký tự. Chỉ gửi được một lần duy nhất.`}
                      error={currentError ?? undefined}
                    />
                    <Button
                      wine
                      title="Gửi bằng chứng"
                      disabled={disabled}
                      onPress={() => onSubmitEvidence(item, currentEvidenceText)}
                    />
                  </View>
                ) : null}

                {isNeedsEvidence && Boolean(item.evidenceSubmittedAt) ? (
                  <View style={styles.submittedBanner}>
                    <Icon name="verified" size={15} color={stitchTokens.likeNewGreen} />
                    <AppText kind="small" style={styles.submittedText}>
                      Đã gửi bằng chứng lúc {formatDateTime(item.evidenceSubmittedAt!)}. Nhân viên tại điểm đang đối chiếu lại.
                    </AppText>
                  </View>
                ) : null}

                {/* 5. Actions with proper spacing and 48dp+ touch targets */}
                {(item.auctionId || isWithdrawable) ? (
                  <View style={styles.actionsCol}>
                    {item.auctionId ? (
                      <Button
                        wine
                        secondary
                        title="Xem phiên đấu giá"
                        disabled={disabled}
                        onPress={() => onOpenAuction(item.auctionId!)}
                      />
                    ) : null}
                    {isWithdrawable && item.state === "Passed" ? (
                      <Button
                        wine
                        title="Đăng phiên"
                        disabled={disabled}
                        onPress={() => onPublish(item)}
                      />
                    ) : null}
                    {isWithdrawable ? (
                      <Button
                        destructive
                        secondary
                        title="Rút sách khỏi đấu giá"
                        disabled={disabled}
                        onPress={() => onWithdraw(item)}
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  centerBox: { alignItems: "center", paddingVertical: space.section, gap: 8 },
  emptyCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: space.xl,
    alignItems: "center",
    gap: 10,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: stitchTokens.roseWarmSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 15, color: stitchTokens.wineDark, textAlign: "center" },
  emptyDesc: { fontSize: 13, color: stitchTokens.brownMuted, textAlign: "center", lineHeight: 19 },

  cards: { gap: space.md },
  intakeCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: space.lg,
    gap: space.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  statusPill: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.parchment,
  },
  pillWarn: { backgroundColor: stitchTokens.amberBg },
  pillError: { backgroundColor: stitchTokens.flashRedBg },
  pillSuccess: { backgroundColor: stitchTokens.likeNewGreenBg },
  statusText: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  statusTextError: { color: stitchTokens.flashRed },
  statusTextSuccess: { color: stitchTokens.likeNewGreen },
  refCode: { color: stitchTokens.brownMuted, fontVariant: ["tabular-nums"], fontWeight: "600" },

  infoBlock: { gap: 4 },
  intakeTitle: { fontSize: 16, lineHeight: 22, color: stitchTokens.wineDark },
  metaText: { fontVariant: ["tabular-nums"] },
  deadlineRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  deadlineText: { color: stitchTokens.flashRed, fontWeight: "600" },

  noteBox: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  noteTitle: { fontSize: 12, color: stitchTokens.wineDark },
  noteBody: { lineHeight: 18 },

  evidenceBox: {
    borderTopWidth: 1,
    borderTopColor: stitchTokens.borderWarm,
    paddingTop: space.md,
    gap: space.sm,
  },
  submittedBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderRadius: 12,
    padding: 12,
  },
  submittedText: { flex: 1, color: stitchTokens.deepCocoa, lineHeight: 18 },

  actionsCol: {
    borderTopWidth: 1,
    borderTopColor: stitchTokens.borderWarm,
    paddingTop: space.md,
    gap: space.sm,
  },
});
