import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { AppText, Icon, space, stitchTokens } from "../../../core/ui";
import type { Listing } from "../contracts";

interface BookOverviewSectionProps {
  item: Listing;
}

function formatVnd(amount: number | null | undefined): string {
  if (amount == null) return "";
  return new Intl.NumberFormat("vi-VN").format(amount) + " ₫";
}

function formatListingDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function BookOverviewSection({ item }: BookOverviewSectionProps) {
  const { book, salePrice, exchangeValue, purchaseAvailability } = item;

  const availability = purchaseAvailability?.status ?? "Available";
  const isAvailable = availability === "Available";

  const statusLabel =
    availability === "AwaitingPayment"
      ? "Chờ người mua thanh toán"
    : availability === "InTransaction"
      ? "Đang trong giao dịch"
    : availability === "InNegotiation"
      ? "Đang thương lượng giữ chỗ"
    : "Sẵn sàng giao dịch";

  const statusColor = isAvailable
    ? stitchTokens.likeNewGreen
    : availability === "InTransaction"
      ? stitchTokens.flashRed
      : stitchTokens.tagExchangeText;

  const statusBg = isAvailable
    ? stitchTokens.likeNewGreenBg
    : availability === "InTransaction"
      ? stitchTokens.flashRedBg
      : stitchTokens.tagExchangeBg;

  const categoryTag = book.category
    ? `${book.category.toUpperCase()} · BẢN SÁCH TUYỂN CHỌN`
    : "VĂN HỌC KINH ĐIỂN · BẢN SÁCH TUYỂN CHỌN";

  const authorsText = book.authors?.length
    ? book.authors.join(", ")
    : "Chưa rõ tác giả";

  const rawPublisher = book.publisher?.trim();
  const isInvalidPublisher =
    !rawPublisher ||
    ["kh có", "không có", "chưa rõ", "n/a", "none"].includes(
      rawPublisher.toLowerCase(),
    );
  const publisherClean = isInvalidPublisher ? null : rawPublisher;

  const publicationText = [
    publisherClean,
    book.publicationYear ? `${book.publicationYear}` : null,
    item.pages ? `${item.pages}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const publishedDateText = formatListingDate(item.publishedAt);
  const areaText = item.fulfillment?.name || "TP.HCM";
  const listingCode = `#TIN-${item.id.slice(0, 8).toUpperCase()}`;

  return (
    <View style={styles.card}>
      {/* Top Meta Row: Category Badge & Listing Code */}
      <View style={styles.topMetaRow}>
        <View style={styles.categoryBadge}>
          <Icon name="tag" size={12} color={stitchTokens.wineMid} />
          <AppText style={styles.categoryTag}>{categoryTag}</AppText>
        </View>

        <View style={styles.listingCodeBadge}>
          <AppText style={styles.listingCodeText}>{listingCode}</AppText>
        </View>
      </View>

      {/* Book Title & Authors */}
      <View style={styles.headerStack}>
        <AppText style={styles.bookTitle} accessibilityRole="header">
          {book.title}
        </AppText>

        <AppText style={styles.authorsRow}>
          <AppText style={styles.authorLabel}>Tác giả: </AppText>
          <AppText style={styles.authorHighlight}>{authorsText}</AppText>
          {publicationText ? ` · ${publicationText}` : ""}
        </AppText>
        <AppText style={styles.authorsRow}>
          <AppText style={styles.authorLabel}>Người đăng: </AppText>
          <AppText style={styles.authorHighlight}>{item.seller.displayName}</AppText>
        </AppText>
      </View>

      {/* Pricing Module with Warm Amber Glow */}
      <View style={styles.pricingBox}>
        <View style={styles.priceRow}>
          <View style={styles.priceCol}>
            {salePrice != null ? (
              <View style={styles.mainPriceGroup}>
                <AppText style={styles.mainPrice}>{formatVnd(salePrice)}</AppText>
                <View style={styles.discountBadge}>
                  <AppText style={styles.discountText}>Giá niêm yết</AppText>
                </View>
              </View>
            ) : null}

            {exchangeValue != null && (
              <View style={styles.exchangeGroup}>
                <Icon name="sync" size={13} color={stitchTokens.likeNewGreen} />
                <AppText style={styles.exchangeText}>
                  Đổi sách: {formatVnd(exchangeValue)}
                </AppText>
              </View>
            )}
          </View>
        </View>

        {/* Status Line */}
        <View style={styles.statusRow}>
          <View style={[styles.statusPill, { backgroundColor: statusBg }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <AppText style={[styles.statusText, { color: statusColor }]}>
              {statusLabel}
            </AppText>
          </View>

          <View style={styles.verifiedTag}>
            <Icon name="check" size={12} color={stitchTokens.wineDark} />
            <AppText style={styles.publishedHint}>Đã kiểm duyệt catalog</AppText>
          </View>
        </View>

        {/* Date & Location Footnote */}
        <View style={styles.footnoteRow}>
          <Icon name="pin" size={12} color={stitchTokens.roseBrown} />
          <AppText style={styles.footnoteText}>
            {publishedDateText ? `Đăng ngày ${publishedDateText}` : "Đang niêm yết"}
            {` · Khu vực ${areaText}`}
          </AppText>
        </View>
      </View>

      {/* Exchange Preferences Card */}
      {item.exchangePreferences &&
        (item.exchangePreferences.targetCategory ||
          item.exchangePreferences.targetAuthor ||
          item.exchangePreferences.targetDescription) && (
          <View style={styles.exchangePrefCard}>
            <View style={styles.exchangePrefHeader}>
              <Icon name="sync" size={14} color={stitchTokens.wineDark} />
              <AppText style={styles.exchangePrefTitle}>
                🎯 Tiêu chí đổi sách của chủ sở hữu
              </AppText>
            </View>
            <View style={styles.exchangePrefBody}>
              {item.exchangePreferences.targetCategory ? (
                <View style={styles.prefRow}>
                  <AppText style={styles.prefLabel}>Thể loại mong muốn: </AppText>
                  <AppText style={styles.prefValue}>
                    {item.exchangePreferences.targetCategory}
                  </AppText>
                </View>
              ) : null}
              {item.exchangePreferences.targetAuthor ? (
                <View style={styles.prefRow}>
                  <AppText style={styles.prefLabel}>Tác giả mong muốn: </AppText>
                  <AppText style={styles.prefValue}>
                    {item.exchangePreferences.targetAuthor}
                  </AppText>
                </View>
              ) : null}
              {item.exchangePreferences.targetDescription ? (
                <View style={styles.prefRow}>
                  <AppText style={styles.prefLabel}>Ghi chú: </AppText>
                  <AppText style={styles.prefValue}>
                    {item.exchangePreferences.targetDescription}
                  </AppText>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tìm sách khớp mong muốn này trên sàn"
                onPress={() => {
                  const query =
                    item.exchangePreferences?.targetAuthor ||
                    item.exchangePreferences?.targetCategory ||
                    "";
                  router.push({
                    pathname: "/search",
                    params: { q: query, mode: "Both" },
                  });
                }}
                style={({ pressed }) => [
                  styles.searchPrefBtn,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Icon name="search" size={11} color={stitchTokens.wineDark} />
                <AppText style={styles.searchPrefBtnText}>
                  Tìm sách khớp mong muốn trên sàn →
                </AppText>
              </Pressable>
            </View>
          </View>
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.md,
    borderRadius: 20,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    gap: space.md,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  topMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  categoryBadge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: stitchTokens.terracottaSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  categoryTag: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    letterSpacing: 0.4,
  },
  listingCodeBadge: {
    backgroundColor: stitchTokens.parchment,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorderAlpha40,
  },
  listingCodeText: {
    fontSize: 10,
    fontWeight: "800",
    color: stitchTokens.wineMid,
    letterSpacing: 0.5,
  },
  headerStack: {
    gap: 6,
  },
  bookTitle: {
    fontSize: 23,
    lineHeight: 30,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  authorsRow: {
    fontSize: 13,
    color: stitchTokens.roseBrown,
    lineHeight: 20,
  },
  authorLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: stitchTokens.wineMid,
  },
  authorHighlight: {
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  pricingBox: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: stitchTokens.amberBg,
    borderWidth: 1.5,
    borderColor: stitchTokens.goldBorder,
    gap: 12,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  priceCol: {
    gap: 8,
  },
  mainPriceGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  mainPrice: {
    fontSize: 26,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  discountBadge: {
    backgroundColor: stitchTokens.wineLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  discountText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.white,
    letterSpacing: 0.3,
  },
  exchangeGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: stitchTokens.likeNewGreenBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  exchangeText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.amberBorder,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  verifiedTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  publishedHint: {
    fontSize: 11,
    color: stitchTokens.darkWood,
    fontWeight: "600",
  },
  footnoteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.amberBorder,
  },
  footnoteText: {
    fontSize: 11,
    color: stitchTokens.roseBrown,
    fontWeight: "500",
  },
  exchangePrefCard: {
    backgroundColor: "#FDF8F5",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    padding: space.sm,
    gap: 6,
  },
  exchangePrefHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  exchangePrefTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  exchangePrefBody: {
    gap: 4,
  },
  prefRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  prefLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.roseBrown,
  },
  prefValue: {
    fontSize: 12,
    fontWeight: "500",
    color: stitchTokens.wineDark,
    flexShrink: 1,
  },
  searchPrefBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    backgroundColor: stitchTokens.whiteSurface,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    marginTop: 4,
  },
  searchPrefBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
});
