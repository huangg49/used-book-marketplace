import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon } from "../../../core/ui/icon";
import { formatVnd } from "../../../core/ui/format";
import { stitchTokens } from "../../../core/ui/theme";
import type { MyIntake } from "../contracts";

export interface SendToAuctionNoticesProps {
  readonly created: MyIntake | null;
  readonly error: string | null;
  readonly onDismissError?: () => void;
  readonly onRetryPending?: () => void;
  readonly hasPending?: boolean;
  readonly isBusy?: boolean;
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });

export function SendToAuctionNotices({
  created,
  error,
  onDismissError,
  onRetryPending,
  hasPending = false,
  isBusy = false,
}: SendToAuctionNoticesProps) {
  if (!created && !error && !hasPending) return null;

  return (
    <View style={styles.container}>
      {/* 1. Success Banner */}
      {created && (
        <View style={styles.successCard}>
          <View style={styles.successIconCircle}>
            <Icon name="check" size={16} color="#FFFFFF" />
          </View>

          <View style={styles.successContent}>
            <View style={styles.successHeaderRow}>
              <AppText kind="bold" style={styles.successTitle}>
                Đã gửi hồ sơ thành công!
              </AppText>
              <View style={styles.codeBadge}>
                <AppText kind="small" style={styles.codeBadgeText}>
                  #{created.id.slice(0, 8).toUpperCase()}
                </AppText>
              </View>
            </View>

            <AppText style={styles.successBody}>
              Ấn bản <AppText kind="bold">"{created.title}"</AppText>. Hạn chót mang sách tới trạm:{" "}
              <AppText kind="bold" style={{ color: stitchTokens.wineDark }}>
                {formatDateTime(created.dropoffDeadline)}
              </AppText>
              .
            </AppText>

            <View style={styles.pricingRecapRow}>
              <AppText kind="small" style={styles.pricingRecapText}>
                Khởi điểm: <AppText kind="bold">{formatVnd(created.startPrice)}</AppText>
              </AppText>
              <AppText kind="small" style={styles.bulletDot}>•</AppText>
              <AppText kind="small" style={styles.pricingRecapText}>
                Bước: <AppText kind="bold">{formatVnd(created.step)}</AppText>
              </AppText>
              {created.buyNowPrice != null && (
                <>
                  <AppText kind="small" style={styles.bulletDot}>•</AppText>
                  <AppText kind="small" style={styles.pricingRecapText}>
                    Mua ngay: <AppText kind="bold">{formatVnd(created.buyNowPrice)}</AppText>
                  </AppText>
                </>
              )}
            </View>
          </View>
        </View>
      )}

      {/* 2. Error Notice Banner */}
      {error && (
        <View style={styles.errorCard}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, flex: 1 }}>
            <Icon name="info" size={18} color={stitchTokens.flashRed} />
            <View style={{ flex: 1 }}>
              <AppText kind="bold" style={styles.errorTitle}>
                Chưa hoàn tất yêu cầu
              </AppText>
              <AppText style={styles.errorBody}>{error}</AppText>
            </View>
          </View>

          {onDismissError && (
            <Pressable onPress={onDismissError} style={{ padding: 4 }}>
              <Icon name="close" size={16} color={stitchTokens.subtleGray} />
            </Pressable>
          )}
        </View>
      )}

      {/* 3. Pending Offline Retry */}
      {hasPending && onRetryPending && (
        <View style={styles.pendingCard}>
          <View style={{ flex: 1 }}>
            <AppText kind="bold" style={{ fontSize: 13, color: stitchTokens.wineDark }}>
              Có thao tác chưa rõ kết quả
            </AppText>
            <AppText kind="small" style={{ color: stitchTokens.subtleGray }}>
              Kiểm tra kết nối mạng và thử lại thao tác vừa rồi.
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onRetryPending}
            disabled={isBusy}
            style={[styles.retryBtn, isBusy && { opacity: 0.6 }]}
          >
            <AppText kind="bold" style={styles.retryBtnText}>
              {isBusy ? "Đang gửi..." : "Thử lại"}
            </AppText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  successCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#F4F7EE",
    borderWidth: 1,
    borderColor: "#C5D8B8",
    borderRadius: 12,
    padding: 12,
  },
  successIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: stitchTokens.verifiedGreen,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  successContent: {
    flex: 1,
    gap: 4,
  },
  successHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  successTitle: {
    fontSize: 14,
    color: stitchTokens.wineDark,
  },
  codeBadge: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#C5D8B8",
  },
  codeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  successBody: {
    fontSize: 12,
    color: stitchTokens.deepCocoa,
    lineHeight: 18,
  },
  pricingRecapRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    paddingTop: 2,
  },
  pricingRecapText: {
    fontSize: 11,
    color: stitchTokens.deepCocoa,
  },
  bulletDot: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    backgroundColor: stitchTokens.flashRedBg,
    borderWidth: 1,
    borderColor: "#F5C6CB",
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  errorTitle: {
    fontSize: 13,
    color: stitchTokens.flashRed,
  },
  errorBody: {
    fontSize: 12,
    color: stitchTokens.deepCocoa,
    lineHeight: 17,
    marginTop: 2,
  },
  pendingCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF3E0",
    borderWidth: 1,
    borderColor: "#FFE0B2",
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  retryBtn: {
    backgroundColor: stitchTokens.wineDark,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  retryBtnText: {
    fontSize: 12,
    color: "#FFFFFF",
  },
});
