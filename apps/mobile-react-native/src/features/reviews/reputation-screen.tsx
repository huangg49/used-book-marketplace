import type { MemberReputation } from "@used-books/session-client";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
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
  colors,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";

function ReputationBackdrop() {
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      accessible={false}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 400 860"
        preserveAspectRatio="xMidYMin slice"
      >
        <Defs>
          <LinearGradient id="repPaper" x1="0" y1="0" x2="0.2" y2="1">
            <Stop offset="0" stopColor={stitchTokens.creamBg} />
            <Stop offset="0.55" stopColor={stitchTokens.parchment} />
            <Stop offset="1" stopColor={stitchTokens.warmIvory} />
          </LinearGradient>
          <LinearGradient id="repWine" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={stitchTokens.wine} />
            <Stop offset="0.6" stopColor={stitchTokens.wineDark} />
            <Stop offset="1" stopColor={stitchTokens.wineDeep} />
          </LinearGradient>
          <RadialGradient id="repGoldGlow" cx="0.88" cy="0.14" r="0.55">
            <Stop
              offset="0"
              stopColor={stitchTokens.gold}
              stopOpacity="0.22"
            />
            <Stop offset="1" stopColor={stitchTokens.gold} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        <Rect x="0" y="0" width="400" height="860" fill="url(#repPaper)" />

        {/* Deep Wine curved arch header */}
        <Path
          d="M0 0 H400 V192 Q200 232 0 192 Z"
          fill="url(#repWine)"
        />
        <Path
          d="M0 0 H400 V192 Q200 232 0 192 Z"
          fill="url(#repGoldGlow)"
        />

        {/* Subtle geometric gold rings */}
        <Circle
          cx="355"
          cy="46"
          r="76"
          fill="none"
          stroke={stitchTokens.gold}
          strokeOpacity="0.16"
          strokeWidth="1.2"
        />
        <Circle
          cx="355"
          cy="46"
          r="46"
          fill="none"
          stroke={stitchTokens.gold}
          strokeOpacity="0.12"
          strokeWidth="1"
        />
        <Circle
          cx="36"
          cy="148"
          r="48"
          fill="none"
          stroke={stitchTokens.gold}
          strokeOpacity="0.09"
          strokeWidth="1"
        />
      </Svg>
    </View>
  );
}

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
      <ReputationBackdrop />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 12) + 6,
            paddingBottom: Math.max(insets.bottom, 20) + 16,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={result.isRefetching}
            onRefresh={() => void result.refetch()}
            tintColor={stitchTokens.gold}
          />
        }
      >
        {/* Top Bar inside Wine Arch */}
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/account")
            }
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Icon name="back" size={18} color={stitchTokens.white} />
            <AppText kind="bold" style={styles.backBtnText}>
              Quay lại
            </AppText>
          </Pressable>

          <View style={styles.headerBadge}>
            <Icon name="shield" size={13} color={stitchTokens.gold} />
            <AppText style={styles.headerBadgeText}>Uy tín công khai</AppText>
          </View>
        </View>

        <View style={styles.heroHeader}>
          <AppText kind="heading" style={styles.heroTitle}>
            Hồ sơ uy tín
          </AppText>
          <AppText kind="small" style={styles.heroSub}>
            Tổng hợp giao dịch hoàn tất và đánh giá thực tế tại Lật lại
          </AppText>
        </View>

        {result.isPending ? (
          <View style={styles.floatingCard}>
            <StatePanel wine loading title="Đang tải hồ sơ uy tín…" />
          </View>
        ) : null}

        {result.isError ? (
          <View style={styles.floatingCard}>
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
            {/* 1. Floating Hero Identity & Wine-Gold Score Card */}
            <View style={styles.profileCard}>
              <View style={styles.identityRow}>
                <View style={styles.avatarRing}>
                  <View style={styles.avatarCircle}>
                    <AppText style={styles.avatarText}>
                      {(data.displayName.trim()[0] || "M").toUpperCase()}
                    </AppText>
                  </View>
                </View>

                <View style={styles.identityCol}>
                  <AppText
                    accessibilityRole="header"
                    numberOfLines={1}
                    style={styles.memberName}
                  >
                    {data.displayName}
                  </AppText>
                  <View style={styles.metaPillsRow}>
                    <View style={styles.metaPill}>
                      <Icon name="check" size={11} color={stitchTokens.wine} />
                      <AppText style={styles.metaPillText}>
                        {data.completedTransactions} giao dịch hoàn tất
                      </AppText>
                    </View>
                    <View style={styles.metaPill}>
                      <Icon name="message" size={11} color={stitchTokens.wine} />
                      <AppText style={styles.metaPillText}>
                        {data.reviewCount} đánh giá
                      </AppText>
                    </View>
                  </View>
                </View>
              </View>

              {/* Deep Wine & Gold Split Rating Banner */}
              <View style={styles.scoreBanner}>
                <View style={styles.scoreCol}>
                  <AppText style={styles.scoreLabel}>Điểm đối tác</AppText>
                  <View style={styles.scoreValueRow}>
                    <Icon
                      name="star"
                      size={17}
                      filled={data.partnerRating !== null}
                      color={stitchTokens.gold}
                    />
                    <AppText style={styles.scoreValue}>
                      {data.partnerRating === null
                        ? "Chưa có"
                        : `${data.partnerRating.toFixed(1)}/5`}
                    </AppText>
                  </View>
                  <AppText style={styles.scoreSub}>
                    Từ {data.partnerRatingCount} lượt
                  </AppText>
                </View>

                <View style={styles.scoreDivider} />

                <View style={styles.scoreCol}>
                  <AppText style={styles.scoreLabel}>Chất lượng sách</AppText>
                  <View style={styles.scoreValueRow}>
                    <Icon name="book" size={16} color={stitchTokens.gold} />
                    <AppText style={styles.scoreValue}>
                      {data.bookRating === null
                        ? "Chưa có"
                        : `${data.bookRating.toFixed(1)}/5`}
                    </AppText>
                  </View>
                  <AppText style={styles.scoreSub}>
                    Từ {data.bookRatingCount} lượt
                  </AppText>
                </View>
              </View>

              {/* Verified Violations Status Bar */}
              <View
                style={[
                  styles.violationBanner,
                  data.verifiedViolations > 0
                    ? styles.violationBannerWarn
                    : styles.violationBannerClean,
                ]}
              >
                <View
                  style={[
                    styles.violationIconBox,
                    data.verifiedViolations > 0
                      ? styles.violationIconWarn
                      : styles.violationIconClean,
                  ]}
                >
                  <Icon
                    name="shield"
                    size={15}
                    color={
                      data.verifiedViolations > 0
                        ? stitchTokens.flashRed
                        : stitchTokens.likeNewGreen
                    }
                  />
                </View>
                <View style={styles.violationBody}>
                  <AppText style={styles.violationTitle}>
                    Vi phạm đã xác minh
                  </AppText>
                  <AppText style={styles.violationHint}>
                    {data.verifiedViolations > 0
                      ? "Ghi nhận từ các trường hợp đã có kết luận chính thức"
                      : "Chưa ghi nhận vi phạm nào được xác minh"}
                  </AppText>
                </View>
                <View
                  style={[
                    styles.violationCountPill,
                    data.verifiedViolations > 0
                      ? styles.violationCountPillWarn
                      : styles.violationCountPillClean,
                  ]}
                >
                  <AppText
                    style={[
                      styles.violationCountText,
                      data.verifiedViolations > 0
                        ? styles.violationCountTextWarn
                        : styles.violationCountTextClean,
                    ]}
                  >
                    {data.verifiedViolations}
                  </AppText>
                </View>
              </View>
            </View>

            {/* 2. Transparent Calculation Note */}
            <View style={styles.noteCard}>
              <View style={styles.noteHeader}>
                <View style={styles.noteIconBox}>
                  <Icon name="info" size={14} color={stitchTokens.wine} />
                </View>
                <AppText style={styles.noteTitle}>
                  Cách tính điểm minh bạch
                </AppText>
              </View>
              <AppText style={styles.noteText}>
                Mỗi điểm là trung bình cộng từ số đánh giá đã công bố (chưa bị
                ẩn hoặc xóa). Điểm đối tác phản ánh cách giao dịch; điểm sách
                phản ánh tình trạng sách đã cung cấp. Số giao dịch hoàn tất
                không phải số lượt đánh giá; khiếu nại chưa kết luận không tính
                là vi phạm.
              </AppText>
            </View>

            {/* 3. Public Reviews Section */}
            <View style={styles.sectionHead}>
              <AppText style={styles.sectionTitle}>Đánh giá công khai</AppText>
              <View style={styles.sectionCountPill}>
                <AppText style={styles.sectionCountText}>
                  {data.reviewCount}
                </AppText>
              </View>
            </View>

            {data.reviewCount === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconCircle}>
                  <Icon name="message" size={26} color={stitchTokens.wine} />
                </View>
                <AppText style={styles.emptyTitle}>
                  Chưa có đánh giá công khai
                </AppText>
                <AppText style={styles.emptyDesc}>
                  Đánh giá từ các giao dịch mua bán, trao đổi hoặc đấu giá đã
                  công bố sẽ hiển thị tại đây.
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
    gap: 14,
    flexGrow: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 38,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  backBtnText: {
    color: stitchTokens.white,
    fontSize: 15,
  },
  pressed: {
    opacity: 0.78,
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.whiteAlpha14,
    borderWidth: 1,
    borderColor: stitchTokens.goldAlpha40,
  },
  headerBadgeText: {
    color: stitchTokens.gold,
    fontSize: 12,
    fontWeight: "700",
    includeFontPadding: false,
  },
  heroHeader: {
    gap: 4,
    paddingBottom: 6,
  },
  heroTitle: {
    color: stitchTokens.white,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  heroSub: {
    color: stitchTokens.gold,
    fontSize: 13,
    lineHeight: 19,
  },
  floatingCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 18,
    shadowColor: stitchTokens.wineDark,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  profileCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 18,
    gap: 14,
    shadowColor: stitchTokens.wineDark,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatarRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    padding: 3,
    borderWidth: 1.5,
    borderColor: stitchTokens.goldDark,
    backgroundColor: stitchTokens.warmIvory,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: stitchTokens.wine,
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
    gap: 6,
  },
  memberName: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  metaPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.wineAlpha08,
  },
  metaPillText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  scoreBanner: {
    flexDirection: "row",
    backgroundColor: stitchTokens.wine,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.goldAlpha40,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  scoreCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  scoreDivider: {
    width: 1,
    height: 44,
    backgroundColor: stitchTokens.whiteAlpha20,
  },
  scoreLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    color: stitchTokens.gold,
    includeFontPadding: false,
  },
  scoreValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scoreValue: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    color: stitchTokens.white,
    includeFontPadding: false,
  },
  scoreSub: {
    fontSize: 11,
    lineHeight: 15,
    color: stitchTokens.whiteAlpha70,
    includeFontPadding: false,
  },
  violationBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  violationBannerWarn: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderColor: stitchTokens.peachBorder,
  },
  violationBannerClean: {
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderColor: stitchTokens.greenLightBorder,
  },
  violationIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  violationIconWarn: {
    backgroundColor: stitchTokens.wineAlpha08,
  },
  violationIconClean: {
    backgroundColor: stitchTokens.whiteSurface,
  },
  violationBody: {
    flex: 1,
    gap: 2,
  },
  violationTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  violationHint: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.muted,
    includeFontPadding: false,
  },
  violationCountPill: {
    minWidth: 32,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  violationCountPillWarn: {
    backgroundColor: stitchTokens.flashRed,
  },
  violationCountPillClean: {
    backgroundColor: stitchTokens.likeNewGreen,
  },
  violationCountText: {
    fontSize: 13,
    fontWeight: "800",
    includeFontPadding: false,
  },
  violationCountTextWarn: {
    color: stitchTokens.white,
  },
  violationCountTextClean: {
    color: stitchTokens.white,
  },
  noteCard: {
    backgroundColor: stitchTokens.warmIvory,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 14,
    gap: 8,
  },
  noteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  noteIconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: stitchTokens.wineAlpha08,
    alignItems: "center",
    justifyContent: "center",
  },
  noteTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  noteText: {
    fontSize: 12,
    lineHeight: 18,
    color: stitchTokens.deepCocoa,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  sectionCountPill: {
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.wineAlpha08,
  },
  sectionCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wine,
    includeFontPadding: false,
  },
  emptyCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 10,
    shadowColor: stitchTokens.wineDark,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  emptyIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: stitchTokens.wineAlpha08,
    borderWidth: 1,
    borderColor: stitchTokens.wineAlpha20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 290,
  },
  reviewCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 16,
    gap: 10,
    shadowColor: stitchTokens.wineDark,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  reviewAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  smallAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: stitchTokens.wine,
    borderWidth: 1,
    borderColor: stitchTokens.goldDark,
    alignItems: "center",
    justifyContent: "center",
  },
  smallAvatarText: {
    fontSize: 13,
    fontWeight: "800",
    color: stitchTokens.gold,
    includeFontPadding: false,
  },
  authorName: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  ratingPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  ratingPair: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  ratingLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  starStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  commentBody: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
  replyBox: {
    backgroundColor: stitchTokens.warmIvory,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: stitchTokens.wine,
    padding: 12,
    gap: 4,
  },
  replyLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wine,
    includeFontPadding: false,
  },
  replyText: {
    fontSize: 13,
    lineHeight: 19,
    color: stitchTokens.deepCocoa,
  },
});
