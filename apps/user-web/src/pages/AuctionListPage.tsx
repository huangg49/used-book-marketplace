import { useQuery } from '@tanstack/react-query'
import { AuctionGrid } from '../components/AuctionGrid'
import { useSearchParams, Link } from 'react-router-dom'
import { ArrowRight, BookOpen, ChevronDown, Gavel } from 'lucide-react'
import { AuctionCard } from '../components/AuctionCard'
import { AuctionHero } from '../components/AuctionHero'
import { AuctionEntrance } from '../components/AuctionEntrance'
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
  ['Sách được kiểm tra trước', 'Người bán gửi sách tới điểm giao nhận. Sách đạt kiểm tra thì người bán tự đăng phiên ngay hoặc hẹn giờ mở.'],
  ['Bạn chọn mức trả', 'Trả trực tiếp hoặc đặt mức tự động tối đa. Mức tự động chỉ bạn thấy; lượt trả giá không giữ tiền trong ví.'],
  ['Thắng phiên, thanh toán rồi nhận sách', 'Người thắng thanh toán từ ví mô phỏng trong 24 giờ sau khi phiên kết thúc. Mua ngay có hạn 15 phút. Bạn tự nhận sách tại điểm ở TP.HCM.'],
]

export function AuctionListPage() {
  const auth = useSession()
  const [params, setParams] = useSearchParams()
  const live = useAuctionListLive()
  const result = useQuery({ queryKey: ['auctions'], queryFn: () => listAuctions(), retry: false, staleTime: 0, refetchInterval: live ? false : 30_000 })
  // ADR 0047: scheduled auctions are shown apart and cannot be bid on yet.
  const upcoming = useQuery({ queryKey: ['auctions', 'upcoming'], queryFn: () => listAuctions('upcoming'), retry: false, refetchInterval: 60_000 })
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
  return <div className={styles.page}>
    <AuctionEntrance />
    <AuctionHero auctions={showData ? all : []} serverTime={result.data?.serverTime} pending={result.isPending} stale={stale} failed={result.isError && !stale} />
    <div className={styles.content}>
    <details className={styles.guide}>
      <summary>Cách tham gia đấu giá <ChevronDown size={16} aria-hidden="true" /></summary>
      <ol>{STEPS.map(([title, body]) => <li key={title}><strong>{title}</strong><p>{body}</p></li>)}</ol>
    </details>
    <section aria-labelledby="auction-list-title">
      <div className={styles.sectionHeading}><h2 id="auction-list-title" tabIndex={-1}>Phiên đang mở</h2><div className={styles.sectionActions}><span className={styles.connection}><i className={live && !result.isError ? styles.live : ''} aria-hidden="true" />{result.isError ? 'Chưa cập nhật được giá' : live ? 'Giá cập nhật trực tiếp' : 'Cập nhật mỗi 30 giây'}</span>{auth.status === 'authenticated' && <Link to={ROUTES.myAuctions}>Đấu giá của tôi <ArrowRight size={15} aria-hidden="true" /></Link>}<Link className={styles.create} to={ROUTES.auctionCreate()}><Gavel size={15} aria-hidden="true" />Đấu giá sách của bạn</Link></div></div>
      <div className={styles.toolbar} role="group" aria-label="Lọc và sắp xếp phiên đấu giá">
        <div className={styles.point}><FilterSelect id="auction-point" label="Điểm nhận sách" value={point} onChange={(v) => update('point', v)} options={[{ value: '', label: 'Tất cả điểm nhận' }, ...points.map((p) => ({ value: p, label: p }))]} /></div>
        <label className={styles.checkbox}><input type="checkbox" checked={buyNowOnly} onChange={() => update('buyNow', buyNowOnly ? '' : '1')} />Có giá mua ngay</label>
        <div className={styles.sort}><FilterSelect id="auction-sort" label="Sắp xếp" value={sort} onChange={(v) => update('sort', v === 'endingSoon' ? '' : v)} options={Object.entries(SORTS).map(([value, s]) => ({ value, label: s.label }))} /></div>
      </div>
      {filtered && <p className={styles.filterScope}>Bộ lọc áp dụng cho kệ phiên bên dưới.</p>}
      <div className={styles.resultLine}><p role="status">{result.data ? `${items.length} phiên${filtered ? ' phù hợp' : ' đang mở'}` : result.isError ? 'Chưa tải được danh sách' : 'Đang tải phiên đấu giá…'}</p>{filtered && <button type="button" className={styles.textButton} onClick={() => { const next = new URLSearchParams(params); next.delete('point'); next.delete('buyNow'); setParams(next, {replace:true}) }}>Xóa bộ lọc</button>}</div>
      {result.isPending && <div className={styles.grid} aria-busy="true" aria-label="Đang tải phiên đấu giá">{Array.from({length:4}, (_, i) => <div key={i} className={styles.skeleton} />)}</div>}
      {result.isError && !stale && <div className={styles.empty} role="alert"><BookOpen size={32} aria-hidden="true" /><h3>Chưa tải được các phiên</h3><p>Kiểm tra kết nối rồi thử lại. Các lựa chọn bộ lọc của bạn vẫn được giữ.</p><button type="button" className={styles.action} onClick={() => void result.refetch()}>Thử lại</button></div>}
      {stale && <div className={styles.refreshError} role="alert"><p>Chưa làm mới được danh sách. Giá và trạng thái đang hiển thị là lần tải gần nhất.</p><button type="button" className={styles.textButton} onClick={() => void result.refetch()}>Thử cập nhật lại</button></div>}
      {result.data && !result.isError && items.length === 0 && <div className={styles.empty}>
        <BookOpen size={32} aria-hidden="true" /><h3>{filtered ? 'Chưa có phiên phù hợp' : 'Kệ đấu giá đang chờ sách mới'}</h3>
        <p>{filtered ? 'Thử bỏ bớt bộ lọc để khám phá các phiên khác.' : 'Phiên mới mở sau khi sách được kiểm tra tại điểm giao nhận. Trong lúc chờ, ghé kệ sách đang bán nhé.'}</p>
        {filtered ? <button type="button" className={styles.action} onClick={() => { const next = new URLSearchParams(params); next.delete('point'); next.delete('buyNow'); setParams(next, {replace:true}) }}>Xem tất cả phiên</button> : <Link className={styles.action} to={ROUTES.search}>Khám phá sách <ArrowRight size={16} aria-hidden="true" /></Link>}
      </div>}
      {result.data && showData && items.length > 0 && <AuctionGrid className={styles.grid} orderKey={layoutKey}>{items.map((auction) => <AuctionCard key={auction.id} auction={auction} serverTime={result.data.serverTime} />)}</AuctionGrid>}
      {all.length >= 50 && <p className={styles.limit}>Đang hiển thị tối đa 50 phiên sắp kết thúc. Bộ lọc và sắp xếp áp dụng trong danh sách này.</p>}
    </section>
    {!!upcoming.data?.items.length && <section aria-labelledby="auction-upcoming-title">
      <div className={styles.sectionHeading}><h2 id="auction-upcoming-title">Sắp mở</h2></div>
      <p className={styles.filterScope}>Người bán đã hẹn giờ mở các phiên này. Bạn có thể xem trước; trả giá và mua ngay mở khi phiên bắt đầu.</p>
      <AuctionGrid className={styles.grid} orderKey={upcoming.data.items.map((a) => a.id).join(':')}>{upcoming.data.items.map((auction) => <AuctionCard key={auction.id} auction={auction} serverTime={upcoming.data.serverTime} />)}</AuctionGrid>
    </section>}
    <p className={styles.demo}>Điểm giao nhận và tiền trong ví được mô phỏng cho đồ án.</p>
    </div>
  </div>
}
