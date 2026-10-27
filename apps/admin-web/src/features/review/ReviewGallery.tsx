import { useEffect, useId, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Expand,
  Minus,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { session } from "../../core/session";
import { Button, ErrorNotice } from "../../core/ui";
import { mediaRead } from "./contracts";
import { reviewImageReady } from "./media-readiness";
import { playTaskMotion } from "../../core/task-motion";
import styles from "./ReviewGallery.module.css";

export function ReviewGallery({
  listingId,
  ids,
  onReady,
  revisionNumber,
}: {
  listingId: string;
  ids: string[];
  onReady?: (id: string, ready: boolean) => void;
  revisionNumber: number;
}) {
  const captionId = useId();
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const dialog = useRef<HTMLDialogElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const imageMotions = useRef<
    Partial<Record<"preview" | "viewer", () => void>>
  >({});
  function revealImage(image: HTMLImageElement, target: "preview" | "viewer") {
    imageMotions.current[target]?.();
    imageMotions.current[target] = playTaskMotion(
      image,
      [{ opacity: 0.55 }, { opacity: 1 }],
      180,
    );
  }
  useEffect(() => {
    const motions = imageMotions.current;
    return () => {
      Object.values(motions).forEach((stop) => stop?.());
      delete motions.preview;
      delete motions.viewer;
    };
  }, [active, open]);
  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["review-media", listingId, id],
      queryFn: () =>
        session.request(
          `/operations/listings/${listingId}/media/${id}/read`,
          mediaRead,
        ),
      staleTime: 60_000,
      refetchInterval: 90_000,
      gcTime: 0,
    })),
  });
  const ready = ids.map((id, index) => {
    const query = queries[index];
    const url = query.data?.url;
    return reviewImageReady(url, loaded[id], failed[id], query.isError);
  });
  const readiness = ready.join(",");
  const identity = ids.join(",");
  useEffect(() => {
    const states = readiness.split(",");
    identity
      .split(",")
      .filter(Boolean)
      .forEach((id, index) => onReady?.(id, states[index] === "true"));
  }, [identity, readiness, onReady]);
  useEffect(
    () => () => {
      identity
        .split(",")
        .filter(Boolean)
        .forEach((id) => onReady?.(id, false));
    },
    [identity, onReady],
  );
  useEffect(() => {
    if (readiness.split(",")[active] !== "true") dialog.current?.close();
  }, [active, readiness]);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);
  function change(index: number) {
    if (!ready[index]) return;
    setActive(index);
    setZoom(100);
    viewport.current?.scrollTo(0, 0);
  }
  function close() {
    dialog.current?.close();
  }
  const current = queries[active]?.data;
  const next = (active + 1) % ids.length;
  const previous = (active - 1 + ids.length) % ids.length;
  return (
    <div className={styles.gallery} ref={root} tabIndex={-1}>
      {ids.length === 0 && <p className="muted">Bản gửi này chưa có ảnh.</p>}
      {current && ready[active] && (
        <button
          type="button"
          className={styles.preview}
          aria-label={`Xem lớn ảnh ${active + 1}`}
          onClick={(event) => {
            opener.current = event.currentTarget;
            setZoom(100);
            dialog.current?.showModal();
            setOpen(true);
          }}
        >
          <img
            key={current.url}
            src={current.url}
            alt={`Ảnh ${active + 1} do người đăng cung cấp`}
            referrerPolicy="no-referrer"
            onLoad={(event) => revealImage(event.currentTarget, "preview")}
            onError={() =>
              setFailed((old) => ({ ...old, [ids[active]]: current.url }))
            }
          />
          <span>
            <Expand size={16} aria-hidden="true" />
            Xem rõ ảnh {active + 1} / {ids.length}
          </span>
        </button>
      )}
      <div className={styles.thumbnails} aria-label="Chọn ảnh người đăng gửi">
        {ids.map((id, index) => {
          const query = queries[index];
          const url = query.data?.url;
          return (
            <figure key={id}>
              {query.isPending && (
                <p role="status">Đang tải ảnh {index + 1}…</p>
              )}
              {query.error ? (
                <ErrorNotice
                  error={query.error}
                  retry={() => void query.refetch()}
                  busy={query.isFetching}
                />
              ) : (
                url && (
                  <>
                    {failed[id] !== url && (
                      <button
                        type="button"
                        aria-label={`Chọn ảnh ${index + 1}`}
                        aria-pressed={active === index}
                        disabled={!ready[index]}
                        onClick={() => change(index)}
                      >
                        <img
                          src={url}
                          alt={`Ảnh thu nhỏ ${index + 1}`}
                          referrerPolicy="no-referrer"
                          onLoad={() =>
                            setLoaded((old) => ({ ...old, [id]: url }))
                          }
                          onError={() =>
                            setFailed((old) => ({ ...old, [id]: url }))
                          }
                        />
                      </button>
                    )}
                    {failed[id] === url && (
                      <div role="alert">
                        <p>Ảnh {index + 1} chưa tải được.</p>
                        <Button
                          busy={query.isFetching}
                          onClick={() => {
                            setFailed((old) => ({ ...old, [id]: "" }));
                            setLoaded((old) => ({ ...old, [id]: "" }));
                            void query.refetch();
                          }}
                        >
                          Tải lại ảnh {index + 1}
                        </Button>
                      </div>
                    )}
                  </>
                )
              )}
              <figcaption>
                {String(index + 1).padStart(2, "0")}
                {index === 0 ? " · Ảnh đầu" : ""}
              </figcaption>
            </figure>
          );
        })}
      </div>
      <dialog
        ref={dialog}
        className={styles.viewer}
        aria-label={`Xem lớn ảnh ${active + 1}`}
        aria-describedby={captionId}
        onClose={() => {
          setOpen(false);
          setZoom(100);
          (opener.current?.isConnected ? opener.current : root.current)?.focus({
            preventScroll: true,
          });
        }}
        onKeyDown={(event) => {
          if (
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.nativeEvent.isComposing
          )
            return;
          if (event.key === "ArrowRight" && ids.length > 1) {
            event.preventDefault();
            change(next);
          }
          if (event.key === "ArrowLeft" && ids.length > 1) {
            event.preventDefault();
            change(previous);
          }
          if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            setZoom((z) => Math.min(300, z + 25));
          }
          if (event.key === "-") {
            event.preventDefault();
            setZoom((z) => Math.max(100, z - 25));
          }
          if (event.key === "0") {
            event.preventDefault();
            setZoom(100);
          }
        }}
      >
        <header className={styles.toolbar}>
          <div>
            <strong>
              Ảnh {active + 1} <span>/ {ids.length}</span>
            </strong>
            <span id={captionId}>
              Bản gửi {revisionNumber} · Ảnh do người đăng cung cấp
            </span>
          </div>
          <Button
            autoFocus
            aria-label={`Đóng ảnh ${active + 1}`}
            onClick={close}
          >
            <X size={20} aria-hidden="true" />
          </Button>
        </header>
        <div
          ref={viewport}
          className={styles.viewport}
          tabIndex={0}
          aria-label="Vùng xem ảnh; có thể cuộn khi phóng lớn"
        >
          {current && ready[active] && (
            <img
              key={current.url}
              src={current.url}
              alt={`Chi tiết ảnh ${active + 1}`}
              referrerPolicy="no-referrer"
              style={{ width: `${zoom}%` }}
              onLoad={(event) => revealImage(event.currentTarget, "viewer")}
              onError={() =>
                setFailed((old) => ({ ...old, [ids[active]]: current.url }))
              }
            />
          )}
        </div>
        <footer className={styles.controls}>
          <div>
            <Button
              aria-label="Ảnh trước"
              disabled={ids.length < 2 || !ready[previous]}
              onClick={() => change(previous)}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </Button>
            <Button
              aria-label="Ảnh tiếp theo"
              disabled={ids.length < 2 || !ready[next]}
              onClick={() => change(next)}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </Button>
          </div>
          <div>
            <Button
              aria-label="Thu nhỏ ảnh"
              disabled={zoom <= 100}
              onClick={() => setZoom(zoom - 25)}
            >
              <Minus size={18} aria-hidden="true" />
            </Button>
            <output aria-live="polite">{zoom}%</output>
            <Button
              aria-label="Phóng lớn ảnh"
              disabled={zoom >= 300}
              onClick={() => setZoom(zoom + 25)}
            >
              <Plus size={18} aria-hidden="true" />
            </Button>
            <Button
              aria-label="Đặt lại kích thước ảnh"
              onClick={() => {
                setZoom(100);
                viewport.current?.scrollTo(0, 0);
              }}
            >
              <RotateCcw size={17} aria-hidden="true" />
            </Button>
          </div>
          <p>← → Đổi ảnh · + − Phóng / thu · Esc Đóng</p>
        </footer>
      </dialog>
    </div>
  );
}
