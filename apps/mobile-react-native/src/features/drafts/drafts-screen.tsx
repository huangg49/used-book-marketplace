import { useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
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
  Button,
  Chip,
  ConfirmDialog,
  Notice,
  Screen,
  StatePanel,
  TopNavbar,
  WineHeader,
  space,
  stitchTokens,
} from "../../core/ui";
import { draftPage, emptyContent, privateDraft, receipt } from "./contracts";
import { DraftEditor } from "./draft-editor";
import { photoError, useForeground } from "./draft-media";
import { DraftListingRow } from "./draft-listing-row";
import { manageableListing } from "./listing-form";
import { executeLifecycle, lifecycleIntent } from "./lifecycle-command";
import { MemberNavigation } from "../navigation/member-navigation";
import { useLocalSearchParams, router } from "expo-router";
import { ApiError } from "@used-books/session-client";
import { useNotifications } from "../notifications/notifications-model";
import { HomeNotificationsModal } from "../shelf/home-components/home-notifications-modal";

const filters = [
  { value: "", label: "Tất cả" },
  { value: "Draft", label: "Bản nháp" },
  { value: "PendingReview", label: "Chờ duyệt" },
  { value: "Rejected", label: "Cần sửa" },
  { value: "Approved", label: "Đã duyệt" },
] as const;

export function DraftsScreen() {
  const { client, state } = useSession(),
    cache = useQueryClient();
  const foreground = useForeground();
  const params = useLocalSearchParams<{ listingId?: string }>();
  const linkedId =
    typeof params.listingId === "string" ? params.listingId : null;
  const ownerId = state.status === "authenticated" ? state.user.id : null;
  const notifications = useNotifications(client, !!ownerId);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [selection, setSelected] = useState<string | null>(null);
  const selected = selection ?? linkedId;
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    version: number;
  } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const createKey = useRef<string | null>(null);

  const drafts = useInfiniteQuery({
    queryKey: ["drafts", ownerId, filter],
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
    refetchInterval: foreground ? 5_000 : false,
  });

  const detail = useQuery({
    queryKey: ["draft", ownerId, selected],
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
      setFilter("");
      setSelected(r.entityId);
      await cache.invalidateQueries({ queryKey: ["drafts"] });
    },
  });

  const inaccessible =
    detail.error instanceof ApiError &&
    [401, 403, 404].includes(detail.error.status);
  function closeListing() {
    setSelected(null);
    if (linkedId) router.replace("/drafts");
    void cache.invalidateQueries({ queryKey: ["drafts"] });
    void cache.removeQueries({ queryKey: ["draft", ownerId, selected] });
  }

  if (selected && detail.data && !inaccessible)
    return (
      <DraftEditor
        key={selected}
        initial={detail.data}
        onBack={closeListing}
      />
    );

  if (selected)
    return (
      <Screen
        headerExtendsToStatusBar
        canvasColor={stitchTokens.creamBg}
        header={<WineHeader title="Bài đăng" backLabel="Về sách của tôi" onBack={closeListing} />}
      >
        <StatePanel
          wine
          loading={detail.isPending}
          title={detail.error ? "Chưa mở được bài đăng" : "Đang mở bài đăng…"}
          action={
            detail.error
              ? { label: "Thử lại", onPress: () => void detail.refetch() }
              : undefined
          }
        />
      </Screen>
    );

  const items = drafts.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Screen
      appearance="home"
      header={
        <TopNavbar
          subtitle="Đăng sách"
          notificationCount={notifications.data?.unreadCount ?? 0}
          onNotificationsPress={() => setNotificationsOpen(true)}
          onMessagesPress={() => router.push("/chat-inbox")}
        />
      }
      footer={<MemberNavigation current="/drafts" />}
      footerAppearance="navigation"
    >
      <View style={styles.content}>
        <View style={styles.intro}>
          <AppText accessibilityRole="header" kind="heading" color={stitchTokens.wineDark} style={styles.heading}>
            Bài đăng của tôi
          </AppText>
          <Button
            title="Đăng sách mới"
            wine
            busy={create.isPending}
            disabled={state.status !== "authenticated" || state.user.status !== "ACTIVE"}
            onPress={() => {
              if (!create.isPending) create.mutate();
            }}
          />
        </View>

        <ScrollView
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {filters.map((tab) => (
            <Chip
              key={tab.value}
              selected={filter === tab.value}
              title={tab.label}
              compact
              wine
              onPress={() => setFilter(tab.value)}
            />
          ))}
        </ScrollView>

        {create.error ? <Notice tone="error">{photoError(create.error)}</Notice> : null}
        {drafts.isPending ? <StatePanel wine loading title="Đang tải bài đăng…" /> : null}
        {drafts.error && !drafts.isFetchNextPageError ? (
          <StatePanel
            wine
            title="Chưa tải được bài đăng"
            message={photoError(drafts.error)}
            action={{ label: "Thử tải lại", onPress: () => void drafts.refetch() }}
          />
        ) : null}
        {drafts.isSuccess && items.length === 0 ? (
          <StatePanel
            wine
            title={filter ? "Chưa có bài trong mục này" : "Bạn chưa có bài đăng"}
            message={filter ? undefined : "Chọn Đăng sách mới để tạo bản nháp đầu tiên."}
            icon="book"
            action={filter ? { label: "Xem tất cả", onPress: () => setFilter("") } : undefined}
          />
        ) : null}

        {items.map((listing, index) => (
          <DraftListingRow
            key={listing.id}
            listing={listing}
            position={index + 1}
            onOpen={() => setSelected(listing.id)}
            onDelete={manageableListing(listing) ? () => setDeleteTarget({
              id: listing.id,
              version: listing.version,
            }) : undefined}
          />
        ))}

        {drafts.isFetchNextPageError ? (
          <Notice tone="error">Chưa tải được trang tiếp theo. Danh sách hiện tại vẫn có thể xem.</Notice>
        ) : null}
        {drafts.hasNextPage ? (
          <Button
            title={drafts.isFetchNextPageError ? "Thử tải trang tiếp theo" : "Xem thêm bài đăng"}
            wine
            secondary
            busy={drafts.isFetchingNextPage}
            onPress={() => void drafts.fetchNextPage()}
          />
        ) : null}
      </View>

      <HomeNotificationsModal visible={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
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
            setDeleteTarget(null);
          } catch (e) {
            setDeleteError(photoError(e));
          } finally {
            setDeleteBusy(false);
          }
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    padding: space.lg,
    gap: space.md,
  },
  intro: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  heading: {
    flexGrow: 1,
    flexShrink: 1,
    fontSize: 24,
    lineHeight: 32,
  },
  filters: {
    gap: space.xs,
    paddingVertical: space.xs,
  },
});
