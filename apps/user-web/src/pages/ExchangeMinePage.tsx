import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '../hooks/useSession'
import { ArrowLeftRight, X, Star, ChevronLeft, ChevronRight } from 'lucide-react'
import { ROUTES, formatVnd } from '../lib/routes'
import { getExchangeTransactions, getExchangeCounts } from '../services/exchange'
import type { ExchangeItem, ExchangeTab, ExchangeBook } from '../lib/mock/exchangeMine'
import styles from './ExchangeMinePage.module.css'

const TAB_MAPPINGS: Record<ExchangeTab, string> = {
    sent: 'Đề nghị đã gửi',
    received: 'Đề nghị nhận được',
    active: 'Đang thực hiện',
    done: 'Hoàn tất'
}

function getStatusInfo(status: string) {
    switch (status) {
        case 'FUNDING': return { text: 'Chờ đặt cọc', class: styles.statusActive }
        case 'RESOLUTION_PENDING': return { text: 'Đang cần xử lý', class: styles.statusActive }
        // Sent / Received
        case 'PENDING': return { text: 'Chờ phản hồi', class: styles.statusPending }
        case 'REJECTED': return { text: 'Bị từ chối', class: styles.statusRejected }
        case 'EXPIRED': return { text: 'Hết hạn', class: styles.statusRejected }
        case 'CANCELLED': return { text: 'Đã hủy', class: styles.statusRejected }
        // Active
        case 'DELIVERING': return { text: 'Đang giao nhận', class: styles.statusActive }
        case 'WAITING_YOU_SEND': return { text: 'Chờ bạn gửi sách', class: styles.statusActive }
        case 'WAITING_YOU_CONFIRM': return { text: 'Chờ xác nhận', class: styles.statusActive }
        // Done
        case 'COMPLETED': return { text: 'Hoàn tất', class: styles.statusDone }
        case 'NEED_REVIEW': return { text: 'Cần đánh giá', class: styles.statusActive }
        default: return { text: status, class: styles.statusPending }
    }
}

