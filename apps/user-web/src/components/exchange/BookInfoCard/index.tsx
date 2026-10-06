import { BookHeart, Repeat, Star, Mail } from 'lucide-react';
import type { ExchangeDetail } from '../../../lib/mock/exchangeDetail';
import { BookCover } from '../../BookCover';
import { formatVnd } from '../../../lib/routes';
import styles from './BookInfoCard.module.css';

interface BookInfoCardProps {
    detail: ExchangeDetail;
}

export function BookInfoCard({ detail }: BookInfoCardProps) {

    const receiveBooks = detail.receiveBooks;
    const giveBooks = detail.giveBooks;

    const moneyAmount = detail.moneyAmount || 0;
    let moneyText = 'Trao đổi ngang giá (Không bù tiền)';
    
    if (detail.moneyCompensationType !== 'none' && moneyAmount > 0) {
        if (detail.moneyCompensationType === 'user_pays') {
            moneyText = `Tôi bù thêm ${formatVnd(moneyAmount)}`;
        } else {
            moneyText = `Họ bù thêm ${formatVnd(moneyAmount)}`;
        }
    }

    return (
        <div className={styles.card}>
            <h2 className={styles.cardTitle}>
                <BookHeart className={styles.iconGold} /> Thông tin sách
            </h2>
            
            <div className={styles.booksArea}>
                <div className={styles.receiveCol}>
                    <span className={styles.pillReceive}>Sách bạn nhận</span>
                    <div className={styles.bookListFlex}>
                        {receiveBooks.map(book => (
                            <div key={book.id} className={styles.bookItemRow}>
                                <div className={styles.coverLarge}>
                                    <BookCover title={book.title} coverUrl={book.coverUrl} index={0} />
                                </div>
                                <div className={styles.bookInfo}>
                                    <h3 className={styles.bookTitle}>{book.title}</h3>
                                    <p className={styles.bookAuthor}>{book.author}</p>
                                    <p className={styles.bookCondition}>Tình trạng: {book.condition || 'Rất tốt'}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className={styles.exchangeIconWrapper}>
                    <div className={styles.exchangeIconCircle}>
                        <Repeat size={24} />
                    </div>
                </div>

                <div className={styles.giveCol}>
                    <span className={styles.pillGive}>Sách bạn giao</span>
                    <div className={styles.bookListFlex}>
                        {giveBooks.slice(0, 3).map(book => (
                            <div key={book.id} className={styles.bookItemRowGive}>
                                <div className={styles.bookInfoGive}>
                                    <h3 className={styles.bookTitle}>{book.title}</h3>
                                    <p className={styles.bookAuthor}>{book.author}</p>
                                </div>
                                <div className={styles.coverSmall}>
                                    <BookCover title={book.title} coverUrl={book.coverUrl} index={0} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className={styles.detailsGrid}>
                <div className={styles.partnerRow}>
                    <div className={styles.partnerInfo}>
                        <div className={styles.avatar}>
                            {detail.partner.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <p className={styles.partnerLabel}>Đối tác trao đổi</p>
                            <p className={styles.partnerName}>@{detail.partner.username}</p>
                        </div>
                    </div>
                    <div className={styles.partnerStats}>
                        <div className={styles.starRow}>
                            <Star className={styles.iconStar} size={14} fill="currentColor" />
                            <span className={styles.ratingValue}>{detail.partner.rating?.toFixed(1) || '0.0'}</span>
                        </div>
                        <p className={styles.tradeCount}>{detail.partner.transactionCount} giao dịch</p>
                    </div>
                </div>

                <div className={styles.detailItem}>
                    <p className={styles.detailLabel}>Phương thức giao</p>
                    <p className={styles.detailValueFlex}>
                        <Mail className={styles.iconGoldSmall} size={16} /> {detail.deliveryMethod === 'meetup' ? 'Gặp trực tiếp' : 'Gửi qua đường bưu điện'}
                    </p>
                </div>

                <div className={styles.detailItem}>
                    <p className={styles.detailLabel}>Bù tiền</p>
                    <p className={styles.detailValue}>{moneyText}</p>
                </div>

                {detail.initialMessage && (
                    <div className={styles.messageItem}>
                        <p className={styles.detailLabel}>Lời nhắn kèm theo</p>
                        <p className={styles.messageContent}>"{detail.initialMessage}"</p>
                    </div>
                )}
            </div>
        </div>
    );
}
