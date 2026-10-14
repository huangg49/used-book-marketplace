import { BookHeart, Repeat, Star, Truck, Banknote, ShieldCheck, MapPin } from 'lucide-react';
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
                                    <p className={styles.bookCondition}>Tình trạng: {book.condition || 'Chưa có thông tin'}</p>
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
                    {(detail.partner.rating !== undefined || detail.partner.transactionCount !== undefined) && <div className={styles.partnerStats}>
                        <div className={styles.starRow}>
                            <Star className={styles.iconStar} size={14} fill="currentColor" />
                            <span className={styles.ratingValue}>{detail.partner.rating?.toFixed(1) ?? 'Chưa có đánh giá'}</span>
                        </div>
                        {detail.partner.transactionCount !== undefined && <p className={styles.tradeCount}>{detail.partner.transactionCount} giao dịch</p>}
                    </div>}
                </div>

                <div className={styles.detailItem}>
                    <p className={styles.detailLabel}>Phương thức giao nhận</p>
                    <p className={styles.detailValueFlex}>
                        <Truck className={styles.iconGoldSmall} size={16} />
                        <span>Chuyển phát bưu điện / Hẹn gặp trực tiếp (TP.HCM)</span>
                    </p>
                </div>

                <div className={styles.detailItem}>
                    <p className={styles.detailLabel}>Cước phí vận chuyển</p>
                    <p className={styles.detailValueFlex}>
                        <Banknote className={styles.iconGoldSmall} size={16} />
                        <span>Mỗi bên tự chi trả chiều gửi của mình (0 đ cấn trừ sàn)</span>
                    </p>
                </div>

                <div className={styles.detailItem}>
                    <p className={styles.detailLabel}>Bù chênh lệch</p>
                    <p className={styles.detailValue}>{moneyText}</p>
                </div>

                <div className={styles.detailItem}>
                    <p className={styles.detailLabel}>Tiền cọc bảo chứng</p>
                    <p className={styles.detailValueFlex}>
                        <ShieldCheck className={styles.iconGoldSmall} size={16} />
                        <span>{detail.viewerFundingAmount ? formatVnd(detail.viewerFundingAmount) : '100% giá trị sách đối tác'} (Hoàn lại khi hoàn tất)</span>
                    </p>
                </div>

                <div className={styles.detailItem}>
                    <p className={styles.detailLabel}>Địa chỉ nhận sách của bạn</p>
                    <p className={styles.detailValueFlex}>
                        <MapPin className={styles.iconGoldSmall} size={16} />
                        <span>
                            {detail.viewerAddress ? (
                                <>
                                    <strong>{detail.viewerAddress.recipientName}</strong> · {detail.viewerAddress.phone} · {detail.viewerAddress.detail}
                                </>
                            ) : (
                                <span style={{ color: '#888' }}>Chưa thiết lập (chọn qua nút Đề xuất lại hoặc Chấp nhận)</span>
                            )}
                        </span>
                    </p>
                </div>

                <div className={styles.detailItem}>
                    <p className={styles.detailLabel}>Địa chỉ nhận sách của đối tác</p>
                    <p className={styles.detailValueFlex}>
                        <MapPin className={styles.iconGoldSmall} size={16} />
                        <span>
                            {detail.partnerAddress ? (
                                <>
                                    <strong>{detail.partnerAddress.recipientName}</strong> · {detail.partnerAddress.phone} · {detail.partnerAddress.detail}
                                </>
                            ) : (
                                <span style={{ color: '#888' }}>Chờ đối tác cập nhật</span>
                            )}
                        </span>
                    </p>
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
