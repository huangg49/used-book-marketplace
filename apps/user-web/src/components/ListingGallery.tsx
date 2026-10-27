import { useEffect, useRef, useState } from "react";
import { listingTitle } from "../lib/book-bundle";
import { ArrowLeft, ArrowRight, Expand, ImageOff, X } from "lucide-react";
import { ListingPhoto } from "./BookCard";
import { type PublicListing } from "../services/public-listings";
import styles from "./ListingGallery.module.css";
import { lockPageScroll } from "../lib/page-scroll";
import { usePublicListingPhoto } from "../hooks/usePublicListingPhoto";
import { useNearViewport } from "../hooks/useNearViewport";

function Thumbnail({ book, index }: { book: PublicListing; index: number }) {
  const photoId = book.photos[index]!.id;
  const [failedUrl, setFailedUrl] = useState<string>();
  const { ref, active } = useNearViewport();
  const photo = usePublicListingPhoto(
    book.id,
    book.revisionId,
    photoId,
    active,
  );
  return (
    <div ref={ref} style={{ width: "100%", height: "100%" }}>
      {photo.url && failedUrl !== photo.url ? (
        <img
          src={photo.url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(photo.url)}
        />
      ) : (
        <ImageOff size={20} aria-hidden="true" />
      )}
    </div>
  );
}

export function ListingGallery({ book }: { book: PublicListing }) {
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const viewer = useRef<HTMLDialogElement>(null);
  const current = Math.min(index, Math.max(0, book.photos.length - 1));
  function close() {
    viewer.current?.close();
    setExpanded(false);
  }
  useEffect(() => {
    if (!expanded) return;
    return lockPageScroll();
  }, [expanded]);
  function step(amount: number) {
    setIndex((current + amount + book.photos.length) % book.photos.length);
  }
  return (
    <section className={styles.gallery} aria-label="Ảnh bản sách">
      <div className={styles.photo} data-book-cover="true">
        <ListingPhoto
          key={book.id + current}
          book={book}
          photoIndex={current}
          eager
          alt={`Ảnh ${current + 1} của ${listingTitle(book)}`}
        />
        {book.photos.length > 0 && (
          <button
            className={styles.expand}
            type="button"
            aria-label="Xem ảnh lớn"
            onClick={() => {
              viewer.current?.showModal();
              setExpanded(true);
            }}
          >
            <Expand size={17} aria-hidden="true" /> Xem ảnh lớn
          </button>
        )}
      </div>
      {book.photos.length > 1 && (
        <div
          className={styles.thumbnails}
          role="group"
          aria-label="Chọn ảnh bản sách"
        >
          {book.photos.map((photo, position) => (
            <button
              key={photo.id}
              type="button"
              aria-label={`Xem ảnh ${position + 1}`}
              aria-pressed={current === position}
              onClick={() => setIndex(position)}
            >
              <Thumbnail book={book} index={position} />
              <span>{position + 1}</span>
            </button>
          ))}
        </div>
      )}
      <div className={styles.caption}>
        <p>Ảnh do người đăng cung cấp.</p>
        {book.photos.length > 0 && (
          <span aria-live="polite">
            Ảnh {current + 1}/{book.photos.length}
          </span>
        )}
      </div>
      <dialog
        ref={viewer}
        className={styles.viewer}
        aria-labelledby="listing-viewer-title"
        onClose={() => setExpanded(false)}
        onKeyDown={(event) => {
          if (book.photos.length < 2) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            step(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
      >
        <div className={styles.viewerHead}>
          <h2 id="listing-viewer-title">Ảnh bản sách</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Đóng ảnh lớn"
            autoFocus
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        {expanded && (
          <div className={styles.largePhoto}>
            <ListingPhoto
              key={book.id + current}
              book={book}
              photoIndex={current}
              eager
              alt={`Ảnh ${current + 1} của ${listingTitle(book)}`}
            />
          </div>
        )}
        <div className={styles.viewerFoot}>
          {book.photos.length > 1 && (
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Ảnh trước"
            >
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
          )}
          <p aria-live="polite">
            Ảnh {current + 1}/{book.photos.length} · Người đăng cung cấp
          </p>
          {book.photos.length > 1 && (
            <button type="button" onClick={() => step(1)} aria-label="Ảnh sau">
              <ArrowRight size={20} aria-hidden="true" />
            </button>
          )}
        </div>
      </dialog>
    </section>
  );
}
