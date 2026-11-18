import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url))
const { chromium, expect } = require('playwright/test')
const { preview } = await import(pathToFileURL(require.resolve('vite')).href)
const origin = 'http://127.0.0.1:4225'
const out = path.join(root, '.tmp/auction-driver')
const code = 'LL-ABCDEF123456'
const shipmentPath = '/driver?trackingCode=' + code
const now = '2026-11-18T06:30:00.000Z'
const orderId = '00000000-0000-4000-8000-000000000001'
const auctionId = '00000000-0000-4000-8000-000000000002'
const exchangeParcel = {
  exchangeId: auctionId, activeLeg: 'initiator', trackingCode: 'GHN-QA-TRAODOI',
  carrierCode: 'SIMULATOR', carrierName: 'Lật Lại Express', status: 'InTransit',
  readyForPickup: true, bothDelivered: false, itemsSummary: 'Kiện trao đổi QA', fee: 0,
  sender: { name: 'Bạn đọc A', phone: '', detail: 'Điểm QA A' },
  receiver: { name: 'Bạn đọc B', phone: '', detail: 'Điểm QA B' },
  shippedAt: now, lastEvent: 'Bưu tá đang đi giao', legs: [],
}
await mkdir(out, { recursive: true })
const server = await preview({
  configFile: false, root: path.join(root, 'apps/user-web'),
  preview: { host: '127.0.0.1', port: 4225, strictPort: true },
})
let browser
try {
  browser = await chromium.launch()
  for (const viewer of ['Buyer', 'Operator', 'DemoBuyer']) {
    const demo = viewer === 'DemoBuyer'
    const context = await browser.newContext({ viewport: { width: viewer === 'Buyer' ? 390 : 1440, height: 900 } })
    await context.routeWebSocket('**/*', (socket) => socket.close())
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const commands = []
    let read = false
    let delivered = false
    let started = false
    let version = 4
    const demoCommands = []
    const actor = {
      id: viewer === 'Operator' ? auctionId : orderId, email: 'driver@example.test',
      displayName: 'Tài khoản QA', status: 'ACTIVE', roles: viewer === 'Operator' ? ['TEST_OPERATOR'] : ['MEMBER'],
    }
    await context.route('**/*', (route) => {
      const req = route.request()
      const url = new URL(req.url())
      const endpoint = url.pathname
      if (!endpoint.startsWith('/api/v1/')) return url.origin === origin ? route.continue() : route.abort()
      if (endpoint === '/api/v1/auth/login') return route.fulfill({
        json: { accessToken: 'fixture', refreshToken: 'x'.repeat(43), expiresIn: 900, user: actor },
      })
      if (endpoint === '/api/v1/auth/me') return route.fulfill({ json: actor })
      if (endpoint === '/api/v1/demo/skip') return route.fulfill({ json: { enabled: demo } })
      if (endpoint === `/api/v1/me/auctions/${auctionId}/participation`) return route.fulfill({ json: {
        auctionId, alias: 1, mode: 'Manual', ownLevel: 30000, boughtNow: false, leading: true,
        state: 'Sold', currentPrice: 30000, minimumBid: null, fulfillmentMethod: 'SelfCollect',
        won: true, orderId, finalPrice: 30000, paymentDeadline: null, serverTime: now,
      } })
      if (endpoint === `/api/v1/me/point-orders/${orderId}`) return route.fulfill({ json: {
        id: orderId, auctionId, title: 'Sách QA', pointName: 'Điểm demo', role: 'Buyer',
        state: delivered ? 'Inspection' : 'InTransit', version,
        amounts: { bookPrice: 30000, outboundFee: 0, buyerTotal: 30000 },
        fulfillmentMethod: 'CarrierOutbound', paymentDeadline: null, paidAt: now, serverTime: now,
        report: { outcome: 'Pass', inspectedAt: now, note: null, scope: 'Kiểm tra tình trạng QA' },
        acceptanceDeadline: null, acceptedAt: now, collectionDeadline: null,
        collectedAt: delivered ? now : null, inspectionDeadline: delivered ? '2026-11-21T06:30:00.000Z' : null,
        returnDeadline: null, refunded: false, resolution: null,
        delivery: {
          recipientName: 'Người nhận QA', phone: '0900000000', localityCode: 'DEMO-A', detail: 'Địa chỉ QA',
          outboundFee: 0, trackingCode: code, dispatchedAt: '2026-11-18T06:15:00.000Z',
          deliveryDeadline: '2026-11-28T06:15:00.000Z', deliveredAt: delivered ? now : null,
          demoOutForDeliveryAt: started ? now : null,
        },
      } })
      if (endpoint === '/api/v1/shipments/carrier/orders/active') return route.fulfill({ json: exchangeParcel })
      if (endpoint === '/api/v1/shipments/carrier/orders/recent') return route.fulfill({ json: [] })
      if (endpoint === '/api/v1/point-orders/delivery-tracking/' + code) {
        read = true
        assert.equal(req.headers().authorization, 'Bearer fixture')
        return route.fulfill({ json: {
          orderId, auctionId, trackingCode: code, title: 'Sách QA', pointName: 'Điểm demo',
          dispatchedAt: '2026-11-18T06:15:00.000Z', deliveryDeadline: '2026-11-28T06:15:00.000Z',
          status: delivered ? 'Delivered' : 'InTransit', outcomeAt: delivered ? now : null,
          viewer: demo ? 'Buyer' : viewer, canReport: viewer === 'Operator' && !delivered, serverTime: now,
          canDemoControl: demo, version, demoOutForDeliveryAt: started ? now : null,
        } })
      }
      if (endpoint === `/api/v1/point-orders/${orderId}/demo-start-delivery` ||
          endpoint === `/api/v1/point-orders/${orderId}/demo-deliver`) {
        assert.equal(demo, true)
        assert.equal(req.method(), 'POST')
        assert.deepEqual(req.postDataJSON(), { expectedVersion: version })
        assert.ok(req.headers()['idempotency-key'])
        if (endpoint.endsWith('/demo-start-delivery')) {
          assert.equal(started, false)
          started = true
          demoCommands.push('Start')
        } else {
          assert.equal(started, true)
          delivered = true
          demoCommands.push('Deliver')
        }
        version++
        return route.fulfill({ json: {
          id: orderId, entityType: 'PointOrder', entityId: orderId, auctionId, orderId,
          version, state: delivered ? 'Inspection' : 'InTransit',
          currentPrice: null, minimumBid: null, leading: false, serverTime: now,
        } })
      }
      if (endpoint === '/api/v1/operations/simulator/point-delivery-events') {
        assert.equal(viewer, 'Operator')
        const body = req.postDataJSON()
        assert.equal(body.trackingCode, code)
        assert.equal(body.outcome, 'Delivered')
        assert.equal(body.eventId, req.headers()['idempotency-key'])
        commands.push({ key: req.headers()['idempotency-key'], body })
        delivered = true
        if (commands.length === 1) return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE' } })
        return route.fulfill({ json: {
          id: body.eventId, entityType: 'PointOrder', entityId: orderId, auctionId, orderId,
          version: 5, state: 'Inspection', currentPrice: null, minimumBid: null, leading: false, serverTime: now,
        } })
      }
      if (endpoint === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } })
      return route.fulfill({ status: 404, json: { code: 'NotFound' } })
    })
    if (viewer === 'Buyer') {
      await page.goto(origin + '/driver')
      await expect(page.getByRole('region', { name: 'Thông tin kiện sách' })).toContainText(exchangeParcel.trackingCode)
      await expect(page.getByRole('button', { name: '4. Giao thành công & Ký nhận POD' })).toBeEnabled()
      await page.screenshot({ path: path.join(out, 'exchange.png') })
      await page.getByRole('searchbox', { name: 'Mã vận đơn' }).fill(code.toLowerCase())
      await page.getByRole('button', { name: 'Tìm đơn' }).click()
    } else {
      await page.goto(origin + shipmentPath + (demo ? '&demo=1' : ''))
    }
    await expect(page.getByRole('heading', { name: 'Đăng nhập để xem vận đơn' })).toBeVisible()
    assert.equal(read, false)
    await page.getByRole('link', { name: 'Đăng nhập', exact: true }).click()
    await page.getByLabel(/^Email/).fill(actor.email)
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password')
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(page.getByRole('heading', { name: demo ? 'Hãng đã nhận sách' : 'Sách đang được giao' })).toBeVisible()
    await expect(page.getByRole('searchbox', { name: 'Mã vận đơn' })).toHaveValue(code)
    await expect(page.getByRole('list', { name: 'Tiến trình vận chuyển' })).toBeVisible()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: path.join(out, viewer.toLowerCase() + '.png') })
    const deliver = page.getByRole('button', { name: '3. Giao thành công', exact: true })
    if (viewer === 'Buyer') {
      await expect(deliver).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Về đơn đấu giá' })).toHaveAttribute('href', '/auctions/' + auctionId + '/order')
    } else if (demo) {
      await expect(deliver).toBeDisabled()
      assert.deepEqual(demoCommands, [])
      await page.getByRole('button', { name: /2\. Bắt đầu đi giao/ }).click()
      await expect(page.getByText('Bưu tá đã bắt đầu đi giao. Đơn đang ở bước Nhận sách.')).toBeVisible()
      await expect(deliver).toBeEnabled()
      assert.deepEqual(demoCommands, ['Start'])
      await page.getByRole('link', { name: 'Về đơn đấu giá' }).click()
      await expect(page.getByRole('heading', { name: 'Bưu tá đang đi giao sách cho bạn' })).toBeVisible()
      await expect(page.getByRole('listitem').filter({ has: page.getByText('Đang diễn ra', { exact: true }) })).toContainText('Nhận sách')
      await page.getByRole('link', { name: 'Mở Simulator giao hàng · Demo', exact: true }).click()
      await expect(deliver).toBeEnabled()
      assert.deepEqual(demoCommands, ['Start'])
      await deliver.click()
      await page.getByRole('dialog').getByRole('button', { name: 'Ghi nhận kết quả' }).click()
      await expect(page.getByRole('heading', { name: 'Sách đã giao thành công' })).toBeVisible()
      await page.getByRole('link', { name: 'Về đơn đấu giá' }).click()
      await expect(page.getByRole('heading', { name: 'Kiểm tra sách bạn đã nhận' })).toBeVisible()
      assert.deepEqual(demoCommands, ['Start', 'Deliver'])
    } else {
      await expect(page.getByRole('region', { name: 'Thông tin kiện sách' })).toContainText(code)
      await expect(page.getByText('1. Đã nhận sách từ điểm', { exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Quy trình giao nhận kiện đấu giá' })).toBeVisible()
      await page.setViewportSize({ width: 320, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await page.screenshot({ path: path.join(out, 'operator-mobile.png') })
      await deliver.click()
      await page.getByRole('dialog').getByRole('button', { name: 'Ghi nhận kết quả' }).click()
      await page.getByRole('button', { name: 'Thử lại báo kết quả' }).click()
      await expect(page.getByRole('heading', { name: 'Sách đã giao thành công' })).toBeVisible()
      await expect(deliver).toHaveCount(0)
      assert.equal(commands.length, 2)
      assert.deepEqual(commands[0], commands[1])
    }
    assert.deepEqual(errors, [])
    await context.close()
  }
  console.log('PASS: Driver lookup, buyer view, operator exact replay and two separate demo stages.')
} finally {
  await browser?.close()
  await new Promise((resolve) => server.httpServer.close(resolve))
}
