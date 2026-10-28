import { useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import {
  reviewTypes,
  reviewTypeSchema,
  reviewTransactionsSchema,
  transactionReviewsSchema,
  reviewStatusLabels,
  sendReviewIntent,
  pendingReviewIntent,
  ApiError,
  type ReviewType,
  type TransactionReview,
  type ReviewTransactionsPage,
} from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  BackAction,
  Button,
  Chip,
  Notice,
  Screen,
  StatePanel,
  TextField,
  space,
} from "../../core/ui";
const date = (s: string) => new Date(s).toLocaleString("vi-VN");
function ReviewText({
  review,
  title,
}: {
  review: TransactionReview;
  title: string;
}) {
  return (
    <View style={{ gap: space.sm, paddingVertical: space.lg }}>
      <AppText kind="bold">{title}</AppText>
      <AppText kind="small">
        {reviewStatusLabels[review.status]} · {date(review.createdAt)}
      </AppText>
      {review.status === "Deleted" ? (
        <AppText>
          Đã xóa công khai; không thể gửi lại đánh giá cho giao dịch này.
        </AppText>
      ) : (
        <>
          <AppText>
            Đối tác: {review.partnerRating}/5
            {review.bookRating !== null
              ? ` · Sách nhận: ${review.bookRating}/5`
              : ""}
          </AppText>
          {review.comment ? <AppText>{review.comment}</AppText> : null}
        </>
      )}
      {review.reply ? (
        <>
          <AppText kind="bold">
            Phản hồi (
            {review.reply.status === "Approved"
              ? "Đã duyệt"
              : review.reply.status === "Pending"
                ? "Chờ duyệt"
                : "Đã ẩn"}
            )
          </AppText>
          <AppText>{review.reply.text}</AppText>
        </>
      ) : null}
    </View>
  );
}
export function ReviewsScreen() {
  const { type: raw, id } = useLocalSearchParams<{
    type?: string;
    id?: string;
  }>();
  const type = reviewTypeSchema.safeParse(raw).success
    ? (raw as ReviewType)
    : "Exchange";
  return (
    <Screen
      header={
        <BackAction
          title="Về tài khoản"
          onPress={() => router.navigate("/account")}
        />
      }
    >
      <AppText kind="title" accessibilityRole="header">
        Đánh giá của tôi
      </AppText>
      {id ? (
        <ReviewPanel key={`${type}:${id}`} type={type} id={id} />
      ) : (
        <ReviewList type={type} />
      )}
    </Screen>
  );
}
function ReviewList({ type }: { type: ReviewType }) {
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
  if (!owner) return <StatePanel title="Đăng nhập để xem đánh giá" />;
  if (
    result.error instanceof ApiError &&
    [401, 403].includes(result.error.status)
  )
    return (
      <StatePanel
        wine
        title="Quyền truy cập đã thay đổi"
        message="Đăng nhập lại để xem giao dịch."
      />
    );
  return (
    <>
      <Button
        wine
        secondary
        title="Xem hồ sơ uy tín của tôi"
        onPress={() =>
          router.push({ pathname: "/reputation", params: { id: owner } })
        }
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {reviewTypes.map(([t, label]) => (
          <Chip
            wine
            key={t}
            title={label}
            selected={t === type}
            onPress={() => router.setParams({ type: t })}
          />
        ))}
      </View>
      {result.isPending ? (
        <StatePanel wine loading title="Đang tải giao dịch…" />
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
      {result.isSuccess && result.data.pages[0].items.length === 0 ? (
        <StatePanel
          wine
          title="Chưa có giao dịch hoàn tất"
          message="Giao dịch đang giao nhận hoặc xử lý sự cố chưa đủ điều kiện đánh giá."
        />
      ) : null}
      {result.data?.pages
        .flatMap((p) => p.items)
        .map((item) => (
          <Button
            wine
            secondary
            key={item.transactionId}
            title={`Đánh giá giao dịch với ${item.partnerName} · Mã ${item.transactionId.slice(0, 8).toUpperCase()} · Hoàn tất ${date(item.completedAt)}`}
            onPress={() =>
              router.push({
                pathname: "/reviews",
                params: { type: item.transactionType, id: item.transactionId },
              })
            }
          />
        ))}
      {result.hasNextPage ? (
        <Button
          wine
          title="Xem thêm giao dịch"
          busy={result.isFetchingNextPage}
          onPress={() => void result.fetchNextPage()}
        />
      ) : null}
    </>
  );
}
function ReviewPanel({ type, id }: { type: ReviewType; id: string }) {
  const { client, state } = useSession(),
    cache = useQueryClient(),
    owner = state.status === "authenticated" ? state.user.id : undefined;
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
  const scope = `reviews:${owner}:${type}:${id}`,
    uncertain = pendingReviewIntent(client, scope);
  const [editor, setEditor] = useState<
      "create" | "edit" | "delete" | "reply" | null
    >(null),
    [partner, setPartner] = useState(0),
    [book, setBook] = useState(0),
    [text, setText] = useState(""),
    [version, setVersion] = useState<number>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    running = useRef(false);
  async function send() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const data = result.data,
      mine = data?.myReview,
      peer = data?.partnerReview;
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
  if (!owner) return <StatePanel title="Đăng nhập để xem đánh giá" />;
  if (result.isPending)
    return <StatePanel wine loading title="Đang tải đánh giá…" />;
  if (result.isError)
    return (
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
    );
  const data = result.data,
    mine = data.myReview,
    peer = data.partnerReview;
  function open(mode: typeof editor) {
    setEditor(mode);
    setPartner(mode === "edit" ? (mine?.partnerRating ?? 0) : 0);
    setBook(mode === "edit" ? (mine?.bookRating ?? 0) : 0);
    setText(mode === "edit" ? (mine?.comment ?? "") : "");
    setVersion((mode === "reply" ? peer : mine)?.version);
    setError("");
  }
  return (
    <>
      <AppText>
        Bạn có 48 giờ từ lần gửi đầu để sửa/xóa. Chỉ công bố khi hết quyền sửa
        của hai bên và đủ điều kiện; không công bố ngay khi đối phương gửi.
      </AppText>
      {data.deadline ? (
        <AppText kind="small">
          Hạn gửi theo máy chủ: {date(data.deadline)}
        </AppText>
      ) : null}
      {error ? <Notice error>{error}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}
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
            <>
              <ReviewText review={mine} title="Đánh giá của bạn" />
              <AppText kind="small">
                Hạn sửa/xóa: {date(mine.editDeadline)}
                {mine.legacyDisclosed
                  ? " · Bản cũ đã hiển thị, đã khóa sửa."
                  : ""}
                {mine.evidenceHeld ? " · Đang giữ bằng chứng." : ""}
              </AppText>
            </>
          ) : null}
          {peer ? (
            <ReviewText review={peer} title="Đánh giá từ đối tác" />
          ) : (
            <AppText>Chưa có đánh giá đối tác được công bố.</AppText>
          )}
          {!editor ? (
            <>
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
              {data.canDelete ? (
                <Button
                  wine
                  secondary
                  title="Xóa đánh giá công khai"
                  onPress={() => open("delete")}
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
            </>
          ) : (
            <View style={{ gap: space.lg }}>
              {editor === "delete" ? (
                <AppText>
                  Xác nhận xóa công khai? Lịch sử vẫn giữ và bạn không thể gửi
                  lại cho giao dịch này.
                </AppText>
              ) : (
                <>
                  {editor !== "reply" ? (
                    <>
                      <Score
                        label="Điểm đối tác"
                        value={partner}
                        set={setPartner}
                        disabled={busy}
                      />
                      {data.bookRatingRequired ? (
                        <Score
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
          <Button
            wine
            secondary
            title="Tải lại đánh giá"
            busy={result.isFetching}
            onPress={() => void result.refetch()}
          />
        </>
      )}
      <Button
        wine
        secondary
        title="Về danh sách đánh giá"
        disabled={busy}
        onPress={() => router.replace("/reviews")}
      />
      <Button
        wine
        secondary
        title="Xem hồ sơ đối tác"
        disabled={busy}
        onPress={() =>
          router.push({
            pathname: "/reputation",
            params: { id: data.partnerId },
          })
        }
      />
    </>
  );
}
function Score({
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
    <View style={{ gap: space.sm }}>
      <AppText kind="bold">{label}</AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Chip
            wine
            key={n}
            title={`${n}/5`}
            selected={value === n}
            disabled={disabled}
            onPress={() => set(n)}
          />
        ))}
      </View>
    </View>
  );
}
