import { View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  ApiError,
  transactionReviewsSchema,
  type ReviewType,
} from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
import { AppText, Button, Notice, space } from "../../core/ui";

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
    <View style={{ gap: space.sm }}>
      {data.awaitingCompletion && (
        <AppText>
          Bạn có thể viết ngay trong 72 giờ kiểm tra. Đánh giá vẫn riêng tư đến
          khi giao dịch hoàn tất và đủ điều kiện công bố; tiền tiếp tục được
          giữ.
        </AppText>
      )}
      <Button
        wine
        title={data.canReview ? "Viết đánh giá" : "Xem đánh giá"}
        onPress={() =>
          router.push({ pathname: "/reviews", params: { type, id } })
        }
      />
    </View>
  );
}
