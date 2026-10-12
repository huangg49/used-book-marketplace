import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Expand, X } from 'lucide-react'
import { getAuctionPhoto, type AuctionSummary } from '../services/auctions'
import { lockPageScroll } from '../lib/page-scroll'
import styles from './AuctionGallery.module.css'

export function AuctionPhoto({
  auction,
  index = 0,
  interactive = true,
  eager = false,
}: {
  auction: AuctionSummary
  index?: number
  interactive?: boolean
  eager?: boolean
}) {
  const mediaId = auction.book?.photos[index]?.id
  const [failed, setFailed] = useState<string>()
  const photo = useQuery({
    queryKey: ['auction-photo', auction.id, auction.book?.revisionId, mediaId],
    queryFn: () => getAuctionPhoto(auction.id, mediaId!),
    enabled: !!mediaId,
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
        onError={() => setFailed(url)}
      />
    )
  const error = photo.isError || !!(url && failed === url)
  return (
    <div className={styles.placeholder}>
      <BookOpen size={32} aria-hidden="true" />
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
  const photos = auction.book?.photos ?? []
  const current = Math.min(index, Math.max(0, photos.length - 1))
  useEffect(() => (expanded ? lockPageScroll() : undefined), [expanded])
  return (
    <section className={styles.gallery} aria-label="Ảnh bản sách đấu giá">
      <div className={styles.image}>
        <AuctionPhoto
          key={`${auction.id}:${current}`}
          auction={auction}
          index={current}
          eager
        />
        {!!photos.length && (
          <button
            type="button"
            className={styles.expand}
            onClick={() => {
              viewer.current?.showModal()
              setExpanded(true)
            }}
          >
            <Expand size={16} aria-hidden="true" /> Xem ảnh lớn
          </button>
        )}
      </div>
      {photos.length > 1 && (
        <div
          className={styles.choices}
          role="group"
          aria-label="Chọn ảnh bản sách"
        >
          {photos.map((photo, i) => (
            <button
              type="button"
              key={photo.id}
              aria-pressed={current === i}
              onClick={() => setIndex(i)}
            >
              Ảnh {i + 1}
            </button>
          ))}
        </div>
      )}
      <p className={styles.caption}>
        Ảnh do người đăng cung cấp.
        {photos.length > 0 && (
          <span aria-live="polite">
            {' '}
            {current + 1}/{photos.length}
          </span>
        )}
      </p>
      <dialog
        ref={viewer}
        className={styles.viewer}
        aria-label={`Ảnh lớn của ${auction.title}`}
        onClose={() => setExpanded(false)}
      >
        <button
          type="button"
          className={styles.close}
          onClick={() => viewer.current?.close()}
          autoFocus
        >
          <X size={20} aria-hidden="true" /> Đóng ảnh
        </button>
        {expanded && <AuctionPhoto auction={auction} index={current} eager />}
      </dialog>
    </section>
  )
}
