import { useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import {
  ApiError,
  pendingReviewIntent,
  reviewStatusLabels,
  reviewTransactionsSchema,
  reviewTypeSchema,
  reviewTypes,
  sendReviewIntent,
  transactionReviewsSchema,
  type ReviewTransactionsPage,
  type ReviewType,
  type TransactionReview,
} from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  Button,
  Icon,
  Notice,
  StatePanel,
  TextField,
  WineHeader,
  colors,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";

const date = (s: string) =>
  new Date(s).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function StarDisplay({ rating }: { rating: number }) {
  return (
    <View style={styles.starRow} accessibilityLabel={`${rating} trên 5 sao`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon
          key={n}
          name="star"
          size={15}
          filled={n <= rating}
          color={n <= rating ? stitchTokens.goldDark : stitchTokens.borderWarm}
        />
      ))}
    </View>
  );
}

function ReviewCard({
  review,
  title,
  footerNote,
}: {
  review: TransactionReview;
  title: string;
  footerNote?: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <AppText style={styles.cardTitle}>{title}</AppText>
        <View style={styles.statusPill}>
          <AppText style={styles.statusPillText}>
            {reviewStatusLabels[review.status]}
          </AppText>
        </View>
      </View>

      <AppText style={styles.metaText}>{date(review.createdAt)}</AppText>

      {review.status === "Deleted" ? (
        <AppText style={styles.mutedBody}>
          Đã xóa công khai; không thể gửi lại đánh giá cho giao dịch này.
        </AppText>
      ) : (
        <>
          <View style={styles.ratingPillsRow}>
            <View style={styles.ratingPair}>
              <AppText style={styles.ratingLabel}>Đối tác</AppText>
              <StarDisplay rating={review.partnerRating} />
            </View>
            {review.bookRating !== null ? (
              <View style={styles.ratingPair}>
                <AppText style={styles.ratingLabel}>Sách nhận</AppText>
                <StarDisplay rating={review.bookRating} />
              </View>
            ) : null}
          </View>
          {review.comment ? (
            <AppText style={styles.commentBody}>{review.comment}</AppText>
          ) : null}
        </>
      )}

      {review.reply ? (
        <View style={styles.replyBox}>
          <AppText style={styles.replyTitle}>
            Phản hồi (
            {review.reply.status === "Approved"
              ? "Đã duyệt"
              : review.reply.status === "Pending"
                ? "Chờ duyệt"
                : "Đã ẩn"}
            )
          </AppText>
          <AppText style={styles.replyBody}>{review.reply.text}</AppText>
        </View>
      ) : null}

      {Boolean(footerNote) && (
        <AppText style={styles.footerNote}>{footerNote}</AppText>
      )}
    </View>
  );
}

export function ReviewsScreen() {
  const { type: raw, id } = useLocalSearchParams<{
    type?: string;
    id?: string;
  }>();
  const { state } = useSession();
  const insets = useSafeAreaInsets();
  const owner = state.status === "authenticated" ? state.user.id : undefined;
  const type = reviewTypeSchema.safeParse(raw).success
    ? (raw as ReviewType)
    : "Exchange";

  return (
    <View style={styles.screenRoot}>
      <WineHeader
        title={id ? "Đánh giá giao dịch" : "Đánh giá của tôi"}
        subtitle={
          id
            ? `Mã #${id.slice(0, 8).toUpperCase()}`
            : "Ghi nhận trải nghiệm giao dịch và chất lượng sách"
        }
        onBack={() =>
          id
            ? router.replace("/reviews")
            : router.canGoBack()
              ? router.back()
              : router.navigate("/account")
        }
        rightIcon={!id && owner ? "verified" : undefined}
        rightLabel="Xem hồ sơ uy tín của tôi"
        onRightPress={
          !id && owner
            ? () => router.push({ pathname: "/reputation", params: { id: owner } })
            : undefined
        }
      />

      {id ? (
        <ReviewPanel
          key={`${type}:${id}`}
          type={type}
          id={id}
          bottomInset={insets.bottom}
        />
      ) : (
        <ReviewList type={type} bottomInset={insets.bottom} />
      )}
    </View>
  );
}

