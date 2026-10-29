import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, radius, space, stitchTokens } from "../../core/ui";
import { formatVnd } from "../../core/ui/format";
import type { Exchange } from "./contracts";

interface ExchangeShippingCardProps {
  exchange: Exchange;
  isInitiator: boolean;
  partnerName: string;
}

function BarcodeGraphic({ code }: { code: string }) {
  const clean = code.replace(/[^A-Za-z0-9]/g, "") || "LATLAI2026";
  const bars: { width: number; marginRight: number }[] = [];
  for (let i = 0; i < Math.min(clean.length, 16); i++) {
    const charCode = clean.charCodeAt(i);
    const w = (charCode % 3) + 1.5;
    const spaceW = ((charCode >> 1) % 2) + 1.5;
    bars.push({ width: w, marginRight: spaceW });
  }

  return (
    <View style={styles.barcodeWrapper}>
      <View style={styles.barcodeBars}>
        {bars.map((bar, idx) => (
          <View
            key={idx}
            style={[
              styles.barcodeBar,
              { width: bar.width, marginRight: bar.marginRight },
            ]}
          />
        ))}
      </View>
      <AppText style={styles.barcodeText}>{code}</AppText>
    </View>
  );
}

export function ExchangeShippingCard({
  exchange,
  isInitiator,
  partnerName,
}: ExchangeShippingCardProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  // Shipments & Addresses
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

  const mySentAt = myShipment?.shippedAt || exchange.initiatorShippedAt;
  const partnerSentAt = partnerShipment?.shippedAt || exchange.recipientShippedAt;
  const myReceivedAt = exchange.completedAt; // delivered/completed state

  const bothSent = Boolean(mySentAt && partnerSentAt);
  const isDeliveredOrCompleted =
    exchange.status === "Delivered" || exchange.status === "Completed";

  const copyToClipboard = async (text: string, type: "code" | "address") => {
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
    if (type === "code") {
      setCopiedCode(text);
      setTimeout(() => setCopiedCode(null), 2500);
    } else {
      setCopiedAddress(text);
      setTimeout(() => setCopiedAddress(null), 2500);
    }
  };

  // Only display for active shipping/delivered/completed exchanges
  if (
    [
      "Proposed",
      "AcceptedAwaitingFunding",
      "Cancelled",
      "Rejected",
      "Expired",
    ].includes(exchange.status)
  ) {
    return null;
  }

  const partnerAddressFull = partnerAddress
    ? `${partnerAddress.recipientName} - ${partnerAddress.phone}, ${partnerAddress.detail}`
    : "";

  const myAddressFull = myAddress
    ? `${myAddress.recipientName} - ${myAddress.phone}, ${myAddress.detail}`
    : "";

  return (
    <View style={styles.container}>
      {/* 1. Header with Icon and 2-way Badge */}
      <View style={styles.header}>
        <View style={styles.headerIconBox}>
          <Icon name="truck" size={20} color={stitchTokens.whiteSurface} />
        </View>
        <View style={styles.headerTitles}>
          <View style={styles.categoryBadge}>
            <AppText style={styles.categoryBadgeText}>
              Giao nhận 2 chiều độc lập
            </AppText>
          </View>
          <AppText style={styles.cardTitle}>Tiến trình giao nhận 2 chiều</AppText>
          <AppText style={styles.cardSubtitle}>
            Mỗi bên chủ động gửi sách và tự thanh toán cước phí chiều đi
          </AppText>
        </View>
      </View>

      {/* 2. Overview Status Banner */}
      <View style={styles.overviewBanner}>
        <Icon
          name={bothSent ? "truck" : "clock"}
          size={16}
          color={bothSent ? stitchTokens.likeNewGreen : stitchTokens.wineDark}
        />
        <AppText style={styles.overviewBannerText}>
          {isDeliveredOrCompleted
            ? "Cả 2 gói sách đã đến nơi · Sẵn sàng kiểm tra và tất toán"
            : bothSent
            ? "Cả 2 kiện sách đang trên đường vận chuyển · Hãy chú ý điện thoại"
            : mySentAt && !partnerSentAt
            ? `Bạn đã gửi sách · Đang chờ @${partnerName} tạo đơn gửi sách`
            : !mySentAt && partnerSentAt
            ? `@${partnerName} đã gửi sách · Vui lòng gửi sách sớm (hạn 72h)`
            : "Chờ cả hai bên hoàn tất đóng gói và tạo đơn vận chuyển"}
        </AppText>
      </View>

      {/* 3. LEG 1: Chiều đi · Bạn gửi cho Đối tác */}
      <View style={styles.legCard}>
        <View style={styles.legHeader}>
          <View style={[styles.directionPill, styles.directionPillOutgoing]}>
            <Icon name="arrow" size={13} color={stitchTokens.wineDark} />
            <AppText style={styles.directionTextOutgoing}>
              Chiều đi · Bạn gửi sách
            </AppText>
          </View>

          <View
            style={[
              styles.legStatusBadge,
              mySentAt ? styles.legStatusBadgeSent : styles.legStatusBadgeWaiting,
            ]}
          >
            <AppText
              style={[
                styles.legStatusText,
                mySentAt ? styles.legStatusTextSent : styles.legStatusTextWaiting,
              ]}
            >
              {isDeliveredOrCompleted
                ? "Đối tác đã nhận"
                : mySentAt
                ? "Đang giao tới đối tác"
                : "Chờ bạn tạo đơn"}
            </AppText>
          </View>
        </View>

        {/* 3-Step Mini Track */}
        <View style={styles.miniStepper}>
          <View style={styles.miniStepItem}>
            <View
              style={[
                styles.miniStepMarker,
                mySentAt && styles.miniStepMarkerActive,
              ]}
            >
              <Icon
                name={mySentAt ? "check" : "bag"}
                size={11}
                color={mySentAt ? stitchTokens.whiteSurface : stitchTokens.wineDark}
              />
            </View>
            <AppText style={styles.miniStepLabel}>
              {mySentAt ? "Đã gửi" : "Tạo đơn"}
            </AppText>
          </View>

          <View
            style={[
              styles.miniStepLine,
              mySentAt && styles.miniStepLineCompleted,
            ]}
          />

          <View style={styles.miniStepItem}>
            <View
              style={[
                styles.miniStepMarker,
                bothSent && styles.miniStepMarkerActive,
              ]}
            >
              <Icon
                name="truck"
                size={11}
                color={bothSent ? stitchTokens.whiteSurface : stitchTokens.wineDark}
              />
            </View>
            <AppText style={styles.miniStepLabel}>Vận chuyển</AppText>
          </View>

          <View
            style={[
              styles.miniStepLine,
              isDeliveredOrCompleted && styles.miniStepLineCompleted,
            ]}
          />

          <View style={styles.miniStepItem}>
            <View
              style={[
                styles.miniStepMarker,
                isDeliveredOrCompleted && styles.miniStepMarkerActive,
              ]}
            >
              <Icon
                name={isDeliveredOrCompleted ? "check" : "shield"}
                size={11}
                color={
                  isDeliveredOrCompleted
                    ? stitchTokens.whiteSurface
                    : stitchTokens.wineDark
                }
              />
            </View>
            <AppText style={styles.miniStepLabel}>Đối tác nhận</AppText>
          </View>
        </View>

        {/* Destination Address of Partner (Where to send) */}
        {partnerAddress && (
          <View style={styles.addressBox}>
            <View style={styles.addressBoxHeader}>
              <View style={styles.addressTitleRow}>
                <Icon name="pin" size={13} color={stitchTokens.wineDark} />
                <AppText style={styles.addressBoxTitle}>
                  Địa chỉ gửi tới @{partnerName}:
                </AppText>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sao chép địa chỉ nhận của đối tác"
                onPress={() => copyToClipboard(partnerAddressFull, "address")}
                style={({ pressed }) => [
                  styles.copyBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Icon
                  name={copiedAddress === partnerAddressFull ? "check" : "bookmark"}
                  size={12}
                  color={
                    copiedAddress === partnerAddressFull
                      ? stitchTokens.likeNewGreen
                      : stitchTokens.wineDark
                  }
                />
                <AppText
                  style={[
                    styles.copyBtnText,
                    copiedAddress === partnerAddressFull && styles.copyBtnTextSuccess,
                  ]}
                >
                  {copiedAddress === partnerAddressFull ? "Đã chép" : "Sao chép"}
                </AppText>
              </Pressable>
            </View>

            <View style={styles.addressContent}>
              <AppText style={styles.recipientLine}>
                {partnerAddress.recipientName} · {partnerAddress.phone}
              </AppText>
              <AppText style={styles.detailLine}>{partnerAddress.detail}</AppText>
            </View>
          </View>
        )}

        {/* Airway Bill & Tracking Code */}
        {myShipment ? (
          <View style={styles.shipmentDetailsBox}>
            <View style={styles.carrierRow}>
              <AppText style={styles.detailLabel}>Đơn vị vận chuyển:</AppText>
              <View style={styles.carrierTag}>
                <AppText style={styles.carrierTagText}>
                  {myShipment.method === "direct"
                    ? "Gặp mặt trực tiếp"
                    : myShipment.carrierName || myShipment.carrierCode || "Chuyển phát nhanh"}
                </AppText>
              </View>
            </View>

            {myShipment.trackingCode ? (
              <View style={styles.trackingCard}>
                <View style={styles.trackingTopRow}>
                  <View>
                    <AppText style={styles.trackingTitle}>MÃ VẬN ĐƠN CHIỀU ĐI</AppText>
                    <AppText style={styles.trackingCodeValue}>
                      {myShipment.trackingCode}
                    </AppText>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Sao chép mã vận đơn"
                    onPress={() =>
                      copyToClipboard(myShipment.trackingCode!, "code")
                    }
                    style={({ pressed }) => [
                      styles.copyBtnLarge,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Icon
                      name={
                        copiedCode === myShipment.trackingCode
                          ? "check"
                          : "tag"
                      }
                      size={13}
                      color={
                        copiedCode === myShipment.trackingCode
                          ? stitchTokens.likeNewGreen
                          : stitchTokens.wineDark
                      }
                    />
                    <AppText
                      style={[
                        styles.copyBtnLargeText,
                        copiedCode === myShipment.trackingCode &&
                          styles.copyBtnTextSuccess,
                      ]}
                    >
                      {copiedCode === myShipment.trackingCode
                        ? "Đã chép"
                        : "Chép mã"}
                    </AppText>
                  </Pressable>
                </View>

                {/* Electronic Barcode graphic */}
                <BarcodeGraphic code={myShipment.trackingCode} />
              </View>
            ) : null}

            {myShipment.meetupLocation ? (
              <View style={styles.meetupRow}>
                <Icon name="pin" size={13} color={stitchTokens.wineDark} />
                <AppText style={styles.meetupText}>
                  Điểm hẹn: {myShipment.meetupLocation}
                </AppText>
              </View>
            ) : null}

            {myShipment.notes ? (
              <AppText style={styles.notesText}>
                Ghi chú: {myShipment.notes}
              </AppText>
            ) : null}
          </View>
        ) : (
          <View style={styles.emptyNoticeBox}>
            <Icon name="bag" size={16} color={stitchTokens.wineDark} />
            <AppText style={styles.emptyNoticeText}>
              Bạn chưa tạo đơn gửi sách. Hãy đóng gói sách cẩn thận và bấm “Tạo đơn vận chuyển” ở bảng thao tác bên dưới.
            </AppText>
          </View>
        )}
      </View>

      {/* 4. LEG 2: Chiều về · Đối tác gửi cho bạn */}
      <View style={styles.legCard}>
        <View style={styles.legHeader}>
          <View style={[styles.directionPill, styles.directionPillIncoming]}>
            <Icon name="back" size={13} color={stitchTokens.likeNewGreen} />
            <AppText style={styles.directionTextIncoming}>
              Chiều về · Bạn nhận sách
            </AppText>
          </View>

          <View
            style={[
              styles.legStatusBadge,
              partnerSentAt
                ? styles.legStatusBadgeSent
                : styles.legStatusBadgeWaiting,
            ]}
          >
            <AppText
              style={[
                styles.legStatusText,
                partnerSentAt
                  ? styles.legStatusTextSent
                  : styles.legStatusTextWaiting,
              ]}
            >
              {isDeliveredOrCompleted
                ? "Bạn đã nhận sách"
                : partnerSentAt
                ? "Đang giao tới bạn"
                : "Chờ đối tác gửi"}
            </AppText>
          </View>
        </View>

        {/* 3-Step Mini Track */}
        <View style={styles.miniStepper}>
          <View style={styles.miniStepItem}>
            <View
              style={[
                styles.miniStepMarker,
                partnerSentAt && styles.miniStepMarkerActive,
              ]}
            >
              <Icon
                name={partnerSentAt ? "check" : "bag"}
                size={11}
                color={
                  partnerSentAt
                    ? stitchTokens.whiteSurface
                    : stitchTokens.wineDark
                }
              />
            </View>
            <AppText style={styles.miniStepLabel}>
              {partnerSentAt ? "Đã gửi" : "Chuẩn bị"}
            </AppText>
          </View>

          <View
            style={[
              styles.miniStepLine,
              bothSent && styles.miniStepLineCompleted,
            ]}
          />

          <View style={styles.miniStepItem}>
            <View
              style={[
                styles.miniStepMarker,
                bothSent && styles.miniStepMarkerActive,
              ]}
            >
              <Icon
                name="truck"
                size={11}
                color={bothSent ? stitchTokens.whiteSurface : stitchTokens.wineDark}
              />
            </View>
            <AppText style={styles.miniStepLabel}>Vận chuyển</AppText>
          </View>

          <View
            style={[
              styles.miniStepLine,
              isDeliveredOrCompleted && styles.miniStepLineCompleted,
            ]}
          />

          <View style={styles.miniStepItem}>
            <View
              style={[
                styles.miniStepMarker,
                isDeliveredOrCompleted && styles.miniStepMarkerActive,
              ]}
            >
              <Icon
                name={isDeliveredOrCompleted ? "check" : "shield"}
                size={11}
                color={
                  isDeliveredOrCompleted
                    ? stitchTokens.whiteSurface
                    : stitchTokens.wineDark
                }
              />
            </View>
            <AppText style={styles.miniStepLabel}>Đồng kiểm 72h</AppText>
          </View>
        </View>

        {/* Destination Address of Viewer */}
        {myAddress && (
          <View style={styles.addressBox}>
            <View style={styles.addressBoxHeader}>
              <View style={styles.addressTitleRow}>
                <Icon name="pin" size={13} color={stitchTokens.wineDark} />
                <AppText style={styles.addressBoxTitle}>
                  Địa chỉ nhận của bạn:
                </AppText>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sao chép địa chỉ nhận của bạn"
                onPress={() => copyToClipboard(myAddressFull, "address")}
                style={({ pressed }) => [
                  styles.copyBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Icon
                  name={copiedAddress === myAddressFull ? "check" : "bookmark"}
                  size={12}
                  color={
                    copiedAddress === myAddressFull
                      ? stitchTokens.likeNewGreen
                      : stitchTokens.wineDark
                  }
                />
                <AppText
                  style={[
                    styles.copyBtnText,
                    copiedAddress === myAddressFull && styles.copyBtnTextSuccess,
                  ]}
                >
                  {copiedAddress === myAddressFull ? "Đã chép" : "Sao chép"}
                </AppText>
              </Pressable>
            </View>

            <View style={styles.addressContent}>
              <AppText style={styles.recipientLine}>
                {myAddress.recipientName} · {myAddress.phone}
              </AppText>
              <AppText style={styles.detailLine}>{myAddress.detail}</AppText>
            </View>
          </View>
        )}

        {/* Partner Shipment Details */}
        {partnerShipment ? (
          <View style={styles.shipmentDetailsBox}>
            <View style={styles.carrierRow}>
              <AppText style={styles.detailLabel}>Đơn vị vận chuyển:</AppText>
              <View style={styles.carrierTag}>
                <AppText style={styles.carrierTagText}>
                  {partnerShipment.method === "direct"
                    ? "Gặp mặt trực tiếp"
                    : partnerShipment.carrierName || partnerShipment.carrierCode || "Chuyển phát nhanh"}
                </AppText>
              </View>
            </View>

            {partnerShipment.trackingCode ? (
              <View style={styles.trackingCard}>
                <View style={styles.trackingTopRow}>
                  <View>
                    <AppText style={styles.trackingTitle}>MÃ VẬN ĐƠN CHIỀU VỀ</AppText>
                    <AppText style={styles.trackingCodeValue}>
                      {partnerShipment.trackingCode}
                    </AppText>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Sao chép mã vận đơn chiều về"
                    onPress={() =>
                      copyToClipboard(partnerShipment.trackingCode!, "code")
                    }
                    style={({ pressed }) => [
                      styles.copyBtnLarge,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Icon
                      name={
                        copiedCode === partnerShipment.trackingCode
                          ? "check"
                          : "tag"
                      }
                      size={13}
                      color={
                        copiedCode === partnerShipment.trackingCode
                          ? stitchTokens.likeNewGreen
                          : stitchTokens.wineDark
                      }
                    />
                    <AppText
                      style={[
                        styles.copyBtnLargeText,
                        copiedCode === partnerShipment.trackingCode &&
                          styles.copyBtnTextSuccess,
                      ]}
                    >
                      {copiedCode === partnerShipment.trackingCode
                        ? "Đã chép"
                        : "Chép mã"}
                    </AppText>
                  </Pressable>
                </View>

                {/* Electronic Barcode */}
                <BarcodeGraphic code={partnerShipment.trackingCode} />
              </View>
            ) : null}

            {partnerShipment.meetupLocation ? (
              <View style={styles.meetupRow}>
                <Icon name="pin" size={13} color={stitchTokens.wineDark} />
                <AppText style={styles.meetupText}>
                  Điểm hẹn: {partnerShipment.meetupLocation}
                </AppText>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.emptyNoticeBox}>
            <Icon name="clock" size={16} color={stitchTokens.wineDark} />
            <AppText style={styles.emptyNoticeText}>
              Đối tác @{partnerName} đang chuẩn bị sách. Bạn sẽ nhận được mã vận đơn ngay khi đối tác tạo đơn gửi.
            </AppText>
          </View>
        )}
      </View>

      {/* 5. Escrow POL-14 Guarantee Callout Card */}
      <View style={styles.escrowCard}>
        <View style={styles.escrowIconBox}>
          <Icon name="shield" size={18} color={stitchTokens.likeNewGreen} />
        </View>
        <View style={styles.escrowContent}>
          <AppText style={styles.escrowTitle}>
            Bảo chứng an toàn giao dịch Lật Lại (POL-14)
          </AppText>
          <AppText style={styles.escrowDesc}>
            Toàn bộ tiền cọc bảo chứng ({formatVnd(isInitiator ? exchange.initiatorDeposit : exchange.recipientDeposit)}) và tiền bù đang được tạm khóa an toàn trên Ledger. Mỗi bên có 72 giờ kiểm tra từ lúc xác nhận nhận sách. Chỉ tất toán sau cả hai hạn nếu không có tranh chấp.
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    padding: space.md,
    gap: 14,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  headerIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: stitchTokens.wineDark,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitles: {
    flex: 1,
    gap: 2,
  },
  categoryBadge: {
    alignSelf: "flex-start",
    backgroundColor: stitchTokens.parchment,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    marginBottom: 2,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  cardSubtitle: {
    fontSize: 11,
    color: stitchTokens.roseBrown,
    lineHeight: 15,
  },
  overviewBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: stitchTokens.parchment,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  overviewBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.wineDark,
    lineHeight: 16,
  },
  legCard: {
    backgroundColor: stitchTokens.creamBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    padding: 12,
    gap: 10,
  },
  legHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  directionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  directionPillOutgoing: {
    backgroundColor: stitchTokens.parchment,
  },
  directionPillIncoming: {
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  directionTextOutgoing: {
    fontSize: 11,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  directionTextIncoming: {
    fontSize: 11,
    fontWeight: "800",
    color: stitchTokens.likeNewGreen,
  },
  legStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  legStatusBadgeSent: {
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  legStatusBadgeWaiting: {
    backgroundColor: stitchTokens.amberBg,
  },
  legStatusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  legStatusTextSent: {
    color: stitchTokens.likeNewGreen,
  },
  legStatusTextWaiting: {
    color: stitchTokens.terracottaSoft,
  },
  miniStepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: stitchTokens.whiteSurface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  miniStepItem: {
    alignItems: "center",
    gap: 4,
  },
  miniStepMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  miniStepMarkerActive: {
    backgroundColor: stitchTokens.likeNewGreen,
    borderColor: stitchTokens.likeNewGreen,
  },
  miniStepLine: {
    flex: 1,
    height: 2,
    backgroundColor: stitchTokens.peachBorder,
    marginHorizontal: 4,
  },
  miniStepLineCompleted: {
    backgroundColor: stitchTokens.likeNewGreen,
  },
  miniStepLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: stitchTokens.roseBrown,
  },
  addressBox: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 10,
    padding: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  addressBoxHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addressTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  addressBoxTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: stitchTokens.parchment,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  copyBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  copyBtnTextSuccess: {
    color: stitchTokens.likeNewGreen,
  },
  addressContent: {
    gap: 1,
  },
  recipientLine: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  detailLine: {
    fontSize: 11,
    color: stitchTokens.roseBrown,
    lineHeight: 15,
  },
  shipmentDetailsBox: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 10,
    padding: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  carrierRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailLabel: {
    fontSize: 11,
    color: stitchTokens.roseBrown,
  },
  carrierTag: {
    backgroundColor: stitchTokens.parchment,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  carrierTagText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  trackingCard: {
    backgroundColor: stitchTokens.creamBg,
    borderRadius: 8,
    padding: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  trackingTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  trackingTitle: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: stitchTokens.roseBrown,
  },
  trackingCodeValue: {
    fontSize: 13,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    fontFamily: "monospace",
  },
  copyBtnLarge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: stitchTokens.whiteSurface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  copyBtnLargeText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  barcodeWrapper: {
    backgroundColor: stitchTokens.whiteSurface,
    padding: 8,
    borderRadius: 6,
    alignItems: "center",
    gap: 4,
  },
  barcodeBars: {
    flexDirection: "row",
    height: 24,
    alignItems: "stretch",
  },
  barcodeBar: {
    backgroundColor: stitchTokens.wineDark,
    borderRadius: 0.5,
  },
  barcodeText: {
    fontSize: 9,
    fontFamily: "monospace",
    color: stitchTokens.roseBrown,
    letterSpacing: 1.5,
  },
  meetupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  meetupText: {
    fontSize: 11,
    color: stitchTokens.wineDark,
    fontWeight: "600",
  },
  notesText: {
    fontSize: 11,
    fontStyle: "italic",
    color: stitchTokens.roseBrown,
  },
  emptyNoticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: stitchTokens.whiteSurface,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  emptyNoticeText: {
    flex: 1,
    fontSize: 11,
    color: stitchTokens.wineDark,
    lineHeight: 15,
  },
  escrowCard: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: stitchTokens.likeNewGreen,
  },
  escrowIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: stitchTokens.whiteSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  escrowContent: {
    flex: 1,
    gap: 3,
  },
  escrowTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: stitchTokens.likeNewGreen,
  },
  escrowDesc: {
    fontSize: 11,
    color: stitchTokens.wineDark,
    lineHeight: 15,
  },
  pressed: {
    opacity: 0.7,
  },
});
