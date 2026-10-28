import React from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Button, Icon, radius, space, stitchTokens } from "../../core/ui";
import type { Exchange, ExchangeReviewItem, ExchangeReviewsResponse } from "./contracts";

interface ExchangeReviewsCardProps {
  exchange: Exchange;
  reviewsData?: ExchangeReviewsResponse | null;
  isLoading?: boolean;
  partnerName: string;
  onOpenReviewModal: () => void;
}

function StarsRating({ score }: { score: number }) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Icon
          key={s}
          name="star"
          size={14}
          color={s <= score ? stitchTokens.amberBg : stitchTokens.peachBorder}
          filled={s <= score}
        />
      ))}
    </View>
  );
}

function ReviewItemBox({
  review,
  isSelf,
  authorName,
}: {
  review: ExchangeReviewItem;
  isSelf: boolean;
  authorName: string;
}) {
  const formattedDate = new Date(review.createdAt).toLocaleDateString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <View style={styles.reviewItem}>
      <View style={styles.reviewHeader}>
        <View style={{ flex: 1 }}>
          <AppText style={styles.reviewAuthor}>
            {isSelf ? "Đánh giá của bạn" : review.authorName || `@${authorName}`}
          </AppText>
          <AppText style={styles.reviewDate}>{formattedDate}</AppText>
        </View>
        <View style={styles.roleBadge}>
          <AppText style={styles.roleBadgeText}>
            {isSelf ? "Bạn" : "Đối tác"}
          </AppText>
        </View>
      </View>

      <View style={styles.ratingsRow}>
        <View style={styles.ratingScore}>
          <AppText style={styles.ratingLabel}>Chất lượng sách:</AppText>
          <StarsRating score={review.bookRating} />
          <AppText style={styles.ratingNumber}>{review.bookRating}/5</AppText>
        </View>
        <View style={styles.ratingScore}>
          <AppText style={styles.ratingLabel}>Đối tác:</AppText>
          <StarsRating score={review.partnerRating} />
          <AppText style={styles.ratingNumber}>{review.partnerRating}/5</AppText>
        </View>
      </View>

      {review.tags && review.tags.length > 0 && (
        <View style={styles.tagsList}>
          {review.tags.map((tag) => (
            <View key={tag} style={styles.tagBadge}>
              <AppText style={styles.tagBadgeText}>✓ {tag}</AppText>
            </View>
          ))}
        </View>
      )}

      {review.comment ? (
        <AppText style={styles.commentText}>"{review.comment}"</AppText>
      ) : null}
    </View>
  );
}