function ReviewList({
  type,
  bottomInset,
}: {
  type: ReviewType;
  bottomInset: number;
}) {
  const { client, state } = useSession();
  const owner = state.status === "authenticated" ? state.user.id : undefined;

  const result = useInfiniteQuery({
    queryKey: ["reviewTransactions", owner, type],
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p: ReviewTransactionsPage) => p.nextCursor ?? undefined,
    queryFn: ({ pageParam }) =>
      client.request(
        `/me/review-transactions?type=${type}&limit=10${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        reviewTransactionsSchema,
      ),
    enabled: !!owner,
    retry: false,
  });

  if (!owner) {
    return (
      <View style={styles.centerWrap}>
        <StatePanel wine title="Đăng nhập để xem đánh giá" />
      </View>
    );
  }

  if (
    result.error instanceof ApiError &&
    [401, 403].includes(result.error.status)
  ) {
    return (
      <View style={styles.centerWrap}>
        <StatePanel
          wine
          title="Quyền truy cập đã thay đổi"
          message="Đăng nhập lại để xem giao dịch."
        />
      </View>
    );
  }

  const items = result.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingBottom: Math.max(bottomInset, 16) + 12 },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={result.isRefetching}
          onRefresh={() => void result.refetch()}
          tintColor={stitchTokens.wineDark}
        />
      }
    >
      {/* Profile Reputation Shortcut Strip */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Xem hồ sơ uy tín của tôi"
        onPress={() =>
          router.push({ pathname: "/reputation", params: { id: owner } })
        }
        style={({ pressed }) => [
          styles.reputationBanner,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.reputationIconWrap}>
          <Icon name="verified" size={18} color={stitchTokens.wine} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText style={styles.reputationBannerTitle}>
            Hồ sơ uy tín của tôi
          </AppText>
          <AppText style={styles.reputationBannerSub}>
            Xem điểm trung bình và đánh giá công khai từ đối tác
          </AppText>
        </View>
        <Icon name="chevronRight" size={16} color={stitchTokens.wine} />
      </Pressable>

      {/* Type Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsRow}
      >
        {reviewTypes.map(([t, label]) => {
          const selected = t === type;
          return (
            <Pressable
              key={t}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => router.setParams({ type: t })}
              style={({ pressed }) => [
                styles.tabPill,
                selected && styles.tabPillActive,
                pressed && styles.pressed,
              ]}
            >
              <AppText
                style={[
                  styles.tabPillText,
                  selected && styles.tabPillTextActive,
                ]}
              >
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      {result.isPending ? (
        <View style={styles.centerWrap}>
          <StatePanel wine loading title="Đang tải giao dịch…" />
        </View>
      ) : null}

      {result.isError ? (
        <StatePanel
          wine
          title="Chưa tải được giao dịch"
          action={{
            label: "Thử lại",
            onPress: () => void result.refetch(),
            busy: result.isFetching,
          }}
        />
      ) : null}

      {result.isSuccess && items.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <Icon name="star" size={26} color={stitchTokens.wine} />
          </View>
          <AppText style={styles.emptyTitle}>
            Chưa có giao dịch đủ điều kiện đánh giá
          </AppText>
          <AppText style={styles.emptySub}>
            Xác nhận đã nhận sách để viết đánh giá ngay mà không cần chờ hết 72
            giờ. Giao dịch đang xử lý sự cố sẽ tạm chưa mở đánh giá.
          </AppText>
        </View>
      ) : null}

      {items.map((item) => (
        <Pressable
          key={item.transactionId}
          accessibilityRole="button"
          accessibilityLabel={`Đánh giá giao dịch với ${item.partnerName}`}
          onPress={() =>
            router.push({
              pathname: "/reviews",
              params: { type: item.transactionType, id: item.transactionId },
            })
          }
          style={({ pressed }) => [styles.txnRowCard, pressed && styles.pressed]}
        >
          <View style={styles.partnerAvatar}>
            <AppText style={styles.partnerAvatarText}>
              {(item.partnerName.trim()[0] || "Đ").toUpperCase()}
            </AppText>
          </View>

          <View style={styles.txnRowInfo}>
            <View style={styles.txnRowHead}>
              <AppText numberOfLines={1} style={styles.txnPartnerName}>
                {item.partnerName}
              </AppText>
              <AppText style={styles.txnCode}>
                #{item.transactionId.slice(0, 8).toUpperCase()}
              </AppText>
            </View>
            <AppText numberOfLines={1} style={styles.txnDate}>
              {item.completedAt
                ? `Hoàn tất ${date(item.completedAt)}`
                : `Đã nhận sách ${date(item.reviewableAt!)}`}
            </AppText>
          </View>

          <View style={styles.txnActionCue}>
            <AppText style={styles.txnActionText}>Đánh giá</AppText>
            <Icon name="chevronRight" size={15} color={stitchTokens.wine} />
          </View>
        </Pressable>
      ))}

      {result.hasNextPage ? (
        <Button
          wine
          secondary
          title="Xem thêm giao dịch"
          busy={result.isFetchingNextPage}
          onPress={() => void result.fetchNextPage()}
        />
      ) : null}
    </ScrollView>
  );
}

function ReviewPanel({
  type,
  id,
  bottomInset,
}: {
  type: ReviewType;
  id: string;
  bottomInset: number;
}) {
  const { client, state } = useSession();
  const cache = useQueryClient();
  const owner = state.status === "authenticated" ? state.user.id : undefined;

  const result = useQuery({
    queryKey: ["transactionReviews", owner, type, id],
    queryFn: () =>
      client.request(
        `/transactions/${type}/${id}/reviews`,
        transactionReviewsSchema,
      ),
    enabled: !!owner,
    retry: false,
  });

  const scope = `reviews:${owner}:${type}:${id}`;
  const uncertain = pendingReviewIntent(client, scope);

  const [editor, setEditor] = useState<
    "create" | "edit" | "delete" | "reply" | null
  >(null);
  const [partner, setPartner] = useState(0);
  const [book, setBook] = useState(0);
  const [text, setText] = useState("");
  const [version, setVersion] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const running = useRef(false);

  async function send() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const data = result.data;
    const mine = data?.myReview;
    const peer = data?.partnerReview;
    const path =
      editor === "create"
        ? `/transactions/${type}/${id}/reviews`
        : `/transaction-reviews/${editor === "reply" ? peer?.id : mine?.id}/${editor}`;
    const body =
      editor === "delete"
        ? { expectedVersion: version }
        : editor === "reply"
          ? { expectedVersion: version, text }
          : {
              partnerRating: partner,
              ...(data?.bookRatingRequired ? { bookRating: book } : {}),
              comment: text,
              ...(editor === "edit"
                ? { expectedVersion: version, tags: mine?.tags ?? [] }
                : {}),
            };
    try {
      await sendReviewIntent(client, scope, path, body, () =>
        Crypto.randomUUID(),
      );
      setEditor(null);
      setNotice("Đã lưu theo xác nhận của máy chủ.");
      await cache.invalidateQueries({
        queryKey: ["transactionReviews", owner, type, id],
      });
      await cache.invalidateQueries({ queryKey: ["memberReputation"] });
    } catch (e) {
      setError(
        pendingReviewIntent(client, scope)
          ? "Chưa rõ kết quả. Thử lại yêu cầu đã gửi để giữ nguyên nội dung và mã yêu cầu."
          : e instanceof ApiError
            ? e.message
            : "Chưa gửi được. Bản nháp vẫn được giữ.",
      );
      if (e instanceof ApiError && e.status === 409) void result.refetch();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  if (!owner) {
    return (
      <View style={styles.centerWrap}>
        <StatePanel wine title="Đăng nhập để xem đánh giá" />
      </View>
    );
  }
  if (result.isPending) {
    return (
      <View style={styles.centerWrap}>
        <StatePanel wine loading title="Đang tải đánh giá…" />
      </View>
    );
  }
  if (result.isError) {
    return (
      <View style={styles.centerWrap}>
        <StatePanel
          wine
          title="Chưa tải được đánh giá"
          message="Không có quyền xem hoặc kết nối chưa sẵn sàng."
          action={{
            label: "Thử lại",
            onPress: () => void result.refetch(),
            busy: result.isFetching,
          }}
        />
      </View>
    );
  }

  const data = result.data;
  const mine = data.myReview;
  const peer = data.partnerReview;

  function open(mode: typeof editor) {
    setEditor(mode);
    setPartner(mode === "edit" ? (mine?.partnerRating ?? 0) : 0);
    setBook(mode === "edit" ? (mine?.bookRating ?? 0) : 0);
    setText(mode === "edit" ? (mine?.comment ?? "") : "");
    setVersion((mode === "reply" ? peer : mine)?.version);
    setError("");
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingBottom: Math.max(bottomInset, 16) + 12 },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={result.isRefetching}
          onRefresh={() => void result.refetch()}
          tintColor={stitchTokens.wineDark}
        />
      }
    >
      <View style={styles.ruleStrip}>
        <Icon name="info" size={16} color={stitchTokens.wine} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText style={styles.ruleText}>
            Bạn có 48 giờ từ lần gửi đầu để sửa hoặc xóa. Đánh giá chỉ công bố
            khi hết quyền sửa của hai bên và đủ điều kiện.
          </AppText>
          {data.deadline ? (
            <AppText style={styles.deadlineText}>
              Hạn gửi theo máy chủ: {date(data.deadline)}
            </AppText>
          ) : null}
        </View>
      </View>

      {data.awaitingCompletion ? (
        <Notice>
          Đánh giá đang riêng tư trong thời gian kiểm tra. Tiền vẫn giữ theo quy
          trình; chỉ công bố và tính điểm khi giao dịch hoàn tất và đủ điều kiện.
        </Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      {uncertain ? (
        <Button
          wine
          title="Thử lại yêu cầu đã gửi"
          busy={busy}
          onPress={() => void send()}
        />
      ) : (
        <>
          {mine ? (
            <ReviewCard
              review={mine}
              title="Đánh giá của bạn"
              footerNote={
                `Hạn sửa/xóa: ${date(mine.editDeadline)}` +
                (mine.legacyDisclosed
                  ? " · Bản cũ đã hiển thị, đã khóa sửa."
                  : "") +
                (mine.evidenceHeld ? " · Đang giữ bằng chứng." : "")
              }
            />
          ) : null}

          {peer ? (
            <ReviewCard review={peer} title="Đánh giá từ đối tác" />
          ) : (
            <View style={styles.pendingPeerCard}>
              <Icon name="clock" size={16} color={colors.muted} />
              <AppText style={styles.pendingPeerText}>
                Chưa có đánh giá từ đối tác được công bố.
              </AppText>
            </View>
          )}

          {!editor ? (
            <View style={styles.actionStack}>
              {data.canReview ? (
                <Button
                  wine
                  title="Viết đánh giá"
                  onPress={() => open("create")}
                />
              ) : null}
              {data.canEdit ? (
                <Button
                  wine
                  secondary
                  title="Sửa đánh giá"
                  onPress={() => open("edit")}
                />
              ) : null}
              {data.canReply ? (
                <Button
                  wine
                  secondary
                  title="Phản hồi đánh giá"
                  onPress={() => open("reply")}
                />
              ) : null}
              {data.canDelete ? (
                <Button
                  wine
                  secondary
                  title="Xóa đánh giá công khai"
                  onPress={() => open("delete")}
                />
              ) : null}
            </View>
          ) : (
            <View style={styles.editorCard}>
              <AppText style={styles.editorHeading}>
                {editor === "delete"
                  ? "Xác nhận xóa đánh giá"
                  : editor === "reply"
                    ? "Phản hồi đánh giá đối tác"
                    : editor === "edit"
                      ? "Chỉnh sửa đánh giá"
                      : "Viết đánh giá mới"}
              </AppText>

              {editor === "delete" ? (
                <AppText style={styles.mutedBody}>
                  Xác nhận xóa công khai? Lịch sử vẫn giữ và bạn không thể gửi
                  lại cho giao dịch này.
                </AppText>
              ) : (
                <>
                  {editor !== "reply" ? (
                    <>
                      <StarScorePicker
                        label="Điểm đối tác"
                        value={partner}
                        set={setPartner}
                        disabled={busy}
                      />
                      {data.bookRatingRequired ? (
                        <StarScorePicker
                          label="Điểm sách nhận"
                          value={book}
                          set={setBook}
                          disabled={busy}
                        />
                      ) : null}
                    </>
                  ) : null}

                  <TextField
                    label={
                      editor === "reply"
                        ? "Nội dung phản hồi"
                        : "Nhận xét (không bắt buộc)"
                    }
                    value={text}
                    onChangeText={setText}
                    multiline
                    maxLength={1000}
                    editable={!busy}
                    hint={`${text.length}/1.000 ký tự. Không đưa thông tin liên hệ hoặc chứng cứ riêng vào nội dung công khai.`}
                  />
                </>
              )}

              {version !== undefined &&
              version !== (editor === "reply" ? peer : mine)?.version ? (
                <Button
                  wine
                  secondary
                  title="Dùng phiên bản hiện tại, giữ bản nháp"
                  onPress={() =>
                    setVersion((editor === "reply" ? peer : mine)?.version)
                  }
                />
              ) : null}

              <Button
                wine
                title={
                  editor === "delete"
                    ? "Xác nhận xóa"
                    : editor === "reply"
                      ? "Gửi phản hồi để kiểm duyệt"
                      : "Lưu đánh giá"
                }
                busy={busy}
                disabled={
                  editor === "reply"
                    ? !text.trim()
                    : editor !== "delete" &&
                      (!partner || (data.bookRatingRequired && !book))
                }
                onPress={() => void send()}
              />
              <Button
                wine
                secondary
                title="Đóng bản nháp"
                disabled={busy}
                onPress={() => setEditor(null)}
              />
            </View>
          )}
        </>
      )}

      <View style={styles.bottomLinksRow}>
        <View style={{ flex: 1 }}>
          <Button
            wine
            secondary
            title="Hồ sơ đối tác"
            disabled={busy}
            onPress={() =>
              router.push({
                pathname: "/reputation",
                params: { id: data.partnerId },
              })
            }
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            wine
            secondary
            title="Tải lại"
            busy={result.isFetching}
            onPress={() => void result.refetch()}
          />
        </View>
      </View>
    </ScrollView>
  );
}

function StarScorePicker({
  label,
  value,
  set,
  disabled,
}: {
  label: string;
  value: number;
  set: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.pickerBlock}>
      <View style={styles.pickerHeader}>
        <AppText style={styles.pickerLabel}>{label}</AppText>
        <AppText style={styles.pickerValue}>
          {value > 0 ? `${value}/5 sao` : "Chưa chọn"}
        </AppText>
      </View>
      <View style={styles.starsPickerRow}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= value;
          return (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityLabel={`${label} ${n} trên 5 sao`}
              accessibilityState={{ checked: value === n }}
              disabled={disabled}
              onPress={() => set(n)}
              style={({ pressed }) => [
                styles.starBtn,
                active && styles.starBtnActive,
                pressed && styles.pressed,
              ]}
            >
              <Icon
                name="star"
                size={24}
                filled={active}
                color={active ? stitchTokens.goldDark : stitchTokens.borderWarm}
              />
            </Pressable>
          );
        })}
      </View>
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
    paddingTop: space.md,
    gap: 12,
    flexGrow: 1,
  },
  centerWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.section,
  },
  reputationBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    padding: 14,
  },
  reputationIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
  },
  reputationBannerTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  reputationBannerSub: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    includeFontPadding: false,
  },
  tabsScroll: {
    flexGrow: 0,
  },
  tabsRow: {
    gap: 8,
    paddingVertical: 2,
    alignItems: "center",
  },
  tabPill: {
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  tabPillActive: {
    backgroundColor: stitchTokens.wineDark,
    borderColor: stitchTokens.wineDark,
  },
  tabPillText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
    includeFontPadding: false,
  },
  tabPillTextActive: {
    color: stitchTokens.white,
  },
  txnRowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 14,
  },
  partnerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
  },
  partnerAvatarText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  txnRowInfo: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  txnRowHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  txnPartnerName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: colors.ink,
    flexShrink: 1,
    includeFontPadding: false,
  },
  txnCode: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: stitchTokens.wine,
    includeFontPadding: false,
  },
  txnDate: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    includeFontPadding: false,
  },
  txnActionCue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  txnActionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: stitchTokens.wine,
    includeFontPadding: false,
  },
  ruleStrip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    padding: 12,
  },
  ruleText: {
    fontSize: 12,
    lineHeight: 18,
    color: stitchTokens.deepCocoa,
  },
  deadlineText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  card: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 14,
    gap: 8,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: colors.ink,
    includeFontPadding: false,
  },
  statusPill: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusPillText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
    includeFontPadding: false,
  },
  metaText: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
    includeFontPadding: false,
  },
  mutedBody: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
  ratingPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  ratingPair: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: stitchTokens.parchment,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  ratingLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
    includeFontPadding: false,
  },
  starRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  commentBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.ink,
  },
  replyBox: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    padding: 10,
    gap: 4,
  },
  replyTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: stitchTokens.wine,
    includeFontPadding: false,
  },
  replyBody: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },
  footerNote: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.warmBorder,
  },
  pendingPeerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: stitchTokens.parchment,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    padding: 12,
  },
  pendingPeerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  actionStack: {
    gap: 10,
  },
  editorCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    padding: 16,
    gap: 14,
  },
  editorHeading: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  pickerBlock: {
    gap: 8,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerLabel: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
    color: colors.ink,
    includeFontPadding: false,
  },
  pickerValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: stitchTokens.wine,
    includeFontPadding: false,
  },
  starsPickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  starBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  starBtnActive: {
    backgroundColor: stitchTokens.goldLight,
    borderColor: stitchTokens.goldDark,
  },
  bottomLinksRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  emptyCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
    gap: 8,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
  },
  emptySub: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    textAlign: "center",
  },
  pressed: {
    opacity: 0.78,
  },
});
