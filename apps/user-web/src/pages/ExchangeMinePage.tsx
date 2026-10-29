import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '../hooks/useSession'
import { ArrowLeftRight, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { ROUTES, formatVnd } from '../lib/routes'
import { getExchangeTransactions, getExchangeCounts } from '../services/exchange'
import type { ExchangeItem, ExchangeTab, ExchangeBook } from '../lib/mock/exchangeMine'
import { BookCover } from '../components/BookCover'
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
        case 'INSPECTING': return { text: 'Đang kiểm tra sách', class: styles.statusActive }
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
    const currentTab: ExchangeTab = rawTab && Object.hasOwn(TAB_MAPPINGS, rawTab) ? rawTab as ExchangeTab : 'sent'
    const rawPage = Number(searchParams.get('page') ?? 1)
    const currentPage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1

    const { data: countsData } = useQuery({
        queryKey: ['exchangeCounts', actor],
        queryFn: getExchangeCounts,
        enabled: !!actor
    })

    const { data: listData, isLoading, isError, isFetching, refetch } = useQuery({
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
        const index = e.key === 'ArrowRight' ? (currentIndex + 1) % tabKeys.length
            : e.key === 'ArrowLeft' ? (currentIndex - 1 + tabKeys.length) % tabKeys.length
            : e.key === 'Home' ? 0 : e.key === 'End' ? tabKeys.length - 1 : undefined
        if (index === undefined) return
        e.preventDefault()
        setTab(tabKeys[index])
        document.getElementById(`tab-${tabKeys[index]}`)?.focus()
    }

    if (!actor) return <div className={styles.container}><h1 className={styles.pageTitle}>Trao đổi của tôi</h1><p>{auth.status === 'loading' ? 'Đang kiểm tra đăng nhập…' : 'Đăng nhập để xem trao đổi của bạn.'}</p>{auth.status !== 'loading' && <Link className={styles.btnAction} to="/login?returnUrl=%2Fexchange%2Fmine">Đăng nhập</Link>}</div>
    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.pageTitle}>Trao đổi của tôi</h1>
                <p className={styles.pageSubtitle}>Theo dõi đề nghị đã gửi, phản hồi từ người khác và tiến trình đổi sách của bạn.</p>
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
                            type="button"
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
                aria-busy={isFetching}
            >
                {isLoading && (
                    <div className={styles.loading} role="status">Đang tải trao đổi…</div>
                )}

                {isError && (
                    <div className={styles.error} role="alert">
                        <h2>Chưa tải được trao đổi</h2>
                        <p>Kiểm tra kết nối rồi thử lại. Mục bạn đang xem vẫn được giữ.</p>
                        <button type="button" disabled={isFetching} onClick={() => void refetch()} className={styles.btnAction} style={{ width: 'auto', marginTop: 16 }}>{isFetching ? 'Đang tải lại…' : 'Thử lại'}</button>
                    </div>
                )}

                {!isLoading && !isError && listData && listData.data.length === 0 && (
                    <div className={styles.emptyState}>
                        <ArrowLeftRight size={32} aria-hidden="true" />
                        <h2 className={styles.emptyStateTitle}>
                            {currentTab === 'sent' && 'Bạn chưa gửi đề nghị nào'}
                            {currentTab === 'received' && 'Chưa có đề nghị nào gửi đến bạn'}
                            {currentTab === 'active' && 'Không có giao dịch nào đang thực hiện'}
                            {currentTab === 'done' && 'Chưa có giao dịch nào hoàn tất'}
                        </h2>
                        <p>{currentTab === 'sent' ? 'Tìm một cuốn bạn muốn đọc rồi gửi đề nghị từ trang sách.'
                            : currentTab === 'received' ? 'Khi có người muốn đổi sách với bạn, đề nghị sẽ xuất hiện ở đây.'
                            : currentTab === 'active' ? 'Các trao đổi được chấp nhận sẽ xuất hiện ở đây để bạn theo dõi.'
                            : 'Các trao đổi hoàn tất sẽ được lưu ở đây.'}</p>
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
                    <BookCover
                        title={mainBook.title}
                        coverUrl={mainBook.coverUrl}
                        index={0}
                        className={styles.bookCoverImage}
                    />
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
                        <p className={styles.username}>{item.partner.username}</p>
                    </div>
                </div>
                <p className={styles.dateText}>Tạo ngày {formatDate(item.createdAt)}</p>
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
                        <div className={styles.exchangeIconLabel}>{statusInfo.text}</div>
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
