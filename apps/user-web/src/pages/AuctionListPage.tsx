import { Pagination } from "../components/Pagination";
import { usePaginationFocus } from "../components/Pagination/usePaginationFocus";
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AuctionEmptyArt } from '../components/AuctionEmptyArt'
import { AuctionGrid } from '../components/AuctionGrid'
import { useSearchParams, Link } from 'react-router-dom'
import { ArrowRight, BookOpen, ChevronDown, Gavel, HelpCircle, Search, ShieldCheck, SlidersHorizontal, Store, X } from 'lucide-react'
import { AuctionCard } from '../components/AuctionCard'
import { FilterSelect } from '../components/FilterSelect'
import { useAuctionListLive } from '../hooks/useAuctionLive'
import { listAuctions, type AuctionSummary } from '../services/auctions'
import { ROUTES } from '../lib/routes'
import { useSession } from '../hooks/useSession'
import styles from './AuctionListPage.module.css'
import { outcomeUnknown } from '../hooks/useAuctionClock'
import { conditions as conditionLabels } from '../lib/listing-labels'
import {
  CONDITIONS, ENDING, FILTER_KEYS, PRICE_RANGES, activeFilterCount, matches, readFilters,
  type Condition, type Ending, type PriceRange,
} from '../lib/auction-filters'

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
    title: 'Trả giá theo lịch phiên',
    body: 'Người bán chọn thời lượng 1–168 giờ. Trả giá theo bước hoặc chọn mua ngay nếu còn khả dụng; mức tự động chỉ mình bạn xem được. Phiên cần đủ người đăng ký (ít nhất 4) và đặt cọc, không đủ trước hạn thì phiên bị hủy và hoàn cọc; ví giữ tiền cọc và mức bạn đang dẫn, hoàn lại khi bạn không thắng.',
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
    next.delete('auctionPage')
    if (value) next.set(key, value); else next.delete(key)
    setParams(next, { replace: true })
  }

  const filters = readFilters(params)
  const { point, buyNow: buyNowOnly } = filters
  const rawSort = params.get('sort') ?? ''
  const sort = Object.hasOwn(SORTS, rawSort) ? rawSort : 'endingSoon'
  const all = result.data?.items ?? []
  const points = [...new Set([...all.map((a) => a.pointName), ...(point ? [point] : [])])].sort()
  const now = result.data ? Date.parse(result.data.serverTime) : Date.now()
  const items = all.filter((a) => matches(a, filters, now)).sort(SORTS[sort]!.compare)
  const size = 8
  const normalizePage = (key: string, total: number) => {
    const value = Number(params.get(key) || 1)
    return Math.min(Number.isSafeInteger(value) && value > 0 ? value : 1, Math.max(1, Math.ceil(total / size)))
  }
  const currentPage = normalizePage('auctionPage', items.length)
  const upcomingItems = upcoming.data?.items ?? []
  const upcomingPage = normalizePage('upcomingPage', upcomingItems.length)
  const requestActiveFocus = usePaginationFocus(currentPage, JSON.stringify([filters, sort]), 'auction-list-title', result.isFetching)
  const requestUpcomingFocus = usePaginationFocus(upcomingPage, 'upcoming', 'auction-upcoming-title', upcoming.isFetching)
  const selectPage = (key: string, page: number) => {
    if (key === 'auctionPage') requestActiveFocus(); else requestUpcomingFocus();
    const next = new URLSearchParams(params)
    if (page > 1) next.set(key, String(page)); else next.delete(key)
    setParams(next)
  }
  const activeCount = activeFilterCount(filters)
  const filtered = activeCount > 0 || !!filters.q
  // The search box types freely; the URL follows after a short pause.
  const [query, setQuery] = useState(filters.q)
  useEffect(() => {
    if (query.trim() === filters.q) return
    const timer = window.setTimeout(() => update('q', query.trim()), 250)
    return () => window.clearTimeout(timer)
  })
  const clearFilters = () => {
    const next = new URLSearchParams(params)
    FILTER_KEYS.forEach((key) => next.delete(key))
    next.delete('auctionPage')
    setParams(next, { replace: true })
    setQuery('')
  }
  const [panelOpen, setPanelOpen] = useState(activeCount > 0)
  const toggleCondition = (c: Condition) => {
    const set = new Set(filters.conditions)
    if (set.has(c)) set.delete(c); else set.add(c)
    update('cond', CONDITIONS.filter((x) => set.has(x)).join(','))
  }
  const chips: { key: string; label: string; clear: () => void }[] = [
    ...(point ? [{ key: 'point', label: point, clear: () => update('point', '') }] : []),
    ...filters.conditions.map((c) => ({ key: `cond-${c}`, label: conditionLabels[c], clear: () => toggleCondition(c) })),
    ...(filters.price ? [{ key: 'price', label: PRICE_RANGES[filters.price].label, clear: () => update('price', '') }] : []),
    ...(filters.ending ? [{ key: 'ends', label: `Kết thúc ${ENDING[filters.ending].label.toLowerCase()}`, clear: () => update('ends', '') }] : []),
    ...(filters.noBids ? [{ key: 'noBids', label: 'Chưa có lượt trả giá', clear: () => update('noBids', '') }] : []),
    ...(buyNowOnly ? [{ key: 'buyNow', label: 'Có giá mua ngay', clear: () => update('buyNow', '') }] : []),
  ]
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

          {/* Search, sort and the filter panel */}
          <div className={styles.toolbar} role="search" aria-label="Tìm và lọc phiên đấu giá">
            <label className={styles.search}>
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">Tìm theo tên sách hoặc tác giả</span>
              <input
                type="search"
                value={query}
                placeholder="Tìm tên sách, tác giả…"
                autoComplete="off"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.preventDefault(); setQuery('') } }}
              />
              {query && (
                <button type="button" className={styles.searchClear} onClick={() => setQuery('')} aria-label="Xóa nội dung tìm">
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </label>
            <button
              type="button"
              className={styles.filterToggle}
              aria-expanded={panelOpen}
              aria-controls="auction-filter-panel"
              onClick={() => setPanelOpen((o) => !o)}
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              <span>Bộ lọc</span>
              {activeCount > 0 && <b className={styles.filterCount}>{activeCount}</b>}
              <ChevronDown size={16} className={styles.filterChevron} aria-hidden="true" />
            </button>
            <div className={styles.sort}>
              <FilterSelect
                id="auction-sort"
                label="Sắp xếp"
                searchable={false}
                value={sort}
                onChange={(v) => update('sort', v === 'endingSoon' ? '' : v)}
                options={Object.entries(SORTS).map(([value, s]) => ({ value, label: s.label }))}
              />
            </div>
          </div>

          <div id="auction-filter-panel" className={styles.filterPanel} hidden={!panelOpen}>
            <fieldset className={styles.filterGroup}>
              <legend>Tình trạng sách</legend>
              <div className={styles.chipRow}>
                {CONDITIONS.map((c) => (
                  <button key={c} type="button" className={styles.chip} aria-pressed={filters.conditions.includes(c)} onClick={() => toggleCondition(c)}>
                    {conditionLabels[c]}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className={styles.filterGroup}>
              <legend>Mức giá hiện tại</legend>
              <div className={styles.chipRow}>
                {(Object.keys(PRICE_RANGES) as PriceRange[]).map((key) => (
                  <button key={key} type="button" className={styles.chip} aria-pressed={filters.price === key} onClick={() => update('price', filters.price === key ? '' : key)}>
                    {PRICE_RANGES[key].label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className={styles.filterGroup}>
              <legend>Kết thúc</legend>
              <div className={styles.chipRow}>
                {(Object.keys(ENDING) as Ending[]).map((key) => (
                  <button key={key} type="button" className={styles.chip} aria-pressed={filters.ending === key} onClick={() => update('ends', filters.ending === key ? '' : key)}>
                    {ENDING[key].label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className={styles.filterGroup}>
              <span className={styles.groupLabel}>Điểm nhận và lựa chọn khác</span>
              <div className={styles.filterRow}>
                <div className={styles.point}>
                  <FilterSelect
                    id="auction-point"
                    label="Điểm nhận sách"
                    searchable={false}
                    value={point}
                    onChange={(v) => update('point', v)}
                    options={[{ value: '', label: 'Tất cả điểm nhận' }, ...points.map((p) => ({ value: p, label: p }))]}
                  />
                </div>
                <label className={styles.checkbox}>
                  <input type="checkbox" checked={buyNowOnly} onChange={() => update('buyNow', buyNowOnly ? '' : '1')} />
                  <span>Có giá mua ngay</span>
                </label>
                <label className={styles.checkbox}>
                  <input type="checkbox" checked={filters.noBids} onChange={() => update('noBids', filters.noBids ? '' : '1')} />
                  <span>Chưa có lượt trả giá</span>
                </label>
              </div>
            </div>
          </div>

          {filtered && result.data && (
            <div className={styles.activeFilterNote} role="status">
              <span className={styles.resultCount}>
                <b>{items.length}</b> / {all.length} phiên{filters.q && <> khớp “<b>{filters.q}</b>”</>}
              </span>
              {chips.length > 0 && (
                <ul className={styles.activeChips} aria-label="Bộ lọc đang dùng">
                  {chips.map((chip) => (
                    <li key={chip.key}>
                      <button type="button" onClick={chip.clear} aria-label={`Bỏ lọc ${chip.label}`}>
                        {chip.label} <X size={13} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className={styles.clearBtn} onClick={clearFilters}>
                Xóa tất cả
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
              <AuctionEmptyArt variant={filtered ? 'filter' : 'shelf'} />
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
                  onClick={clearFilters}
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
              {items.slice((currentPage - 1) * size, currentPage * size).map((auction) => (
                <AuctionCard key={auction.id} auction={auction} serverTime={result.data.serverTime} />
              ))}
            </AuctionGrid>
          )}

          {showData && <Pagination page={currentPage} totalItems={items.length} pageSize={size}
            onPageChange={page => selectPage('auctionPage', page)} hideOnSinglePage itemLabel="phiên trong danh sách" ariaLabel="Phân trang đấu giá đang mở" bordered />}

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
                <h2 id="auction-upcoming-title" tabIndex={-1}>Đang nhận đăng ký</h2>
                <span className={styles.countBadgeUpcoming}>
                  {upcoming.data.items.length} phiên chờ đủ người
                </span>
              </div>
            </div>
            <p className={styles.upcomingHint}>
              Sách đã qua kiểm định. Đăng ký và đặt cọc để giữ chỗ; phiên mở khi đủ số người tối thiểu (tự mở ngay hoặc theo giờ người bán hẹn). Không đủ người trước hạn thì phiên bị hủy và hoàn cọc.
            </p>
            <AuctionGrid className={styles.grid} orderKey={upcoming.data.items.map((a) => a.id).join(':')}>
              {upcomingItems.slice((upcomingPage - 1) * size, upcomingPage * size).map((auction) => (
                <AuctionCard key={auction.id} auction={auction} serverTime={upcoming.data.serverTime} />
              ))}
            </AuctionGrid>
            <Pagination page={upcomingPage} totalItems={upcomingItems.length} pageSize={size}
              onPageChange={page => selectPage('upcomingPage', page)} hideOnSinglePage itemLabel="phiên đã hẹn" ariaLabel="Phân trang đấu giá sắp mở" bordered />
          </section>
        )}

        <div className={styles.footerNote}>
          <p>Điểm giao nhận và ví tiền được mô phỏng phục vụ đồ án Lật Lại — Nền tảng luân chuyển sách cũ.</p>
        </div>
      </div>
    </div>
  )
}
