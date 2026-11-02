import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, RefreshCw } from "lucide-react";
import { session } from "../../core/session";
import { mediaRead, type Listing } from "./contracts";
import styles from "./ReviewWorkspace.module.css";

/** A queue thumbnail is identification only; it never satisfies the review checklist. */
export function QueueCover({ value }: { value: Listing }) {
  const mediaId = value.currentRevision.content.mediaIds[0];
  const [failedUrl, setFailedUrl] = useState<string>();
  const photo = useQuery({
    queryKey: ["review-media", value.id, mediaId],
    enabled: !!mediaId,
    queryFn: () =>
      session.request(
        `/operations/listings/${value.id}/media/${mediaId}/read`,
        mediaRead,
      ),
    staleTime: 60_000,
    gcTime: 0,
  });
  const url = photo.data?.url;
  const failed = photo.isError || (!!url && failedUrl === url);
  return (
    <div className={styles.queueCover}>
      {url && !failed ? (
        <img
          src={url}
          alt="Ảnh đầu của bản sách"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <>
          <BookOpen size={24} strokeWidth={1.4} aria-hidden="true" />
          <span>
            {!mediaId
              ? "Chưa có ảnh"
              : failed
                ? "Ảnh chưa tải"
                : "Đang tải ảnh"}
          </span>
          {failed && (
            <button
              type="button"
              aria-label="Tải lại ảnh nhận diện"
              disabled={photo.isFetching}
              onClick={() => {
                setFailedUrl(undefined);
                void photo.refetch();
              }}
            >
              <RefreshCw size={14} aria-hidden="true" /> Thử lại
            </button>
          )}
        </>
      )}
    </div>
  );
}
