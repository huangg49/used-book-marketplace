import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Heart, MapPin, Repeat } from 'lucide-react'
import { ROUTES, formatVnd } from '../lib/routes'
import type { BookItem } from '../lib/mock/home'
import styles from './BookCard.module.css'

export interface BookCardProps {
  book: BookItem
  index: number
}

export function BookCard({ book, index }: BookCardProps) {
  const [liked, setLiked] = useState(false)
  const [imageError, setImageError] = useState(false)
  const coverClass = styles[`cover${index % 4}`] ?? ''
  const isExchange = book.listingType === 'exchange'
  const showFallback = !book.coverUrl || imageError

  return (
    <article className={styles.card}>
      <div className={`${styles.cover} ${showFallback ? coverClass : ''}`}>
        {!showFallback ? (
          <img 
            src={book.coverUrl} 
            alt={`Bìa sách ${book.title}`} 
            loading="lazy" 
            className={styles.coverImage}
            onError={() => setImageError(true)}
          />
        ) : (
          <div className={styles.coverFallback}>
            <BookOpen size={44} aria-hidden="true" />
            <span className={styles.coverTitle} aria-hidden="true">
              {book.title}
            </span>
          </div>
        )}
        
        {isExchange ? (
          <span className={`${styles.tag} ${styles.tagExchange}`}>
            <Repeat size={12} aria-hidden="true" /> Trao đổi
          </span>
        ) : book.badge ? (
          <span className={styles.tag}>{book.badge}</span>
        ) : null}
      </div>

      <div className={styles.cardContent}>
        <h3 className={styles.cardTitle}>
          <Link to={ROUTES.bookDetail(book.id)} className={styles.cardLink}>
            {book.title}
          </Link>
        </h3>
        <p className={styles.cardAuthor}>
          {book.author}
          {book.year ? ` (${book.year})` : ''}
        </p>
        <p className={styles.cardMeta}>
          <span>{book.condition}</span>
          <span className={styles.cardLocation}>
            <MapPin size={13} aria-hidden="true" /> {book.location}
          </span>
        </p>

        <div className={styles.cardFooter}>
          <span className={styles.price}>
            {isExchange || book.priceVnd === undefined ? 'Chỉ trao đổi' : formatVnd(book.priceVnd)}
          </span>
          <button
            type="button"
            className={styles.favoriteButton}
            aria-pressed={liked}
            aria-label={liked ? `Bỏ yêu thích ${book.title}` : `Yêu thích ${book.title}`}
            onClick={() => setLiked((value) => !value)}
          >
            <Heart size={16} fill={liked ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  )
}
