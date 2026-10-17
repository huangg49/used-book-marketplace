import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon } from "../../../core/ui/icon";
import { formatVnd } from "../../../core/ui/format";
import { stitchTokens } from "../../../core/ui/theme";
import type { MyIntake } from "../contracts";
import { withdrawable, EVIDENCE_MIN_LENGTH } from "../auctions-model";

export interface SendToAuctionActiveIntakesProps {
  readonly intakes: MyIntake[];
  readonly isLoading?: boolean;
  readonly onWithdraw: (intake: MyIntake) => void;
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

export function SendToAuctionActiveIntakes({
  intakes,
  isLoading = false,
  onWithdraw,
  onSubmitEvidence,
  evidenceTextMap,
  onChangeEvidenceText,
  evidenceError,
  disabled = false,
}: SendToAuctionActiveIntakesProps) {
  // Filter active intakes that are not completed/reclaimed
  const activeList = intakes.filter((i) => i.state !== "Cancelled" && i.state !== "Reclaimed");

  return (
    <View style={styles.sectionContainer}>
      {/* Header */}
      <View style={styles.sectionHeaderRow}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="gavel" size={17} color={stitchTokens.wineDark} />
          <AppText kind="bold" style={styles.sectionTitle}>
            Sách đã gửi đấu giá
          </AppText>
        </View>
        <View style={styles.countBadge}>
          <AppText kind="small" style={styles.countBadgeText}>
            {activeList.length} ấn bản lưu chuyển
          </AppText>
        </View>
      </View>

      {/* Loading state */}
      {isLoading && (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="small" color={stitchTokens.wine} />
          <AppText kind="small" style={{ color: stitchTokens.subtleGray, marginTop: 6 }}>
            Đang tải danh sách hồ sơ...
          </AppText>
        </View>
      )}

      {/* Empty state */}
      {!isLoading && activeList.length === 0 && (
        <View style={styles.emptyContainer}>
          <Icon name="book" size={24} color={stitchTokens.subtleGray} />
          <AppText kind="bold" style={styles.emptyTitle}>
            Chưa có hồ sơ đấu giá
          </AppText>
          <AppText kind="small" style={styles.emptyDesc}>
            Khi bạn gửi sách tới trạm tiếp nhận, trạng thái kiểm tra và phiên đấu giá sẽ hiển thị tại đây.
          </AppText>
        </View>
      )}

      {/* Active Cards */}
      {!isLoading && activeList.length > 0 && (
        <View style={styles.cardsContainer}>
          {activeList.map((item) => {
            const isWithdrawable = withdrawable(item.state);
            const isNeedsEvidence = item.state === "NeedsEvidence";
            const currentEvidenceText = evidenceTextMap[item.id] ?? "";
            const currentError = evidenceError?.id === item.id ? evidenceError.text : null;

            return (
              <View key={item.id} style={styles.intakeCard}>
                {/* 1. Status Bar */}
                <View style={styles.cardHeaderRow}>
                  <View
                    style={[
                      styles.statusPill,
                      item.state === "AwaitingDropoff" && styles.statusPillWarning,
                      item.state === "NeedsEvidence" && styles.statusPillError,
                      item.state === "Passed" && styles.statusPillSuccess,
                      item.state === "Received" && styles.statusPillNeutral,
                      item.state === "ReclaimRequired" && styles.statusPillNeutral,
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
                            ? stitchTokens.verifiedGreen
                            : stitchTokens.wineDark
                      }
                    />
                    <AppText
                      kind="small"
                      style={[
                        styles.statusPillText,
                        item.state === "NeedsEvidence" && { color: stitchTokens.flashRed },
                        item.state === "Passed" && { color: stitchTokens.verifiedGreen },
                      ]}
                    >
                      {item.state === "AwaitingDropoff"
                        ? "Chờ bạn mang sách tới"
                        : item.state === "Received"
                          ? "Điểm đã nhận, chờ kiểm tra"
                          : item.state === "NeedsEvidence"
                            ? "Cần bổ sung bằng chứng"
                            : item.state === "Passed"
                              ? "Đạt kiểm tra, chờ mở phiên"
                              : item.state === "Auctioning"
                                ? "Đang đấu giá"
                                : "Mời bạn tới nhận lại sách"}
                    </AppText>
                  </View>

                  <AppText kind="small" style={styles.refCodeText}>
                    #{item.id.slice(0, 6).toUpperCase()}
                  </AppText>
                </View>

                {/* 2. Book Info */}
                <View style={styles.bookInfoRow}>
                  <View style={styles.bookThumbPlaceholder}>
                    <Icon name="book" size={20} color={stitchTokens.wine} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText kind="bold" numberOfLines={1} style={styles.intakeTitle}>
                      {item.title}
                    </AppText>
                    <AppText kind="small" style={styles.intakeSub}>
                      Khởi điểm: {formatVnd(item.startPrice)} • Bước: {formatVnd(item.step)}
                    </AppText>

                    {item.state === "AwaitingDropoff" && (
                      <View style={styles.deadlineRow}>
                        <Icon name="clock" size={12} color={stitchTokens.flashRed} />
                        <AppText kind="small" style={styles.deadlineText}>
                          Hạn chót mang sách: {formatDateTime(item.dropoffDeadline)}
                        </AppText>
                      </View>
                    )}
                  </View>
                </View>

                {/* 3. Inspection Examiner Note (if any) */}
                {Boolean(item.inspectionNote) && (
                  <View style={styles.examinerBox}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Icon name="info" size={13} color={stitchTokens.wineDark} />
                      <AppText kind="bold" style={styles.examinerTitle}>
                        Ghi chú từ giám định viên tại trạm:
                      </AppText>
                    </View>
                    <AppText style={styles.examinerNoteText}>{item.inspectionNote}</AppText>
                  </View>
                )}

                {/* 4. Evidence Input Area (for NeedsEvidence state) */}
                {isNeedsEvidence && !item.evidenceSubmittedAt && (
                  <View style={styles.evidenceInputSection}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <AppText kind="bold" style={{ fontSize: 12, color: stitchTokens.deepCocoa }}>
                        Bằng chứng / Giải trình chi tiết
                      </AppText>
                      <AppText kind="small" style={{ color: stitchTokens.subtleGray }}>
                        (Tối thiểu {EVIDENCE_MIN_LENGTH} ký tự)
                      </AppText>
                    </View>

                    <TextInput
                      value={currentEvidenceText}
                      onChangeText={(text) => onChangeEvidenceText(item.id, text)}
                      editable={!disabled}
                      placeholder="Mô tả nguồn gốc, dấu riêng hoặc giấy tờ bạn có để đối chiếu..."
                      placeholderTextColor={stitchTokens.subtleGray}
                      multiline
                      numberOfLines={3}
                      maxLength={2000}
                      style={[
                        styles.evidenceInput,
                        Boolean(currentError) && styles.evidenceInputError,
                      ]}
                    />

                    {Boolean(currentError) && (
                      <AppText kind="small" style={{ color: stitchTokens.flashRed, fontSize: 11 }}>
                        {currentError}
                      </AppText>
                    )}

                    <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 4 }}>
                      <Pressable
                        accessibilityRole="button"
                        disabled={disabled}
                        onPress={() => onSubmitEvidence(item, currentEvidenceText)}
                        style={[styles.submitEvidenceBtn, disabled && { opacity: 0.6 }]}
                      >
                        <Icon name="check" size={14} color="#FFDF97" />
                        <AppText kind="bold" style={styles.submitEvidenceBtnText}>
                          Gửi bằng chứng
                        </AppText>
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* If evidence was already submitted */}
                {isNeedsEvidence && Boolean(item.evidenceSubmittedAt) && (
                  <View style={styles.evidenceSubmittedNote}>
                    <Icon name="verified" size={14} color={stitchTokens.verifiedGreen} />
                    <AppText kind="small" style={{ flex: 1, color: stitchTokens.deepCocoa }}>
                      Đã gửi bằng chứng lúc {formatDateTime(item.evidenceSubmittedAt!)}. Nhân viên khác tại điểm đang thẩm định lại.
                    </AppText>
                  </View>
                )}

                {/* 5. Withdraw Button (Rút sách) */}
                {isWithdrawable && (
                  <View style={styles.cardActionsRow}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={disabled}
                      onPress={() => onWithdraw(item)}
                      style={({ pressed }) => [
                        styles.withdrawBtn,
                        pressed && { opacity: 0.8 },
                        disabled && { opacity: 0.5 },
                      ]}
                    >
                      <AppText kind="bold" style={styles.withdrawBtnText}>
                        Rút sách khỏi đấu giá
                      </AppText>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    gap: 10,
    paddingTop: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 16,
    color: stitchTokens.wineDark,
  },
  countBadge: {
    backgroundColor: stitchTokens.roseWarmSurface,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  countBadgeText: {
    fontSize: 11,
    color: stitchTokens.wineDark,
    fontWeight: "700",
  },
  centerLoading: {
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyContainer: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 20,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    color: stitchTokens.deepCocoa,
  },
  emptyDesc: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
    textAlign: "center",
    lineHeight: 17,
  },
  cardsContainer: {
    gap: 12,
  },
  intakeCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 14,
    gap: 10,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: stitchTokens.creamBg,
  },
  statusPillWarning: {
    backgroundColor: "#FFF8E1",
  },
  statusPillError: {
    backgroundColor: stitchTokens.flashRedBg,
  },
  statusPillSuccess: {
    backgroundColor: "#E8F5E9",
  },
  statusPillNeutral: {
    backgroundColor: stitchTokens.creamBg,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  refCodeText: {
    fontSize: 10,
    color: stitchTokens.subtleGray,
    fontWeight: "700",
  },
  bookInfoRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  bookThumbPlaceholder: {
    width: 44,
    height: 56,
    borderRadius: 6,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  intakeTitle: {
    fontSize: 14,
    color: stitchTokens.deepCocoa,
  },
  intakeSub: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
  },
  deadlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  deadlineText: {
    fontSize: 11,
    color: stitchTokens.flashRed,
    fontWeight: "600",
  },
  examinerBox: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    padding: 10,
    gap: 4,
  },
  examinerTitle: {
    fontSize: 11,
    color: stitchTokens.wineDark,
  },
  examinerNoteText: {
    fontSize: 12,
    color: stitchTokens.deepCocoa,
    lineHeight: 17,
  },
  evidenceInputSection: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    padding: 10,
    gap: 6,
  },
  evidenceInput: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    padding: 8,
    fontSize: 12,
    color: stitchTokens.deepCocoa,
    textAlignVertical: "top",
    minHeight: 64,
  },
  evidenceInputError: {
    borderColor: stitchTokens.flashRed,
  },
  submitEvidenceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: stitchTokens.wineDark,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  submitEvidenceBtnText: {
    fontSize: 12,
    color: "#FFFFFF",
  },
  evidenceSubmittedNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F4F7EE",
    borderRadius: 8,
    padding: 8,
  },
  cardActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.cardBorder,
  },
  withdrawBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  withdrawBtnText: {
    fontSize: 11,
    color: stitchTokens.deepCocoa,
  },
});
