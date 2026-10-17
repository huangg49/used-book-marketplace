import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { useSession } from "../../core/session/session-provider";
import { AppText } from "../../core/ui/text";
import { AppModal as Modal, Icon, formatVnd, stitchTokens } from "../../core/ui";
import {
  AUCTION_MAX_PRICE,
  createAuctionCommand,
  sendAuctionCommand,
  auctionErrorText,
} from "./auctions-model";
import type { ExtendedAuctionItem } from "./auctions-data";
import type { PublicAuctionSummary } from "./contracts";

export interface AuctionQuickBidModalProps {
  readonly visible: boolean;
  readonly auction: (ExtendedAuctionItem | PublicAuctionSummary) | null;
  readonly onClose: () => void;
  readonly onSuccess: (amount: number) => void;
}

export function AuctionQuickBidModal({
  visible,
  auction,
  onClose,
  onSuccess,
}: AuctionQuickBidModalProps) {
  const { client, state } = useSession();
  const isAuthenticated = state.status === "authenticated";

  const currentPrice = auction?.currentPrice ?? auction?.startPrice ?? 0;
  const step = auction?.step ?? 50000;
  const defaultMinimum = auction?.minimumBid ?? currentPrice + step;

  const [bidAmount, setBidAmount] = useState<number>(defaultMinimum);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prevAuctionId, setPrevAuctionId] = useState<string | null>(null);
  if (auction && auction.id !== prevAuctionId) {
    setPrevAuctionId(auction.id);
    const nextMin = auction.minimumBid ?? (auction.currentPrice ?? auction.startPrice) + auction.step;
    setBidAmount(nextMin);
    setError(null);
  }

  if (!visible || !auction) return null;

  const quickIncrements = [
    step,
    step * 2,
    step * 4,
    Math.max(100000, step * 5),
  ];

  const handleSelectIncrement = (inc: number) => {
    const nextVal = Math.min(AUCTION_MAX_PRICE, currentPrice + inc);
    setBidAmount(nextVal);
    setError(null);
  };

  const handleConfirmBid = async () => {
    if (!isAuthenticated) {
      onClose();
      router.push("/account");
      return;
    }

    if (bidAmount < defaultMinimum) {
      setError(`Mức trả giá tối thiểu phải là ${formatVnd(defaultMinimum)}`);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const commandKey = Crypto.randomUUID();
      const command = createAuctionCommand(
        auction.id,
        "Manual",
        bidAmount,
        commandKey,
      );
      await sendAuctionCommand(client, command);
      onSuccess(bidAmount);
      onClose();
    } catch (cause) {
      setError(auctionErrorText(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleGroup}>
              <View style={styles.gavelIconCircle}>
                <Icon name="gavel" size={16} color={stitchTokens.wine} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText kind="bold" style={styles.headerTitle}>
                  Đặt Giá Nhanh
                </AppText>
                <AppText
                  kind="small"
                  style={styles.headerSubtitle}
                  numberOfLines={1}
                >
                  {auction.title}
                </AppText>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng"
              onPress={onClose}
              style={styles.closeBtn}
            >
              <Icon name="close" size={18} color={stitchTokens.subtleGray} />
            </Pressable>
          </View>

          {/* Current & Next Bid Info Box */}
          <View style={styles.priceSummaryBox}>
            <View style={styles.priceRow}>
              <AppText kind="small" style={styles.priceLabel}>
                Giá cao nhất hiện tại:
              </AppText>
              <AppText kind="bold" style={styles.currentPriceText}>
                {formatVnd(currentPrice)}
              </AppText>
            </View>

            <View style={styles.priceDivider} />

            <View style={styles.priceRow}>
              <View style={{ gap: 2 }}>
                <AppText kind="small" style={styles.priceLabel}>
                  Mức bạn sẽ trả:
                </AppText>
                <AppText kind="small" style={styles.stepHint}>
                  Bước giá: +{formatVnd(step)}
                </AppText>
              </View>
              <AppText kind="heading" style={styles.targetBidText}>
                {formatVnd(bidAmount)}
              </AppText>
            </View>
          </View>

          {/* Quick Increment Chips */}
          <View style={{ gap: 8 }}>
            <AppText kind="small" style={styles.chipSectionTitle}>
              Chọn bước nâng giá nhanh:
            </AppText>
            <View style={styles.chipRow}>
              {quickIncrements.map((inc) => {
                const targetPrice = currentPrice + inc;
                const isSelected = bidAmount === targetPrice;
                return (
                  <Pressable
                    key={inc}
                    onPress={() => handleSelectIncrement(inc)}
                    style={[
                      styles.incChip,
                      isSelected && styles.incChipSelected,
                    ]}
                  >
                    <AppText
                      kind="bold"
                      style={[
                        styles.incChipText,
                        isSelected && styles.incChipTextSelected,
                      ]}
                    >
                      +{formatVnd(inc)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Trust and Escrow Notice */}
          <View style={styles.escrowNotice}>
            <Icon name="shield" size={16} color={stitchTokens.likeNewGreen} />
            <AppText kind="small" style={styles.escrowText}>
              Bảo chứng sàn Lật Lại • Cam kết giữ sách tại trạm trung chuyển đã
              được thẩm định 5 bước.
            </AppText>
          </View>

          {/* Error Message */}
          {error ? (
            <View style={styles.errorBox}>
              <Icon name="info" size={14} color={stitchTokens.crimson} />
              <AppText kind="small" style={styles.errorText}>
                {error}
              </AppText>
            </View>
          ) : null}

          {/* CTA Buttons */}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              disabled={busy}
              style={styles.cancelBtn}
            >
              <AppText kind="bold" style={styles.cancelBtnText}>
                Hủy
              </AppText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={handleConfirmBid}
              disabled={busy}
              style={[
                styles.confirmBtn,
                !isAuthenticated && styles.loginBtn,
                busy && { opacity: 0.7 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={stitchTokens.white} size="small" />
              ) : (
                <AppText kind="bold" style={styles.confirmBtnText}>
                  {isAuthenticated
                    ? `Xác nhận: ${formatVnd(bidAmount)}`
                    : "Đăng nhập để đặt giá"}
                </AppText>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: stitchTokens.modalScrim,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: stitchTokens.whiteSurface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
    gap: 16,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  gavelIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: stitchTokens.roseWarmTag,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
    color: stitchTokens.wineDark,
  },
  headerSubtitle: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: stitchTokens.parchment,
  },
  priceSummaryBox: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  priceLabel: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
  },
  stepHint: {
    fontSize: 10,
    color: stitchTokens.roseBrown,
  },
  currentPriceText: {
    fontSize: 14,
    color: stitchTokens.deepCocoa,
  },
  priceDivider: {
    height: 1,
    backgroundColor: stitchTokens.cardBorder,
  },
  targetBidText: {
    fontSize: 18,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  chipSectionTitle: {
    fontSize: 12,
    color: stitchTokens.deepCocoa,
    fontWeight: "600",
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
  },
  incChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  incChipSelected: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wine,
  },
  incChipText: {
    fontSize: 12,
    color: stitchTokens.deepCocoa,
  },
  incChipTextSelected: {
    color: stitchTokens.white,
  },
  escrowNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  escrowText: {
    fontSize: 11,
    color: stitchTokens.likeNewGreen,
    flex: 1,
    lineHeight: 15,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
    borderRadius: 6,
    backgroundColor: stitchTokens.flashRedBg,
  },
  errorText: {
    fontSize: 12,
    color: stitchTokens.crimson,
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 13,
    color: stitchTokens.subtleGray,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: stitchTokens.wine,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  loginBtn: {
    backgroundColor: stitchTokens.goldBronze,
  },
  confirmBtnText: {
    fontSize: 14,
    color: stitchTokens.white,
  },
});
