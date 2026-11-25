import type { MemberReputation } from "@used-books/session-client";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useInfiniteQuery } from "@tanstack/react-query";
import { memberReputationSchema } from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  Button,
  Icon,
  StatePanel,
  WineHeader,
  colors,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";

function StarStrip({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={styles.starStrip} accessibilityLabel={`${rating} trên 5 sao`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon
          key={n}
          name="star"
          size={size}
          filled={n <= rating}
          color={n <= rating ? stitchTokens.goldDark : stitchTokens.borderWarm}
        />
      ))}
    </View>
  );
}

export function ReputationScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { client } = useSession();
  const insets = useSafeAreaInsets();

  const result = useInfiniteQuery({
    queryKey: ["memberReputation", id],
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p: MemberReputation) => p.nextCursor ?? undefined,
    queryFn: ({ pageParam }) =>
      client.publicRequest(
        `/members/${encodeURIComponent(id ?? "")}/reputation?limit=10${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        memberReputationSchema,
      ),
    enabled: !!id,
    retry: false,
  });

  const data = result.data?.pages[0];
  const reviews = result.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View style={styles.screenRoot}>
      <WineHeader
        title="Hồ sơ uy tín"
        subtitle={data ? data.displayName : "Thông tin thành viên"}
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/account")
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 16) + 12 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={result.isRefetching}
            onRefresh={() => void result.refetch()}
            tintColor={stitchTokens.wineDark}
          />
        }
      >
        {result.isPending ? (
          <View style={styles.centerWrap}>
            <StatePanel wine loading title="Đang tải hồ sơ uy tín…" />
          </View>
        ) : null}

        {result.isError ? (
          <View style={styles.centerWrap}>
            <StatePanel
              wine
              title="Chưa xem được hồ sơ"
              message="Hồ sơ không công khai hoặc kết nối chưa sẵn sàng."
              action={{
                label: "Thử lại",
                onPress: () => void result.refetch(),
                busy: result.isFetching,
              }}
            />
          </View>
        ) : null}

        {data ? (
          <>
            {/* Member Identity & Metrics Card */}
            <View style={styles.profileCard}>
              <View style={styles.identityRow}>
                <View style={styles.avatarCircle}>
                  <AppText style={styles.avatarText}>
                    {(data.displayName.trim()[0] || "M").toUpperCase()}
                  </AppText>
                </View>
                <View style={styles.identityCol}>
                  <AppText accessibilityRole="header" style={styles.memberName}>
                    {data.displayName}
                  </AppText>
                  <AppText style={styles.completedLine}>
                    {data.completedTransactions} giao dịch hoàn tất ·{" "}
                    {data.reviewCount} đánh giá công khai
                  </AppText>
                </View>
              </View>

              <View style={styles.metricsRow}>
                <View style={styles.metricBox}>
                  <AppText style={styles.metricLabel}>Điểm đối tác</AppText>
                  <View style={styles.metricScoreRow}>
                    <Icon
                      name="star"
                      size={16}
                      filled={data.partnerRating !== null}
                      color={
                        data.partnerRating !== null
                          ? stitchTokens.goldDark
                          : colors.muted
                      }
                    />
                    <AppText style={styles.metricValue}>
                      {data.partnerRating === null
                        ? "Chưa có"
                        : `${data.partnerRating.toFixed(1)}/5`}
                    </AppText>
                  </View>
                  <AppText style={styles.metricCount}>
                    Từ {data.partnerRatingCount} lượt
                  </AppText>
                </View>

                <View style={styles.metricDivider} />

                <View style={styles.metricBox}>
                  <AppText style={styles.metricLabel}>Chất lượng sách</AppText>
                  <View style={styles.metricScoreRow}>
                    <Icon
                      name="book"
                      size={15}
                      color={
                        data.bookRating !== null
                          ? stitchTokens.wine
                          : colors.muted
                      }
                    />
                    <AppText style={styles.metricValue}>
                      {data.bookRating === null
                        ? "Chưa có"
                        : `${data.bookRating.toFixed(1)}/5`}
                    </AppText>
                  </View>
                  <AppText style={styles.metricCount}>
                    Từ {data.bookRatingCount} lượt
                  </AppText>
                </View>
              </View>

              <View style={styles.violationRow}>
                <Icon
                  name="shield"
                  size={15}
                  color={
                    data.verifiedViolations > 0
                      ? stitchTokens.flashRed
                      : stitchTokens.likeNewGreen
                  }
                />
                <AppText style={styles.violationText}>
                  Vi phạm đã xác minh:{" "}
                  <AppText
                    style={[
                      styles.violationCount,
                      data.verifiedViolations > 0 && {
                        color: stitchTokens.flashRed,
                      },
                    ]}
                  >
                    {data.verifiedViolations}
                  </AppText>
                </AppText>
              </View>
            </View>

            {/* Transparent Calculation Note */}
            <View style={styles.noteCard}>
              <AppText style={styles.noteText}>
                Mỗi điểm là trung bình cộng từ số đánh giá đã công bố (chưa bị
                ẩn hoặc xóa). Điểm đối tác phản ánh cách giao dịch; điểm sách
                phản ánh tình trạng sách đã cung cấp. Số giao dịch hoàn tất
                không phải số lượt đánh giá; khiếu nại chưa kết luận không tính
                là vi phạm.
              </AppText>
            </View>

            {/* Reviews Section */}
            <View style={styles.sectionHead}>
              <AppText style={styles.sectionTitle}>
                Đánh giá công khai ({data.reviewCount})
              </AppText>
            </View>

            {data.reviewCount === 0 ? (
              <View style={styles.emptyCard}>
                <Icon name="message" size={26} color={stitchTokens.wine} />
                <AppText style={styles.emptyTitle}>
                  Chưa có đánh giá công khai
                </AppText>
              </View>
            ) : (
              reviews.map((r) => (
                <View key={r.id} style={styles.reviewCard}>
                  <View style={styles.reviewAuthorRow}>
                    <View style={styles.smallAvatar}>
                      <AppText style={styles.smallAvatarText}>
                        {(r.authorName.trim()[0] || "N").toUpperCase()}
                      </AppText>
                    </View>
                    <AppText style={styles.authorName}>{r.authorName}</AppText>
                  </View>

                  <View style={styles.ratingPillsRow}>
                    <View style={styles.ratingPair}>
                      <AppText style={styles.ratingLabel}>Đối tác</AppText>
                      <StarStrip rating={r.partnerRating} />
                    </View>
                    {r.bookRating !== null ? (
                      <View style={styles.ratingPair}>
                        <AppText style={styles.ratingLabel}>Sách</AppText>
                        <StarStrip rating={r.bookRating} />
                      </View>
                    ) : null}
                  </View>

                  {r.comment ? (
                    <AppText style={styles.commentBody}>{r.comment}</AppText>
                  ) : null}

                  {r.reply ? (
                    <View style={styles.replyBox}>
                      <AppText style={styles.replyLabel}>
                        Phản hồi đã duyệt
                      </AppText>
                      <AppText style={styles.replyText}>{r.reply.text}</AppText>
                    </View>
                  ) : null}
                </View>
              ))
            )}

            {result.hasNextPage ? (
              <Button
                wine
                secondary
                title="Xem thêm đánh giá"
                busy={result.isFetchingNextPage}
                onPress={() => void result.fetchNextPage()}
              />
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: stitchTokens.creamBg,
  },
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: 12,
    flexGrow: 1,
  },
  centerWrap: {
    paddingVertical: space.section,
  },
  profileCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 16,
    gap: 14,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: stitchTokens.wineDark,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
    color: stitchTokens.gold,
    includeFontPadding: false,
  },
  identityCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  memberName: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    color: colors.ink,
    includeFontPadding: false,
  },
  completedLine: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    includeFontPadding: false,
  },
  metricsRow: {
    flexDirection: "row",
    backgroundColor: stitchTokens.parchment,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  metricBox: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  metricDivider: {
    width: 1,
    backgroundColor: stitchTokens.warmBorder,
    marginVertical: 4,
  },
  metricLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: colors.muted,
    includeFontPadding: false,
  },
  metricScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metricValue: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
    color: colors.ink,
    includeFontPadding: false,
  },
  metricCount: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.muted,
    includeFontPadding: false,
  },
  violationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.warmBorder,
  },
  violationText: {
    fontSize: 13,
    lineHeight: 18,
    color: stitchTokens.deepCocoa,
    includeFontPadding: false,
  },
  violationCount: {
    fontWeight: "800",
    color: stitchTokens.likeNewGreen,
  },
  noteCard: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    padding: 12,
  },
  noteText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
  },
  sectionHead: {
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  emptyCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.muted,
  },
  reviewCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 14,
    gap: 10,
  },
  reviewAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  smallAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
  },
  smallAvatarText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  authorName: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
    color: colors.ink,
    includeFontPadding: false,
  },
  ratingPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  ratingPair: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: stitchTokens.parchment,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
  },
  ratingLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
    includeFontPadding: false,
  },
  starStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  commentBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.ink,
  },
  replyBox: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    padding: 10,
    gap: 4,
  },
  replyLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: stitchTokens.wine,
    includeFontPadding: false,
  },
  replyText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },
});
