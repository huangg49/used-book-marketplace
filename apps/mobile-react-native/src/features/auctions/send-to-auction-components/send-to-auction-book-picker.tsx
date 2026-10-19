import { useState } from "react";
import { ActivityIndicator, LayoutAnimation, Platform, Pressable, StyleSheet, UIManager, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon } from "../../../core/ui/icon";
import { formatVnd } from "../../../core/ui/format";
import { stitchTokens } from "../../../core/ui/theme";
import type { PrivateDraft } from "../../drafts/contracts";
import { DraftCoverPhoto } from "../../drafts/draft-cover-photo";
import { BookIdentity } from "../../drafts/catalog-picker";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface SendToAuctionBookPickerProps {
  readonly eligibleListings: PrivateDraft[];
  // ADR 0041: the seller's own Auction listings still being written or reviewed.
  readonly unfinishedListings?: PrivateDraft[];
  readonly selectedListingId: string | null;
  readonly onSelectListing: (id: string) => void;
  readonly onOpenListing?: (id: string) => void;
  readonly onCreateListing?: () => void;
  readonly creating?: boolean;
  readonly createError?: string | null;
  readonly loadError?: boolean;
  readonly onRetryLoad?: () => void;
  readonly disabled?: boolean;
  readonly isLoading?: boolean;
  readonly defaultExpanded?: boolean;
}

const unfinishedStatus: Record<string, string> = {
  Draft: "Bản nháp · cần hoàn thiện",
  PendingReview: "Đang chờ duyệt",
  Rejected: "Cần chỉnh sửa theo góp ý",
};

