import React from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Icon, space, stitchTokens } from "../../core/ui";
import { formatVnd } from "../../core/ui/format";
import type { Exchange } from "./contracts";
import { mapExchangeStatusInfo } from "./contracts";
import { PublicPhoto } from "../shelf/public-photo";
import type { Listing } from "../shelf/contracts";

interface ExchangeProposalCardProps {
  exchange: Exchange;
  isInitiator: boolean;
  initiatorListings?: (Listing | null)[] | null;
  initiatorListing?: Listing | null;
  recipientListing?: Listing | null;
}

export function ExchangeProposalCard({
  exchange,
  isInitiator,
  initiatorListings,
  initiatorListing,
  recipientListing,
}: ExchangeProposalCardProps) {
  const statusInfo = mapExchangeStatusInfo(exchange.status, isInitiator);

  const initiatorListingCount =
    exchange.initiatorListingIds && exchange.initiatorListingIds.length > 0
      ? exchange.initiatorListingIds.length
      : 1;

  const initiatorBookList: (Listing | null)[] =
    initiatorListings && initiatorListings.length > 0
      ? initiatorListings
      : initiatorListing
        ? [initiatorListing]
        : new Array(initiatorListingCount).fill(null);

  const recipientBookList: (Listing | null)[] = recipientListing
    ? [recipientListing]
    : [null];

  const myBooks = isInitiator ? initiatorBookList : recipientBookList;
  const partnerBooks = isInitiator ? recipientBookList : initiatorBookList;

  const partnerListingPrimary = isInitiator
    ? recipientListing
    : initiatorListing ?? initiatorListings?.[0];

  const partnerAddressName = isInitiator
    ? exchange.recipientAddress?.recipientName
    : exchange.initiatorAddress?.recipientName;

  const partnerName =
    partnerListingPrimary?.seller.displayName ??
    partnerAddressName ??
    (isInitiator ? "Đối tác" : "Đối tác đề nghị");

  // Financial calculations
  const diff = exchange.diffAmount;
  const isPayer = exchange.diffPayerId === (isInitiator ? exchange.initiatorId : exchange.recipientId);

  let moneyLabel = "Trao đổi ngang giá";
  let moneyTone: string = stitchTokens.likeNewGreen;
  let moneyBg: string = stitchTokens.likeNewGreenBg;

  if (diff > 0) {
    if (isPayer) {
      moneyLabel = `Bạn cần bù thêm: ${formatVnd(diff)}`;
      moneyTone = stitchTokens.wineDark;
      moneyBg = stitchTokens.amberBg;
    } else {
      moneyLabel = `Đối tác sẽ bù thêm: ${formatVnd(diff)}`;
      moneyTone = stitchTokens.likeNewGreen;
      moneyBg = stitchTokens.likeNewGreenBg;
    }
  }

  const myDeposit = isInitiator ? exchange.initiatorDeposit : exchange.recipientDeposit;
  const partnerDeposit = isInitiator ? exchange.recipientDeposit : exchange.initiatorDeposit;

  const myAddress = isInitiator ? exchange.initiatorAddress : exchange.recipientAddress;
  const partnerAddress = isInitiator ? exchange.recipientAddress : exchange.initiatorAddress;

  return (
    <View style={styles.card}>
      {/* 1. Header with Code and Status Badge */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <AppText style={styles.codeText}>
            #{exchange.id.slice(0, 8).toUpperCase()}
          </AppText>
          <AppText style={styles.dateText}>
            Tạo ngày {new Date(exchange.createdAt).toLocaleDateString("vi-VN")}
          </AppText>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: statusInfo.badgeBg }]}>
          <AppText style={[styles.statusText, { color: statusInfo.badgeColor }]}>
            {statusInfo.label}
          </AppText>
        </View>
      </View>

      {/* 2. Book Exchange Matchup Cards */}
      <View style={styles.booksComparison}>
        {/* Your Books (Sách của bạn gửi đi) */}
        <View style={styles.bookSideCard}>
          <View style={styles.sideHeader}>
            <AppText style={styles.sideBadge}>
              {myBooks.length > 1
                ? `SÁCH BẠN GỬI ĐI (${myBooks.length} CUỐN)`
                : "SÁCH CỦA BẠN GỬI ĐI"}
            </AppText>
          </View>
          <View style={{ gap: 8 }}>
            {myBooks.length > 0 ? (
              myBooks.map((item, idx) => (
                <View key={item?.id ?? `my-${idx}`} style={styles.bookInfoRow}>
                  <View style={styles.photoBox}>
                    {item?.photos?.[0] ? (
                      <PublicPhoto
                        listingId={item.id}
                        revisionId={item.revisionId}
                        mediaId={item.photos[0].id}
                        label="Bìa sách bạn gửi"
                        active={true}
                        compact
                      />
                    ) : (
                      <View style={styles.photoPlaceholder}>
                        <Icon name="book" size={24} color={stitchTokens.roseBrown} />
                      </View>
                    )}
                  </View>
                  <View style={styles.bookTextCol}>
                    {item ? (
                      <>
                        <AppText style={styles.bookTitle} numberOfLines={2}>
                          {item.book.title}
                        </AppText>
                        <AppText style={styles.bookAuthors} numberOfLines={1}>
                          {item.book.authors.join(", ")}
                        </AppText>
                        <AppText style={styles.bookValue}>
                          Giá trị: {formatVnd(item.exchangeValue ?? item.salePrice ?? 0)}
                        </AppText>
                      </>
                    ) : (
                      <>
                        <AppText style={styles.bookTitle} numberOfLines={2}>
                          Sách gửi trao đổi #{idx + 1}
                        </AppText>
                        <AppText style={styles.bookAuthors} numberOfLines={1}>
                          {exchange.status === "Completed"
                            ? "Đã giao nhận hoàn tất"
                            : "Sách trong thỏa thuận trao đổi"}
                        </AppText>
                        <AppText style={styles.bookValue}>
                          {exchange.status === "Completed"
                            ? "Đã đối soát lưu ký"
                            : "Chi tiết trong hồ sơ"}
                        </AppText>
                      </>
                    )}
                  </View>
                </View>
              ))
            ) : null}
          </View>
        </View>

        {/* Swap Icon Divider */}
        <View style={styles.swapDivider}>
          <View style={styles.swapLine} />
          <View style={styles.swapCircle}>
            <Icon name="sync" size={16} color={stitchTokens.wineDark} />
          </View>
          <View style={styles.swapLine} />
        </View>

        {/* Partner Books */}
        <View style={styles.bookSideCard}>
          <View style={styles.sideHeader}>
            <AppText style={styles.sideBadgePartner}>
              {partnerBooks.length > 1
                ? `SÁCH BẠN NHẬN VỀ (${partnerBooks.length} CUỐN TỪ @${partnerName})`
                : `SÁCH BẠN NHẬN VỀ (TỪ @${partnerName})`}
            </AppText>
          </View>
          <View style={{ gap: 8 }}>
            {partnerBooks.length > 0 ? (
              partnerBooks.map((item, idx) => (
                <View key={item?.id ?? `partner-${idx}`} style={styles.bookInfoRow}>
                  <View style={styles.photoBox}>
                    {item?.photos?.[0] ? (
                      <PublicPhoto
                        listingId={item.id}
                        revisionId={item.revisionId}
                        mediaId={item.photos[0].id}
                        label="Bìa sách bạn nhận"
                        active={true}
                        compact
                      />
                    ) : (
                      <View style={styles.photoPlaceholder}>
                        <Icon name="book" size={24} color={stitchTokens.roseBrown} />
                      </View>
                    )}
                  </View>
                  <View style={styles.bookTextCol}>
                    {item ? (
                      <>
                        <AppText style={styles.bookTitle} numberOfLines={2}>
                          {item.book.title}
                        </AppText>
                        <AppText style={styles.bookAuthors} numberOfLines={1}>
                          {item.book.authors.join(", ")}
                        </AppText>
                        <AppText style={styles.bookValue}>
                          Giá trị: {formatVnd(item.exchangeValue ?? item.salePrice ?? 0)}
                        </AppText>
                      </>
                    ) : (
                      <>
                        <AppText style={styles.bookTitle} numberOfLines={2}>
                          Sách nhận từ đối tác #{idx + 1}
                        </AppText>
                        <AppText style={styles.bookAuthors} numberOfLines={1}>
                          {exchange.status === "Completed"
                            ? "Đã giao dịch hoàn tất"
                            : "Sách trao đổi đối ứng"}
                        </AppText>
                        <AppText style={styles.bookValue}>
                          {exchange.status === "Completed"
                            ? "Đã tất toán lưu ký"
                            : "Chi tiết trong hồ sơ"}
                        </AppText>
                      </>
                    )}
                  </View>
                </View>
              ))
            ) : null}
          </View>
        </View>
      </View>

      {/* 3. Financial Settlement Box */}
      <View style={[styles.settlementBox, { backgroundColor: moneyBg }]}>
        <View style={styles.settlementRow}>
          <Icon name="tag" size={17} color={moneyTone} />
          <View style={{ flex: 1 }}>
            <AppText style={[styles.settlementTitle, { color: moneyTone }]}>
              {moneyLabel}
            </AppText>
            <AppText style={styles.settlementSub}>
              Cọc đối soát: Bạn {formatVnd(myDeposit)} · Đối tác {formatVnd(partnerDeposit)}
            </AppText>
          </View>
        </View>
      </View>

      {/* 4. Delivery Address Summary */}
      <View style={styles.addressSection}>
        <View style={styles.addressHeaderRow}>
          <Icon name="pin" size={14} color={stitchTokens.wineMid} />
          <AppText style={styles.addressHeaderTitle}>Địa chỉ giao nhận</AppText>
        </View>

        <View style={styles.addressBlock}>
          <AppText style={styles.addressRoleLabel}>Địa chỉ của bạn:</AppText>
          {myAddress ? (
            <AppText style={styles.addressDetail}>
              {myAddress.recipientName} ({myAddress.phone}) — {myAddress.detail}
            </AppText>
          ) : (
            <AppText style={styles.addressMissing}>Chưa cấu hình địa chỉ nhận hàng</AppText>
          )}
        </View>

        {partnerAddress ? (
          <View style={styles.addressBlock}>
            <AppText style={styles.addressRoleLabel}>Địa chỉ đối tác:</AppText>
            <AppText style={styles.addressDetail}>
              {partnerAddress.recipientName} ({partnerAddress.phone}) — {partnerAddress.detail}
            </AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  card: {
    padding: space.md,
    borderRadius: 18,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachMuted,
    gap: 12,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.peachBorder,
  },
  headerLeft: {
    gap: 2,
  },
  codeText: {
    fontSize: 15,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  dateText: {
    fontSize: 11,
    color: stitchTokens.roseBrown,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  booksComparison: {
    gap: 10,
  },
  bookSideCard: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorderAlpha40,
    gap: 8,
  },
  sideHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  sideBadge: {
    fontSize: 10,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    backgroundColor: stitchTokens.terracottaSoft,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    letterSpacing: 0.3,
  },
  sideBadgePartner: {
    fontSize: 10,
    fontWeight: "800",
    color: stitchTokens.white,
    backgroundColor: stitchTokens.wineMid,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    letterSpacing: 0.3,
  },
  bookInfoRow: {
    flexDirection: "row",
    gap: 12,
  },
  photoBox: {
    width: 65,
    height: 85,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: stitchTokens.warmCard,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bookTextCol: {
    flex: 1,
    justifyContent: "center",
    gap: 3,
  },
  bookTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    lineHeight: 18,
  },
  bookAuthors: {
    fontSize: 12,
    color: stitchTokens.roseBrown,
  },
  bookValue: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
    marginTop: 2,
  },
  loadingBook: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
    fontStyle: "italic",
  },
  swapDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: -2,
  },
  swapLine: {
    flex: 1,
    height: 1,
    backgroundColor: stitchTokens.peachBorder,
  },
  swapCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: stitchTokens.terracottaSoft,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  settlementBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
  },
  settlementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  settlementTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  settlementSub: {
    fontSize: 11,
    color: stitchTokens.darkWood,
    marginTop: 2,
  },
  addressSection: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorderAlpha40,
    gap: 6,
  },
  addressHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  addressHeaderTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  addressBlock: {
    gap: 1,
  },
  addressRoleLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.roseBrown,
    textTransform: "uppercase",
  },
  addressDetail: {
    fontSize: 11,
    color: stitchTokens.darkWood,
    lineHeight: 16,
  },
  addressMissing: {
    fontSize: 11,
    color: stitchTokens.crimson,
    fontStyle: "italic",
  },
  shipmentSection: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    gap: 10,
  },
  shipmentHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.peachBorderAlpha40,
  },
  shipmentHeaderTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  shipmentCard: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorderAlpha40,
    gap: 6,
  },
  shipmentTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shipmentRole: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.roseBrown,
    textTransform: "uppercase",
  },
  shipmentStatusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  shipmentStatusSent: {
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  shipmentStatusWaiting: {
    backgroundColor: stitchTokens.amberBg,
  },
  shipmentStatusText: {
    fontSize: 10,
    fontWeight: "700",
  },
  shipmentStatusTextSent: {
    color: stitchTokens.likeNewGreen,
  },
  shipmentStatusTextWaiting: {
    color: stitchTokens.goldBronze,
  },
  shipmentDetails: {
    gap: 3,
  },
  shipmentMethodText: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.darkWood,
  },
  trackingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginVertical: 2,
  },
  trackingLabel: {
    fontSize: 11,
    color: stitchTokens.darkWood,
  },
  trackingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: stitchTokens.terracottaSoft,
  },
  trackingCodeText: {
    fontSize: 12,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    letterSpacing: 0.5,
  },
  shipmentDetailText: {
    fontSize: 11,
    color: stitchTokens.darkWood,
    lineHeight: 15,
  },
  shipmentNotesText: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
    fontStyle: "italic",
    lineHeight: 15,
  },
  shipmentDateText: {
    fontSize: 10,
    color: stitchTokens.roseBrown,
    marginTop: 2,
  },
  shipmentPendingText: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
    fontStyle: "italic",
  },
});

