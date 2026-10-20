import { useRef, useState } from "react";
import { ScrollView, View } from "react-native";
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
  BookCard,
  Button,
  Chip,
  ConfirmDialog,
  Icon,
  Notice,
  Screen,
  StatePanel,
  WebBrandLogo,
  space,
  stitchTokens,
} from "../../core/ui";
import { draftPage, emptyContent, privateDraft, receipt } from "./contracts";
import { DraftEditor } from "./draft-editor";
import { photoError, useForeground } from "./draft-media";
import { BookIdentity } from "./catalog-picker";
import { DraftCoverPhoto } from "./draft-cover-photo";
import { executeLifecycle, lifecycleIntent } from "./lifecycle-command";
import { MemberNavigation } from "../navigation/member-navigation";

export function DraftsScreen() {
  const { client, state } = useSession(),
    cache = useQueryClient();
  const foreground = useForeground();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    version: number;
  } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const createKey = useRef<string | null>(null);

  const drafts = useInfiniteQuery({
    queryKey: ["drafts", filter],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      client.request(
        "/me/listings?channel=Marketplace&limit=20" +
          (filter ? "&moderation=" + filter : "") +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""),
        draftPage,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: foreground,
    refetchInterval: foreground ? 15000 : false,
  });

  const allDrafts = useQuery({
    queryKey: ["drafts-metrics"],
    queryFn: () => client.request("/me/listings?channel=Marketplace&limit=50", draftPage),
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
      await cache.invalidateQueries({ queryKey: ["drafts-metrics"] });
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
          void cache.invalidateQueries({ queryKey: ["drafts-metrics"] });
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
          wine
          secondary
          onPress={() => setSelected(null)}
        />
      </Screen>
    );

  const metricItems = allDrafts.data?.items ?? [];
  const totalCount = metricItems.length;
  const pendingCount = metricItems.filter(
    (d) => d.state.moderation === "PendingReview",
  ).length;
  const approvedCount = metricItems.filter(
    (d) => d.state.moderation === "Approved",
  ).length;
  const rejectedCount = metricItems.filter(
    (d) => d.state.moderation === "Rejected",
  ).length;
  const draftOnlyCount = metricItems.filter(
    (d) => d.state.moderation === "Draft",
  ).length;

  return (
    <Screen
      footer={<MemberNavigation current="/drafts" />}
      footerAppearance="navigation"
    >
      {/* DangSachHome Header */}
      <View
        style={{
          alignItems: "center",
          justifyContent: "center",
          marginTop: space.xs,
          marginBottom: 4,
          gap: 6,
        }}
      >
        <View
          style={{
            backgroundColor: stitchTokens.wine,
            paddingHorizontal: 18,
            paddingVertical: 7,
            borderRadius: 14,
            shadowColor: stitchTokens.wine,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 4,
            elevation: 3,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <WebBrandLogo scale={0.75} />
        </View>

        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 3,
            borderRadius: 10,
            backgroundColor: stitchTokens.terracottaSoft,
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
          }}
        >
          <Icon name="book" size={12} color={stitchTokens.wine} />
          <AppText
            kind="small"
            color={stitchTokens.wine}
            style={{
              fontSize: 10,
              fontWeight: "700",
              letterSpacing: 0.5,
            }}
          >
            TỦ SÁCH CỦA TÔI · QUẢN LÝ BÀI ĐĂNG
          </AppText>
        </View>


      </View>

      {/* Bento Stats & Quick Action Hero */}
      <View
        style={{
          backgroundColor: stitchTokens.warmIvory,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: stitchTokens.peachBorder,
          padding: space.md,
          gap: space.md,
          shadowColor: stitchTokens.black,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 2,
        }}
      >
        {/* 4-Stat Metric Row */}
        <View style={{ flexDirection: "row", gap: 6 }}>
          <View
            style={{
              flex: 1,
              backgroundColor: stitchTokens.parchment,
              paddingVertical: 8,
              paddingHorizontal: 2,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: stitchTokens.peachBorder,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AppText
              kind="heading"
              color={stitchTokens.wineDark}
              style={{ fontSize: 20, fontWeight: "700" }}
            >
              {totalCount}
            </AppText>
            <AppText
              kind="small"
              color={stitchTokens.roseBrown}
              style={{ fontSize: 10, marginTop: 2, fontWeight: "600" }}
            >
              Tổng ấn bản
            </AppText>
          </View>

          <View
            style={{
              flex: 1,
              backgroundColor: stitchTokens.parchment,
              paddingVertical: 8,
              paddingHorizontal: 2,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: stitchTokens.peachBorder,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: stitchTokens.goldMedal,
                }}
              />
              <AppText
                kind="heading"
                color={stitchTokens.wineDark}
                style={{ fontSize: 20, fontWeight: "700" }}
              >
                {pendingCount}
              </AppText>
            </View>
            <AppText
              kind="small"
              color={stitchTokens.roseBrown}
              style={{ fontSize: 10, marginTop: 2, fontWeight: "600" }}
            >
              Chờ duyệt
            </AppText>
          </View>

          <View
            style={{
              flex: 1,
              backgroundColor: stitchTokens.parchment,
              paddingVertical: 8,
              paddingHorizontal: 2,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: stitchTokens.peachBorder,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: stitchTokens.forestGreen,
                }}
              />
              <AppText
                kind="heading"
                color={stitchTokens.wineDark}
                style={{ fontSize: 20, fontWeight: "700" }}
              >
                {approvedCount}
              </AppText>
            </View>
            <AppText
              kind="small"
              color={stitchTokens.roseBrown}
              style={{ fontSize: 10, marginTop: 2, fontWeight: "600" }}
            >
              Đang bán
            </AppText>
          </View>

          <View
            style={{
              flex: 1,
              backgroundColor: stitchTokens.parchment,
              paddingVertical: 8,
              paddingHorizontal: 2,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: stitchTokens.peachBorder,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: stitchTokens.brickRed,
                }}
              />
              <AppText
                kind="heading"
                color={stitchTokens.brickRed}
                style={{ fontSize: 20, fontWeight: "700" }}
              >
                {rejectedCount}
              </AppText>
            </View>
            <AppText
              kind="small"
              color={stitchTokens.roseBrown}
              style={{ fontSize: 10, marginTop: 2, fontWeight: "600" }}
            >
              Cần sửa
            </AppText>
          </View>
        </View>

        {/* Quick Action CTA Button */}
        <Button
          title="+ Đăng Sách Mới Ngay"
          wine
          busy={create.isPending}
          disabled={
            state.status !== "authenticated" || state.user.status !== "ACTIVE"
          }
          onPress={() => {
            if (!create.isPending) create.mutate();
          }}
        />
      </View>

      {/* Status Filter Chips (Single Horizontal Scrollable Row) */}
      <View style={{ marginTop: space.xs }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            gap: 6,
            paddingVertical: 4,
          }}
          style={{ flexGrow: 0 }}
        >
          {[
            { value: "", label: "Tất cả", count: totalCount },
            { value: "Draft", label: "Bản nháp", count: draftOnlyCount },
            { value: "PendingReview", label: "Chờ duyệt", count: pendingCount },
            { value: "Rejected", label: "Cần sửa", count: rejectedCount },
            { value: "Approved", label: "Đang niêm yết", count: approvedCount },
          ].map((tab) => (
            <Chip
              key={tab.value}
              selected={filter === tab.value}
              title={`${tab.label} (${tab.count})`}
              wine
              onPress={() => setFilter(tab.value)}
            />
          ))}
        </ScrollView>
      </View>

      {create.error ? (
        <Notice tone="error">{photoError(create.error)}</Notice>
      ) : null}

      {drafts.isPending ? (
        <StatePanel loading title="Đang tải danh sách bài đăng…" />
      ) : null}

      {drafts.error ? (
        <>
          <Notice tone="error">{photoError(drafts.error)}</Notice>
          <Button
            title="Thử tải lại"
            wine
            secondary
            onPress={() => void drafts.refetch()}
          />
        </>
      ) : null}

      {drafts.data?.pages[0].items.length === 0 ? (
        <View
          style={{
            backgroundColor: stitchTokens.warmIvory,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: stitchTokens.peachBorder,
            padding: space.lg,
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icon name="book" size={32} color={stitchTokens.roseBrown} />
          <AppText kind="bold" color={stitchTokens.wineDark}>
            Chưa có bài đăng nào trong mục này
          </AppText>
          <AppText kind="small" color={stitchTokens.roseBrown} style={{ textAlign: "center" }}>
            Các ấn bản bạn tạo, gửi duyệt hoặc đang niêm yết sẽ xuất hiện tại đây.
          </AppText>
        </View>
      ) : null}

      {/* 2-Column Grid Layout for Book Postings */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          marginHorizontal: -4,
        }}
      >
        {drafts.data?.pages
          .flatMap((p) => p.items)
          .map((d) => {
            const modState = d.state.moderation;
            const isRejected = modState === "Rejected";

            const actionTitle = isRejected
              ? "Sửa bài"
              : modState === "PendingReview"
                ? "Chi tiết"
                : modState === "Draft"
                  ? "Hoàn thiện"
                  : "Xem sách";

            return (
              <View
                key={d.id}
                style={{
                  width: "50%",
                  padding: 4,
                }}
              >
                <BookCard
                  variant="management"
                  style={{ width: "100%", marginBottom: 0 }}
                  item={{
                    id: d.id,
                    moderation: d.state.moderation,
                    salePrice: d.currentRevision.content.salePrice,
                    mediaCount: d.currentRevision.content.mediaIds.length,
                  }}
                  photoNode={
                    d.currentRevision.content.mediaIds?.[0] ? (
                      <DraftCoverPhoto
                        listingId={d.id}
                        mediaId={d.currentRevision.content.mediaIds[0]}
                        label="Ảnh bìa"
                      />
                    ) : undefined
                  }
                  titleNode={
                    <BookIdentity id={d.currentRevision.content.bookId} compact />
                  }
                  actionTitle={actionTitle}
                  onActionPress={() => setSelected(d.id)}
                  onOpen={() => setSelected(d.id)}
                  onDelete={
                    !d.state.deletedAt
                      ? () =>
                          setDeleteTarget({
                            id: d.id,
                            version: d.version,
                          })
                      : undefined
                  }
                />
              </View>
            );
          })}
      </View>

      <ConfirmDialog
        visible={!!deleteTarget}
        title="Xóa bài đăng"
        message="Bạn có chắc chắn muốn xóa bài đăng này không? Thao tác này không thể hoàn tác."
        confirmLabel="Xóa"
        destructive
        busy={deleteBusy}
        error={deleteError}
        onCancel={() => {
          if (!deleteBusy) {
            setDeleteTarget(null);
            setDeleteError("");
          }
        }}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleteBusy(true);
          setDeleteError("");
          try {
            const intent = lifecycleIntent(
              deleteTarget.id,
              deleteTarget.version,
              "archive",
              Crypto.randomUUID(),
            );
            await executeLifecycle(client, intent);
            await cache.invalidateQueries({ queryKey: ["drafts"] });
            await cache.invalidateQueries({ queryKey: ["drafts-metrics"] });
            setDeleteTarget(null);
          } catch (e) {
            setDeleteError(photoError(e));
          } finally {
            setDeleteBusy(false);
          }
        }}
      />

      {drafts.hasNextPage ? (
        <Button
          title="Xem thêm bản nháp"
          wine
          secondary
          busy={drafts.isFetchingNextPage}
          onPress={() => void drafts.fetchNextPage()}
        />
      ) : null}
    </Screen>
  );
}
