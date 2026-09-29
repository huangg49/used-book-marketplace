import { useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  BackAction,
  Button,
  Chip,
  Notice,
  Screen,
  StatePanel,
  colors,
  space,
} from "../../core/ui";
import { draftPage, emptyContent, privateDraft, receipt } from "./contracts";
import { DraftEditor } from "./draft-editor";
import { photoError, useForeground } from "./draft-media";
import { BookIdentity } from "./catalog-picker";
import { listingSummary, moderationLabel } from "./listing-form";
import { MemberNavigation } from "../navigation/member-navigation";
export function DraftsScreen() {
  const { client, state } = useSession(),
    cache = useQueryClient();
  const foreground = useForeground();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const createKey = useRef<string | null>(null);
  const drafts = useInfiniteQuery({
    queryKey: ["drafts", filter],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      client.request(
        "/me/listings?limit=20" +
          (filter ? "&moderation=" + filter : "") +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""),
        draftPage,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: foreground,
    refetchInterval: foreground ? 15000 : false,
  });
  const detail = useQuery({
    queryKey: ["draft", selected],
    queryFn: () => client.request(`/me/listings/${selected}`, privateDraft),
    enabled: !!selected,
    refetchOnWindowFocus: false,
  });
  const create = useMutation({
    mutationFn: () => {
      createKey.current ??= Crypto.randomUUID();
      return client.request("/listings", receipt, {
        method: "POST",
        headers: { "Idempotency-Key": createKey.current },
        body: JSON.stringify({ content: emptyContent }),
      });
    },
    onSuccess: async (r) => {
      createKey.current = null;
      setSelected(r.entityId);
      await cache.invalidateQueries({ queryKey: ["drafts"] });
    },
  });
  if (selected && detail.data)
    return (
      <DraftEditor
        key={selected}
        initial={detail.data}
        onBack={() => {
          setSelected(null);
          void cache.invalidateQueries({ queryKey: ["drafts"] });
          void cache.removeQueries({ queryKey: ["draft", selected] });
        }}
      />
    );
  if (selected)
    return (
      <Screen>
        <StatePanel
          loading={detail.isPending}
          title={detail.error ? "Chưa mở được bản nháp" : "Đang mở bản nháp"}
          action={
            detail.error
              ? { label: "Thử lại", onPress: () => void detail.refetch() }
              : undefined
          }
        />
        <Button
          title="Về danh sách"
          secondary
          onPress={() => setSelected(null)}
        />
      </Screen>
    );
  return (
    <Screen footer={<MemberNavigation current="/drafts" />}>
      <BackAction
        title="Về tài khoản"
        onPress={() => router.replace("./account")}
      />
      <View style={{ gap: space.md }}>
        <AppText kind="label" color={colors.rustText}>
          TỦ SÁCH CỦA BẠN
        </AppText>
        <AppText
          kind="heading"
          color={colors.forest}
          accessibilityRole="header"
        >
          Sách của tôi
        </AppText>
        <AppText color={colors.muted}>
          Hoàn thiện bản nháp, theo dõi duyệt bài và xem lại những cuốn bạn muốn
          chuyền tay.
        </AppText>
      </View>
      <Button
        title="Tạo bản nháp"
        busy={create.isPending}
        disabled={
          state.status !== "authenticated" || state.user.status !== "ACTIVE"
        }
        onPress={() => {
          if (!create.isPending) create.mutate();
        }}
      />
      <View style={{ gap: space.sm, flexDirection: "row", flexWrap: "wrap" }}>
        {[["", "Tất cả sách"], ...Object.entries(moderationLabel)].map(
          ([value, label]) => (
            <Chip
              key={value}
              selected={filter === value}
              title={label}
              onPress={() => setFilter(value)}
            />
          ),
        )}
      </View>
      {create.error ? (
        <Notice tone="error">{photoError(create.error)}</Notice>
      ) : null}
      {drafts.isPending ? (
        <StatePanel loading title="Đang tải bản nháp" />
      ) : null}
      {drafts.error ? (
        <>
          <Notice tone="error">{photoError(drafts.error)}</Notice>
          <Button
            title="Thử tải lại"
            secondary
            onPress={() => void drafts.refetch()}
          />
        </>
      ) : null}
      {drafts.data?.pages[0].items.length === 0 ? (
        <StatePanel
          title="Chưa có sách trong mục này"
          message="Bản nháp và kết quả duyệt của bạn sẽ xuất hiện ở đây."
        />
      ) : null}
      {drafts.data?.pages
        .flatMap((p) => p.items)
        .map((d, i) => {
          const summary = listingSummary(d, i + 1);
          return (
            <View
              key={d.id}
              style={{
                gap: space.sm,
                paddingVertical: space.lg,
                borderTopWidth: 1,
                borderColor: colors.rule,
              }}
            >
              <AppText kind="label" color={colors.rustText}>
                {summary.status}
              </AppText>
              <BookIdentity id={d.currentRevision.content.bookId} />
              <AppText>
                {d.currentRevision.content.description ||
                  "Chưa có lời nhắn về cuốn sách."}
              </AppText>
              <AppText kind="small">
                {d.currentRevision.content.mediaIds.length} ảnh đã chọn
              </AppText>
              {summary.note ? (
                <AppText
                  kind="small"
                  color={
                    d.state.moderation === "Rejected" ||
                    d.state.visibility === "Removed"
                      ? colors.rustText
                      : colors.muted
                  }
                >
                  {summary.note}
                </AppText>
              ) : null}
              <Button
                secondary
                title={summary.action}
                onPress={() => setSelected(d.id)}
              />
            </View>
          );
        })}
      {drafts.hasNextPage ? (
        <Button
          title="Xem thêm bản nháp"
          secondary
          busy={drafts.isFetchingNextPage}
          onPress={() => void drafts.fetchNextPage()}
        />
      ) : null}
    </Screen>
  );
}
