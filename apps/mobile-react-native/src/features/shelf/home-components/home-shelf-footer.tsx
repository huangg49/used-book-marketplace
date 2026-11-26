import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import {
  AppText,
  Icon,
  layout,
  space,
  stitchTokens,
} from "../../../core/ui";

export function HomeShelfFooter({
  loadedCount,
  hasNextPage,
  fetchingNextPage,
  nextPageError,
  onLoadMore,
  onScrollTop,
}: {
  loadedCount: number;
  hasNextPage: boolean;
  fetchingNextPage: boolean;
  nextPageError?: string;
  onLoadMore: () => void;
  onScrollTop?: () => void;
}) {
  const [loadMoreFocused, setLoadMoreFocused] = useState(false);
  const [topFocused, setTopFocused] = useState(false);

  if (loadedCount === 0 && !hasNextPage) return null;

  return (
    <View style={styles.section}>
      {/* Editorial count hairline */}
      <View style={styles.dividerRow}>
        <View style={styles.hairline} />
        <AppText
          kind="small"
          accessibilityLiveRegion="polite"
          style={styles.countText}
        >
          {hasNextPage
            ? `Đang hiển thị ${loadedCount} cuốn`
            : `Đã hiển thị tất cả ${loadedCount} cuốn`}
        </AppText>
        <View style={styles.hairline} />
      </View>

      {hasNextPage ? (
        <View style={styles.actionWrap}>
          {nextPageError ? (
            <AppText kind="small" style={styles.errorText}>
              {nextPageError}
            </AppText>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              nextPageError ? "Thử tải thêm sách" : "Xem thêm sách"
            }
            accessibilityState={{
              disabled: fetchingNextPage,
              busy: fetchingNextPage,
            }}
            disabled={fetchingNextPage}
            onPress={onLoadMore}
            onFocus={() => setLoadMoreFocused(true)}
            onBlur={() => setLoadMoreFocused(false)}
            style={({ pressed }) => [
              styles.loadMoreBtn,
              nextPageError && styles.loadMoreBtnError,
              loadMoreFocused && layout.focus,
              pressed && !fetchingNextPage && styles.loadMoreBtnPressed,
              fetchingNextPage && styles.loadMoreBtnBusy,
            ]}
          >
            {fetchingNextPage ? (
              <>
                <ActivityIndicator size="small" color={stitchTokens.wine} />
                <AppText kind="bold" style={styles.loadMoreText}>
                  Đang tải thêm sách…
                </AppText>
              </>
            ) : (
              <>
                <AppText kind="bold" style={styles.loadMoreText}>
                  {nextPageError ? "Thử tải thêm sách" : "Xem thêm sách"}
                </AppText>
                <Icon
                  name="chevronDown"
                  size={16}
                  color={stitchTokens.wine}
                  strokeWidth={2.2}
                />
              </>
            )}
          </Pressable>
        </View>
      ) : loadedCount > 6 && onScrollTop ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Lên đầu trang"
          onPress={onScrollTop}
          onFocus={() => setTopFocused(true)}
          onBlur={() => setTopFocused(false)}
          style={({ pressed }) => [
            styles.scrollTopBtn,
            topFocused && layout.focus,
            pressed && styles.scrollTopBtnPressed,
          ]}
        >
          <Icon
            name="chevronUp"
            size={14}
            color={stitchTokens.wine}
            strokeWidth={2.2}
          />
          <AppText kind="bold" style={styles.scrollTopText}>
            Lên đầu trang
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: "100%",
    paddingHorizontal: 12,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: 12,
    alignItems: "center",
  },
  dividerRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 4,
  },
  hairline: {
    flex: 1,
    height: 1,
    backgroundColor: stitchTokens.cardBorder,
  },
  countText: {
    fontSize: 11.5,
    lineHeight: 15,
    color: stitchTokens.subtleGray,
    fontVariant: ["tabular-nums"],
    includeFontPadding: false,
  },
  actionWrap: {
    width: "100%",
    gap: 8,
    alignItems: "center",
  },
  errorText: {
    fontSize: 12,
    lineHeight: 16,
    color: stitchTokens.crimson,
    textAlign: "center",
  },
  loadMoreBtn: {
    width: "100%",
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  loadMoreBtnError: {
    borderColor: stitchTokens.errorLightBorder,
    backgroundColor: stitchTokens.roseIce,
  },
  loadMoreBtnPressed: {
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  loadMoreBtnBusy: {
    opacity: 0.72,
  },
  loadMoreText: {
    fontSize: 13.5,
    lineHeight: 18,
    color: stitchTokens.wine,
    includeFontPadding: false,
  },
  scrollTopBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  scrollTopBtnPressed: {
    backgroundColor: stitchTokens.pillWarmBg,
  },
  scrollTopText: {
    fontSize: 12,
    lineHeight: 16,
    color: stitchTokens.wine,
    includeFontPadding: false,
  },
});
