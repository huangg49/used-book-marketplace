import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowRight, GitCompareArrows } from "lucide-react";
import { session } from "../../core/session";
import { dateText } from "../../core/format";
import { Button, CursorPagination } from "../../core/ui";
import { ListFeedback } from "../../core/list-feedback";
import { pageOf, revision, type Revision } from "./contracts";
import { compareRevisions } from "./revision-diff";
import { ReviewGallery } from "./ReviewGallery";
import { RevisionPicker } from "./RevisionPicker";
import styles from "./RevisionComparison.module.css";

export function RevisionComparison({
  listingId,
  current,
}: {
  listingId: string;
  current: Revision;
}) {
  const result = useInfiniteQuery({
    queryKey: ["revisions", listingId],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      session.request(
        `/operations/listings/${listingId}/revisions?limit=10${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        pageOf(revision),
      ),
    getNextPageParam: (page) => page.nextCursor || undefined,
  });
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState(current.id);
  const [onlyChanged, setOnlyChanged] = useState(true);
  const [showPhotos, setShowPhotos] = useState(false);
  const revisions = Array.from(
    new Map(
      [
        current,
        ...(result.data?.pages.flatMap((page) => page.items) ?? []),
      ].map((r) => [r.id, r]),
    ).values(),
  ).sort((a, b) => b.number - a.number);
  const before =
    revisions.find((r) => r.id === beforeId) ??
    revisions.find((r) => r.number < current.number);
  const after = revisions.find((r) => r.id === afterId) ?? current;
  const rows = before ? compareRevisions(before, after) : [];
  const count = rows.filter((r) => r.changed).length;
  return (
    <section className={styles.compare} aria-label="Đối chiếu các bản gửi">
      <div className={styles.heading}>
        <GitCompareArrows size={21} aria-hidden="true" />
        <h3>Điều gì đã thay đổi?</h3>
      </div>
      <p>
        So sánh nội dung lưu ở hai lần gửi. Phiếu quyết định luôn dành cho bản
        gửi hiện tại, không dành cho bản cũ đang đối chiếu.
      </p>
      <ListFeedback result={result} loadingText="Đang tải các bản gửi…" />
      {revisions.length < 2 ? (
        <div className={styles.empty}>
          <strong>Đây là bản gửi đầu tiên.</strong>
          <p>Chưa có bản gửi trước để đối chiếu.</p>
        </div>
      ) : (
        <>
          <div className={styles.selectors}>
            <RevisionPicker
              label="Bản đối chiếu"
              value={before?.id ?? ""}
              currentId={current.id}
              revisions={revisions}
              onChange={(id) => {
                setBeforeId(id);
                setShowPhotos(false);
              }}
            />
            <ArrowRight size={18} aria-hidden="true" />
            <RevisionPicker
              label="Bản cần xem"
              value={after.id}
              currentId={current.id}
              revisions={revisions}
              onChange={(id) => {
                setAfterId(id);
                setShowPhotos(false);
              }}
            />
          </div>
          {before && (
            <>
              <div className={styles.summary}>
                <strong>{count} mục thay đổi</strong>
                <label>
                  <input
                    type="checkbox"
                    checked={onlyChanged}
                    onChange={(e) => setOnlyChanged(e.target.checked)}
                  />
                  Chỉ xem thay đổi
                </label>
              </div>
              {before.id === after.id && (
                <p role="status">Bạn đang chọn cùng một bản gửi.</p>
              )}
              <div className={styles.columnHead}>
                <span>Nội dung</span>
                <span>
                  Bản {before.number}
                  <small>{dateText(before.submittedAt)}</small>
                </span>
                <span>
                  Bản {after.number}
                  <small>{dateText(after.submittedAt)}</small>
                </span>
              </div>
              {rows
                .filter((r) => !onlyChanged || r.changed)
                .map((r) => (
                  <div
                    className={`${styles.row} ${r.changed ? styles.changed : ""}`}
                    key={r.label}
                  >
                    <strong>{r.label}</strong>
                    <div>
                      <span>Bản {before.number}</span>
                      {r.before}
                    </div>
                    <div>
                      <span>Bản {after.number}</span>
                      {r.after}
                    </div>
                  </div>
                ))}
              {count === 0 && onlyChanged && (
                <p className={styles.empty}>
                  Không có thay đổi trong nội dung, ảnh, bộ sách hoặc lựa chọn
                  giao nhận của hai bản gửi này.
                </p>
              )}
              <div className={styles.photos}>
                <Button
                  onClick={() => setShowPhotos(!showPhotos)}
                  aria-expanded={showPhotos}
                >
                  {showPhotos ? "Ẩn ảnh đối chiếu" : "Mở ảnh của hai bản gửi"}
                </Button>
                {showPhotos && (
                  <div className={styles.photoColumns}>
                    <section>
                      <h4>Bản gửi {before.number}</h4>
                      <ReviewGallery
                        key={before.id}
                        listingId={listingId}
                        ids={before.content.mediaIds}
                        revisionNumber={before.number}
                      />
                    </section>
                    <section>
                      <h4>Bản gửi {after.number}</h4>
                      <ReviewGallery
                        key={after.id}
                        listingId={listingId}
                        ids={after.content.mediaIds}
                        revisionNumber={after.number}
                      />
                    </section>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
      <CursorPagination
        pageCount={result.data?.pages.length ?? 0}
        hasNextPage={result.hasNextPage}
        isFetchingNextPage={result.isFetchingNextPage}
        isFetching={result.isFetching}
        error={result.isFetchNextPageError ? result.error : undefined}
        onNextPage={() => void result.fetchNextPage({ cancelRefetch: false })}
        nextLabel="Tải thêm bản gửi để đối chiếu"
      />
    </section>
  );
}