export function ExchangeReviewsCard({
  exchange,
  reviewsData,
  isLoading,
  partnerName,
  onOpenReviewModal,
}: ExchangeReviewsCardProps) {
  if (exchange.status !== "Completed") {
    return null;
  }

  if (isLoading) {
    return (
      <View style={styles.card}>
        <AppText style={styles.loadingText}>Đang tải đánh giá...</AppText>
      </View>
    );
  }

  if (!reviewsData) {
    return null;
  }

  const { canReview, deadline, myReview, partnerReview } = reviewsData;

  const formattedDeadline = deadline
    ? new Date(deadline).toLocaleDateString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : null;

  return (
    <View style={styles.card}>
      {/* 1. Header */}
      <View style={styles.header}>
        <View style={styles.headerIconBox}>
          <Icon name="star" size={18} color={stitchTokens.whiteSurface} filled />
        </View>
        <View style={styles.headerTitles}>
          <AppText style={styles.title}>Đánh giá & Nhận xét</AppText>
          <AppText style={styles.subtitle}>
            Mức độ hài lòng về sách và độ tin cậy giữa hai bên
          </AppText>
        </View>
      </View>

      {/* 2. Prompt Banner if Eligible to Review */}
      {canReview && (
        <View style={styles.promptBanner}>
          <View style={styles.promptContent}>
            <AppText style={styles.promptTitle}>
              Chia sẻ cảm nhận về giao dịch!
            </AppText>
            <AppText style={styles.promptDesc}>
              Đánh giá sách nhận được và đối tác @{partnerName} giúp xây dựng cộng đồng bạn đọc uy tín, minh bạch.
            </AppText>
          </View>
          <Button
            title="⭐ Viết đánh giá đối tác"
            wine
            onPress={onOpenReviewModal}
          />
        </View>
      )}

      {/* 3. Review Items Display */}
      <View style={styles.reviewsList}>
        {/* Your Review */}
        {myReview ? (
          <ReviewItemBox
            review={myReview}
            isSelf={true}
            authorName="Bạn"
          />
        ) : (
          <View style={styles.pendingReviewBox}>
            <Icon name="clock" size={20} color={stitchTokens.wineDark} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText style={styles.pendingTitle}>Bạn chưa gửi đánh giá</AppText>
              <AppText style={styles.pendingDesc}>
                {canReview
                  ? "Bấm nút 'Viết đánh giá' ở trên để gửi nhận xét."
                  : "Đã quá hạn 7 ngày gửi đánh giá theo quy định."}
              </AppText>
            </View>
          </View>
        )}

        {/* Partner Review */}
        {partnerReview ? (
          <ReviewItemBox
            review={partnerReview}
            isSelf={false}
            authorName={partnerName}
          />
        ) : (
          <View style={styles.pendingReviewBox}>
            <Icon name="shield" size={20} color={stitchTokens.wineDark} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText style={styles.pendingTitle}>
                Chưa hiển thị đánh giá từ @{partnerName}
              </AppText>
              <AppText style={styles.pendingDesc}>
                Theo quy tắc bảo mật FR-R03, nhận xét của đối tác chỉ được tiết lộ sau khi cả 2 bên cùng gửi đánh giá hoặc sau 7 ngày kết thúc giao dịch.
              </AppText>
            </View>
          </View>
        )}
      </View>

      {/* 4. POL-18 Deadline Notice */}
      {formattedDeadline && (
        <View style={styles.deadlineBox}>
          <Icon name="clock" size={13} color={stitchTokens.roseBrown} />
          <AppText style={styles.deadlineText}>
            Thời hạn đánh giá (POL-18): trước {formattedDeadline} (168 giờ kể từ khi hoàn tất).
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    padding: space.md,
    gap: 12,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  loadingText: {
    fontSize: 12,
    color: stitchTokens.roseBrown,
    textAlign: "center",
  },
  header: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  headerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: stitchTokens.amberBg,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitles: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  subtitle: {
    fontSize: 11,
    color: stitchTokens.roseBrown,
  },
  promptBanner: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  promptContent: {
    gap: 2,
  },
  promptTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  promptDesc: {
    fontSize: 11,
    color: stitchTokens.wineDark,
    lineHeight: 15,
  },
  reviewsList: {
    gap: 10,
  },
  reviewItem: {
    backgroundColor: stitchTokens.creamBg,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reviewAuthor: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  reviewDate: {
    fontSize: 10,
    color: stitchTokens.roseBrown,
  },
  roleBadge: {
    backgroundColor: stitchTokens.parchment,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  ratingsRow: {
    gap: 4,
  },
  ratingScore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ratingLabel: {
    fontSize: 11,
    color: stitchTokens.wineDark,
    fontWeight: "600",
    width: 105,
  },
  starsRow: {
    flexDirection: "row",
    gap: 2,
  },
  ratingNumber: {
    fontSize: 11,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  tagsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tagBadge: {
    backgroundColor: stitchTokens.whiteSurface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: stitchTokens.likeNewGreen,
  },
  commentText: {
    fontSize: 12,
    fontStyle: "italic",
    color: stitchTokens.wineDark,
    lineHeight: 16,
  },
  pendingReviewBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: stitchTokens.parchment,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  pendingTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  pendingDesc: {
    fontSize: 11,
    color: stitchTokens.roseBrown,
    lineHeight: 15,
  },
  deadlineBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 4,
  },
  deadlineText: {
    fontSize: 10,
    color: stitchTokens.roseBrown,
    lineHeight: 14,
  },
});
