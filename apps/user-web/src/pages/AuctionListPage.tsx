import { useQuery } from '@tanstack/react-query'
import { AuctionGrid } from '../components/AuctionGrid'
import { useSearchParams, Link } from 'react-router-dom'
import { ArrowRight, BookOpen, ChevronDown, Gavel, HelpCircle, ShieldCheck, Store } from 'lucide-react'
import { AuctionCard } from '../components/AuctionCard'
import { FilterSelect } from '../components/FilterSelect'
import { useAuctionListLive } from '../hooks/useAuctionLive'
import { listAuctions, type AuctionSummary } from '../services/auctions'
import { ROUTES } from '../lib/routes'
import { useSession } from '../hooks/useSession'
import styles from './AuctionListPage.module.css'
import { outcomeUnknown } from '../hooks/useAuctionClock'

const price = (a: AuctionSummary) => a.currentPrice ?? a.startPrice
const SORTS: Record<string, { label: string; compare: (a: AuctionSummary, b: AuctionSummary) => number }> = {
  endingSoon: { label: 'Sắp kết thúc', compare: (a, b) => a.endAt.localeCompare(b.endAt) },
  newest: { label: 'Mới mở', compare: (a, b) => b.startAt.localeCompare(a.startAt) },
  priceAsc: { label: 'Giá thấp đến cao', compare: (a, b) => price(a) - price(b) },
  priceDesc: { label: 'Giá cao đến thấp', compare: (a, b) => price(b) - price(a) },
}

const STEPS = [
  {
    step: '01',
    title: 'Kiểm định trước khi lên sàn',
    body: 'Người bán gửi sách tới điểm giao nhận TP.HCM. Nhân viên kiểm tra đạt chuẩn thì phiên mới được mở hoặc hẹn giờ mở.',
    icon: ShieldCheck,
  },
  {
    step: '02',
    title: 'Trả giá minh bạch 24 giờ',
    body: 'Trả giá theo bước hoặc chốt mua ngay nếu người bán cho phép. Mức tự động bảo mật tuyệt đối, không giữ tiền trước.',
    icon: Gavel,
  },
  {
    step: '03',
    title: 'Thanh toán & Nhận sách',
    body: 'Người thắng thanh toán qua ví mô phỏng trong 24 giờ sau phiên, nhận sách trực tiếp tại điểm giao nhận an tâm.',
    icon: Store,
  },
]