function formatDate(isoString: string) {
    try {
        return new Intl.DateTimeFormat('vi-VN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        }).format(new Date(isoString));
    } catch {
        return isoString;
    }
}

export default function ExchangeMinePage() {
    const [searchParams, setSearchParams] = useSearchParams()
    const auth = useSession()
    const actor = auth.status === 'authenticated' ? auth.user.id : undefined

    const rawTab = searchParams.get('tab')
    const currentTab: ExchangeTab = rawTab && rawTab in TAB_MAPPINGS ? rawTab as ExchangeTab : 'sent'
    const rawPage = Number(searchParams.get('page') ?? 1)
    const currentPage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1

    const { data: countsData } = useQuery({
        queryKey: ['exchangeCounts', actor],
        queryFn: getExchangeCounts,
        enabled: !!actor
    })

    const { data: listData, isLoading, isError, refetch } = useQuery({
        queryKey: ['exchangeTransactions', actor, currentTab, currentPage],
        queryFn: () => getExchangeTransactions(currentTab, currentPage),
        enabled: !!actor
    })

    const setTab = (tab: ExchangeTab) => {
        setSearchParams({ tab, page: '1' })
    }

    const setPage = (page: number) => {
        setSearchParams({ tab: currentTab, page: page.toString() })
    }

    const handleTabKeyDown = (e: React.KeyboardEvent, tabKeys: ExchangeTab[], currentIndex: number) => {
        if (e.key === 'ArrowRight') {
            e.preventDefault()
            const next = tabKeys[(currentIndex + 1) % tabKeys.length]
            setTab(next)
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault()
            const prev = tabKeys[(currentIndex - 1 + tabKeys.length) % tabKeys.length]
            setTab(prev)
        }
    }

    if (!actor) return <div className={styles.container}><h1 className={styles.pageTitle}>Trao đổi của tôi</h1><p>{auth.status === 'loading' ? 'Đang kiểm tra đăng nhập…' : 'Đăng nhập để xem trao đổi của bạn.'}</p>{auth.status !== 'loading' && <Link className={styles.btnAction} to="/login?returnUrl=%2Fexchange%2Fmine">Đăng nhập</Link>}</div>
    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.pageTitle}>Trao Đổi Của Tôi</h1>
                <p className={styles.pageSubtitle}>Quản lý những cuộc hành trình mới của những trang sách. Theo dõi các lời đề nghị, đang thực hiện và lịch sử trao đổi của bạn.</p>
            </div>

            <div 
                className={styles.tabList} 
                role="tablist" 
                aria-label="Các loại trao đổi"
            >
                {(Object.keys(TAB_MAPPINGS) as ExchangeTab[]).map((tab, idx, arr) => {
                    const count = countsData ? countsData[tab] : '—';
                    const isActive = currentTab === tab;
                    return (
                        <button
                            key={tab}
                            role="tab"
                            aria-selected={isActive}
                            aria-controls={`panel-${tab}`}
                            id={`tab-${tab}`}
                            tabIndex={isActive ? 0 : -1}
                            className={`${styles.tabButton} ${isActive ? styles.tabButtonActive : ''}`}
                            onClick={() => setTab(tab)}
                            onKeyDown={(e) => handleTabKeyDown(e, arr, idx)}
                        >
                            {TAB_MAPPINGS[tab]} ({count})
                        </button>
                    )
                })}
            </div>

            <div 
                className={styles.tabPanel}
                role="tabpanel" 
                id={`panel-${currentTab}`} 
                aria-labelledby={`tab-${currentTab}`}
                aria-live="polite"
            >
                {isLoading && (
                    <div className={styles.loading}>Đang tải dữ liệu...</div>
                )}

                {isError && (
                    <div className={styles.error}>
                        <p>Đã xảy ra lỗi khi tải dữ liệu.</p>
                        <button onClick={() => refetch()} className={styles.btnAction} style={{ width: 'auto', marginTop: 16 }}>Thử lại</button>
                    </div>
                )}

                {!isLoading && !isError && listData && listData.data.length === 0 && (
                    <div className={styles.emptyState}>
                        <h3 className={styles.emptyStateTitle}>
                            {currentTab === 'sent' && 'Bạn chưa gửi đề nghị nào'}
                            {currentTab === 'received' && 'Chưa có đề nghị nào gửi đến bạn'}
                            {currentTab === 'active' && 'Không có giao dịch nào đang thực hiện'}
                            {currentTab === 'done' && 'Chưa có giao dịch nào hoàn tất'}
                        </h3>
                        {currentTab === 'sent' && (
                            <Link to={ROUTES.exchange} className={styles.emptyStateBtn}>Tìm sách để trao đổi</Link>
                        )}
                        {currentTab === 'received' && (
                            <Link to={ROUTES.sell} className={styles.emptyStateBtn}>Đăng thêm sách</Link>
                        )}
                    </div>
                )}

                {!isLoading && !isError && listData && listData.data.length > 0 && (
                    <div className={styles.cardList}>
                        {listData.data.map(item => (
                            <ExchangeCard key={item.id} item={item} />
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {!isLoading && !isError && listData && listData.total > 5 && (
                    <div className={styles.pagination}>
                        <div className={styles.paginationInner}>
                            <button 
                                className={styles.pageBtn} 
                                disabled={currentPage <= 1}
                                onClick={() => setPage(currentPage - 1)}
                                aria-label="Trang trước"
                            >
                                <ChevronLeft size={18} />
                            </button>
                            
                            {Array.from({ length: Math.ceil(listData.total / 5) }).map((_, i) => (
                                <button
                                    key={i + 1}
                                    className={`${styles.pageBtn} ${currentPage === i + 1 ? styles.pageBtnActive : ''}`}
                                    onClick={() => setPage(i + 1)}
                                    aria-label={`Trang ${i + 1}`}
                                    aria-current={currentPage === i + 1 ? 'page' : undefined}
                                >
                                    {i + 1}
                                </button>
                            ))}

                            <button 
                                className={styles.pageBtn}
                                disabled={currentPage >= Math.ceil(listData.total / 5)}
                                onClick={() => setPage(currentPage + 1)}
                                aria-label="Trang sau"
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

function ExchangeCard({ item }: { item: ExchangeItem }) {
    const isRejected = item.status === 'REJECTED' || item.status === 'EXPIRED' || item.status === 'CANCELLED';
    const statusInfo = getStatusInfo(item.status);
    
    const renderBookCol = (books: ExchangeBook[], label: string, isGive: boolean) => {
        const mainBook = books[0];
        const count = books.length;
        const title = count > 1 ? `${mainBook.title} +${count - 1} cuốn` : mainBook.title;
        const author = count > 1 ? 'Nhiều tác giả' : mainBook.author;
        const totalPrice = books.reduce((sum, b) => sum + (b.price || 0), 0);
        
        return (
            <div className={`${styles.bookSide} ${isGive ? styles.bookSideGive : styles.bookSideReceive}`}>
                {/* Text and Image swap sides depending on Receive or Give */}
                {!isGive && (
                    <div className={styles.bookInfo}>
                        <span className={styles.bookLabel}>{label}</span>
                        <h3 className={styles.bookTitle} title={title}>{title}</h3>
                        <p className={styles.bookAuthor}>{author}</p>
                        {totalPrice > 0 && (
                            <p className={styles.bookPrice}>{formatVnd(totalPrice)}</p>
                        )}
                    </div>
                )}
                
                <div className={styles.bookCoverWrapper}>
                    {count > 1 && <div className={styles.multipleBooksBg1} />}
                    {count > 1 && <div className={styles.multipleBooksBg2} />}
                    {mainBook.coverUrl ? (
                        <img src={mainBook.coverUrl} alt={`Bìa sách ${mainBook.title}`} className={styles.bookCoverImage} />
                    ) : (
                        <div className={styles.bookCoverImage} />
                    )}
                    {count > 1 && (
                        <div className={styles.multipleBooksBadge}>{count}</div>
                    )}
                </div>

                {isGive && (
                    <div className={styles.bookInfo}>
                        <span className={`${styles.bookLabel} ${styles.bookLabelGive}`}>{label}</span>
                        <h3 className={styles.bookTitle} title={title}>{title}</h3>
                        <p className={styles.bookAuthor}>{author}</p>
                        {totalPrice > 0 && (
                            <p className={styles.bookPrice}>{formatVnd(totalPrice)}</p>
                        )}
                    </div>
                )}
            </div>
        )
    }

    const firstReceiveTitle = item.receiveBooks[0]?.title || 'Sách';
    const firstGiveTitle = item.giveBooks[0]?.title || 'Sách';

    return (
        <div className={`${styles.card} ${isRejected ? styles.cardRejected : ''}`}>
            {/* Left */}
            <div className={styles.leftCol}>
                <div className={styles.userInfo}>
                    <div className={styles.avatar}>
                        {item.partner.username.charAt(0)}
                    </div>
                    <div>
                        <p className={styles.username}>@{item.partner.username}</p>
                        <div className={styles.rating}>
                            <Star size={12} fill="currentColor" strokeWidth={0} />
                            <span className={styles.ratingValue}>
                                {item.partner.rating ? `(${item.partner.rating.toFixed(1).replace('.', ',')})` : '(Chưa có đánh giá)'}
                            </span>
                        </div>
                    </div>
                </div>
                <p className={styles.dateText}>GỬI: {formatDate(item.createdAt)}</p>
            </div>

            {/* Middle */}
            <div className={styles.middleCol}>
                {renderBookCol(item.receiveBooks, 'Bạn nhận', false)}
                
                <div className={styles.exchangeIconCol}>
                    <div className={styles.exchangeIconBox}>
                        {isRejected ? (
                            <X size={20} strokeWidth={2.5} />
                        ) : (
                            <ArrowLeftRight size={20} strokeWidth={2.5} />
                        )}
                    </div>
                    {isRejected ? (
                        <div className={styles.exchangeIconLabel}>Bị từ chối</div>
                    ) : (
                        <div className={styles.exchangeIconLabel}>
                            {item.moneyCompensationType === 'user_pays' && (
                                <>Bạn bù<br/>+{formatVnd(item.moneyAmount || 0)}</>
                            )}
                            {item.moneyCompensationType === 'other_pays' && (
                                <>Họ bù<br/>+{formatVnd(item.moneyAmount || 0)}</>
                            )}
                            {item.moneyCompensationType === 'none' && 'Đổi ngang'}
                        </div>
                    )}
                </div>

                {renderBookCol(item.giveBooks, 'Bạn giao', true)}
            </div>

            {/* Mobile Action Row (Hidden on Desktop) */}
            <div className={styles.mobileActionRow}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div className={`${styles.statusPill} ${statusInfo.class}`}>
                        {statusInfo.text}
                    </div>
                </div>
                <Link 
                    to={ROUTES.exchangeDetail(item.id)} 
                    className={styles.btnAction}
                    aria-label={`Xem chi tiết trao đổi ${firstReceiveTitle} lấy ${firstGiveTitle} với @${item.partner.username}`}
                >
                    Xem chi tiết
                </Link>
            </div>

            {/* Right Column (Hidden on Mobile) */}
            <div className={styles.rightCol}>
                <div className={`${styles.statusPill} ${statusInfo.class}`}>
                    {statusInfo.text}
                </div>
                <Link 
                    to={ROUTES.exchangeDetail(item.id)} 
                    className={styles.btnAction}
                    aria-label={`Xem chi tiết trao đổi ${firstReceiveTitle} lấy ${firstGiveTitle} với @${item.partner.username}`}
                >
                    Xem chi tiết
                </Link>
            </div>
        </div>
    )
}
