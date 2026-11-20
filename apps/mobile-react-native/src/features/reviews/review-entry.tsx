import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  ApiError,
  transactionReviewsSchema,
  type ReviewType,
} from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
import { AppText, Button, Icon, Notice, stitchTokens } from "../../core/ui";

export function ReviewEntry({
  type,
  id,
  version,
}: {
  type: ReviewType;
  id: string;
  version?: number;
}) {
  const { client, state } = useSession();
  const owner = state.status === "authenticated" ? state.user.id : undefined;
  const result = useQuery({
    queryKey: ["reviewEntry", owner, type, id, version],
    queryFn: () =>
      client.request(
        `/transactions/${type}/${id}/reviews`,
        transactionReviewsSchema,
      ),
    enabled: !!owner,
    retry: false,
  });
  if (
    !owner ||
    (result.error instanceof ApiError &&
      [401, 403, 404].includes(result.error.status))
  )
    return null;
  if (result.isPending)
    return (
      <AppText accessibilityRole="text">Đang kiểm tra quyền đánh giá…</AppText>
    );
  if (result.isError)
    return (
      <Notice tone="error">
        <AppText>Chưa tải được quyền đánh giá.</AppText>
        <Button wine title="Thử lại" onPress={() => void result.refetch()} />
      </Notice>
    );
  const data = result.data;
  if (!data?.canReview && !data?.myReview && !data?.partnerReview) return null;
  return (
    <View style={styles.cardContainer}>
      <View style={styles.headerRow}>
        <Icon name="star" size={15} color={stitchTokens.wineDark} />
        <AppText style={styles.title}>Đánh giá trải nghiệm</AppText>
      </View>
      {data.awaitingCompletion && (
        <AppText style={styles.hintText}>
          Bạn có thể viết nhận xét trước trong 72 giờ này. Đánh giá được giữ riêng tư đến khi giao dịch hoàn tất và tiền tiếp tục được bảo vệ.
        </AppText>
      )}
      <Button
        wine
        secondary={Boolean(data.awaitingCompletion)}
        title={data.canReview ? "Viết đánh giá đối tác" : "Xem đánh giá"}
        onPress={() =>
          router.push({ pathname: "/reviews", params: { type, id } })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: stitchTokens.warmIvory,
    borderColor: stitchTokens.borderWarm,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginTop: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  hintText: {
    fontSize: 12,
    lineHeight: 17,
    color: stitchTokens.darkWood,
  },
});
