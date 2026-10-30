import { useState } from "react";
import { View } from "react-native";
import { router, type Href } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ApiError,
  uniqueWorkItems,
  workAttention,
  workItemsPageSchema,
  workLanesFor,
  workTarget,
  type WorkLane,
} from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  Button,
  Chip,
  Notice,
  StatePanel,
  space,
  stitchTokens,
} from "../../core/ui";

export function WorkInbox({
  ownerId,
  status,
}: {
  ownerId: string;
  status: string;
}) {
  const { client } = useSession();
  const foreground = useForeground();
  const [selection, setSelection] = useState<WorkLane>("DirectOrders");
  const lanes = workLanesFor(status);
  const lane = lanes.some(([value]) => value === selection)
    ? selection
    : "DirectOrders";
  const result = useInfiniteQuery({
    queryKey: ["work-inbox", ownerId, status, lane],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      client.request(
        `/me/work-items?lane=${lane}&limit=5${pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""}`,
        workItemsPageSchema,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: foreground,
    retry: false,
    staleTime: 0,
    refetchInterval: foreground ? 30_000 : false,
  });
  const inaccessible =
    result.error instanceof ApiError &&
    [401, 403].includes(result.error.status);
  const items = inaccessible
    ? []
    : uniqueWorkItems(result.data?.pages.flatMap((page) => page.items) ?? []);
  return (
    <View style={{ gap: space.md }}>
      <AppText kind="heading" accessibilityRole="header">
        Việc đang chờ
      </AppText>
      <AppText>
        Chọn nhóm để xem lý do và hạn xử lý. Mở giao dịch để kiểm tra bước được
        phép thực hiện.
      </AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {lanes.map(([value, label]) => (
          <Chip
            wine
            key={value}
            title={label}
            selected={value === lane}
            onPress={() => setSelection(value)}
          />
        ))}
      </View>
      <Button
        wine
        secondary
        title="Cập nhật danh sách"
        busy={result.isFetching}
        onPress={() => void result.refetch()}
      />
      {result.isPending && (
        <StatePanel wine loading title="Đang tải việc trong nhóm này…" />
      )}
      {result.error && (
        <>
          <Notice tone="error">
            Chưa cập nhật được danh sách.{" "}
            {items.length
              ? "Các mục bên dưới thuộc lần tải trước."
              : "Chưa thể kết luận bạn có việc cần làm hay không."}
          </Notice>
          <Button
            wine
            secondary
            title="Thử lại"
            busy={result.isFetching}
            onPress={() =>
              void (result.isFetchNextPageError
                ? result.fetchNextPage()
                : result.refetch())
            }
          />
        </>
      )}
      {result.isSuccess && items.length === 0 && (
        <StatePanel
          wine
          title="Chưa có việc trong nhóm này"
          message="Những nhóm khác và đánh giá sau giao dịch có nơi theo dõi riêng bên dưới."
        />
      )}
      {items.map((item) => {
        const path = workTarget(item, "native");
        return (
          <View
            key={item.id}
            style={{
              borderBottomWidth: 1,
              borderBottomColor: stitchTokens.cardBorder,
              paddingVertical: space.md,
              gap: space.sm,
            }}
          >
            <AppText kind="small">{workAttention[item.attention]}</AppText>
            <AppText kind="bold">{item.title}</AppText>
            <AppText>{item.reason}</AppText>
            {item.dueAt && (
              <AppText kind="small">
                Mốc xử lý: {new Date(item.dueAt).toLocaleString("vi-VN")}
              </AppText>
            )}
            {path && (
              <Button
                wine
                secondary
                title={`Mở ${item.title}`}
                onPress={() => router.push(path as Href)}
              />
            )}
          </View>
        );
      })}
      {result.hasNextPage && (
        <Button
          wine
          title="Xem thêm việc trong nhóm"
          busy={result.isFetching}
          onPress={() => void result.fetchNextPage()}
        />
      )}
      {result.data?.pages[0] && (
        <AppText kind="small">
          Theo trạng thái lúc{" "}
          {new Date(result.data.pages[0].serverTime).toLocaleTimeString(
            "vi-VN",
          )}
          . Danh sách được cập nhật khi bạn quay lại.
        </AppText>
      )}
    </View>
  );
}
