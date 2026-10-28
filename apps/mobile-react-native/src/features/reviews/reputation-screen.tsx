import type { MemberReputation } from "@used-books/session-client";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { memberReputationSchema } from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  BackAction,
  Button,
  Screen,
  StatePanel,
  space,
} from "../../core/ui";
export function ReputationScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>(),
    { client } = useSession();
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
  return (
    <Screen
      header={
        <BackAction
          title="Quay lại"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/account")
          }
        />
      }
    >
      <AppText kind="title" accessibilityRole="header">
        Hồ sơ uy tín
      </AppText>
      {result.isPending ? (
        <StatePanel wine loading title="Đang tải hồ sơ…" />
      ) : null}
      {result.isError ? (
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
      ) : null}
      {data ? (
        <>
          <AppText kind="heading" accessibilityRole="header">
            {data.displayName}
          </AppText>
          <AppText>Giao dịch hoàn tất: {data.completedTransactions}</AppText>
          <AppText>
            Điểm đối tác:{" "}
            {data.partnerRating === null
              ? "Chưa có"
              : `${data.partnerRating.toFixed(1)}/5`}
          </AppText>
          <AppText>
            Điểm sách nhận:{" "}
            {data.bookRating === null
              ? "Chưa có"
              : `${data.bookRating.toFixed(1)}/5`}
          </AppText>
          <AppText>Vi phạm đã xác minh: {data.verifiedViolations}</AppText>
          <AppText kind="small">
            Điểm tính từ {data.reviewCount} đánh giá công khai hợp lệ. Khiếu nại
            chưa kết luận không phải vi phạm. Review chưa công bố, bị ẩn hoặc đã
            xóa không được tính.
          </AppText>
          {data.reviewCount === 0 ? (
            <StatePanel wine title="Chưa có đánh giá công khai" />
          ) : null}
          {result.data?.pages
            .flatMap((p) => p.items)
            .map((r) => (
              <View
                key={r.id}
                style={{ gap: space.sm, paddingVertical: space.lg }}
              >
                <AppText kind="bold">{r.authorName}</AppText>
                <AppText>
                  Đối tác: {r.partnerRating}/5
                  {r.bookRating !== null ? ` · Sách: ${r.bookRating}/5` : ""}
                </AppText>
                {r.comment ? <AppText>{r.comment}</AppText> : null}
                {r.reply ? (
                  <>
                    <AppText kind="bold">Phản hồi đã duyệt</AppText>
                    <AppText>{r.reply.text}</AppText>
                  </>
                ) : null}
              </View>
            ))}
          {result.hasNextPage ? (
            <Button
              wine
              title="Xem thêm đánh giá"
              busy={result.isFetchingNextPage}
              onPress={() => void result.fetchNextPage()}
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
