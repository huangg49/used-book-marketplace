import { StyleSheet, View } from "react-native";
import { AppText, Button, ConfirmDialog, Icon, Notice, Sheet, formatVnd, space, stitchTokens } from "../../../core/ui";
import type { HandoverPoint, MyIntake } from "../contracts";
import { AUCTION_FORMATS, type AuctionFormat, type AuctionStep } from "../auctions-model";
import type { PrivateDraft } from "../../drafts/contracts";
import { BookIdentity } from "../../drafts/catalog-picker";

export interface SendToAuctionModalsProps {
  readonly confirmSubmitVisible: boolean;
  readonly onCancelSubmit: () => void;
  readonly onConfirmSubmit: () => void;
  readonly isSubmitting?: boolean;
  readonly submitError?: string | null;
  readonly selectedListing: PrivateDraft | undefined;
  readonly selectedPoint: HandoverPoint | undefined;
  readonly startPrice: number | null;
  readonly step: AuctionStep;
  readonly auctionType?: AuctionFormat;
  readonly minBidders?: number;
  readonly buyNowPrice: number | null;
  readonly dutchTopPrice?: number | null;
  readonly dutchIntervalSeconds?: number | null;
  readonly depositAmount?: number | null;

  readonly withdrawTarget: MyIntake | null;
  readonly onCancelWithdraw: () => void;
  readonly onConfirmWithdraw: () => void;
  readonly isWithdrawing?: boolean;
  readonly withdrawError?: string | null;

  readonly evidenceTarget: MyIntake | null;
  readonly evidenceNote?: string;
  readonly onCancelEvidence: () => void;
  readonly onConfirmEvidence: () => void;
  readonly isSubmittingEvidence?: boolean;
  readonly evidenceSubmitError?: string | null;
}

