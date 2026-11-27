import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, ChevronLeft, ChevronRight, Expand, X } from 'lucide-react'
import { getAuctionPhoto, type AuctionSummary } from '../services/auctions'
import { lockPageScroll } from '../lib/page-scroll'
import styles from './AuctionGallery.module.css'

export function AuctionPhoto({
  auction,
  index = 0,
  interactive = true,
  eager = false,
  active = true,
}: {
  auction: AuctionSummary
  index?: number
  interactive?: boolean
  eager?: boolean
  active?: boolean
}) {
  const mediaId = auction.book?.photos[index]?.id
  const [failed, setFailed] = useState<string>()
  const photo = useQuery({
    queryKey: ['auction-photo', auction.id, auction.book?.revisionId, mediaId],
    queryFn: () => getAuctionPhoto(auction.id, mediaId!),
    enabled: active && !!mediaId,
    retry: false,
    staleTime: 60_000,
  })
  const url = photo.data?.url
  if (url && !photo.isError && failed !== url)
    return (
      <img
        src={url}
        alt={`Ảnh ${index + 1} của ${auction.title}`}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        onError={() => setFailed(url)}
      />
    )
  const error = photo.isError || !!(url && failed === url)
  return (
    <div className={styles.placeholder}>
      <BookOpen size={30} aria-hidden="true" />
      <span>
        {error
          ? 'Chưa tải được ảnh'
          : mediaId
            ? 'Đang tải ảnh…'
            : 'Chưa có ảnh bản sách'}
      </span>
      {error && interactive && (
        <button
          type="button"
          disabled={photo.isFetching}
          onClick={() => {
            setFailed(undefined)
            void photo.refetch()
          }}
        >
          Tải lại ảnh
        </button>
      )}
    </div>
  )
}

export function AuctionGallery({ auction }: { auction: AuctionSummary }) {
  const [index, setIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const viewer = useRef<HTMLDialogElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const photos = auction.book?.photos ?? []
  const count = photos.length
  const current = Math.min(index, Math.max(0, count - 1))
  const hasMany = count > 1

  const goTo = (next: number) => {
    if (count <= 1) return
    setIndex((next + count) % count)
  }
  const prev = () => goTo(current - 1)
  const next = () => goTo(current + 1)

  useEffect(() => (expanded ? lockPageScroll() : undefined), [expanded])
  useEffect(() => {
    const dialog = viewer.current
    if (!dialog) return
    const onBackdrop = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close()
    }
    dialog.addEventListener('click', onBackdrop)
    return () => dialog.removeEventListener('click', onBackdrop)
  }, [])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!hasMany) return
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      prev()
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      next()
    }
  }

  return (
    <section
      className={styles.gallery}
      aria-label="Ảnh bản sách đấu giá"
      aria-roledescription={hasMany ? 'carousel' : undefined}
      onKeyDown={onKeyDown}
    >
      <div
        className={styles.stage}
        onPointerDown={(e) => {
          if (!hasMany || e.button > 0) return
          swipeStart.current = { x: e.clientX, y: e.clientY }
        }}
        onPointerUp={(e) => {
          const start = swipeStart.current
          swipeStart.current = null
          if (!start || !hasMany) return
          const dx = e.clientX - start.x
          const dy = e.clientY - start.y
          if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0) next()
            else prev()
          }
        }}
        onPointerCancel={() => { swipeStart.current = null }}
      >
        {count === 0 ? (
          <div className={styles.slide}>
            <AuctionPhoto auction={auction} index={0} eager />
          </div>
        ) : (
          <div
            className={styles.track}
            style={{ transform: `translate3d(-${current * 100}%, 0, 0)` }}
          >
            {photos.map((photo, i) => (
              <div
                key={photo.id}
                className={styles.slide}
                aria-hidden={i !== current || undefined}
              >
                <AuctionPhoto
                  auction={auction}
                  index={i}
                  eager={i === 0 || Math.abs(i - current) <= 1}
                  active={i === current || Math.abs(i - current) <= 1}
                />
              </div>
            ))}
          </div>
        )}

        {hasMany && (
          <>
            <button
              type="button"
              className={`${styles.navBtn} ${styles.navPrev}`}
              aria-label="Ảnh trước"
              onClick={prev}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`${styles.navBtn} ${styles.navNext}`}
              aria-label="Ảnh tiếp theo"
              onClick={next}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>

            <div className={styles.dots} role="tablist" aria-label="Chuyển ảnh bản sách">
              {photos.map((photo, i) => (
                <button
                  key={photo.id}
                  type="button"
                  role="tab"
                  aria-selected={i === current}
                  aria-label={`Xem ảnh ${i + 1} trên ${count}`}
                  className={i === current ? styles.dotActive : styles.dot}
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>
          </>
        )}

        {count > 0 && (
          <button
            type="button"
            className={styles.expand}
            onClick={(e) => {
              openerRef.current = e.currentTarget
              viewer.current?.showModal()
              setExpanded(true)
            }}
          >
            <Expand size={15} aria-hidden="true" /> Xem ảnh lớn
          </button>
        )}
      </div>

      {hasMany && (
        <div className={styles.thumbs} role="group" aria-label="Ảnh thu nhỏ bản sách">
          {photos.map((photo, i) => (
            <button
              type="button"
              key={photo.id}
              className={styles.thumb}
              aria-pressed={current === i}
              aria-label={`Ảnh ${i + 1}`}
              onClick={() => setIndex(i)}
            >
              <AuctionPhoto auction={auction} index={i} interactive={false} eager />
            </button>
          ))}
        </div>
      )}

      <p className={styles.caption}>
        <span>Ảnh thật của bản sách</span>
        {count > 0 && (
          <span className={styles.counter} aria-live="polite">
            {current + 1}/{count}
          </span>
        )}
      </p>

      <dialog
        ref={viewer}
        data-lenis-prevent="true"
        className={styles.viewer}
        aria-label={`Ảnh lớn của ${auction.title}`}
        onKeyDown={onKeyDown}
        onClose={() => {
          setExpanded(false)
          if (openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true })
        }}
      >
        <div className={styles.viewerSheet}>
          <header className={styles.viewerHead} data-focus-inverse>
            <span className={styles.viewerTitle}>
              <strong>{auction.title}</strong>
              {hasMany && <span className={styles.viewerCount}>{current + 1}/{count}</span>}
            </span>
            <button
              type="button"
              className={styles.close}
              onClick={() => viewer.current?.close()}
              autoFocus
            >
              <X size={18} aria-hidden="true" /> Đóng ảnh
            </button>
          </header>
          <div className={styles.viewerStage}>
            {hasMany && (
              <button
                type="button"
                className={`${styles.navBtn} ${styles.navPrev}`}
                aria-label="Ảnh trước"
                onClick={prev}
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
            )}
            {expanded && <AuctionPhoto auction={auction} index={current} eager />}
            {hasMany && (
              <button
                type="button"
                className={`${styles.navBtn} ${styles.navNext}`}
                aria-label="Ảnh tiếp theo"
                onClick={next}
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </dialog>
    </section>
  )
}
