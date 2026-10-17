import { Modal, Pressable, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon } from "../../../core/ui/icon";
import { formatVnd } from "../../../core/ui/format";
import { stitchTokens } from "../../../core/ui/theme";
import type { HandoverPoint, MyIntake } from "../contracts";
import type { PrivateDraft } from "../../drafts/contracts";
import { BookIdentity } from "../../drafts/catalog-picker";

export interface SendToAuctionModalsProps {
  // 1. Submit Confirm Modal
  readonly confirmSubmitVisible: boolean;
  readonly onCancelSubmit: () => void;
  readonly onConfirmSubmit: () => void;
  readonly isSubmitting?: boolean;
  readonly selectedListing: PrivateDraft | undefined;
  readonly selectedPoint: HandoverPoint | undefined;
  readonly startPrice: number | null;
  readonly step: 10000 | 50000;
  readonly buyNowPrice: number | null;

  // 2. Withdraw Confirm Modal
  readonly withdrawTarget: MyIntake | null;
  readonly onCancelWithdraw: () => void;
  readonly onConfirmWithdraw: () => void;
  readonly isWithdrawing?: boolean;

  // 3. Evidence Confirm Modal
  readonly evidenceTarget: MyIntake | null;
  readonly onCancelEvidence: () => void;
  readonly onConfirmEvidence: () => void;
  readonly isSubmittingEvidence?: boolean;
}

