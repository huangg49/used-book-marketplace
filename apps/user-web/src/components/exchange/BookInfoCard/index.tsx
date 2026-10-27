import { conditions } from '../../../lib/listing-labels';
import { BookHeart, Repeat, Star, Truck, Banknote, ShieldCheck, MapPin } from 'lucide-react';
import type { ExchangeDetail } from '../../../lib/mock/exchangeDetail';
import { BookCover } from '../../BookCover';
import { formatVnd } from '../../../lib/routes';
import styles from './BookInfoCard.module.css';

interface BookInfoCardProps {
    detail: ExchangeDetail;
    compact?: boolean;
}

export function BookInfoCard({ detail, compact = false }: BookInfoCardProps) {
    const receiveBooks = detail.receiveBooks;
    const giveBooks = detail.giveBooks;

    const totalReceivePrice = receiveBooks.reduce((sum, b) => sum + (b.price || 0), 0);
    const totalGivePrice = giveBooks.reduce((sum, b) => sum + (b.price || 0), 0);

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
        <div className={compact ? `${styles.card} ${styles.compact}` : styles.card}>
            {/* Header */}
            <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                    <BookHeart className={styles.iconGold} size={20} />
                    <span>Phiếu đề nghị đổi sách</span>
                </h2>
                <div className={styles.partnerSnippet}>
                    <div className={styles.avatarMini}>
                        {detail.partner.username.charAt(0).toUpperCase()}
                    </div>
                    <div className={styles.partnerSnippetText}>
                        <span className={styles.partnerSnippetRole}>Đối tác</span>
                        <strong className={styles.partnerSnippetName}>@{detail.partner.username}</strong>
                    </div>
                    {(detail.partner.rating !== undefined || detail.partner.transactionCount !== undefined) && (
                        <div className={styles.partnerSnippetStats}>
                            <Star className={styles.iconStar} size={13} fill="currentColor" />
                            <span>{detail.partner.rating?.toFixed(1) ?? '—'}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Books Comparison Showcase */}
            <div className={styles.booksShowcase}>
                {/* Sách nhận */}
                <div className={styles.receiveSection}>
                    <div className={styles.sectionHeaderLine}>
                        <span className={styles.pillReceive}>
                            Sách bạn nhận ({receiveBooks.length} cuốn{totalReceivePrice > 0 ? ` · ${formatVnd(totalReceivePrice)}` : ''})
                        </span>
                    </div>
                    <div className={styles.booksList}>
                        {receiveBooks.map((book) => (
                            <div key={book.id} className={styles.bookCard}>
                                <div className={styles.coverWrapper}>
                                    <BookCover title={book.title} coverUrl={book.coverUrl} index={0} />
                                </div>
                                <div className={styles.bookMeta}>
                                    <h3 className={styles.bookTitle}>{book.title}</h3>
                                    <p className={styles.bookAuthor}>{book.author}</p>
                                    <div className={styles.tagsRow}>
                                        <span className={styles.conditionTag}>
                                            {conditions[book.condition as keyof typeof conditions] ?? book.condition ?? 'Đã qua sử dụng'}
                                        </span>
                                        <span className={styles.priceTag}>
                                            {book.price ? formatVnd(book.price) : '—'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Swap Connector */}
                <div className={styles.swapBridge}>
                    <div className={styles.swapBridgeLine} />
                    <div className={styles.swapBridgeBadge}>
                        <Repeat size={14} className={styles.swapBridgeIcon} />
                        <span>Đổi lấy {giveBooks.length} cuốn sách của bạn</span>
                    </div>
                    <div className={styles.swapBridgeLine} />
                </div>

                {/* Sách giao */}
                <div className={styles.giveSection}>
                    <div className={styles.sectionHeaderLine}>
                        <span className={styles.pillGive}>
                            Sách bạn giao ({giveBooks.length} cuốn{totalGivePrice > 0 ? ` · ${formatVnd(totalGivePrice)}` : ''})
                        </span>
                    </div>
                    <div className={styles.booksList}>
                        {giveBooks.map((book) => (
                            <div key={book.id} className={styles.bookCard}>
                                <div className={styles.coverWrapper}>
                                    <BookCover title={book.title} coverUrl={book.coverUrl} index={0} />
                                </div>
                                <div className={styles.bookMeta}>
                                    <h3 className={styles.bookTitle}>{book.title}</h3>
                                    <p className={styles.bookAuthor}>{book.author}</p>
                                    <div className={styles.tagsRow}>
                                        <span className={styles.conditionTag}>
                                            {conditions[book.condition as keyof typeof conditions] ?? book.condition ?? 'Đã qua sử dụng'}
                                        </span>
                                        <span className={styles.priceTag}>
                                            {book.price ? formatVnd(book.price) : '—'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Value balance summary bar */}
                <div className={styles.balanceBanner}>
                    <div className={styles.balanceInfo}>
                        <span className={styles.balanceLabel}>Cân bằng giá trị sách</span>
                        <span className={styles.balanceDetail}>
                            Nhận {formatVnd(totalReceivePrice)} ↔ Giao {formatVnd(totalGivePrice)}
                        </span>
                    </div>
                    <div className={styles.balancePill}>
                        <strong>{moneyText}</strong>
                    </div>
                </div>
            </div>

            {/* Financial & Escrow Bento Section */}
            <div className={styles.bentoSection}>
                <h3 className={styles.sectionHeading}>
                    <ShieldCheck size={16} className={styles.iconGold} />
                    <span>Thỏa thuận tài chính & Bảo chứng</span>
                </h3>
                <div className={styles.bentoGrid}>
                    <div className={styles.bentoTile}>
                        <div className={styles.bentoTileHeader}>
                            <ShieldCheck size={15} className={styles.iconGoldSmall} />
                            <span>Tiền cọc bảo chứng</span>
                        </div>
                        <div className={styles.bentoTileValue}>
                            {detail.viewerFundingAmount ? formatVnd(detail.viewerFundingAmount) : '100% giá trị sách đối tác'}
                        </div>
                        <div className={styles.bentoTileNote}>
                            Hoàn lại 100% vào ví khi hoàn tất giao dịch an toàn (POL-14)
                        </div>
                    </div>

                    <div className={styles.bentoTile}>
                        <div className={styles.bentoTileHeader}>
                            <Banknote size={15} className={styles.iconGoldSmall} />
                            <span>Bù chênh lệch</span>
                        </div>
                        <div className={styles.bentoTileValue}>
                            {moneyText}
                        </div>
                        <div className={styles.bentoTileNote}>
                            Thanh toán từ số dư ví khi xác nhận đặt cọc
                        </div>
                    </div>
                </div>
            </div>

            {/* Shipping & Delivery Addresses Bento Section */}
            <div className={styles.bentoSection}>
                <h3 className={styles.sectionHeading}>
                    <Truck size={16} className={styles.iconGold} />
                    <span>Phương thức & Địa chỉ giao nhận</span>
                </h3>

                <div className={styles.shippingModeCallout}>
                    <Truck size={18} className={styles.shippingCalloutIcon} />
                    <div className={styles.shippingCalloutText}>
                        <strong>Giao nhận độc lập 2 chiều qua bưu tá</strong>
                        <p>Mỗi bên tự đóng gói và tự trả cước chiều gửi của mình (0 đ cấn trừ sàn)</p>
                    </div>
                </div>

                <div className={styles.addressesGrid}>
                    <div className={styles.addressCard}>
                        <div className={styles.addressCardHeader}>
                            <div className={styles.addressCardTitleGroup}>
                                <MapPin size={14} className={styles.iconGoldSmall} />
                                <span>Địa chỉ nhận của bạn</span>
                            </div>
                            <span className={detail.viewerAddress ? styles.badgeReady : styles.badgeWaiting}>
                                {detail.viewerAddress ? '✓ Đã sẵn sàng' : 'Chưa chọn'}
                            </span>
                        </div>
                        <div className={styles.addressCardBody}>
                            {detail.viewerAddress ? (
                                <>
                                    <p className={styles.addressName}>
                                        <strong>{detail.viewerAddress.recipientName}</strong> · {detail.viewerAddress.phone}
                                    </p>
                                    <p className={styles.addressDetail}>{detail.viewerAddress.detail}</p>
                                </>
                            ) : (
                                <p className={styles.addressPlaceholder}>
                                    Chưa thiết lập (chọn qua nút Đề xuất lại hoặc Chấp nhận)
                                </p>
                            )}
                        </div>
                    </div>

                    <div className={styles.addressCard}>
                        <div className={styles.addressCardHeader}>
                            <div className={styles.addressCardTitleGroup}>
                                <MapPin size={14} className={styles.iconGoldSmall} />
                                <span>Địa chỉ nhận của đối tác</span>
                            </div>
                            <span className={detail.partnerAddress ? styles.badgeReady : styles.badgeWaiting}>
                                {detail.partnerAddress ? '✓ Đã cập nhật' : '⏳ Chờ cập nhật'}
                            </span>
                        </div>
                        <div className={styles.addressCardBody}>
                            {detail.partnerAddress ? (
                                <>
                                    <p className={styles.addressName}>
                                        <strong>{detail.partnerAddress.recipientName}</strong> · {detail.partnerAddress.phone}
                                    </p>
                                    <p className={styles.addressDetail}>{detail.partnerAddress.detail}</p>
                                </>
                            ) : (
                                <p className={styles.addressPlaceholder}>
                                    Chờ @{detail.partner.username} cập nhật khi chấp nhận
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Initial Message (if provided) */}
            {detail.initialMessage && (
                <div className={styles.messageBox}>
                    <span className={styles.messageLabel}>Lời nhắn kèm đề nghị:</span>
                    <p className={styles.messageText}>"{detail.initialMessage}"</p>
                </div>
            )}
        </div>
    );
}
