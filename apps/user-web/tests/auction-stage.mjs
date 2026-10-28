// Frontend-only Chromium regression. Auction data and book covers below are
// explicitly synthetic QA fixtures; no API/Mongo writes, bids or credentials.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url))
const webRequire = createRequire(new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')
const { createServer } = await import(pathToFileURL(webRequire.resolve('vite')).href)
const origin = 'http://127.0.0.1:5196'
const evidence = path.join(root, process.env.AUCTION_MOTION_EVIDENCE ?? '.impeccable/review/auction-entrance')
await mkdir(evidence, { recursive: true })
process.env.VITE_API_BASE_URL = `${origin}/api/v1`
const serverTime = new Date().toISOString()
const id = i => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const items = ['Alice — QA', 'Mrs. Dalloway — QA', 'Siddhartha — QA'].map((title, i) => ({
  id: id(i + 1), listingId: id(i + 11), title, state: 'Active', startPrice: 100000,
  currentPrice: null, step: 10000, minimumBid: 100000, buyNowPrice: i === 0 ? 300000 : null,
  bidderCount: 0, startAt: serverTime, endAt: new Date(Date.now() + (i + 20) * 3600000).toISOString(),
  pointName: 'Điểm mô phỏng QA', demoOnly: true,
  book: { revisionId: id(i + 21), authors: ['Tác giả QA'], condition: 'Good', pages: '',
    coverNote: '', notes: '', accessories: '', description: 'Dữ liệu giả lập để kiểm tra giao diện',
    hasMissingPages: false, photos: [{ id: id(i + 31), width: 240, height: 360 }] },
}))
let mode = 'ready'
let photosFailed = false
const errors = []
const checks = []
let server, browser
// Main removed AuctionHero/AuctionEntrance intentionally on 27/10. Exercise the
// shipped compact route; do not resurrect the retired banner to satisfy tests.
async function fixture(context) {
  // This fixture has no realtime server. Keep Socket.IO away from Vite's
  // same-origin dev proxy, which would otherwise forward back into itself.
  await context.routeWebSocket(/\/socket\.io\//, socket => socket.close())
  await context.route(`${origin}/socket.io/**`, route =>
    route.fulfill({ status: 503, json: { message: 'Frontend-only QA: realtime unavailable' } }))
  await context.route(`${origin}/api/v1/**`, async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/v1/auctions') {
      if (url.searchParams.get('phase') === 'upcoming') return route.fulfill({ json: { items: [], serverTime } })
      if (mode === 'pending') await new Promise(resolve => setTimeout(resolve, 1700))
      if (mode === 'error') return route.fulfill({ status: 503, json: { message: 'QA unavailable' } })
      return route.fulfill({ json: { items: mode === 'empty' ? [] : items, serverTime } })
    }
    const photo = url.pathname.match(/\/auctions\/([^/]+)\/photos\//)
    if (photo) {
      if (photosFailed) return route.fulfill({ status: 503, json: { message: 'QA photo unavailable' } })
      return route.fulfill({ json: { id: id(31), width: 240, height: 360,
        url: `${origin}/__qa_cover/${items.findIndex(item => item.id === photo[1])}`, expiresAt: new Date(Date.now() + 600000).toISOString() } })
    }
    return route.fulfill({ status: 503, json: { message: 'Frontend-only QA: unrelated API unavailable' } })
  })
  await context.route(`${origin}/__qa_cover/*`, route => {
    const index = Number(route.request().url().split('/').at(-1))
    const colors = ['#eee1be', '#784235', '#274b46']
    const titles = ['ALICE', 'MRS.', 'SIDDHARTHA']
    return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360" viewBox="0 0 240 360"><rect width="240" height="360" fill="${colors[index]}"/><rect x="12" y="12" width="216" height="336" fill="none" stroke="#b89653" stroke-width="2"/><text x="120" y="100" text-anchor="middle" font-family="Georgia" font-size="${index === 2 ? 23 : 34}" fill="${index === 0 ? '#5c0202' : '#fcf8db'}">${titles[index]}</text>${index === 1 ? '<text x="120" y="140" text-anchor="middle" font-family="Georgia" font-size="27" fill="#fcf8db">DALLOWAY</text>' : ''}<path d="M65 230H175M85 250H155" stroke="#b89653" stroke-width="2"/><text x="120" y="320" text-anchor="middle" font-family="sans-serif" font-size="15" fill="${index === 0 ? '#5c0202' : '#fcf8db'}">QA — BÌA MẪU</text></svg>` })
  })
}

const cards = page => page.locator('[data-auction-id]')
const compact = async page => {
  await page.getByRole('heading', { level: 1, name: 'Đấu giá sách cũ' }).waitFor()
  assert.equal(await page.locator('[data-auction-entrance], #auction-hero-title').count(), 0)
  assert.equal(await page.locator('[inert]').count(), 0)
  assert.equal(await page.evaluate(() => document.body.style.overflow), '')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
}
try {
  server = await createServer({ root: path.join(root, 'apps/user-web'), server: { host: '127.0.0.1', port: 5196, strictPort: true } })
  await server.listen()
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) })
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    await fixture(context)
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    mode = 'ready'; photosFailed = false
    await page.goto(origin + '/auctions')
    await cards(page).nth(2).waitFor()
    await compact(page)
    await page.getByRole('checkbox', { name: /có giá mua ngay/i }).check()
    await page.waitForURL('**/auctions?buyNow=1')
    await page.waitForFunction(() => document.querySelectorAll('[data-auction-id]').length === 1)
    assert.equal(await cards(page).first().getAttribute('data-auction-id'), items[0].id)
    await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click()
    await cards(page).nth(2).waitFor()
    await page.evaluate(async value => {
      const { queryClient } = await import('/src/lib/session.ts')
      queryClient.setQueryData(['auctions'], value)
    }, { items: items.map((item, index) => index === 0 ? { ...item, currentPrice: 120000, bidderCount: 1 } : item), serverTime })
    await cards(page).first().getByText(/120.000/).waitFor()
    await compact(page)
    await page.screenshot({ path: path.join(evidence, 'compact-' + width + '.png'), fullPage: true })
    await page.getByRole('banner').getByRole('link', { name: 'Trang chủ Lật lại' }).click()
    await page.waitForURL(origin + '/')
    await page.goBack()
    await cards(page).nth(2).waitFor()
    await compact(page)
    mode = 'pending'
    await page.reload()
    await page.getByLabel('Đang tải phiên đấu giá', { exact: true }).waitFor()
    await cards(page).nth(2).waitFor()
    mode = 'empty'
    await page.reload()
    await page.getByRole('heading', { name: 'Kệ đấu giá đang chờ những cuốn sách mới' }).waitFor()
    assert.equal(await cards(page).count(), 0)
    mode = 'error'
    await page.reload()
    await page.getByRole('heading', { name: 'Chưa tải được danh sách phiên' }).waitFor()
    mode = 'ready'
    await page.getByRole('button', { name: 'Thử tải lại', exact: true }).click()
    await cards(page).nth(2).waitFor()
    photosFailed = true
    await page.reload()
    await cards(page).first().getByText('Chưa tải được ảnh', { exact: true }).waitFor()
    assert(await cards(page).first().getByRole('link', { name: 'Xem phiên đấu giá ' + items[0].title, exact: true }).isVisible())
    photosFailed = false
    await page.reload()
    await cards(page).first().locator('img').waitFor()
    await compact(page)
    checks.push(width + ': compact page without curtain/banner; filter and cache price update; Back; pending/empty/error/retry; failed covers preserve navigation; responsive layout')
    await context.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(path.join(evidence, 'runtime.json'), JSON.stringify({ date: '2026-10-28', fixture: 'synthetic frontend-only, no API/DB writes; current compact auction route', checks, pageErrors: errors }, null, 2))
  console.log(JSON.stringify({ status: 'PASS', checks, evidence }, null, 2))
} finally { await browser?.close(); await server?.close() }
