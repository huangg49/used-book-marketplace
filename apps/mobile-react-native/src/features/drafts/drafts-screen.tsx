import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
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
  Icon,
  Notice,
  Screen,
  StatePanel,
  TopNavbar,
  WineHeader,
  space,
  stitchTokens,
} from "../../core/ui";
import { draftPage, emptyContent, privateDraft, receipt, type ListingChannel } from "./contracts";
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
import { useTransactionLive } from "../../core/hooks/use-transaction-live";
import { myIntakes, type MyIntake } from "../auctions/contracts";
import { SendToAuctionActiveIntakes } from "../auctions/send-to-auction-components";
import { ScheduleAuctionSheet } from "../auctions/components";

const filters = [
  { value: "", label: "Tất cả" },
  { value: "Draft", label: "Bản nháp" },
  { value: "PendingReview", label: "Chờ duyệt" },
  { value: "Rejected", label: "Cần sửa" },
  { value: "Approved", label: "Đã duyệt" },
] as const;

const channels = [
  { value: "Marketplace", label: "Bài mua/đổi" },
  { value: "Auction", label: "Bài đấu giá" },
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
  const [channel, setChannel] = useState<ListingChannel>("Marketplace");
  const [filter, setFilter] = useState("");
  const [selection, setSelected] = useState<string | null>(null);
  const selected = selection ?? linkedId;
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    version: number;
    bundleTitle?: string | null;
    isApproved: boolean;
  } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [publishTarget, setPublishTarget] = useState<MyIntake | null>(null);
  const createKey = useRef<string | null>(null);

  const inboxLive = useTransactionLive(
    "inbox",
    ownerId ?? "",
    foreground && !!ownerId,
    () => {
      void cache.invalidateQueries({ queryKey: ["drafts", ownerId] });
      if (selected) {
        void cache.invalidateQueries({ queryKey: ["draft", ownerId, selected] });
      }
    },
  );

  const drafts = useInfiniteQuery({
    queryKey: ["drafts", ownerId, channel, filter],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      client.request(
        `/me/listings?channel=${channel}&limit=20` +
          (filter ? "&moderation=" + filter : "") +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""),
        draftPage,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: foreground,
    refetchInterval: foreground ? (inboxLive ? false : 5_000) : false,
  });

  const auctionIntakes = useQuery({
    queryKey: ["my-auction-intakes", ownerId],
    queryFn: () => client.request("/me/auction-intakes", myIntakes),
    enabled: foreground && !!ownerId,
    refetchInterval: foreground ? (inboxLive ? false : 8_000) : false,
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
      setChannel("Marketplace");
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
        backLabel="Về sách của tôi"
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
  const viewingAuction = channel === "Auction";
  const activeIntakes = (auctionIntakes.data?.items ?? []).filter(
    (i) => i.state !== "Cancelled" && i.state !== "Reclaimed",
  );
  const activeIntakeListingIds = new Set(activeIntakes.map((i) => i.listingId));
  const visibleItems =
    viewingAuction && !filter
      ? items.filter((listing) => !activeIntakeListingIds.has(listing.id))
      : items;
  const showAuctionIntakes = viewingAuction && !filter && activeIntakes.length > 0;
  const isAuctionLoading =
    viewingAuction && !filter && drafts.isPending && auctionIntakes.isPending;
  const isEmptyList = viewingAuction && !filter
    ? drafts.isSuccess && !auctionIntakes.isPending && activeIntakes.length === 0 && visibleItems.length === 0
    : drafts.isSuccess && visibleItems.length === 0;

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
          <View style={styles.introCopy}>
            <AppText accessibilityRole="header" kind="heading" color={stitchTokens.wineDark} style={styles.heading}>
              Bài đăng của tôi
            </AppText>
            <AppText kind="small" color={stitchTokens.brownMuted}>
              {viewingAuction ? "Sách đăng ký gửi kiểm định đấu giá" : "Quản lý sách bán và trao đổi"}
            </AppText>
          </View>
          <Button
            title={viewingAuction ? "Gửi đấu giá" : "+ Đăng sách"}
            wine
            busy={create.isPending}
            disabled={state.status !== "authenticated" || state.user.status !== "ACTIVE"}
            onPress={() => {
              if (viewingAuction) {
                router.push("/send-to-auction");
                return;
              }
              if (!create.isPending) create.mutate();
            }}
          />
        </View>

        <View style={styles.segmentedBar} accessibilityRole="tablist">
          {channels.map((tab) => {
            const active = channel === tab.value;
            return (
              <Pressable
                key={tab.value}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setChannel(tab.value);
                  setFilter("");
                }}
                style={({ pressed }) => [
                  styles.segmentBtn,
                  active && styles.segmentBtnActive,
                  pressed && !active && styles.segmentPressed,
                ]}
              >
                <AppText
                  kind="bold"
                  style={[styles.segmentText, active && styles.segmentTextActive]}
                >
                  {tab.value === "Auction" && activeIntakes.length > 0
                    ? `${tab.label} (${activeIntakes.length})`
                    : tab.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.quotaBanner}>
          <Icon name="info" size={14} color={stitchTokens.brownMuted} />
          <AppText kind="small" color={stitchTokens.deepCocoa} style={styles.quotaText}>
            Hạn mức chung là 5 bài đang hiển thị hoặc chờ duyệt.
          </AppText>
        </View>

        <ScrollView
          key={channel}
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
        {(!viewingAuction && drafts.isPending) || isAuctionLoading ? (
          <StatePanel wine loading title="Đang tải bài đăng…" />
        ) : null}
        {drafts.error && !drafts.isFetchNextPageError ? (
          <StatePanel
            wine
            title="Chưa tải được bài đăng"
            message={photoError(drafts.error)}
            action={{ label: "Thử tải lại", onPress: () => void drafts.refetch() }}
          />
        ) : null}
        {isEmptyList ? (
          <StatePanel
            wine
            title={
              filter
                ? "Chưa có bài trong mục này"
                : viewingAuction
                  ? "Chưa có bài đấu giá nào"
                  : "Bạn chưa có bài đăng"
            }
            message={
              filter
                ? undefined
                : viewingAuction
                  ? "Chọn sách đã duyệt hoặc tạo bài mới để gửi kiểm định tại điểm TP.HCM."
                  : "Tạo bản nháp đầu tiên để bán hoặc trao đổi sách trên Lật lại."
            }
            icon="book"
            action={
              filter
                ? { label: "Xem tất cả", onPress: () => setFilter("") }
                : viewingAuction
                  ? { label: "Gửi sách đấu giá", onPress: () => router.push("/send-to-auction") }
                  : {
                      label: "Đăng sách mới",
                      onPress: () => {
                        if (!create.isPending) create.mutate();
                      },
                    }
            }
          />
        ) : null}

        {showAuctionIntakes ? (
          <View style={styles.auctionSection}>
            <View style={styles.sectionHeader}>
              <AppText kind="bold" color={stitchTokens.wineDark} style={styles.sectionTitle}>
                Sách đang gửi đấu giá ({activeIntakes.length})
              </AppText>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: "/my-auctions", params: { view: "intakes" } })}
                style={({ pressed }) => [styles.sectionLink, pressed && { opacity: 0.7 }]}
              >
                <AppText kind="bold" style={styles.sectionLinkText}>Phiên của tôi</AppText>
                <Icon name="chevronRight" size={14} color={stitchTokens.wine} />
              </Pressable>
            </View>
            <SendToAuctionActiveIntakes
              intakes={activeIntakes}
              isLoading={auctionIntakes.isPending}
              onPublish={(item) => setPublishTarget(item)}
              onWithdraw={(item) => router.push({ pathname: "/send-to-auction", params: { intakeId: item.id } })}
              onOpenAuction={(id) => router.push({ pathname: "/auction", params: { id } })}
              onSubmitEvidence={(item) => router.push({ pathname: "/send-to-auction", params: { intakeId: item.id } })}
              evidenceTextMap={{}}
              onChangeEvidenceText={() => {}}
            />
          </View>
        ) : null}

        {showAuctionIntakes && visibleItems.length > 0 ? (
          <AppText kind="bold" color={stitchTokens.wineDark} style={styles.sectionTitle}>
            Bản nháp kênh đấu giá ({visibleItems.length})
          </AppText>
        ) : null}

        {visibleItems.map((listing, index) => (
          <DraftListingRow
            key={listing.id}
            listing={listing}
            position={index + 1}
            onOpen={() => setSelected(listing.id)}
            onDelete={manageableListing(listing) ? () => setDeleteTarget({
              id: listing.id,
              version: listing.version,
              bundleTitle: listing.currentRevision.content.bundle?.title,
              isApproved: listing.state.moderation === "Approved",
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
      <ScheduleAuctionSheet
        key={publishTarget ? `${publishTarget.id}:${publishTarget.version}` : "none"}
        visible={!!publishTarget}
        title={publishTarget?.title ?? ""}
        target={
          publishTarget
            ? {
                kind: "publish",
                intakeId: publishTarget.id,
                version: publishTarget.version,
              }
            : null
        }
        onClose={() => setPublishTarget(null)}
        onDone={() => {
          void cache.invalidateQueries({ queryKey: ["my-auction-intakes", ownerId] });
          void cache.invalidateQueries({ queryKey: ["my-auctions", ownerId] });
          void cache.invalidateQueries({ queryKey: ["public-auctions"] });
        }}
      />
      <ConfirmDialog
        visible={!!deleteTarget}
        title={
          deleteTarget?.bundleTitle
            ? `Xóa bộ “${deleteTarget.bundleTitle}”?`
            : "Xóa bài đăng này?"
        }
        message={
          deleteTarget?.isApproved
            ? "Bài đăng đang hiển thị công khai trên sàn sẽ bị gỡ khỏi tìm kiếm và danh sách yêu thích của người đọc khác. Thao tác này không thể hoàn tác."
            : "Bản nháp và toàn bộ thông tin đã soạn sẽ bị xóa vĩnh viễn. Thao tác này không thể hoàn tác."
        }
        confirmLabel="Xóa bài đăng"
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
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  introCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  heading: {
    fontSize: 22,
    lineHeight: 28,
  },
  segmentedBar: {
    flexDirection: "row",
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  segmentBtnActive: {
    backgroundColor: stitchTokens.wine,
  },
  segmentPressed: {
    backgroundColor: stitchTokens.parchment,
  },
  segmentText: {
    fontSize: 13.5,
    color: stitchTokens.brownMuted,
    textAlign: "center",
  },
  segmentTextActive: {
    color: stitchTokens.gold,
  },
  quotaBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: stitchTokens.parchment,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quotaText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
  },
  filters: {
    gap: space.xs,
    paddingVertical: 2,
  },
  auctionSection: {
    gap: space.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  sectionLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 4,
  },
  sectionLinkText: {
    fontSize: 13,
    color: stitchTokens.wine,
  },
});
