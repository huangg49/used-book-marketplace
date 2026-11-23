import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, stitchTokens } from "../../core/ui";
import { formatVnd } from "../../core/ui/format";
import type { Exchange } from "./contracts";
import { mapExchangeStatusInfo } from "./contracts";
import { PublicPhoto } from "../shelf/public-photo";

interface ExchangeProposalCardProps {
  exchange: Exchange;
  isInitiator: boolean;
  initialCollapsed?: boolean;
}

function FrozenCondition({ book }: { book: NonNullable<Exchange['agreement']>['recipientBook'] }) {
  const [expanded, setExpanded] = useState(false);
  const editionInfo = [book.book.edition, book.book.publicationYear].filter(Boolean).join(" · ");
  const details = [
    book.description,
    book.pages ? `${book.pages} trang` : null,
    book.coverNote,
    book.notes,
    book.accessories,
    book.hasMissingPages ? "Có thiếu trang" : "Không thiếu trang",
    book.readable ? "Đọc tốt" : "Khó đọc",
  ].filter(Boolean).join(". ");

  return (
    <View style={styles.frozenContainer}>
      {editionInfo ? (
        <AppText style={styles.frozenEditionText} numberOfLines={1}>
          {editionInfo}
        </AppText>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? "Thu gọn tình trạng" : "Xem tình trạng đã ghi nhận"}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={styles.frozenToggleBtn}
      >
        <AppText style={styles.frozenToggleText}>
          {expanded ? "▲ Thu gọn tình trạng" : "▼ Tình trạng đã ghi nhận"}
        </AppText>
      </Pressable>
      {expanded && details ? (
        <View style={styles.frozenDetailBox}>
          <AppText style={styles.frozenDetailText}>{details}</AppText>
        </View>
      ) : null}
    </View>
  );
}

export function ExchangeProposalCard({
  exchange,
  isInitiator,
  initialCollapsed,
}: ExchangeProposalCardProps) {
  const defaultCollapsed = initialCollapsed ?? exchange.status !== "Proposed";
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const statusInfo = mapExchangeStatusInfo(exchange.status, isInitiator);

  const initiatorListingCount =
    exchange.initiatorListingIds && exchange.initiatorListingIds.length > 0
      ? exchange.initiatorListingIds.length
      : 1;

  type FrozenBook = NonNullable<Exchange['agreement']>['recipientBook'];
  const frozen = (book: FrozenBook) => ({
    id: book.listingId, revisionId: book.revisionId, photos: book.mediaIds.map((id) => ({ id })),
    book: book.book, snapshot: book, exchangeValue: book.exchangeValue, salePrice: null,
  });
  type BookView = ReturnType<typeof frozen>;
  const initiatorBookList: (BookView | null)[] = exchange.agreement
    ? exchange.agreement.initiatorBooks.map(frozen) : new Array(initiatorListingCount).fill(null);
  const recipientBookList: (BookView | null)[] = exchange.agreement ? [frozen(exchange.agreement.recipientBook)] : [null];
  const myBooks = isInitiator ? initiatorBookList : recipientBookList;
  const partnerBooks = isInitiator ? recipientBookList : initiatorBookList;

  const partnerAddressName = isInitiator
    ? exchange.recipientAddress?.recipientName
    : exchange.initiatorAddress?.recipientName;

  const partnerName =
    (isInitiator ? exchange.agreement?.recipientBook.ownerDisplayName : exchange.agreement?.initiatorBooks[0]?.ownerDisplayName) ??
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
    <View style={[styles.card, collapsed && styles.cardCollapsed]}>
      {!exchange.agreement && (
        <AppText style={styles.legacyNotice}>
          Hồ sơ cũ thiếu bản chụp sách ban đầu. Cọc/bù là nghĩa vụ đã lưu; nội dung sách không được lấy từ bài đăng hiện tại.
        </AppText>
      )}

      {/* 1. Header with Code, Status Badge & Collapse Toggle */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={collapsed ? "Mở rộng chi tiết đề nghị đổi sách" : "Thu gọn đề nghị đổi sách"}
        onPress={() => setCollapsed((v) => !v)}
        style={[styles.header, collapsed && styles.headerCollapsed]}
      >
        <View style={styles.headerLeft}>
          <View style={styles.headerTitleRow}>
            <AppText style={styles.codeText}>
              #{exchange.id.slice(0, 8).toUpperCase()}
            </AppText>
            <View style={[styles.statusBadge, { backgroundColor: statusInfo.badgeBg }]}>
              <AppText style={[styles.statusText, { color: statusInfo.badgeColor }]}>
                {statusInfo.label}
              </AppText>
            </View>
          </View>
          {collapsed ? (
            <View style={styles.collapsedSummaryRow}>
              <Icon name="swap" size={13} color={stitchTokens.roseBrown} />
              <AppText style={styles.collapsedSummaryText} numberOfLines={1}>
                {myBooks[0]?.book.title ?? "Sách gửi"} ⇄ {partnerBooks[0]?.book.title ?? "Sách nhận"}
              </AppText>
            </View>
          ) : (
            <AppText style={styles.dateText}>
              Tạo ngày {new Date(exchange.createdAt).toLocaleDateString("vi-VN")}
            </AppText>
          )}
        </View>

        <View style={styles.collapseToggleBtn}>
          <AppText style={styles.collapseToggleText}>
            {collapsed ? "Chi tiết" : "Thu gọn"}
          </AppText>
          <Icon
            name={collapsed ? "chevronDown" : "chevronUp"}
            size={13}
            color={stitchTokens.wineDark}
          />
        </View>
      </Pressable>

      {!collapsed && (
        <>
          {/* 2. Book Exchange Matchup Cards (Horizontal Row) */}
          <View style={styles.booksComparison}>
            {/* Your Books (Sách của bạn gửi đi) */}
            <View style={styles.bookSideCard}>
              <View style={styles.sideHeader}>
                <AppText style={styles.sideBadge} numberOfLines={1}>
                  {myBooks.length > 1
                    ? `BẠN GỬI (${myBooks.length})`
                    : "SÁCH BẠN GỬI"}
                </AppText>
              </View>
              <View style={styles.booksListCol}>
                {myBooks.length > 0 ? (
                  myBooks.map((item, idx) => (
                    <View key={item?.id ?? `my-${idx}`} style={styles.bookInfoCol}>
                      <View style={styles.photoBox}>
                        {item?.photos?.[0] ? (
                          <PublicPhoto
                            exchangeId={exchange.agreement ? exchange.id : undefined}
                            listingId={item.id}
                            revisionId={item.revisionId}
                            mediaId={item.photos[0].id}
                            label="Bìa sách bạn gửi"
                            active={true}
                            compact
                          />
                        ) : (
                          <View style={styles.photoPlaceholder}>
                            <Icon name="book" size={20} color={stitchTokens.roseBrown} />
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
                            <FrozenCondition book={item.snapshot} />
                          </>
                        ) : (
                          <>
                            <AppText style={styles.bookTitle} numberOfLines={1}>
                              Sách gửi #{idx + 1}
                            </AppText>
                            <AppText style={styles.bookAuthors} numberOfLines={1}>
                              {exchange.status === "Completed"
                                ? "Đã hoàn tất"
                                : "Trong thỏa thuận"}
                            </AppText>
                            <AppText style={styles.bookValue}>
                              {exchange.status === "Completed"
                                ? "Đã đối soát"
                                : "Xem chi tiết"}
                            </AppText>
                          </>
                        )}
                      </View>
                    </View>
                  ))
                ) : null}
              </View>
            </View>

            {/* Swap Icon Center Indicator */}
            <View style={styles.swapCenterBox}>
              <View style={styles.swapCircle}>
                <Icon name="sync" size={12} color={stitchTokens.wineDark} />
              </View>
            </View>

            {/* Partner Books */}
            <View style={styles.bookSideCard}>
              <View style={styles.sideHeader}>
                <AppText style={styles.sideBadgePartner} numberOfLines={1}>
                  {partnerBooks.length > 1
                    ? `NHẬN (${partnerBooks.length} TỪ @${partnerName})`
                    : `SÁCH NHẬN (TỪ @${partnerName})`}
                </AppText>
              </View>
              <View style={styles.booksListCol}>
                {partnerBooks.length > 0 ? (
                  partnerBooks.map((item, idx) => (
                    <View key={item?.id ?? `partner-${idx}`} style={styles.bookInfoCol}>
                      <View style={styles.photoBox}>
                        {item?.photos?.[0] ? (
                          <PublicPhoto
                            exchangeId={exchange.agreement ? exchange.id : undefined}
                            listingId={item.id}
                            revisionId={item.revisionId}
                            mediaId={item.photos[0].id}
                            label="Bìa sách bạn nhận"
                            active={true}
                            compact
                          />
                        ) : (
                          <View style={styles.photoPlaceholder}>
                            <Icon name="book" size={20} color={stitchTokens.roseBrown} />
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
                            <FrozenCondition book={item.snapshot} />
                          </>
                        ) : (
                          <>
                            <AppText style={styles.bookTitle} numberOfLines={1}>
                              Sách nhận #{idx + 1}
                            </AppText>
                            <AppText style={styles.bookAuthors} numberOfLines={1}>
                              {exchange.status === "Completed"
                                ? "Đã giao dịch"
                                : "Đối ứng"}
                            </AppText>
                            <AppText style={styles.bookValue}>
                              {exchange.status === "Completed"
                                ? "Đã tất toán"
                                : "Xem chi tiết"}
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
              <Icon name="tag" size={15} color={moneyTone} />
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
              <Icon name="pin" size={13} color={stitchTokens.wineMid} />
              <AppText style={styles.addressHeaderTitle}>Địa chỉ giao nhận</AppText>
            </View>

            <View style={styles.addressBlock}>
              <AppText style={styles.addressRoleLabel}>Địa chỉ của bạn:</AppText>
              {myAddress ? (
                <AppText style={styles.addressDetail} numberOfLines={2}>
                  {myAddress.recipientName} ({myAddress.phone}) — {myAddress.detail}
                </AppText>
              ) : (
                <AppText style={styles.addressMissing}>Chưa cấu hình địa chỉ nhận hàng</AppText>
              )}
            </View>

            {partnerAddress ? (
              <View style={styles.addressBlock}>
                <AppText style={styles.addressRoleLabel}>Địa chỉ đối tác:</AppText>
                <AppText style={styles.addressDetail} numberOfLines={2}>
                  {partnerAddress.recipientName} ({partnerAddress.phone}) — {partnerAddress.detail}
                </AppText>
              </View>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 10,
    borderRadius: 14,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachMuted,
    gap: 8,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardCollapsed: {
    paddingBottom: 8,
  },
  legacyNotice: {
    fontSize: 11,
    color: stitchTokens.crimson,
    backgroundColor: stitchTokens.flashRedBg,
    padding: 6,
    borderRadius: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.peachBorder,
  },
  headerCollapsed: {
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  headerLeft: {
    flex: 1,
    gap: 2,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  codeText: {
    fontSize: 13.5,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  dateText: {
    fontSize: 10.5,
    color: stitchTokens.roseBrown,
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
  },
  collapseToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 6,
  },
  collapseToggleText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  collapsedSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  collapsedSummaryText: {
    fontSize: 11,
    fontWeight: "600",
    color: stitchTokens.deepCocoa,
    flex: 1,
  },
  booksComparison: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 4,
  },
  bookSideCard: {
    flex: 1,
    padding: 8,
    borderRadius: 10,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorderAlpha40,
    gap: 6,
    justifyContent: "space-between",
  },
  sideHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  sideBadge: {
    fontSize: 9,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    backgroundColor: stitchTokens.terracottaSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    letterSpacing: 0.2,
    textAlign: "center",
  },
  sideBadgePartner: {
    fontSize: 9,
    fontWeight: "800",
    color: stitchTokens.white,
    backgroundColor: stitchTokens.wineMid,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    letterSpacing: 0.2,
    textAlign: "center",
  },
  booksListCol: {
    flex: 1,
    gap: 6,
    justifyContent: "center",
  },
  bookInfoCol: {
    alignItems: "center",
    gap: 5,
  },
  photoBox: {
    width: 48,
    height: 66,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: stitchTokens.warmCard,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignSelf: "center",
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bookTextCol: {
    width: "100%",
    alignItems: "center",
    gap: 2,
  },
  bookTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    lineHeight: 16,
    textAlign: "center",
  },
  bookAuthors: {
    fontSize: 10.5,
    color: stitchTokens.roseBrown,
    textAlign: "center",
  },
  bookValue: {
    fontSize: 11.5,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
    marginTop: 1,
    textAlign: "center",
  },
  frozenContainer: {
    marginTop: 2,
    gap: 2,
    alignItems: "center",
    width: "100%",
  },
  frozenEditionText: {
    fontSize: 10,
    color: stitchTokens.subtleGray,
    textAlign: "center",
  },
  frozenToggleBtn: {
    alignSelf: "center",
    paddingVertical: 1.5,
    paddingHorizontal: 5,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderRadius: 4,
  },
  frozenToggleText: {
    fontSize: 9.5,
    fontWeight: "600",
    color: stitchTokens.wineMid,
    textAlign: "center",
  },
  frozenDetailBox: {
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    borderRadius: 6,
    padding: 6,
    marginTop: 2,
    width: "100%",
  },
  frozenDetailText: {
    fontSize: 10,
    color: stitchTokens.deepCocoa,
    lineHeight: 14,
  },
  swapCenterBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  swapCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: stitchTokens.terracottaSoft,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  settlementBox: {
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
  },
  settlementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  settlementTitle: {
    fontSize: 12,
    fontWeight: "800",
  },
  settlementSub: {
    fontSize: 10.5,
    color: stitchTokens.darkWood,
    marginTop: 1,
  },
  addressSection: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorderAlpha40,
    gap: 4,
  },
  addressHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addressHeaderTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  addressBlock: {
    gap: 1,
  },
  addressRoleLabel: {
    fontSize: 9.5,
    fontWeight: "700",
    color: stitchTokens.roseBrown,
    textTransform: "uppercase",
  },
  addressDetail: {
    fontSize: 10.5,
    color: stitchTokens.darkWood,
    lineHeight: 14,
  },
  addressMissing: {
    fontSize: 10.5,
    color: stitchTokens.crimson,
    fontStyle: "italic",
  },
});
