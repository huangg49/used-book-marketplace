import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon } from "../../../core/ui/icon";
import { formatVnd } from "../../../core/ui/format";
import { stitchTokens } from "../../../core/ui/theme";
import type { PrivateDraft } from "../../drafts/contracts";
import { DraftCoverPhoto } from "../../drafts/draft-cover-photo";
import { BookIdentity } from "../../drafts/catalog-picker";

export interface SendToAuctionBookPickerProps {
  readonly eligibleListings: PrivateDraft[];
  readonly selectedListingId: string | null;
  readonly onSelectListing: (id: string) => void;
  readonly disabled?: boolean;
  readonly isLoading?: boolean;
}

export function SendToAuctionBookPicker({
  eligibleListings,
  selectedListingId,
  onSelectListing,
  disabled = false,
  isLoading = false,
}: SendToAuctionBookPickerProps) {
  return (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionHeaderRow}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="book" size={17} color={stitchTokens.wineDark} />
          <AppText kind="bold" style={styles.sectionTitle}>
            1. Chọn sách
          </AppText>
        </View>
        <AppText kind="small" style={styles.sectionCountBadge}>
          Đã duyệt sẵn sàng ({eligibleListings.length})
        </AppText>
      </View>

      <AppText style={styles.sectionNote}>
        Chỉ các bài đăng Bán đã được kiểm duyệt hồ sơ và đang sẵn sàng mới có thể đưa lên sàn đấu giá.
      </AppText>

      {/* Loading state */}
      {isLoading && (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="small" color={stitchTokens.wine} />
          <AppText kind="small" style={{ color: stitchTokens.subtleGray, marginTop: 6 }}>
            Đang tải sách đã duyệt...
          </AppText>
        </View>
      )}

      {/* Empty state */}
      {!isLoading && eligibleListings.length === 0 && (
        <View style={styles.emptyContainer}>
          <Icon name="book" size={28} color={stitchTokens.subtleGray} />
          <AppText kind="bold" style={styles.emptyTitle}>
            Chưa có sách đủ điều kiện
          </AppText>
          <AppText kind="small" style={styles.emptyDesc}>
            Hãy đăng sách mới ở chế độ "Bán" hoặc đợi sách được ban quản trị duyệt để gửi vào sàn đấu giá.
          </AppText>
        </View>
      )}

      {/* Book cards list */}
      {!isLoading && eligibleListings.length > 0 && (
        <View style={styles.listContainer}>
          {eligibleListings.map((item) => {
            const isSelected = selectedListingId === item.id;
            const content = item.currentRevision.content;
            const coverMediaId = content.mediaIds?.[0];
            const salePrice = content.salePrice;

            return (
              <Pressable
                key={item.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected, disabled }}
                accessibilityLabel="Chọn sách ký gửi"
                disabled={disabled}
                onPress={() => onSelectListing(item.id)}
                style={({ pressed }) => [
                  styles.bookCard,
                  isSelected && styles.bookCardSelected,
                  disabled && { opacity: 0.6 },
                  pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
                ]}
              >
                {/* 3:4 Cover Photo */}
                <View style={styles.coverWrapper}>
                  <DraftCoverPhoto
                    listingId={item.id}
                    mediaId={coverMediaId}
                    label="Ảnh bìa ấn bản"
                  />
                </View>

                {/* Book Details */}
                <View style={styles.bookDetails}>
                  <View style={styles.tagRow}>
                    <View style={styles.tagPill}>
                      <AppText kind="small" style={styles.tagPillText}>
                        {content.condition ? `TÌNH TRẠNG: ${content.condition.toUpperCase()}` : "ĐÃ KIỂM DUYỆT"}
                      </AppText>
                    </View>
                  </View>

                  <BookIdentity id={content.bookId} compact />

                  <View style={styles.footerRow}>
                    <AppText kind="bold" style={styles.priceProtectText}>
                      Giá bảo hộ: {salePrice != null ? formatVnd(salePrice) : "—"}
                    </AppText>
                    <View style={styles.listedBadge}>
                      <Icon name="shield" size={11} color={stitchTokens.subtleGray} />
                      <AppText kind="small" style={styles.listedBadgeText}>
                        Đã niêm yết
                      </AppText>
                    </View>
                  </View>
                </View>

                {/* Radio selection check circle */}
                <View style={[styles.checkCircle, isSelected && styles.checkCircleActive]}>
                  {isSelected && <Icon name="check" size={14} color="#FFDF97" />}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 16,
    color: stitchTokens.wineDark,
  },
  sectionCountBadge: {
    fontSize: 11,
    color: stitchTokens.wine,
    fontWeight: "600",
  },
  sectionNote: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
    lineHeight: 17,
  },
  centerLoading: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyContainer: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 20,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    color: stitchTokens.deepCocoa,
  },
  emptyDesc: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
    textAlign: "center",
    lineHeight: 17,
  },
  listContainer: {
    gap: 10,
    marginTop: 2,
  },
  bookCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 10,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  bookCardSelected: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderColor: stitchTokens.peachBorder,
    borderWidth: 1.5,
  },
  coverWrapper: {
    width: 60,
    height: 80,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  bookDetails: {
    flex: 1,
    gap: 3,
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  tagPill: {
    backgroundColor: "#F6E0A8",
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  tagPillText: {
    fontSize: 9,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    letterSpacing: 0.4,
  },
  bookTitle: {
    fontSize: 14,
    color: stitchTokens.deepCocoa,
  },
  bookAuthor: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  priceProtectText: {
    fontSize: 12,
    color: stitchTokens.wineDark,
  },
  listedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  listedBadgeText: {
    fontSize: 10,
    color: stitchTokens.subtleGray,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1.5,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleActive: {
    backgroundColor: stitchTokens.wineDark,
    borderColor: stitchTokens.wineDark,
  },
});