export function SendToAuctionModals({
  confirmSubmitVisible,
  onCancelSubmit,
  onConfirmSubmit,
  isSubmitting = false,
  submitError = null,
  selectedListing,
  selectedPoint,
  startPrice,
  step,
  auctionType = "English",
  minBidders = 4,
  buyNowPrice,
  dutchTopPrice,
  dutchIntervalSeconds,
  depositAmount,

  withdrawTarget,
  onCancelWithdraw,
  onConfirmWithdraw,
  isWithdrawing = false,
  withdrawError = null,

  evidenceTarget,
  evidenceNote = "",
  onCancelEvidence,
  onConfirmEvidence,
  isSubmittingEvidence = false,
  evidenceSubmitError = null,
}: SendToAuctionModalsProps) {
  const formatLabel = AUCTION_FORMATS.find((f) => f.value === auctionType)?.label ?? "Trả giá lên";

  return (
    <>
      {/* 1. Confirm Consignment Sheet */}
      <Sheet
        title="Xác nhận gửi sách đấu giá"
        visible={confirmSubmitVisible}
        dismissible={!isSubmitting}
        onClose={() => !isSubmitting && onCancelSubmit()}
        footer={
          <View style={styles.footerCol}>
            <Button
              wine
              title={isSubmitting ? "Đang gửi…" : "Xác nhận gửi"}
              busy={isSubmitting}
              disabled={isSubmitting}
              onPress={onConfirmSubmit}
            />
            <Button
              wine
              secondary
              title="Hủy bỏ"
              disabled={isSubmitting}
              onPress={onCancelSubmit}
            />
          </View>
        }
      >
        <View style={styles.summaryBox}>
          <View style={styles.row}>
            <AppText kind="small" style={styles.label}>Ấn bản</AppText>
            <View style={styles.valueEnd}>
              <BookIdentity id={selectedListing?.currentRevision.content.bookId ?? null} compact />
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <AppText kind="small" style={styles.label}>Điểm tiếp nhận</AppText>
            <AppText kind="bold" style={styles.value}>{selectedPoint?.name ?? "Chưa rõ"}</AppText>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <AppText kind="small" style={styles.label}>Hạn mang sách tới điểm</AppText>
            <AppText kind="bold" style={styles.valueWine}>72 giờ (TP.HCM)</AppText>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <AppText kind="small" style={styles.label}>Hình thức</AppText>
            <AppText kind="bold" style={styles.value}>{formatLabel}</AppText>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <AppText kind="small" style={styles.label}>
              {auctionType === "Dutch" ? "Giá sàn" : "Giá khởi điểm"}
            </AppText>
            <AppText kind="bold" style={styles.valueWine}>
              {startPrice != null ? formatVnd(startPrice) : "—"}
            </AppText>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <AppText kind="small" style={styles.label}>Bước giá</AppText>
            <AppText kind="bold" style={styles.value}>{formatVnd(step)}</AppText>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <AppText kind="small" style={styles.label}>Người đăng ký tối thiểu</AppText>
            <AppText kind="bold" style={styles.value}>{`${minBidders} người`}</AppText>
          </View>
          {depositAmount != null ? (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <AppText kind="small" style={styles.label}>Tiền cọc đăng ký</AppText>
                <AppText kind="bold" style={styles.value}>{formatVnd(depositAmount)}</AppText>
              </View>
            </>
          ) : null}
          {auctionType === "Dutch" ? (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <AppText kind="small" style={styles.label}>Giá khởi điểm (giảm dần)</AppText>
                <AppText kind="bold" style={styles.valueWine}>
                  {dutchTopPrice != null ? formatVnd(dutchTopPrice) : "—"}
                </AppText>
              </View>
              <View style={styles.divider} />
              <View style={styles.row}>
                <AppText kind="small" style={styles.label}>Chu kỳ giảm giá</AppText>
                <AppText kind="bold" style={styles.value}>
                  {dutchIntervalSeconds != null ? `Mỗi ${dutchIntervalSeconds} giây` : "—"}
                </AppText>
              </View>
            </>
          ) : null}
          {auctionType === "English" ? (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <AppText kind="small" style={styles.label}>Giá mua ngay</AppText>
                <AppText kind="bold" style={styles.value}>
                  {buyNowPrice != null ? formatVnd(buyNowPrice) : "Không bật"}
                </AppText>
              </View>
            </>
          ) : null}
        </View>

        <View style={styles.noteBox}>
          <Icon name="info" size={16} color={stitchTokens.wine} />
          <AppText kind="small" style={styles.noteText}>
            Sách đấu giá thuộc kênh đấu giá riêng và không thể thay đổi cấu hình giá sau khi phiên mở. Sau khi nhân viên kiểm tra đạt, bạn tự chọn giờ mở và thời lượng phiên.
          </AppText>
        </View>

        {submitError ? <Notice tone="error">{submitError}</Notice> : null}
      </Sheet>

      {/* 2. Confirm Withdraw Dialog */}
      <ConfirmDialog
        visible={Boolean(withdrawTarget)}
        title="Xác nhận rút sách?"
        message={
          withdrawTarget?.state === "AwaitingDropoff"
            ? `Bạn có chắc muốn rút “${withdrawTarget.title}” khỏi đợt gửi đấu giá này? Chỗ giữ tại điểm tiếp nhận sẽ được trả lại ngay.`
            : `Bạn có chắc muốn rút “${withdrawTarget?.title ?? ""}” khỏi đợt đấu giá này? Nếu sách đã mang tới điểm, vui lòng tới nhận lại sách trong 48 giờ.`
        }
        confirmLabel="Rút sách"
        destructive
        busy={isWithdrawing}
        error={withdrawError ?? undefined}
        onCancel={() => !isWithdrawing && onCancelWithdraw()}
        onConfirm={onConfirmWithdraw}
      />

      {/* 3. Confirm Evidence Dialog */}
      <ConfirmDialog
        visible={Boolean(evidenceTarget)}
        title="Gửi bằng chứng đối chiếu?"
        message={`Bạn chỉ gửi được bằng chứng giải trình một lần duy nhất để nhân viên tại điểm đối chiếu lại trước khi quyết định.${evidenceNote.trim() ? `\n\n“${evidenceNote.trim()}”` : ""}`}
        confirmLabel="Gửi ngay"
        busy={isSubmittingEvidence}
        error={evidenceSubmitError ?? undefined}
        onCancel={() => !isSubmittingEvidence && onCancelEvidence()}
        onConfirm={onConfirmEvidence}
      />
    </>
  );
}

const styles = StyleSheet.create({
  footerCol: { gap: space.sm },
  summaryBox: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: space.md,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },
  divider: { height: 1, backgroundColor: stitchTokens.borderWarm },
  label: { color: stitchTokens.brownMuted, flexShrink: 1 },
  valueEnd: { flex: 1, alignItems: "flex-end" },
  value: { color: stitchTokens.deepCocoa, fontSize: 14, textAlign: "right", fontVariant: ["tabular-nums"] },
  valueWine: { color: stitchTokens.wine, fontSize: 14, textAlign: "right", fontVariant: ["tabular-nums"] },
  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderRadius: 12,
    padding: 12,
  },
  noteText: { flex: 1, color: stitchTokens.brownMuted, lineHeight: 18 },
});
