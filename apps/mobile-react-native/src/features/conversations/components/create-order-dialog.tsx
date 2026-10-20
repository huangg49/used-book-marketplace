import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  AppText,
  Button,
  Icon,
  Notice,
  Sheet,
  TextField,
  colors,
  radius,
  space,
  stitchTokens,
} from "../../../core/ui";
import { formatVnd } from "../../../core/ui/format";
import type { PurchaseConversation } from "../contracts";

interface CreateOrderDialogProps {
  visible: boolean;
  onClose: () => void;
  room: PurchaseConversation;
  onConfirm: (agreedPrice: number) => Promise<void>;
  busy?: boolean;
}

export function CreateOrderDialog({
  visible,
  onClose,
  room,
  onConfirm,
  busy = false,
}: CreateOrderDialogProps) {
  const initialPrice = room.terms?.agreedPrice ?? 0;
  const [priceStr, setPriceStr] = useState(
    initialPrice > 0 ? String(initialPrice) : "",
  );
  const [error, setError] = useState<string>();

  const shippingFee = room.quotePreview?.shippingFee ?? 0;
  const priceNum = Number(priceStr);
  const isValidPrice =
    Number.isInteger(priceNum) && priceNum >= 10000 && priceNum <= 1000000;
  const buyerTotal = isValidPrice ? priceNum + shippingFee : 0;

  const handleSubmit = async () => {
    if (!isValidPrice) {
      setError("Giá sách đã thống nhất phải từ 10.000 ₫ đến 1.000.000 ₫.");
      return;
    }
    setError(undefined);
    try {
      await onConfirm(priceNum);
    } catch (e: any) {
      setError(e?.message ?? "Chưa tạo được đơn hàng. Vui lòng thử lại.");
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Tạo đơn cho người mua"
      footer={
        <View style={styles.actionRow}>
          <View style={styles.cancelBtnCol}>
            <Button
              secondary
              title="Hủy"
              onPress={onClose}
              disabled={busy}
            />
          </View>
          <View style={styles.confirmBtnCol}>
            <Button
              title={busy ? "Đang tạo đơn…" : "Xác nhận tạo đơn"}
              onPress={() => void handleSubmit()}
              disabled={busy || !isValidPrice}
              busy={busy}
            />
          </View>
        </View>
      }
    >
      <View style={styles.container}>
        <AppText style={styles.sheetDescription}>
          Kiểm tra thông tin nhận sách và giá đã thống nhất trước khi tạo đơn.
        </AppText>

        {error && <Notice tone="error">{error}</Notice>}

        {/* Input Giá sách */}
        <View style={styles.formGroup}>
          <AppText style={styles.label}>Giá sách đã thỏa thuận (₫)</AppText>
          <TextField
            value={priceStr}
            onChangeText={(text) => {
              setPriceStr(text.replace(/[^0-9]/g, ""));
              setError(undefined);
            }}
            placeholder="Ví dụ: 80000"
            keyboardType="numeric"
            editable={!busy}
          />
        </View>

        {/* Thông tin người nhận & vận chuyển */}
        {room.quotePreview && (
          <View style={styles.destinationCard}>
            <View style={styles.destHeader}>
              <Icon name="pin" size={16} color={stitchTokens.wineDark} />
              <AppText style={styles.destTitle}>Địa chỉ giao nhận</AppText>
            </View>
            <AppText style={styles.destRecipient}>
              {room.quotePreview.destination.recipientName} ·{" "}
              {room.quotePreview.destination.phone}
            </AppText>
            <AppText style={styles.destDetail}>
              {room.quotePreview.destination.detail}
            </AppText>
          </View>
        )}

        {/* Bảng tính chi phí */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <AppText style={styles.summaryLabel}>Tiền sách thỏa thuận</AppText>
            <AppText style={styles.summaryValue}>
              {isValidPrice ? formatVnd(priceNum) : "—"}
            </AppText>
          </View>
          <View style={styles.summaryRow}>
            <AppText style={styles.summaryLabel}>Phí giao nhận dự tính</AppText>
            <AppText style={styles.summaryValue}>
              {formatVnd(shippingFee)}
            </AppText>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <AppText style={styles.totalLabel}>Tổng người mua cần trả</AppText>
            <AppText style={styles.totalValue}>
              {isValidPrice ? formatVnd(buyerTotal) : "—"}
            </AppText>
          </View>
        </View>

        {/* Chú thích an toàn */}
        <View style={styles.noteBox}>
          <Icon name="info" size={16} color={stitchTokens.goldBronze} />
          <AppText style={styles.noteText}>
            Tạo đơn sẽ giữ sách 15 phút ở trạng thái chờ thanh toán. Sau khi
            người mua thanh toán thành công qua ví, đơn sẽ bắt đầu xử lý.
          </AppText>
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.md,
    paddingTop: space.xs,
  },
  sheetDescription: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  formGroup: {
    gap: space.xs,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink,
  },
  destinationCard: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: radius.card,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.rule,
    gap: 4,
  },
  destHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  destTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  destRecipient: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink,
  },
  destDetail: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 16,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
  },
  divider: {
    height: 1,
    backgroundColor: colors.rule,
    marginVertical: 4,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  totalValue: {
    fontSize: 15,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: stitchTokens.amberBg,
    borderRadius: radius.small,
    padding: space.sm,
    borderWidth: 1,
    borderColor: stitchTokens.amberBorder,
    gap: 8,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    color: stitchTokens.orangeDeep,
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: "row",
    gap: space.sm,
    width: "100%",
  },
  cancelBtnCol: {
    flex: 1,
  },
  confirmBtnCol: {
    flex: 2,
  },
});
