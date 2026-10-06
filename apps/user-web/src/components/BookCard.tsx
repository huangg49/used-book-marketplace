import { useState } from 'react';
import { Heart } from 'lucide-react';
import { formatVnd } from '../lib/routes';
import styles from './BookCard.module.css';

export interface BookCardProps {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  price?: number;
  exchangeValue?: number;
  condition: string;
  listingType: 'sell' | 'exchange' | 'auction';
  location?: string;
}

export function BookCard(props: BookCardProps) {
  const { title, author, coverUrl, price, condition, listingType } = props;
  const [liked, setLiked] = useState(false);

  // Xử lý loại giao dịch
  let badgeLabel = 'Bán';
  let badgeClass = styles.badgeSell;
  if (listingType === 'exchange') {
    badgeLabel = 'Trao đổi';
    badgeClass = styles.badgeExchange;
  } else if (listingType === 'auction') {
    badgeLabel = 'Đấu giá';
    badgeClass = styles.badgeAuction;
  }

  return (
    <div className={styles.card}>
      <div className={styles.coverWrapper}>
        {coverUrl ? (
          <img alt={`Bìa sách ${title}`} src={coverUrl} className={styles.coverImage} loading="lazy" />
        ) : (
          <div className={styles.coverFallback}></div>
        )}
        <button 
          className={styles.bookmarkBtn} 
          aria-label="Lưu sách"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setLiked(!liked);
          }}
        >
          <Heart size={16} fill={liked ? 'currentColor' : 'none'} color={liked ? '#B85C45' : '#81796C'} />
        </button>
        <span className={styles.conditionTagOver}>{condition}</span>
      </div>
      
      <div className={styles.meta}>
        <div className={styles.categoryText}>Tiểu thuyết hiện thực</div>
        <h3 className={styles.title} title={title}>{title}</h3>
        <p className={styles.author} title={author}>{author}</p>
        
        <div className={styles.divider}></div>

        <div className={styles.footer}>
          <div className={styles.priceBlock}>
            {listingType === 'sell' && price !== undefined && (
              <span className={styles.price}>{formatVnd(price)}</span>
            )}
            {listingType === 'exchange' && (
              <span className={styles.priceExchange}>28 Xu</span>
            )}
            {listingType === 'auction' && price !== undefined && (
              <span className={styles.priceAuction}>{formatVnd(price)}</span>
            )}
          </div>
          
          <button className={`${styles.actionBtn} ${listingType === 'exchange' ? styles.actionBtnOutline : styles.actionBtnSolid}`}>
            {listingType === 'sell' ? 'Mua ngay' : listingType === 'exchange' ? 'Đổi sách' : 'Tham gia'}
          </button>
        </div>
      </div>
    </div>
  );
}
