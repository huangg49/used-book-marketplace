import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { AuctionCard } from '../components/AuctionCard'
import { listAuctions, type AuctionSummary } from '../services/auctions'

// GET /auctions trả tối đa 50 phiên đang mở, sắp kết thúc trước; lọc và sắp xếp
// ở đây chỉ áp dụng trên danh sách đó.
const SORTS: Record<string, { label: string; compare: (a: AuctionSummary, b: AuctionSummary) => number }> = {
  endingSoon: { label: 'Sắp kết thúc', compare: (a, b) => a.endAt.localeCompare(b.endAt) },
  newest: { label: 'Mới mở', compare: (a, b) => b.startAt.localeCompare(a.startAt) },
  priceAsc: { label: 'Giá thấp đến cao', compare: (a, b) => price(a) - price(b) },
  priceDesc: { label: 'Giá cao đến thấp', compare: (a, b) => price(b) - price(a) },
}
function price(a: AuctionSummary) { return a.currentPrice ?? a.startPrice }

const STEPS = [
  ['Sách được kiểm tra trước', 'Người bán gửi sách tới điểm giao nhận; nhân viên kiểm tra rồi mới mở phiên 24 giờ.'],
  ['Trả giá hoặc đặt mức tối đa', 'Đặt giá tự động trả thay bạn từng bước, không vượt mức bạn chọn. Mức này chỉ bạn thấy.'],
  ['Thắng thì thanh toán, rồi nhận sách', 'Người thắng trả từ ví trong 24 giờ sau khi phiên đóng và nhận sách tại điểm.'],
]

export function AuctionListPage() {
  const [params, setParams] = useSearchParams()
  const result = useQuery({ queryKey: ['auctions'], queryFn: listAuctions, retry: false, staleTime: 0, refetchInterval: 30_000 })
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const point = params.get('point') ?? ''
  const buyNowOnly = params.get('buyNow') === '1'
  const sort = SORTS[params.get('sort') ?? ''] ? params.get('sort')! : 'endingSoon'
  const all = result.data?.items ?? []
  const points = [...new Set(all.map((a) => a.pointName))].sort()
  const items = all
    .filter((a) => (!point || a.pointName === point) && (!buyNowOnly || a.buyNowPrice !== null))
    .sort(SORTS[sort]!.compare)
  const filtered = point !== '' || buyNowOnly

  return (
    <main className="w-full bg-surface text-on-surface px-5 lg:px-12 py-8">
      <header className="mb-8 border-b border-outline-variant pb-6">
        <p className="text-[0.8rem] font-bold uppercase tracking-[0.08em] text-[#9b4027] mb-2">Đấu giá tại TP.HCM</p>
        <h1 className="font-headline-md text-3xl font-bold text-primary">Phiên đấu giá đang mở</h1>
        <p className="max-w-2xl text-on-surface-variant">
          Mỗi cuốn sách đã được nhân viên kiểm tra tại điểm giao nhận trước khi lên phiên. Lượt trả giá không giữ
          tiền trong ví; chỉ người thắng mới thanh toán.
        </p>
      </header>
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <aside className="w-full lg:w-64 shrink-0 flex flex-col gap-6" aria-label="Lọc phiên đấu giá">
          <label className="flex flex-col gap-2">
            Điểm giao nhận
            <select value={point} onChange={(event) => update('point', event.target.value)}>
              <option value="">Tất cả điểm</option>
              {points.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={buyNowOnly} onChange={() => update('buyNow', buyNowOnly ? '' : '1')} />
            Có giá mua ngay
          </label>
          <section className="bg-[#faf7f0] border-l-[3px] border-[#b38a49] p-4" aria-labelledby="auction-how">
            <h2 id="auction-how" className="font-headline-md text-lg font-bold text-primary mb-3">Cách đấu giá</h2>
            <ol className="flex flex-col gap-3 m-0 p-0 list-none">
              {STEPS.map(([title, body], index) => (
                <li key={title} className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-primary-container text-white text-xs font-bold grid place-items-center" aria-hidden="true">{index + 1}</span>
                  <span>
                    <strong className="block text-sm text-on-surface">{title}</strong>
                    <span className="text-[0.8125rem] leading-snug text-on-surface-variant">{body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
        <section className="flex-1 min-w-0 w-full" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <p className="m-0">{result.data ? `${items.length} phiên${filtered ? ' phù hợp' : ' đang mở'}` : 'Đang tải phiên đấu giá'}</p>
            <label className="flex items-center gap-2">
              Sắp xếp
              <select className="!w-auto" value={sort} onChange={(event) => update('sort', event.target.value === 'endingSoon' ? '' : event.target.value)}>
                {Object.entries(SORTS).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          {result.isPending && <p>Đang tải phiên đấu giá…</p>}
          {result.isError && (
            <div role="alert" className="flex flex-col items-start gap-3">
              <p className="m-0">Không tải được danh sách đấu giá. Vui lòng kiểm tra kết nối rồi thử lại.</p>
              <button type="button" className="px-5 py-3 border border-outline-variant rounded" onClick={() => void result.refetch()}>Thử lại</button>
            </div>
          )}
          {result.data && items.length === 0 && (
            <div className="py-12 text-center">
              <p className="font-headline-md text-xl font-bold text-primary mb-2">{filtered ? 'Không có phiên nào khớp bộ lọc' : 'Chưa có phiên đấu giá nào đang mở'}</p>
              <p className="text-on-surface-variant">
                {filtered ? 'Hãy bỏ bớt bộ lọc để xem các phiên khác.' : 'Phiên mới mở sau khi sách được kiểm tra tại điểm giao nhận. Hãy quay lại sau.'}
              </p>
              {filtered && (
                <button type="button" className="mt-4 px-5 py-3 border border-outline-variant rounded" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                  Xóa bộ lọc
                </button>
              )}
            </div>
          )}
          {result.data && items.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {items.map((auction) => <AuctionCard key={auction.id} auction={auction} serverTime={result.data.serverTime} />)}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