export function AuctionListPage() {
  const auth = useSession()
  const [params, setParams] = useSearchParams()
  const live = useAuctionListLive()
  const result = useQuery({
    queryKey: ['auctions'],
    queryFn: () => listAuctions(),
    retry: false,
    staleTime: 0,
    refetchInterval: live ? false : 30_000,
  })
  // ADR 0047: scheduled auctions are shown apart and cannot be bid on yet.
  const upcoming = useQuery({
    queryKey: ['auctions', 'upcoming'],
    queryFn: () => listAuctions('upcoming'),
    retry: false,
    refetchInterval: 60_000,
  })

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    setParams(next, { replace: true })
  }

  const point = params.get('point') ?? ''
  const buyNowOnly = params.get('buyNow') === '1'
  const sort = SORTS[params.get('sort') ?? ''] ? params.get('sort')! : 'endingSoon'
  const all = result.data?.items ?? []
  const points = [...new Set([...all.map((a) => a.pointName), ...(point ? [point] : [])])].sort()
  const items = all.filter((a) => (!point || a.pointName === point) && (!buyNowOnly || a.buyNowPrice !== null)).sort(SORTS[sort]!.compare)
  const filtered = !!point || buyNowOnly
  const stale = result.isError && !!result.data && outcomeUnknown(result.error)
  const showData = !!result.data && (!result.isError || stale)
  const layoutKey = items.map((a) => a.id).join(':')

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        {/* Compact, Elegant Page Header */}
        <header className={styles.pageHeader}>
          <div className={styles.headerText}>
            <h1 className={styles.pageTitle}>Đấu giá sách cũ</h1>
            <p className={styles.pageSubtitle}>
              Mỗi bản sách đều được kiểm định tình trạng tại điểm trước khi mở phiên. Người đọc tự do trả giá trong 24 giờ, nhận sách trực tiếp tại điểm giao nhận TP.HCM.
            </p>
          </div>

          <div className={styles.headerActions}>
            {auth.status === 'authenticated' && (
              <Link to={ROUTES.myAuctions} className={styles.myAuctionsBtn}>
                <span>Đấu giá của tôi</span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            )}
            <Link className={styles.createBtnMain} to={ROUTES.auctionCreate()}>
              <Gavel size={16} aria-hidden="true" />
              <span>Đấu giá sách của bạn</span>
            </Link>
          </div>
        </header>

        {/* Collapsible 3-Step Process Guide */}
        <section className={styles.guideSection} aria-label="Hướng dẫn tham gia đấu giá">
          <details className={styles.guide}>
            <summary>
              <div className={styles.summaryLeft}>
                <HelpCircle size={16} aria-hidden="true" />
                <span>3 bước tham gia sàn đấu giá Lật Lại</span>
              </div>
              <ChevronDown size={16} className={styles.summaryChevron} aria-hidden="true" />
            </summary>
            <div className={styles.stepsGrid}>
              {STEPS.map(({ step, title, body, icon: Icon }) => (
                <div key={step} className={styles.stepCard}>
                  <div className={styles.stepHeader}>
                    <span className={styles.stepNum}>{step}</span>
                    <Icon size={18} className={styles.stepIcon} aria-hidden="true" />
                  </div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              ))}
            </div>
          </details>
        </section>

        {/* Live Active Auctions Shelf */}
        <section aria-labelledby="auction-list-title" className={styles.mainShelf}>
          <div className={styles.sectionHeading}>
            <div className={styles.headingLeft}>
              <h2 id="auction-list-title" tabIndex={-1}>
                Phiên đang mở
              </h2>
              {result.data && (
                <span className={styles.countBadge}>
                  {items.length} phiên
                </span>
              )}
            </div>

            <div className={styles.headingActions}>
              <span className={styles.connection}>
                <i className={live && !result.isError ? styles.livePulse : ''} aria-hidden="true" />
                {result.isError ? 'Chưa cập nhật được giá' : live ? 'Giá cập nhật trực tiếp' : 'Cập nhật mỗi 30s'}
              </span>
            </div>
          </div>

          {/* Filter and Sort Toolbar */}
          <div className={styles.toolbar} role="group" aria-label="Lọc và sắp xếp phiên đấu giá">
            <div className={styles.point}>
              <FilterSelect
                id="auction-point"
                label="Điểm nhận sách"
                value={point}
                onChange={(v) => update('point', v)}
                options={[{ value: '', label: 'Tất cả điểm nhận' }, ...points.map((p) => ({ value: p, label: p }))]}
              />
            </div>

            <label className={styles.checkbox}>
              <input type="checkbox" checked={buyNowOnly} onChange={() => update('buyNow', buyNowOnly ? '' : '1')} />
              <span>Chỉ hiện có giá mua ngay</span>
            </label>

            <div className={styles.sort}>
              <FilterSelect
                id="auction-sort"
                label="Sắp xếp"
                value={sort}
                onChange={(v) => update('sort', v === 'endingSoon' ? '' : v)}
                options={Object.entries(SORTS).map(([value, s]) => ({ value, label: s.label }))}
              />
            </div>
          </div>

          {filtered && (
            <div className={styles.activeFilterNote}>
              <span>Đang lọc theo tiêu chí bạn chọn.</span>
              <button
                type="button"
                className={styles.clearBtn}
                onClick={() => {
                  const next = new URLSearchParams(params)
                  next.delete('point')
                  next.delete('buyNow')
                  setParams(next, { replace: true })
                }}
              >
                Xóa bộ lọc
              </button>
            </div>
          )}

          {/* Grid States */}
          {result.isPending && (
            <div className={styles.grid} aria-busy="true" aria-label="Đang tải phiên đấu giá">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className={styles.skeleton} />
              ))}
            </div>
          )}

          {result.isError && !stale && (
            <div className={styles.empty} role="alert">
              <BookOpen size={36} aria-hidden="true" />
              <h3>Chưa tải được danh sách phiên</h3>
              <p>Hệ thống tạm thời chưa kết nối được máy chủ. Các lựa chọn bộ lọc của bạn vẫn được giữ nguyên.</p>
              <button type="button" className={styles.retryBtn} onClick={() => void result.refetch()}>
                Thử tải lại
              </button>
            </div>
          )}

          {stale && (
            <div className={styles.refreshError} role="alert">
              <p>Chưa làm mới được danh sách. Giá và trạng thái đang hiển thị là lần tải gần nhất.</p>
              <button type="button" className={styles.textButton} onClick={() => void result.refetch()}>
                Thử cập nhật lại
              </button>
            </div>
          )}

          {result.data && !result.isError && items.length === 0 && (
            <div className={styles.empty}>
              <BookOpen size={36} aria-hidden="true" />
              <h3>{filtered ? 'Chưa có phiên phù hợp' : 'Kệ đấu giá đang chờ những cuốn sách mới'}</h3>
              <p>
                {filtered
                  ? 'Thử bỏ bớt bộ lọc để khám phá các phiên sách quý khác.'
                  : 'Phiên mới sẽ mở sau khi sách qua kiểm định tại điểm giao nhận TP.HCM. Trong lúc chờ đợi, bạn có thể ghé kệ sách đang bán.'}
              </p>
              {filtered ? (
                <button
                  type="button"
                  className={styles.retryBtn}
                  onClick={() => {
                    const next = new URLSearchParams(params)
                    next.delete('point')
                    next.delete('buyNow')
                    setParams(next, { replace: true })
                  }}
                >
                  Xem tất cả phiên
                </button>
              ) : (
                <div className={styles.emptyActions}>
                  <Link className={styles.retryBtn} to={ROUTES.auctionCreate()}>
                    <Gavel size={16} aria-hidden="true" />
                    <span>Mở phiên đấu giá ngay</span>
                  </Link>
                  <Link className={styles.secondaryBtn} to={ROUTES.search}>
                    <span>Khám phá sách đang bán</span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              )}
            </div>
          )}

          {result.data && showData && items.length > 0 && (
            <AuctionGrid className={styles.grid} orderKey={layoutKey}>
              {items.map((auction) => (
                <AuctionCard key={auction.id} auction={auction} serverTime={result.data.serverTime} />
              ))}
            </AuctionGrid>
          )}

          {all.length >= 50 && (
            <p className={styles.limit}>
              Đang hiển thị 50 phiên sắp kết thúc. Bộ lọc và sắp xếp áp dụng trong danh sách này.
            </p>
          )}
        </section>

        {/* Scheduled Auctions Section */}
        {!!upcoming.data?.items.length && (
          <section aria-labelledby="auction-upcoming-title" className={styles.upcomingSection}>
            <div className={styles.sectionHeading}>
              <div className={styles.headingLeft}>
                <h2 id="auction-upcoming-title">Sắp mở phiên</h2>
                <span className={styles.countBadgeUpcoming}>
                  {upcoming.data.items.length} phiên đã hẹn giờ
                </span>
              </div>
            </div>
            <p className={styles.upcomingHint}>
              Người bán đã qua kiểm định và hẹn giờ mở các phiên này. Bạn có thể xem trước và chuẩn bị tham gia trả giá khi phiên mở.
            </p>
            <AuctionGrid className={styles.grid} orderKey={upcoming.data.items.map((a) => a.id).join(':')}>
              {upcoming.data.items.map((auction) => (
                <AuctionCard key={auction.id} auction={auction} serverTime={upcoming.data.serverTime} />
              ))}
            </AuctionGrid>
          </section>
        )}

        <div className={styles.footerNote}>
          <p>Điểm giao nhận và ví tiền được mô phỏng phục vụ đồ án Lật Lại — Nền tảng luân chuyển sách cũ.</p>
        </div>
      </div>
    </div>
  )
}