export function SendToAuctionBookPicker({
  eligibleListings,
  unfinishedListings = [],
  selectedListingId,
  onSelectListing,
  onOpenListing,
  onCreateListing,
  creating = false,
  createError = null,
  loadError = false,
  onRetryLoad,
  disabled = false,
  isLoading = false,
  defaultExpanded = true,
}: SendToAuctionBookPickerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  const selectedListing = eligibleListings.find((l) => l.id === selectedListingId);

  return (
    <View style={styles.sectionContainer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? "Thu gọn mục chọn sách" : "Mở rộng mục chọn sách"}
        accessibilityState={{ expanded }}
        onPress={handleToggle}
        style={({ pressed }) => [styles.sectionHeaderRow, pressed && { opacity: 0.8 }]}
      >
        <View style={styles.headerLeft}>
          <Icon name="book" size={17} color={stitchTokens.wineDark} />
          <AppText kind="bold" style={styles.sectionTitle}>
            1. Sách đấu giá
          </AppText>
        </View>

        <View style={styles.headerRight}>
          <AppText kind="small" style={styles.sectionCountBadge}>
            Đã duyệt ({eligibleListings.length})
          </AppText>
          <View style={styles.chevronWrapper}>
            <Icon
              name={expanded ? "chevronDown" : "chevronRight"}
              size={18}
              color={stitchTokens.wineDark}
            />
          </View>
        </View>
      </Pressable>

      {!expanded && selectedListing && (
        <View style={styles.collapsedPreview}>
          <Icon name="check" size={13} color={stitchTokens.wineDark} />
          <View style={{ flex: 1 }}>
            <BookIdentity id={selectedListing.currentRevision.content.bookId} compact />
          </View>
        </View>
      )}

      {expanded && (
        <>
          <AppText style={styles.sectionNote}>
            Sách đấu giá là bài đăng riêng, không hiển thị trên kệ mua/đổi. Tạo sách, chờ duyệt rồi chọn để gửi tới điểm.
          </AppText>

          {onCreateListing ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tạo sách đấu giá mới"
              accessibilityState={{ disabled: disabled || creating, busy: creating }}
              disabled={disabled || creating}
              onPress={onCreateListing}
              style={({ pressed }) => [
                styles.createBtn,
                (disabled || creating) && { opacity: 0.6 },
                pressed && { opacity: 0.85 },
              ]}
            >
              {creating ? (
                <ActivityIndicator size="small" color={stitchTokens.wineDark} />
              ) : (
                <Icon name="plus" size={16} color={stitchTokens.wineDark} />
              )}
              <AppText kind="bold" style={styles.createBtnText}>
                {creating ? "Đang tạo sách đấu giá…" : "Tạo sách đấu giá mới"}
              </AppText>
            </Pressable>
          ) : null}
          {createError ? (
            <AppText kind="small" style={styles.errorText} accessibilityRole="alert">
              {createError}
            </AppText>
          ) : null}

          {/* Load error */}
          {loadError && !isLoading ? (
            <View style={styles.emptyContainer}>
              <AppText kind="bold" style={styles.emptyTitle}>
                Chưa tải được sách đấu giá
              </AppText>
              {onRetryLoad ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={onRetryLoad}
                  style={styles.createBtn}
                >
                  <AppText kind="bold" style={styles.createBtnText}>
                    Thử lại
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* Unfinished auction listings */}
          {!isLoading && unfinishedListings.length > 0 && (
            <View style={styles.listContainer}>
              {unfinishedListings.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Mở sách đấu giá, ${unfinishedStatus[item.state.moderation] ?? item.state.moderation}`}
                  disabled={disabled || !onOpenListing}
                  onPress={() => onOpenListing?.(item.id)}
                  style={({ pressed }) => [
                    styles.bookCard,
                    pressed && { opacity: 0.88 },
                  ]}
                >
                  <View style={styles.coverWrapper}>
                    <DraftCoverPhoto
                      listingId={item.id}
                      mediaId={item.currentRevision.content.mediaIds?.[0]}
                      label="Ảnh bìa sách đấu giá"
                    />
                  </View>
                  <View style={styles.bookDetails}>
                    <View style={styles.tagRow}>
                      <View style={styles.tagPill}>
                        <AppText kind="small" style={styles.tagPillText}>
                          {(unfinishedStatus[item.state.moderation] ?? item.state.moderation).toLocaleUpperCase("vi")}
                        </AppText>
                      </View>
                    </View>
                    {item.currentRevision.content.bookId ? (
                      <BookIdentity id={item.currentRevision.content.bookId} compact />
                    ) : (
                      <AppText kind="small" style={styles.bookAuthor}>
                        Chưa chọn đầu sách
                      </AppText>
                    )}
                  </View>
                  <Icon name="chevronRight" size={18} color={stitchTokens.wineDark} />
                </Pressable>
              ))}
            </View>
          )}

          {/* Loading state */}
          {isLoading && (
            <View style={styles.centerLoading}>
          <ActivityIndicator size="small" color={stitchTokens.wine} />
          <AppText kind="small" style={{ color: stitchTokens.subtleGray, marginTop: 6 }}>
            Đang tải sách đấu giá...
          </AppText>
        </View>
      )}

      {/* Empty state */}
      {!isLoading && !loadError && eligibleListings.length === 0 && (
        <View style={styles.emptyContainer}>
          <Icon name="book" size={28} color={stitchTokens.subtleGray} />
          <AppText kind="bold" style={styles.emptyTitle}>
            Chưa có sách đấu giá đã duyệt
          </AppText>
          <AppText kind="small" style={styles.emptyDesc}>
            {unfinishedListings.length > 0
              ? "Sách ở trên sẽ chọn được tại đây sau khi được duyệt."
              : "Tạo sách đấu giá mới; sau khi được duyệt bạn chọn sách để gửi tới điểm."}
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
                      Giá trị khai báo: {salePrice != null ? formatVnd(salePrice) : "—"}
                    </AppText>
                    <View style={styles.listedBadge}>
                      <Icon name="check" size={11} color={stitchTokens.subtleGray} />
                      <AppText kind="small" style={styles.listedBadgeText}>
                        Đã duyệt
                      </AppText>
                    </View>
                  </View>
                </View>

                {/* Radio selection check circle */}
                <View style={[styles.checkCircle, isSelected && styles.checkCircleActive]}>
                  {isSelected && <Icon name="check" size={14} color={stitchTokens.gold} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    backgroundColor: stitchTokens.vintageGold, // Màu vàng ấm chính xác từ banner Đấu giá
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: stitchTokens.goldBorder,
    padding: 16,
    gap: 12,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 1.5, height: 1.5 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chevronWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: stitchTokens.whiteAlpha70,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  collapsedPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: stitchTokens.whiteAlpha88,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
  },
  sectionTitle: {
    fontSize: 16,
    color: stitchTokens.wineDark,
  },
  sectionCountBadge: {
    fontSize: 11,
    color: stitchTokens.wineDark,
    fontWeight: "700",
  },
  sectionNote: {
    fontSize: 12,
    color: stitchTokens.wineDark,
    opacity: 0.82,
    lineHeight: 17,
  },
  centerLoading: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyContainer: {
    backgroundColor: stitchTokens.whiteAlpha88,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
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
    backgroundColor: stitchTokens.whiteAlpha90,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
    padding: 10,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  bookCardSelected: {
    backgroundColor: stitchTokens.white,
    borderColor: stitchTokens.wineDark,
    borderWidth: 2,
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
    backgroundColor: stitchTokens.vintageGold,
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
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: stitchTokens.wineDark,
    backgroundColor: stitchTokens.whiteAlpha90,
    paddingHorizontal: 14,
  },
  createBtnText: {
    fontSize: 14,
    color: stitchTokens.wineDark,
  },
  errorText: {
    fontSize: 12,
    color: stitchTokens.flashRed,
    lineHeight: 16,
  },
  checkCircleActive: {
    backgroundColor: stitchTokens.wineDark,
    borderColor: stitchTokens.wineDark,
  },
});
