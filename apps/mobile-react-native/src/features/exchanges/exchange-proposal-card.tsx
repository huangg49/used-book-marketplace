import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, space, stitchTokens } from "../../core/ui";
import { formatVnd } from "../../core/ui/format";
import type { Exchange } from "./contracts";
import { PublicPhoto } from "../shelf/public-photo";

type FrozenBook = NonNullable<Exchange["agreement"]>["recipientBook"];

const CONDITION_LABELS: Record<string, string> = {
  LikeNew: "Như mới",
  Good: "Tốt",
  Fair: "Khá",
  Acceptable: "Đọc được",
};

function ConditionDisclosure({ book }: { book: FrozenBook }) {
  const [open, setOpen] = useState(false);
  const edition = [book.book.edition, book.book.publicationYear]
    .filter(Boolean)
    .join(" · ");
  const details = [
    book.description,
    book.pages ? `${book.pages} trang` : null,
    book.coverNote,
    book.notes,
    book.accessories,
    book.hasMissingPages ? "Có thiếu trang" : "Đủ trang",
    book.readable ? "Đọc tốt" : "Khó đọc",
  ]
    .filter(Boolean)
    .join(". ");

  if (!edition && !details) return null;

  return (
    <View style={styles.disclosureWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        hitSlop={6}
        onPress={() => setOpen((v) => !v)}
        style={styles.disclosureBtn}
      >
        <AppText style={styles.disclosureLabel}>
          {open ? "Thu gọn mô tả" : "Xem tình trạng sách"}
        </AppText>
        <Icon
          name={open ? "chevronUp" : "chevronDown"}
          size={13}
          color={stitchTokens.wine}
        />
      </Pressable>
      {open ? (
        <View style={styles.disclosureBody}>
          {edition ? (
            <AppText style={styles.disclosureMeta}>{edition}</AppText>
          ) : null}
          {details ? (
            <AppText style={styles.disclosureText}>{details}</AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function BookRowItem({
  book,
  exchangeId,
  hasTopDivider,
}: {
  book: FrozenBook;
  exchangeId: string;
  hasTopDivider: boolean;
}) {
  return (
    <View style={[styles.bookRow, hasTopDivider && styles.bookRowBorder]}>
      <View style={styles.coverBox}>
        {book.mediaIds[0] ? (
          <PublicPhoto
            exchangeId={exchangeId}
            listingId={book.listingId}
            revisionId={book.revisionId}
            mediaId={book.mediaIds[0]}
            label={`Bìa ${book.book.title}`}
            active
            compact
          />
        ) : (
          <View style={styles.coverFallback}>
            <Icon name="book" size={18} color={stitchTokens.subtleGray} />
          </View>
        )}
      </View>

      <View style={styles.bookMeta}>
        <AppText style={styles.bookTitle} numberOfLines={2}>
          {book.book.title}
        </AppText>
        {book.book.authors.length > 0 ? (
          <AppText style={styles.bookAuthor} numberOfLines={1}>
            {book.book.authors.join(", ")}
          </AppText>
        ) : null}
        <View style={styles.bookFactsRow}>
          <View style={styles.conditionTag}>
            <AppText style={styles.conditionTagText}>
              {CONDITION_LABELS[book.condition] ?? book.condition}
            </AppText>
          </View>
          <AppText style={styles.bookPrice}>
            {formatVnd(book.exchangeValue)}
          </AppText>
        </View>
        <ConditionDisclosure book={book} />
      </View>
    </View>
  );
}

export function ExchangeBookGroup({
  title,
  subtitle,
  books,
  exchangeId,
  incoming = false,
}: {
  title: string;
  subtitle?: string;
  books: FrozenBook[];
  exchangeId: string;
  incoming?: boolean;
}) {
  const totalValue = books.reduce((sum, b) => sum + (b.exchangeValue ?? 0), 0);

  return (
    <View style={styles.card}>
      <View style={styles.groupHeader}>
        <View style={styles.groupTitleRow}>
          <View
            style={[
              styles.directionBadge,
              incoming
                ? styles.directionBadgeIncoming
                : styles.directionBadgeOutgoing,
            ]}
          >
            <AppText
              style={[
                styles.directionBadgeText,
                incoming
                  ? styles.directionBadgeTextIncoming
                  : styles.directionBadgeTextOutgoing,
              ]}
            >
              {incoming ? "BẠN NHẬN" : "BẠN GỬI"}
            </AppText>
          </View>
          <View style={styles.groupTitleText}>
            <AppText style={styles.groupTitle}>{title}</AppText>
            {subtitle ? (
              <AppText style={styles.groupSubtitle} numberOfLines={1}>
                {subtitle}
              </AppText>
            ) : null}
          </View>
        </View>
        <View style={styles.groupTotalCol}>
          <AppText style={styles.groupCount}>{books.length} cuốn</AppText>
          <AppText style={styles.groupTotal}>{formatVnd(totalValue)}</AppText>
        </View>
      </View>

      {books.length === 0 ? (
        <AppText style={styles.emptyText}>
          Phiếu cũ không lưu bản chụp chi tiết sách.
        </AppText>
      ) : (
        <View style={styles.bookList}>
          {books.map((book, idx) => (
            <BookRowItem
              key={book.listingId}
              book={book}
              exchangeId={exchangeId}
              hasTopDivider={idx > 0}
            />
          ))}
        </View>
      )}
    </View>
  );
}

interface ExchangeProposalCardProps {
  exchange: Exchange;
  isInitiator: boolean;
  initialCollapsed?: boolean;
}

export function ExchangeProposalCard({
  exchange,
  isInitiator,
}: ExchangeProposalCardProps) {
  const myBooks: FrozenBook[] = exchange.agreement
    ? isInitiator
      ? exchange.agreement.initiatorBooks
      : [exchange.agreement.recipientBook]
    : [];
  const partnerBooks: FrozenBook[] = exchange.agreement
    ? isInitiator
      ? [exchange.agreement.recipientBook]
      : exchange.agreement.initiatorBooks
    : [];

  const partnerName =
    (isInitiator
      ? exchange.agreement?.recipientBook.ownerDisplayName
      : exchange.agreement?.initiatorBooks[0]?.ownerDisplayName) ??
    (isInitiator
      ? exchange.recipientAddress?.recipientName
      : exchange.initiatorAddress?.recipientName) ??
    "Đối tác";

  const myBooksTotal = myBooks.reduce(
    (sum, b) => sum + (b.exchangeValue ?? 0),
    0,
  );
  const partnerBooksTotal = partnerBooks.reduce(
    (sum, b) => sum + (b.exchangeValue ?? 0),
    0,
  );

  const myDeposit = isInitiator
    ? exchange.initiatorDeposit
    : exchange.recipientDeposit;
  const partnerDeposit = isInitiator
    ? exchange.recipientDeposit
    : exchange.initiatorDeposit;
  const myId = isInitiator ? exchange.initiatorId : exchange.recipientId;
  const isPayer = exchange.diffPayerId === myId && exchange.diffAmount > 0;
  const partnerPays =
    Boolean(exchange.diffPayerId) &&
    exchange.diffPayerId !== myId &&
    exchange.diffAmount > 0;

  return (
    <View style={styles.container}>
      {!exchange.agreement ? (
        <View style={styles.legacyBox}>
          <Icon name="info" size={15} color={stitchTokens.subtleGray} />
          <AppText style={styles.legacyText}>
            Phiếu cũ thiếu bản chụp sách ban đầu. Mức cọc và tiền bù vẫn giữ
            theo thỏa thuận đã lưu.
          </AppText>
        </View>
      ) : null}

      {/* Unified Tactile Trade Matchup Ticket */}
      <View style={styles.card}>
        {/* Outgoing Side */}
        <View style={styles.sideSection}>
          <View style={styles.sideHeaderRow}>
            <View style={[styles.directionBadge, styles.directionBadgeOutgoing]}>
              <AppText
                style={[
                  styles.directionBadgeText,
                  styles.directionBadgeTextOutgoing,
                ]}
              >
                BẠN ĐƯA ({myBooks.length})
              </AppText>
            </View>
            <AppText style={styles.sideTotalText}>
              {formatVnd(myBooksTotal)}
            </AppText>
          </View>
          {myBooks.length === 0 ? (
            <AppText style={styles.emptyText}>Chưa có bản chụp sách.</AppText>
          ) : (
            <View style={styles.bookList}>
              {myBooks.map((book, idx) => (
                <BookRowItem
                  key={book.listingId}
                  book={book}
                  exchangeId={exchange.id}
                  hasTopDivider={idx > 0}
                />
              ))}
            </View>
          )}
        </View>

        {/* Centered Swap Bridge */}
        <View style={styles.swapBridge}>
          <View style={styles.swapBridgeLine} />
          <View style={styles.swapBridgeCircle}>
            <Icon name="swap" size={15} color={stitchTokens.wine} />
          </View>
          <View style={styles.swapBridgeLine} />
        </View>

        {/* Incoming Side */}
        <View style={styles.sideSection}>
          <View style={styles.sideHeaderRow}>
            <View style={styles.sideIncomingLabelGroup}>
              <View
                style={[styles.directionBadge, styles.directionBadgeIncoming]}
              >
                <AppText
                  style={[
                    styles.directionBadgeText,
                    styles.directionBadgeTextIncoming,
                  ]}
                >
                  BẠN NHẬN ({partnerBooks.length})
                </AppText>
              </View>
              <AppText style={styles.partnerMiniName} numberOfLines={1}>
                từ {partnerName}
              </AppText>
            </View>
            <AppText style={styles.sideTotalText}>
              {formatVnd(partnerBooksTotal)}
            </AppText>
          </View>
          {partnerBooks.length === 0 ? (
            <AppText style={styles.emptyText}>Chưa có bản chụp sách.</AppText>
          ) : (
            <View style={styles.bookList}>
              {partnerBooks.map((book, idx) => (
                <BookRowItem
                  key={book.listingId}
                  book={book}
                  exchangeId={exchange.id}
                  hasTopDivider={idx > 0}
                />
              ))}
            </View>
          )}
        </View>
      </View>

      {/* Clean Digital Receipt Card: Deposit & Diff Terms */}
      <View style={styles.card}>
        <View style={styles.financeHeader}>
          <View style={styles.financeIconPill}>
            <Icon name="shield" size={14} color={stitchTokens.wine} />
          </View>
          <AppText style={styles.financeTitle}>Cam kết cọc & tiền bù</AppText>
        </View>

        <View style={styles.financeRows}>
          <View style={styles.financeRow}>
            <View style={styles.financeLabelCol}>
              <AppText style={styles.financeLabel}>Cọc sách bạn gửi</AppText>
              <AppText style={styles.financeHint}>
                Hoàn 100% về ví khi trao đổi hoàn tất
              </AppText>
            </View>
            <AppText style={styles.financeValue}>{formatVnd(myDeposit)}</AppText>
          </View>

          <View style={[styles.financeRow, styles.financeRowBorder]}>
            <View style={styles.financeLabelCol}>
              <AppText style={styles.financeLabel}>Cọc của {partnerName}</AppText>
              <AppText style={styles.financeHint}>
                Lật Lại khóa bảo chứng trên sổ cái
              </AppText>
            </View>
            <AppText style={styles.financeValue}>
              {formatVnd(partnerDeposit)}
            </AppText>
          </View>

          <View style={[styles.financeRow, styles.financeRowBorder]}>
            <View style={styles.financeLabelCol}>
              <AppText style={styles.financeLabel}>
                {isPayer
                  ? "Tiền bù bạn trả"
                  : partnerPays
                    ? "Tiền bù bạn nhận"
                    : "Chênh lệch giá trị"}
              </AppText>
              <AppText style={styles.financeHint}>
                {isPayer
                  ? "Kết chuyển cho đối tác khi xong"
                  : partnerPays
                    ? "Cộng thẳng vào ví bạn khi xong"
                    : "Trao đổi ngang giá"}
              </AppText>
            </View>
            <AppText
              style={[
                styles.financeValue,
                isPayer && styles.financeValueWine,
                partnerPays && styles.financeValueGreen,
              ]}
            >
              {exchange.diffAmount > 0
                ? `${partnerPays ? "+" : isPayer ? "-" : ""}${formatVnd(exchange.diffAmount)}`
                : "0 đ"}
            </AppText>
          </View>
        </View>

        <View style={styles.totalBar}>
          <AppText style={styles.totalLabel}>Tổng cần nộp lúc đặt cọc</AppText>
          <AppText style={styles.totalValue}>
            {formatVnd(myDeposit + (isPayer ? exchange.diffAmount : 0))}
          </AppText>
        </View>
      </View>
    </View>
  );
}

export function ExchangeFundingHistoryCard({
  exchange,
  isInitiator,
}: {
  exchange: Exchange;
  isInitiator: boolean;
}) {
  const myFundedAt = isInitiator
    ? exchange.initiatorFundedAt
    : exchange.recipientFundedAt;
  const partnerFundedAt = isInitiator
    ? exchange.recipientFundedAt
    : exchange.initiatorFundedAt;
  const myDeposit = isInitiator
    ? exchange.initiatorDeposit
    : exchange.recipientDeposit;
  const partnerDeposit = isInitiator
    ? exchange.recipientDeposit
    : exchange.initiatorDeposit;
  const myId = isInitiator ? exchange.initiatorId : exchange.recipientId;
  const myDiff =
    exchange.diffPayerId === myId && exchange.diffAmount > 0
      ? exchange.diffAmount
      : 0;
  const partnerDiff =
    exchange.diffPayerId &&
    exchange.diffPayerId !== myId &&
    exchange.diffAmount > 0
      ? exchange.diffAmount
      : 0;

  return (
    <View style={styles.card}>
      <View style={styles.financeHeader}>
        <View style={styles.financeIconPill}>
          <Icon name="wallet" size={14} color={stitchTokens.wine} />
        </View>
        <AppText style={styles.financeTitle}>Bản ghi đặt cọc bảo chứng</AppText>
      </View>
      <View style={styles.financeRows}>
        <View style={styles.financeRow}>
          <View style={styles.financeLabelCol}>
            <AppText style={styles.financeLabel}>Phần của bạn</AppText>
            <AppText style={styles.financeHint}>
              {myFundedAt
                ? `Đã cọc lúc ${new Date(myFundedAt).toLocaleString("vi-VN")}`
                : "Chưa ghi nhận đặt cọc"}
            </AppText>
          </View>
          <AppText style={styles.financeValue}>
            {formatVnd(myDeposit + myDiff)}
          </AppText>
        </View>

        <View style={[styles.financeRow, styles.financeRowBorder]}>
          <View style={styles.financeLabelCol}>
            <AppText style={styles.financeLabel}>Phần của đối tác</AppText>
            <AppText style={styles.financeHint}>
              {partnerFundedAt
                ? `Đã cọc lúc ${new Date(partnerFundedAt).toLocaleString("vi-VN")}`
                : "Chưa ghi nhận đặt cọc"}
            </AppText>
          </View>
          <AppText style={styles.financeValue}>
            {formatVnd(partnerDeposit + partnerDiff)}
          </AppText>
        </View>
      </View>
    </View>
  );
}

export function ExchangeInspectionHistoryCard({
  exchange,
  isInitiator,
}: {
  exchange: Exchange;
  isInitiator: boolean;
}) {
  const myDeadline = isInitiator
    ? exchange.initiatorInspectionDeadline
    : exchange.recipientInspectionDeadline;
  const partnerDeadline = isInitiator
    ? exchange.recipientInspectionDeadline
    : exchange.initiatorInspectionDeadline;
  const myDone = isInitiator
    ? exchange.initiatorCompletedAt
    : exchange.recipientCompletedAt;
  const partnerDone = isInitiator
    ? exchange.recipientCompletedAt
    : exchange.initiatorCompletedAt;

  const fmt = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString("vi-VN") : "Chưa ghi nhận";

  return (
    <View style={styles.card}>
      <View style={styles.financeHeader}>
        <View style={styles.financeIconPill}>
          <Icon name="clock" size={14} color={stitchTokens.wine} />
        </View>
        <AppText style={styles.financeTitle}>Các mốc kiểm tra 72 giờ</AppText>
      </View>
      <View style={styles.financeRows}>
        <View style={styles.financeRow}>
          <AppText style={styles.financeLabel}>Hạn kiểm tra của bạn</AppText>
          <AppText style={styles.historyTime}>{fmt(myDeadline)}</AppText>
        </View>
        <View style={[styles.financeRow, styles.financeRowBorder]}>
          <AppText style={styles.financeLabel}>Bạn xác nhận kiểm tra</AppText>
          <AppText style={styles.historyTime}>{fmt(myDone)}</AppText>
        </View>
        <View style={[styles.financeRow, styles.financeRowBorder]}>
          <AppText style={styles.financeLabel}>
            Hạn kiểm tra của đối tác
          </AppText>
          <AppText style={styles.historyTime}>{fmt(partnerDeadline)}</AppText>
        </View>
        <View style={[styles.financeRow, styles.financeRowBorder]}>
          <AppText style={styles.financeLabel}>Đối tác xác nhận</AppText>
          <AppText style={styles.historyTime}>{fmt(partnerDone)}</AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  card: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(92, 2, 2, 0.06)",
    padding: 18,
    gap: 14,
    shadowColor: stitchTokens.darkWood,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  legacyBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: space.md,
    borderRadius: 14,
    backgroundColor: stitchTokens.whiteSurface,
  },
  legacyText: {
    flex: 1,
    fontSize: 12.5,
    color: stitchTokens.subtleGray,
    lineHeight: 18,
  },
  sideSection: {
    gap: 10,
  },
  sideHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sideIncomingLabelGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flex: 1,
    minWidth: 0,
  },
  partnerMiniName: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
    fontWeight: "600",
    flexShrink: 1,
  },
  directionBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  directionBadgeOutgoing: {
    backgroundColor: stitchTokens.roseParchment,
  },
  directionBadgeIncoming: {
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  directionBadgeText: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  directionBadgeTextOutgoing: {
    color: stitchTokens.wine,
  },
  directionBadgeTextIncoming: {
    color: stitchTokens.likeNewGreen,
  },
  sideTotalText: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.darkWood,
    fontVariant: ["tabular-nums"],
  },
  swapBridge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 2,
  },
  swapBridgeLine: {
    flex: 1,
    height: 1,
    backgroundColor: stitchTokens.surfaceSoft,
  },
  swapBridgeCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  groupTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    flex: 1,
    minWidth: 0,
  },
  groupTitleText: {
    flex: 1,
    minWidth: 0,
  },
  groupTitle: {
    fontSize: 14.5,
    fontWeight: "800",
    color: stitchTokens.darkWood,
  },
  groupSubtitle: {
    fontSize: 11.5,
    color: stitchTokens.subtleGray,
    marginTop: 1,
  },
  groupTotalCol: {
    alignItems: "flex-end",
  },
  groupCount: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
    fontWeight: "600",
  },
  groupTotal: {
    fontSize: 14.5,
    fontWeight: "800",
    color: stitchTokens.wine,
    fontVariant: ["tabular-nums"],
  },
  emptyText: {
    fontSize: 12.5,
    color: stitchTokens.subtleGray,
  },
  bookList: {
    gap: 12,
  },
  bookRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  bookRowBorder: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.surfaceSoft,
  },
  coverBox: {
    width: 56,
    height: 76,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: stitchTokens.parchment,
    shadowColor: stitchTokens.darkWood,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  coverFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bookMeta: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  bookTitle: {
    fontSize: 14.5,
    fontWeight: "800",
    color: stitchTokens.darkWood,
    lineHeight: 20,
  },
  bookAuthor: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
  },
  bookFactsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 2,
  },
  conditionTag: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: stitchTokens.surfaceSoft,
  },
  conditionTagText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
  },
  bookPrice: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.wine,
    fontVariant: ["tabular-nums"],
  },
  disclosureWrap: {
    marginTop: 3,
  },
  disclosureBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingVertical: 2,
  },
  disclosureLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  disclosureBody: {
    marginTop: 6,
    padding: 10,
    borderRadius: 12,
    backgroundColor: stitchTokens.surfaceSoft,
    gap: 3,
  },
  disclosureMeta: {
    fontSize: 11.5,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
  },
  disclosureText: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
    lineHeight: 17,
  },
  financeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  financeIconPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
  },
  financeTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: stitchTokens.darkWood,
  },
  financeRows: {
    gap: 0,
  },
  financeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
  },
  financeRowBorder: {
    borderTopWidth: 1,
    borderTopColor: stitchTokens.surfaceSoft,
  },
  financeLabelCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  financeLabel: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  financeHint: {
    fontSize: 11.5,
    color: stitchTokens.subtleGray,
  },
  financeValue: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.darkWood,
    fontVariant: ["tabular-nums"],
  },
  financeValueWine: {
    color: stitchTokens.wine,
  },
  financeValueGreen: {
    color: stitchTokens.likeNewGreen,
  },
  totalBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: stitchTokens.parchment,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
    flex: 1,
  },
  totalValue: {
    fontSize: 16.5,
    fontWeight: "800",
    color: stitchTokens.wine,
    fontVariant: ["tabular-nums"],
  },
  historyTime: {
    fontSize: 12.5,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
    fontVariant: ["tabular-nums"],
  },
});