export function SendToAuctionModals({
  confirmSubmitVisible,
  onCancelSubmit,
  onConfirmSubmit,
  isSubmitting = false,
  selectedListing,
  selectedPoint,
  startPrice,
  step,
  buyNowPrice,

  withdrawTarget,
  onCancelWithdraw,
  onConfirmWithdraw,
  isWithdrawing = false,

  evidenceTarget,
  onCancelEvidence,
  onConfirmEvidence,
  isSubmittingEvidence = false,
}: SendToAuctionModalsProps) {
  return (
    <>
      {/* 1. Confirm Consignment Modal */}
      <Modal
        visible={confirmSubmitVisible}
        transparent
        animationType="fade"
        onRequestClose={onCancelSubmit}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ gap: 2 }}>
                <AppText kind="small" style={styles.modalSubHeader}>
                  XÁC NHẬN ĐƠN KÝ GỬI
                </AppText>
                <AppText kind="bold" style={styles.modalTitle}>
                  Gửi sách đấu giá
                </AppText>
              </View>

              <Pressable
                accessibilityLabel="Đóng modal"
                disabled={isSubmitting}
                onPress={onCancelSubmit}
                style={styles.closeBtn}
              >
                <Icon name="close" size={18} color={stitchTokens.subtleGray} />
              </Pressable>
            </View>

            {/* Overview Box */}
            <View style={styles.overviewBox}>
              <View style={styles.overviewRow}>
                <AppText kind="small" style={styles.overviewLabel}>
                  Ấn bản:
                </AppText>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <BookIdentity
                    id={selectedListing?.currentRevision.content.bookId ?? null}
                    compact
                  />
                </View>
              </View>

              <View style={styles.overviewRow}>
                <AppText kind="small" style={styles.overviewLabel}>
                  Điểm tiếp nhận:
                </AppText>
                <AppText kind="bold" numberOfLines={1} style={styles.overviewValue}>
                  {selectedPoint?.name ?? "Chưa rõ"}
                </AppText>
              </View>

              <View style={styles.overviewRow}>
                <AppText kind="small" style={styles.overviewLabel}>
                  Thời hạn mang sách:
                </AppText>
                <AppText kind="bold" style={{ color: stitchTokens.wineDark, fontSize: 13 }}>
                  72 giờ (tại TP.HCM)
                </AppText>
              </View>

              <View style={styles.overviewRow}>
                <AppText kind="small" style={styles.overviewLabel}>
                  Khởi điểm / Mua ngay:
                </AppText>
                <AppText kind="bold" style={styles.overviewValue}>
                  {startPrice != null ? formatVnd(startPrice) : "—"}
                  {buyNowPrice != null ? ` / ${formatVnd(buyNowPrice)}` : " (không)"}
                </AppText>
              </View>
            </View>

            {/* Warning Note */}
            <View style={styles.warningNoteBox}>
              <Icon name="info" size={16} color={stitchTokens.wineDark} />
              <AppText style={styles.warningNoteText}>
                <AppText kind="bold">Lưu ý quan trọng:</AppText> Sách sẽ tạm dừng bán thường trong thời gian ký gửi đấu giá để tránh trùng lặp giao dịch. Giá không đổi được sau khi phiên mở.
              </AppText>
            </View>

            {/* Actions */}
            <View style={styles.modalActionsRow}>
              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={onCancelSubmit}
                style={[styles.modalSecondaryBtn, isSubmitting && { opacity: 0.5 }]}
              >
                <AppText kind="bold" style={styles.modalSecondaryBtnText}>
                  Hủy bỏ
                </AppText>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={onConfirmSubmit}
                style={[styles.modalPrimaryBtn, isSubmitting && { opacity: 0.6 }]}
              >
                <Icon name="check" size={16} color="#FFDF97" />
                <AppText kind="bold" style={styles.modalPrimaryBtnText}>
                  {isSubmitting ? "Đang gửi..." : "Xác nhận gửi"}
                </AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. Confirm Withdraw Modal */}
      <Modal
        visible={Boolean(withdrawTarget)}
        transparent
        animationType="fade"
        onRequestClose={onCancelWithdraw}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Icon name="info" size={20} color={stitchTokens.flashRed} />
                <AppText kind="bold" style={styles.modalTitle}>
                  Xác nhận rút sách
                </AppText>
              </View>

              <Pressable
                accessibilityLabel="Đóng"
                disabled={isWithdrawing}
                onPress={onCancelWithdraw}
                style={styles.closeBtn}
              >
                <Icon name="close" size={18} color={stitchTokens.subtleGray} />
              </Pressable>
            </View>

            <AppText style={{ fontSize: 13, color: stitchTokens.deepCocoa, lineHeight: 19 }}>
              Bạn có chắc muốn rút ấn bản <AppText kind="bold">"{withdrawTarget?.title}"</AppText> khỏi đợt đấu giá này? Sau khi rút, bài đăng sẽ quay trở lại trạng thái Bán thông thường.
            </AppText>

            <View style={styles.warningNoteBox}>
              <AppText kind="small" style={{ color: stitchTokens.deepCocoa, lineHeight: 16 }}>
                {withdrawTarget?.state === "AwaitingDropoff"
                  ? "Chỗ ở điểm tiếp nhận được trả lại và bài đăng trở về bán thường."
                  : "Nếu sách đã gửi tới trạm, bạn vui lòng tới trạm nhận lại sách trong 48 giờ."}
              </AppText>
            </View>

            <View style={styles.modalActionsRow}>
              <Pressable
                accessibilityRole="button"
                disabled={isWithdrawing}
                onPress={onCancelWithdraw}
                style={styles.modalSecondaryBtn}
              >
                <AppText kind="bold" style={styles.modalSecondaryBtnText}>
                  Giữ lại
                </AppText>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={isWithdrawing}
                onPress={onConfirmWithdraw}
                style={[styles.modalDangerBtn, isWithdrawing && { opacity: 0.6 }]}
              >
                <AppText kind="bold" style={styles.modalDangerBtnText}>
                  {isWithdrawing ? "Đang rút..." : "Rút sách"}
                </AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 3. Confirm Evidence Modal */}
      <Modal
        visible={Boolean(evidenceTarget)}
        transparent
        animationType="fade"
        onRequestClose={onCancelEvidence}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <AppText kind="bold" style={styles.modalTitle}>
                Gửi bằng chứng đối chiếu?
              </AppText>
              <Pressable
                accessibilityLabel="Đóng"
                disabled={isSubmittingEvidence}
                onPress={onCancelEvidence}
                style={styles.closeBtn}
              >
                <Icon name="close" size={18} color={stitchTokens.subtleGray} />
              </Pressable>
            </View>

            <AppText style={{ fontSize: 13, color: stitchTokens.deepCocoa, lineHeight: 19 }}>
              Bạn chỉ gửi được bằng chứng giải trình <AppText kind="bold">một lần duy nhất</AppText>. Giám định viên khác tại trạm sẽ đối chiếu và đưa ra phán quyết cuối cùng trước khi mở sàn.
            </AppText>

            <View style={styles.modalActionsRow}>
              <Pressable
                accessibilityRole="button"
                disabled={isSubmittingEvidence}
                onPress={onCancelEvidence}
                style={styles.modalSecondaryBtn}
              >
                <AppText kind="bold" style={styles.modalSecondaryBtnText}>
                  Xem lại
                </AppText>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={isSubmittingEvidence}
                onPress={onConfirmEvidence}
                style={[styles.modalPrimaryBtn, isSubmittingEvidence && { opacity: 0.6 }]}
              >
                <AppText kind="bold" style={styles.modalPrimaryBtnText}>
                  {isSubmittingEvidence ? "Đang gửi..." : "Gửi ngay"}
                </AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(30, 20, 18, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 18,
    padding: 18,
    gap: 14,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  modalSubHeader: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wine,
    letterSpacing: 0.6,
  },
  modalTitle: {
    fontSize: 17,
    color: stitchTokens.wineDark,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: stitchTokens.creamBg,
    alignItems: "center",
    justifyContent: "center",
  },
  overviewBox: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    padding: 12,
    gap: 8,
  },
  overviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  overviewLabel: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
  },
  overviewValue: {
    fontSize: 12,
    color: stitchTokens.deepCocoa,
    flex: 1,
    textAlign: "right",
  },
  warningNoteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FDF5E6",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F0E0C0",
    padding: 10,
  },
  warningNoteText: {
    flex: 1,
    fontSize: 12,
    color: stitchTokens.deepCocoa,
    lineHeight: 17,
  },
  modalActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  modalSecondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSecondaryBtnText: {
    fontSize: 13,
    color: stitchTokens.deepCocoa,
  },
  modalPrimaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: stitchTokens.wineDark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  modalPrimaryBtnText: {
    fontSize: 13,
    color: "#FFFFFF",
  },
  modalDangerBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: stitchTokens.flashRed,
    alignItems: "center",
    justifyContent: "center",
  },
  modalDangerBtnText: {
    fontSize: 13,
    color: "#FFFFFF",
  },
});
