import { useRef, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { randomUUID } from "expo-crypto";
import {
  DEFAULT_SALE_COMMISSION_BPS,
  directOrderCommission,
  formatSaleFeeRate,
  pendingSellerOrder,
  sendSellerOrder,
} from "@used-books/session-client";
import { useSession } from "../../../core/session/session-provider";
import {
  AppText, Button, Checkbox, Icon, Notice, Sheet, colors, radius, space, stitchTokens,
} from "../../../core/ui";
import { formatVnd } from "../../../core/ui/format";
import type { PurchaseConversation } from "../contracts";
import { sellerOrderPrice } from "../purchase-conversation-service";

export function CreateOrderDialog({
  visible, onClose, onCreated, onRefresh, room, listingRevision, listingPrice,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (agreedPrice: number) => void;
  onRefresh: () => void;
  room: PurchaseConversation;
  listingRevision?: string;
  listingPrice?: number;
}) {
  const { client } = useSession();
  const stacked = useWindowDimensions().fontScale > 1.3;
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState<string>();
  const [error, setError] = useState<string>();
  const pending = pendingSellerOrder(client, room.id);
  const price = pending?.agreedBookPrice ?? sellerOrderPrice(room, listingRevision);
  const version = pending?.expectedVersion ?? room.version;
  const commissionBps = room.quotePreview?.commissionBps ?? DEFAULT_SALE_COMMISSION_BPS;
  const commissionRate = formatSaleFeeRate(commissionBps);
  const consent = `${version}:${price}:${commissionBps}`;
  const accepted = acceptedTerms === consent;
  const commission = price == null ? null : directOrderCommission(price, commissionBps);
  const showDestination = room.quotePreview && (!pending || pending.expectedVersion === room.version);

  const close = () => {
    if (sending.current) return;
    setAcceptedTerms(undefined);
    setError(undefined);
    onClose();
  };

  const submit = async () => {
    if (sending.current || !accepted || price == null) return;
    if (!pending && sellerOrderPrice(room, listingRevision) !== price) {
      setAcceptedTerms(undefined);
      setError("Giá hoặc báo giá đã thay đổi. Vui lòng kiểm tra lại.");
      onRefresh();
      return;
    }
    sending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await sendSellerOrder(client, room.id, {
        conversationId: room.id, expectedVersion: version, agreedBookPrice: price,
      }, randomUUID);
    } catch {
      if (pendingSellerOrder(client, room.id)) {
        setError("Chưa xác nhận được đơn đã tạo. Thử lại sẽ gửi đúng yêu cầu trước.");
      } else {
        setAcceptedTerms(undefined);
        setError("Chưa tạo được đơn. Hội thoại hoặc báo giá có thể đã thay đổi.");
        onRefresh();
      }
      return;
    } finally {
      sending.current = false;
      setBusy(false);
    }
    close();
    onCreated(price);
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      dismissible={!busy}
      title="Tạo đơn cho người mua"
      footer={
        <View style={[styles.actions, stacked && styles.actionsStacked]}>
          <View style={!stacked && styles.cancel}>
            <Button secondary title="Hủy" onPress={close} disabled={busy} />
          </View>
          <View style={!stacked && styles.confirm}>
            <Button
              wine
              title={busy ? "Đang tạo đơn…" : pending ? "Thử lại tạo đơn" : "Xác nhận tạo đơn"}
              onPress={() => void submit()}
              disabled={busy || !accepted || price == null}
              busy={busy}
            />
          </View>
        </View>
      }
    >
      {price != null && commission != null ? (
        <View style={styles.summary}>
          <AppText accessibilityRole="header" style={styles.heading}>Giá sách và phí hoa hồng</AppText>
          {listingPrice != null && listingPrice !== price ? (
            <AmountRow label="Giá bài đăng" value={formatVnd(listingPrice)} />
          ) : null}
          <AmountRow label="Giá sách đã chốt" value={formatVnd(price)} />
          <AmountRow label={`Hoa hồng (${commissionRate})`} value={`−${formatVnd(commission)}`} />
          <View style={styles.net}>
            <AmountRow label="Tiền sách dự kiến bạn nhận" value={formatVnd(price - commission)} emphasis />
          </View>
          <AppText style={styles.caption}>
            Phí này được trừ vào tiền sách khi quyết toán. Phí giao nhận tính riêng.
          </AppText>
        </View>
      ) : (
        <Notice tone="warning">Cần chốt giá và có báo giá giao nhận còn hiệu lực để tạo đơn.</Notice>
      )}
      {showDestination && price != null && room.quotePreview ? (
        <View style={styles.destination}>
          <View style={styles.destinationHeading}>
            <Icon name="pin" size={16} color={stitchTokens.wineDark} />
            <AppText accessibilityRole="header" style={styles.heading}>Địa chỉ nhận sách</AppText>
          </View>
          <AppText>{room.quotePreview.destination.recipientName} · {room.quotePreview.destination.phone}</AppText>
          <AppText style={styles.caption}>{room.quotePreview.destination.detail}</AppText>
          <View style={styles.net}>
            <AmountRow label="Phí giao nhận" value={formatVnd(room.quotePreview.shippingFee)} />
            <AmountRow label="Tổng người mua trả" value={formatVnd(price + room.quotePreview.shippingFee)} />
          </View>
          {!pending ? (
            <AppText style={styles.caption}>Đơn giữ sách 15 phút để người mua thanh toán.</AppText>
          ) : null}
        </View>
      ) : null}
      {price != null ? (
        <View style={styles.consent}>
          <Checkbox
            title={`Tôi đồng ý để Lật lại thu hoa hồng ${commissionRate} trên giá sách khi giao dịch hoàn tất.`}
            checked={accepted}
            disabled={busy}
            onPress={() => setAcceptedTerms(accepted ? undefined : consent)}
            color={stitchTokens.wineDark}
          />
        </View>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </Sheet>
  );
}

function AmountRow({ label, value, emphasis = false }: {
  label: string; value: string; emphasis?: boolean;
}) {
  return (
    <View style={styles.amountRow}>
      <AppText style={[styles.amountLabel, emphasis && styles.netLabel]}>{label}</AppText>
      <AppText style={[styles.amountValue, emphasis && styles.netValue]}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.rule,
    padding: space.md,
    gap: space.sm,
  },
  heading: { color: stitchTokens.wineDark, fontWeight: "700" },
  amountRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: space.sm },
  amountLabel: { flexGrow: 1, flexShrink: 1, color: colors.muted, fontSize: 13 },
  amountValue: { marginLeft: "auto", fontWeight: "700", fontSize: 13, color: colors.ink },
  net: { borderTopWidth: 1, borderTopColor: colors.rule, paddingTop: space.sm, gap: space.xs },
  netLabel: { fontWeight: "700", color: colors.ink },
  netValue: { color: stitchTokens.wineDark, fontSize: 16 },
  caption: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  destination: { gap: space.xs },
  destinationHeading: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  consent: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.rule,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  actions: { flexDirection: "row", gap: space.sm, width: "100%" },
  actionsStacked: { flexDirection: "column-reverse" },
  cancel: { flex: 1 },
  confirm: { flex: 2 },
});
