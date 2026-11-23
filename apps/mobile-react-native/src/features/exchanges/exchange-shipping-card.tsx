import React, { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, space, stitchTokens } from "../../core/ui";
import type { Exchange } from "./contracts";

interface ExchangeShippingCardProps {
  exchange: Exchange;
  isInitiator: boolean;
  partnerName: string;
  sendAction?: ReactNode;
  receiveAction?: ReactNode;
  outgoingExtra?: ReactNode;
  incomingExtra?: ReactNode;
  history?: boolean;
}

function formatDateTime(iso?: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function ExchangeShippingCard({
  exchange,
  isInitiator,
  partnerName,
  sendAction,
  receiveAction,
  outgoingExtra,
  incomingExtra,
  history = false,
}: ExchangeShippingCardProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [renderNow] = useState(Date.now);

  if (
    !history &&
    ["Proposed", "AcceptedAwaitingFunding"].includes(exchange.status)
  ) {
    return null;
  }

  const myShipment = isInitiator
    ? exchange.initiatorShipment
    : exchange.recipientShipment;
  const partnerShipment = isInitiator
    ? exchange.recipientShipment
    : exchange.initiatorShipment;

  const myAddress = isInitiator
    ? exchange.initiatorAddress
    : exchange.recipientAddress;
  const partnerAddress = isInitiator
    ? exchange.recipientAddress
    : exchange.initiatorAddress;

  const mySentAt =
    myShipment?.shippedAt ||
    (isInitiator ? exchange.initiatorShippedAt : exchange.recipientShippedAt);
  const partnerSentAt =
    partnerShipment?.shippedAt ||
    (isInitiator ? exchange.recipientShippedAt : exchange.initiatorShippedAt);

  const partnerReceivedMine = Boolean(
    (isInitiator ? exchange.recipientReceivedAt : exchange.initiatorReceivedAt) ||
      exchange.status === "Completed",
  );
  const iReceivedPartners = Boolean(
    (isInitiator ? exchange.initiatorReceivedAt : exchange.recipientReceivedAt) ||
      exchange.status === "Completed",
  );

  const myBooks = exchange.agreement
    ? isInitiator
      ? exchange.agreement.initiatorBooks
      : [exchange.agreement.recipientBook]
    : [];
  const partnerBooks = exchange.agreement
    ? isInitiator
      ? [exchange.agreement.recipientBook]
      : exchange.agreement.initiatorBooks
    : [];

  const copyText = async (text: string, key: string) => {
    try {
      const Clipboard = await import("expo-clipboard");
      if (Clipboard?.setStringAsync) {
        await Clipboard.setStringAsync(text);
      }
    } catch {
      try {
        if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        }
      } catch {
        // Safe fallback
      }
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2200);
  };

  const partnerAddressFull = partnerAddress
    ? `${partnerAddress.recipientName} · ${partnerAddress.phone} · ${partnerAddress.detail}`
    : "";
  const myAddressFull = myAddress
    ? `${myAddress.recipientName} · ${myAddress.phone} · ${myAddress.detail}`
    : "";

  const deadlineText = formatDateTime(exchange.shippingDeadline);
  const shippingExpired = Boolean(
    exchange.shippingDeadline &&
      Date.parse(exchange.shippingDeadline) <= renderNow,
  );

  const outgoingStatus = partnerReceivedMine
    ? { label: "Đối tác đã nhận", tone: "done" as const }
    : mySentAt
      ? { label: "Đang giao tới đối tác", tone: "active" as const }
      : myShipment?.trackingCode
        ? { label: "Đã tạo đơn · Chờ lấy sách", tone: "active" as const }
        : shippingExpired && !history
          ? { label: "Đã quá hạn gửi", tone: "warn" as const }
          : { label: "Chờ bạn gửi sách", tone: "pending" as const };

  const incomingStatus = iReceivedPartners
    ? { label: "Bạn đã nhận sách", tone: "done" as const }
    : partnerSentAt
      ? { label: "Đang giao tới bạn", tone: "active" as const }
      : partnerShipment?.trackingCode
        ? { label: "Đối tác đã tạo đơn", tone: "active" as const }
        : shippingExpired && !history
          ? { label: "Đối tác quá hạn gửi", tone: "warn" as const }
          : { label: "Chờ đối tác gửi", tone: "pending" as const };

  const renderBadge = (status: {
    label: string;
    tone: "done" | "active" | "warn" | "pending";
  }) => (
    <View
      style={[
        styles.statusPill,
        status.tone === "done" && styles.statusPillDone,
        status.tone === "active" && styles.statusPillActive,
        status.tone === "warn" && styles.statusPillWarn,
      ]}
    >
      <AppText
        style={[
          styles.statusPillText,
          status.tone === "done" && styles.statusPillTextDone,
          status.tone === "active" && styles.statusPillTextActive,
          status.tone === "warn" && styles.statusPillTextWarn,
        ]}
      >
        {status.label}
      </AppText>
    </View>
  );

  return (
    <View style={styles.stack}>
      {!history && exchange.status === "Preparing" && deadlineText ? (
        <View style={styles.deadlineBar}>
          <Icon name="clock" size={15} color={stitchTokens.wine} />
          <AppText style={styles.deadlineText}>
            Hạn gửi sách: <AppText style={styles.deadlineStrong}>{deadlineText}</AppText>
            {shippingExpired ? " · Đã quá hạn" : ""}
          </AppText>
        </View>
      ) : null}

      {/* LEG 1: Outgoing (You send) */}
      <View style={styles.legCard}>
        <View style={styles.legHeader}>
          <View style={styles.legTitleRow}>
            <View style={[styles.legIconWrap, styles.legIconOutgoing]}>
              <Icon name="arrow" size={14} color={stitchTokens.wine} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={styles.legTitle}>Bạn gửi sách</AppText>
              {myBooks.length > 0 ? (
                <AppText style={styles.legBooksLine} numberOfLines={1}>
                  {myBooks.map((b) => b.book.title).join(", ")}
                </AppText>
              ) : null}
            </View>
          </View>
          {renderBadge(outgoingStatus)}
        </View>

        {partnerAddress ? (
          <View style={styles.infoBlock}>
            <View style={styles.infoBlockHeader}>
              <View style={styles.infoLabelRow}>
                <Icon name="pin" size={13} color={stitchTokens.subtleGray} />
                <AppText style={styles.infoLabel}>
                  Địa chỉ nhận của {partnerName}
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => void copyText(partnerAddressFull, "partnerAddr")}
                style={styles.copyBtn}
              >
                <AppText style={styles.copyBtnText}>
                  {copiedKey === "partnerAddr" ? "Đã chép" : "Sao chép"}
                </AppText>
              </Pressable>
            </View>
            <AppText style={styles.infoPrimary}>
              {partnerAddress.recipientName} · {partnerAddress.phone}
            </AppText>
            <AppText style={styles.infoSecondary}>{partnerAddress.detail}</AppText>
          </View>
        ) : null}

        {myShipment ? (
          <View style={styles.shipmentMeta}>
            <View style={styles.metaRow}>
              <AppText style={styles.metaKey}>Hình thức</AppText>
              <AppText style={styles.metaVal}>
                {myShipment.method === "direct"
                  ? "Gặp mặt trực tiếp"
                  : myShipment.carrierName || myShipment.carrierCode || "Vận chuyển"}
              </AppText>
            </View>
            {myShipment.trackingCode ? (
              <View style={styles.metaRow}>
                <AppText style={styles.metaKey}>Mã vận đơn</AppText>
                <View style={styles.codeCopyRow}>
                  <AppText style={styles.codeVal}>{myShipment.trackingCode}</AppText>
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => void copyText(myShipment.trackingCode!, "myCode")}
                    style={styles.copyBtn}
                  >
                    <AppText style={styles.copyBtnText}>
                      {copiedKey === "myCode" ? "Đã chép" : "Chép"}
                    </AppText>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {myShipment.meetupLocation ? (
              <View style={styles.metaRow}>
                <AppText style={styles.metaKey}>Điểm hẹn</AppText>
                <AppText style={styles.metaVal}>{myShipment.meetupLocation}</AppText>
              </View>
            ) : null}
            {mySentAt ? (
              <View style={styles.metaRow}>
                <AppText style={styles.metaKey}>Thời điểm gửi</AppText>
                <AppText style={styles.metaVal}>{formatDateTime(mySentAt)}</AppText>
              </View>
            ) : null}
            {myShipment.packagingPhotoUrl || myShipment.packagingVideoUrl ? (
              <View style={styles.evidenceRow}>
                <Icon name="check" size={13} color={stitchTokens.likeNewGreen} />
                <AppText style={styles.evidenceText}>
                  Đã đính kèm ảnh & video đóng gói
                </AppText>
              </View>
            ) : null}
          </View>
        ) : null}

        {sendAction ? <View style={styles.legActionWrap}>{sendAction}</View> : null}
        {outgoingExtra ? <View style={styles.legExtraWrap}>{outgoingExtra}</View> : null}
      </View>

      {/* LEG 2: Incoming (You receive) */}
      <View style={styles.legCard}>
        <View style={styles.legHeader}>
          <View style={styles.legTitleRow}>
            <View style={[styles.legIconWrap, styles.legIconIncoming]}>
              <Icon name="back" size={14} color={stitchTokens.likeNewGreen} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={styles.legTitle}>Bạn nhận sách</AppText>
              {partnerBooks.length > 0 ? (
                <AppText style={styles.legBooksLine} numberOfLines={1}>
                  {partnerBooks.map((b) => b.book.title).join(", ")}
                </AppText>
              ) : null}
            </View>
          </View>
          {renderBadge(incomingStatus)}
        </View>

        {myAddress ? (
          <View style={styles.infoBlock}>
            <View style={styles.infoBlockHeader}>
              <View style={styles.infoLabelRow}>
                <Icon name="pin" size={13} color={stitchTokens.subtleGray} />
                <AppText style={styles.infoLabel}>Địa chỉ nhận của bạn</AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => void copyText(myAddressFull, "myAddr")}
                style={styles.copyBtn}
              >
                <AppText style={styles.copyBtnText}>
                  {copiedKey === "myAddr" ? "Đã chép" : "Sao chép"}
                </AppText>
              </Pressable>
            </View>
            <AppText style={styles.infoPrimary}>
              {myAddress.recipientName} · {myAddress.phone}
            </AppText>
            <AppText style={styles.infoSecondary}>{myAddress.detail}</AppText>
          </View>
        ) : null}

        {partnerShipment ? (
          <View style={styles.shipmentMeta}>
            <View style={styles.metaRow}>
              <AppText style={styles.metaKey}>Hình thức</AppText>
              <AppText style={styles.metaVal}>
                {partnerShipment.method === "direct"
                  ? "Gặp mặt trực tiếp"
                  : partnerShipment.carrierName ||
                    partnerShipment.carrierCode ||
                    "Vận chuyển"}
              </AppText>
            </View>
            {partnerShipment.trackingCode ? (
              <View style={styles.metaRow}>
                <AppText style={styles.metaKey}>Mã vận đơn</AppText>
                <View style={styles.codeCopyRow}>
                  <AppText style={styles.codeVal}>
                    {partnerShipment.trackingCode}
                  </AppText>
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() =>
                      void copyText(partnerShipment.trackingCode!, "partnerCode")
                    }
                    style={styles.copyBtn}
                  >
                    <AppText style={styles.copyBtnText}>
                      {copiedKey === "partnerCode" ? "Đã chép" : "Chép"}
                    </AppText>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {partnerShipment.meetupLocation ? (
              <View style={styles.metaRow}>
                <AppText style={styles.metaKey}>Điểm hẹn</AppText>
                <AppText style={styles.metaVal}>
                  {partnerShipment.meetupLocation}
                </AppText>
              </View>
            ) : null}
            {partnerSentAt ? (
              <View style={styles.metaRow}>
                <AppText style={styles.metaKey}>Đối tác gửi lúc</AppText>
                <AppText style={styles.metaVal}>
                  {formatDateTime(partnerSentAt)}
                </AppText>
              </View>
            ) : null}
          </View>
        ) : (
          <AppText style={styles.waitingHint}>
            {partnerName} chưa cập nhật thông tin gửi sách.
          </AppText>
        )}

        {receiveAction ? (
          <View style={styles.legActionWrap}>{receiveAction}</View>
        ) : null}
        {incomingExtra ? (
          <View style={styles.legExtraWrap}>{incomingExtra}</View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 14,
  },
  deadlineBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: stitchTokens.goldLight,
    borderWidth: 1,
    borderColor: stitchTokens.goldAccent,
  },
  deadlineText: {
    flex: 1,
    fontSize: 12.5,
    color: stitchTokens.darkWood,
  },
  deadlineStrong: {
    fontWeight: "800",
    color: stitchTokens.wine,
    fontVariant: ["tabular-nums"],
  },
  legCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: stitchTokens.wineAlpha05,
    padding: 18,
    gap: 14,
    shadowColor: stitchTokens.darkWood,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  legHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  legTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  legIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  legIconOutgoing: {
    backgroundColor: stitchTokens.roseParchment,
  },
  legIconIncoming: {
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  legTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: stitchTokens.darkWood,
  },
  legBooksLine: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: stitchTokens.surfaceSoft,
  },
  statusPillDone: {
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  statusPillActive: {
    backgroundColor: stitchTokens.amberWarmBg,
  },
  statusPillWarn: {
    backgroundColor: stitchTokens.flashRedBg,
  },
  statusPillText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
  },
  statusPillTextDone: {
    color: stitchTokens.likeNewGreen,
  },
  statusPillTextActive: {
    color: stitchTokens.goldBronze,
  },
  statusPillTextWarn: {
    color: stitchTokens.crimson,
  },
  infoBlock: {
    padding: 13,
    borderRadius: 14,
    backgroundColor: stitchTokens.parchment,
    gap: 4,
  },
  infoBlockHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 2,
  },
  infoLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
    minWidth: 0,
  },
  infoLabel: {
    fontSize: 11.5,
    fontWeight: "600",
    color: stitchTokens.subtleGray,
  },
  infoPrimary: {
    fontSize: 13.5,
    fontWeight: "800",
    color: stitchTokens.darkWood,
  },
  infoSecondary: {
    fontSize: 12.5,
    color: stitchTokens.deepCocoa,
    lineHeight: 18,
  },
  copyBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: stitchTokens.whiteSurface,
    shadowColor: stitchTokens.darkWood,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  copyBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  shipmentMeta: {
    gap: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  metaKey: {
    fontSize: 12.5,
    color: stitchTokens.subtleGray,
  },
  metaVal: {
    fontSize: 13,
    fontWeight: "600",
    color: stitchTokens.darkWood,
    textAlign: "right",
    flexShrink: 1,
  },
  codeCopyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  codeVal: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.wine,
    fontVariant: ["tabular-nums"],
  },
  evidenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.borderWarmLight,
  },
  evidenceText: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.likeNewGreen,
  },
  waitingHint: {
    fontSize: 12.5,
    color: stitchTokens.subtleGray,
  },
  legActionWrap: {
    paddingTop: 4,
  },
  legExtraWrap: {
    gap: space.sm,
  },
});
