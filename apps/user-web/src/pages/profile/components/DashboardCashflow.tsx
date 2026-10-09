export function DashboardCashflow() {
  return (
    <>
      {/*  3. INCOME / EXPENSE & CASHFLOW SECTION  */}
<section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-lg">
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
<div className="flex flex-col gap-1">
<div className="flex items-center gap-2">
<span className="material-symbols-outlined text-primary text-[22px]">finance_chip</span>
<h2 className="font-headline-md text-headline-md text-primary">Dòng tiền &amp; Thống kê lưu khố (6 tháng)</h2>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant">
            Đối soát doanh thu bán sách, trúng đấu giá và ngân sách sưu tập thư tịch.
          </p>
</div>
{/*  Legends  */}
<div className="flex items-center gap-space-md flex-wrap">
<div className="flex items-center gap-1.5">
<span className="w-3.5 h-3.5 rounded-sm bg-primary inline-block"></span>
<span className="font-label-md text-label-md text-on-surface">Thu nhập bán &amp; đấu giá</span>
</div>
<div className="flex items-center gap-1.5">
<span className="w-3.5 h-3.5 rounded-sm bg-secondary inline-block"></span>
<span className="font-label-md text-label-md text-on-surface">Chi phí sưu tầm sách</span>
</div>
</div>
</div>
<div className="grid grid-cols-1 lg:grid-cols-4 gap-space-lg items-center">
{/*  SVG Visual Chart Container (3 Cols)  */}
<div className="lg:col-span-3 bg-surface-container-low rounded-xl p-space-md relative overflow-hidden">
<div className="w-full h-64 flex flex-col justify-between">
{/*  Inline SVG Chart with Archetypal Archival Grid  */}
<svg className="w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 680 220">
{/*  Grid background lines  */}
<line stroke="#ede8de" stroke-dasharray="4 4" strokeWidth="1" x1="40" x2="660" y1="30" y2="30"></line>
<line stroke="#ede8de" stroke-dasharray="4 4" strokeWidth="1" x1="40" x2="660" y1="80" y2="80"></line>
<line stroke="#ede8de" stroke-dasharray="4 4" strokeWidth="1" x1="40" x2="660" y1="130" y2="130"></line>
<line stroke="#dedad0" strokeWidth="1" x1="40" x2="660" y1="180" y2="180"></line>
{/*  Y Axis labels  */}
<text fill="#717974" font-family="Inter" font-size="11" text-anchor="end" x="32" y="34">8M</text>
<text fill="#717974" font-family="Inter" font-size="11" text-anchor="end" x="32" y="84">5M</text>
<text fill="#717974" font-family="Inter" font-size="11" text-anchor="end" x="32" y="134">2M</text>
<text fill="#717974" font-family="Inter" font-size="11" text-anchor="end" x="32" y="184">0</text>
{/*  Month 5 (Th.5)  */}
{/*  Bar Green (Income: 4.8M)  */}
<rect fill="#00261a" height="92" rx="2" width="26" x="85" y="88"></rect>
{/*  Bar Terracotta (Expense: 2.5M)  */}
<rect fill="#994530" height="52" rx="2" width="26" x="115" y="128"></rect>
<text fill="#414844" font-family="Inter" font-size="12" font-weight="500" text-anchor="middle" x="113" y="202">Th.5</text>
{/*  Month 6 (Th.6)  */}
{/*  Bar Green (Income: 3.9M)  */}
<rect fill="#00261a" height="75" rx="2" width="26" x="185" y="105"></rect>
{/*  Bar Terracotta (Expense: 3.1M)  */}
<rect fill="#994530" height="62" rx="2" width="26" x="215" y="118"></rect>
<text fill="#414844" font-family="Inter" font-size="12" font-weight="500" text-anchor="middle" x="213" y="202">Th.6</text>
{/*  Month 7 (Th.7)  */}
{/*  Bar Green (Income: 6.2M)  */}
<rect fill="#00261a" height="115" rx="2" width="26" x="285" y="65"></rect>
{/*  Bar Terracotta (Expense: 1.8M)  */}
<rect fill="#994530" height="38" rx="2" width="26" x="315" y="142"></rect>
<text fill="#414844" font-family="Inter" font-size="12" font-weight="500" text-anchor="middle" x="313" y="202">Th.7</text>
{/*  Month 8 (Th.8)  */}
{/*  Bar Green (Income: 4.1M)  */}
<rect fill="#00261a" height="80" rx="2" width="26" x="385" y="100"></rect>
{/*  Bar Terracotta (Expense: 4.5M)  */}
<rect fill="#994530" height="87" rx="2" width="26" x="415" y="93"></rect>
<text fill="#414844" font-family="Inter" font-size="12" font-weight="500" text-anchor="middle" x="413" y="202">Th.8</text>
{/*  Month 9 (Th.9)  */}
{/*  Bar Green (Income: 5.8M)  */}
<rect fill="#00261a" height="108" rx="2" width="26" x="485" y="72"></rect>
{/*  Bar Terracotta (Expense: 2.9M)  */}
<rect fill="#994530" height="58" rx="2" width="26" x="515" y="122"></rect>
<text fill="#414844" font-family="Inter" font-size="12" font-weight="500" text-anchor="middle" x="513" y="202">Th.9</text>
{/*  Month 10 (Th.10 - Current)  */}
{/*  Bar Green (Income: 7.6M)  */}
<rect fill="#00261a" height="138" rx="2" width="26" x="585" y="42"></rect>
{/*  Bar Terracotta (Expense: 3.4M)  */}
<rect fill="#994530" height="66" rx="2" width="26" x="615" y="114"></rect>
<text fill="#414844" font-family="Inter" font-size="12" font-weight="600" text-anchor="middle" x="613" y="202">Th.10</text>
</svg>
</div>
</div>
{/*  Mini Summary Beside Chart (1 Col)  */}
<div className="flex flex-col gap-space-md">
<div className="p-space-md rounded bg-surface-container-low flex flex-col gap-1">
<span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Tổng thu 6 tháng qua</span>
<span className="font-currency-display text-headline-sm text-primary font-headline-sm font-bold">32.400.000 ₫</span>
<span className="font-label-sm text-label-sm text-on-surface-variant">Bao gồm 8 phiên thanh lý ấn bản</span>
</div>
<div className="p-space-md rounded bg-surface-container-low flex flex-col gap-1">
<span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Tổng chi sưu tầm</span>
<span className="font-currency-display text-headline-sm text-secondary font-headline-sm font-bold">18.250.000 ₫</span>
<span className="font-label-sm text-label-sm text-on-surface-variant">Mua 14 tác phẩm bổ sung kho</span>
</div>
<div className="p-space-md rounded bg-primary-container text-on-primary flex flex-col gap-1">
<span className="font-label-sm text-label-sm text-primary-fixed uppercase tracking-wider">Thặng dư tích lũy</span>
<span className="font-currency-display text-headline-sm font-headline-sm font-bold">+14.150.000 ₫</span>
<span className="font-label-sm text-label-sm text-on-primary/80">Hiệu suất sưu tầm tăng 24%</span>
</div>
</div>
</div>
</section>
    </>
  );
}