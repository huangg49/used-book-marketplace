import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Heart, MapPin, Repeat } from 'lucide-react'
import { ROUTES, formatVnd } from '../lib/routes'
import { getPublicPhoto, type PublicListing } from '../services/public-listings'
import styles from './BookCard.module.css'

export interface BookCardProps {
  book: PublicListing
  index: number
}

export function BookCard({ book, index }: BookCardProps) {
  const [liked, setLiked] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string>()
  const photo = book.photos[0]
  useEffect(() => {
    let active = true
    setPhotoUrl(undefined)
    setImageError(false)
    if (photo) void getPublicPhoto(book.id, photo.id).then((value) => active && setPhotoUrl(value.url)).catch(() => active && setImageError(true))
    return () => { active = false }
  }, [book.id, book.revisionId, photo?.id])
  const coverClass = styles[`cover${index % 4}`] ?? ''
  const isExchange = book.mode !== 'Sale'
  const showFallback = !photo || imageError

  return (
    <article className={styles.card}>
      <div className={`${styles.cover} ${showFallback ? coverClass : ''}`}>
        {!showFallback ? (
          <img
            src={photoUrl}
            alt={`Bìa sách ${book.book.title}`}
            loading="lazy"
            className={styles.coverImage}
            onError={() => setImageError(true)}
          />
        ) : (
          <div className={styles.coverFallback}>
            <BookOpen size={44} aria-hidden="true" />
            <span className={styles.coverTitle} aria-hidden="true">
              {photo ? 'Đang tải ảnh…' : book.book.title}
            </span>
          </div>
        )}
        
          {isExchange ? (
          <span className={`${styles.tag} ${styles.tagExchange}`}>
            <Repeat size={12} aria-hidden="true" /> Trao đổi
          </span>
        ) : null}
      </div>

      <div className={styles.cardContent}>
        <h3 className={styles.cardTitle}>
          <Link to={ROUTES.bookDetail(book.id)} className={styles.cardLink}>
            {book.book.title}
          </Link>
        </h3>
        <p className={styles.cardAuthor}>
          {book.book.authors.join(', ')}
          {book.book.publicationYear ? ` (${book.book.publicationYear})` : ''}
        </p>
        <p className={styles.cardMeta}>
          <span>{({ LikeNew: 'Gần như mới', Good: 'Còn tốt', Fair: 'Đã dùng nhiều', Worn: 'Cũ nhiều' } as const)[book.condition]}</span>
          <span className={styles.cardLocation}>
            <MapPin size={13} aria-hidden="true" /> {book.fulfillment?.name ?? 'Chưa có giao nhận'}
          </span>
        </p>

        <div className={styles.cardFooter}>
          <span className={styles.price}>
            {book.salePrice === null ? 'Chỉ trao đổi' : formatVnd(book.salePrice)}
          </span>
          <button
            type="button"
            className={styles.favoriteButton}
            aria-pressed={liked}
            aria-label={liked ? `Bỏ yêu thích ${book.book.title}` : `Yêu thích ${book.book.title}`}
            onClick={() => setLiked((value) => !value)}
          >
            <Heart size={16} fill={liked ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  )
}
