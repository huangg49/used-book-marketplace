// Real Nest/Mongo reads on a disposable *_test database; storage is fake.
// Run with MONGO_TEST_URL pointed at the dedicated QA replica set, never app DB.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import {
  createTestApi,
  root,
  base,
  password,
} from "../../admin-web/tests/test-api.mjs";

const require = createRequire(
  new URL("../../admin-web/package.json", import.meta.url),
);
const webRequire = createRequire(new URL("../package.json", import.meta.url));
const { chromium } = require("playwright");
const { createServer } = await import(
  pathToFileURL(webRequire.resolve("vite")).href
);
const origin = "http://127.0.0.1:5192";
const evidence = path.join(root, ".tmp/journey-account-evidence");
await mkdir(evidence, { recursive: true });
Object.assign(process.env, {
  VITE_API_BASE_URL: base,
  AUTH_MAIL_PROVIDER: "local",
  AUTH_WEB_ORIGIN: origin,
  AUTH_MAIL_ENCRYPTION_KEY: "account-overview-test-only-encryption-key-000",
});
let fixture, server, browser;
try {
  fixture = await createTestApi({ corsOrigin: origin, listingCount: 4 });
  const targetId = randomUUID();
  const notices = Array.from({ length: 5 }, (_, index) => ({
    _id: randomUUID(),
    userId: fixture.member.user.id,
    kind: "AuctionOutbid",
    title: `Cập nhật phiên đấu giá ${index + 1}`,
    body: "DỮ LIỆU KIỂM THỬ. Có lượt trả giá mới; mở phiên để xem trạng thái hiện tại.",
    targetType: "Auction",
    targetId,
    dedupeKey: randomUUID(),
    createdAt: new Date(Date.now() - index * 60_000),
    readAt: null,
  }));
  await fixture.db.collection("member_notifications").insertMany(notices);
  assert.equal(
    (await fixture.api("/me/wallet", fixture.member.accessToken)).available,
    0,
  );
  assert.equal(
    (await fixture.api("/me/listings?limit=4", fixture.member.accessToken))
      .items.length,
    4,
  );
  process.chdir(path.join(root, "apps/user-web"));
  server = await createServer({
    root: process.cwd(),
    server: { host: "127.0.0.1", port: 5192, strictPort: true },
    logLevel: "error",
  });
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  const main=page.locator('#account-content');page.setDefaultTimeout(15000);
  async function login(heading='Việc của tôi'){await page.getByLabel(/^Email/).fill('member@operations.test');await page.getByLabel(/^Mật khẩu/).fill(password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await main.getByRole('heading',{name:heading,exact:true}).waitFor();}
  async function account(){
    await page.setViewportSize({width:1440,height:900});
    await page.getByRole('button',{name:/^Tài khoản của/}).click();
    await page.getByRole('navigation',{name:'Tài khoản cá nhân',exact:true}).getByRole('link',{name:'Việc của tôi',exact:true}).click();
    await main.getByRole('heading',{name:'Việc của tôi',exact:true}).waitFor();
  }
  async function capture(name,width){await page.setViewportSize({width,height:900});await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(evidence,name+'.png'),fullPage:true});}
  await page.goto(origin+'/account');await login('Tổng quan');
  await main.getByRole('heading',{name:'Thống kê tổng quan',exact:true}).waitFor({state:'attached'});
  await main.getByRole('heading',{name:'Dòng tiền',exact:false}).waitFor();
  const orders=main.getByRole('region',{name:'Theo dõi đơn hàng',exact:true});
  await orders.getByText('Chưa có đơn mua trong danh sách gần đây.',{exact:true}).waitFor();
  assert.equal(await main.getByText('#DM-8021',{exact:true}).count(),0);
  for(const width of [1440,768,390,320])await capture('overview-restored-'+width,width);
  // Exercise actual response shape without writing an order or altering money.
  // Positive/error cases here are explicitly intercepted UI fixtures.
  const orderId=randomUUID();
  const ordersUrl='**/api/v1/me/orders?limit=20';
  await page.route(ordersUrl,route=>route.fulfill({json:{items:[{id:orderId,title:'Đơn QA để kiểm liên kết',version:1,state:'AwaitingPayment',role:'Buyer',createdAt:new Date().toISOString()}],nextCursor:null}}));
  // A fresh browser session avoids reusing the overview's valid 15s cache.
  await page.reload();await login('Tổng quan');
  await orders.getByRole('link',{name:'Xem chi tiết đơn',exact:true}).waitFor();
  assert.equal(await orders.getByRole('link',{name:'Xem chi tiết đơn',exact:true}).getAttribute('href'),'/orders/'+orderId);
  await orders.getByRole('button',{name:'Đơn bán',exact:true}).click();
  await orders.getByText('Chưa có đơn bán trong danh sách gần đây.',{exact:true}).waitFor();
  await page.unroute(ordersUrl);
  await page.route(ordersUrl,route=>route.fulfill({status:503,json:{statusCode:503,code:'UNAVAILABLE',message:'QA read unavailable'}}));
  const cashflowUrl='**/api/v1/me/wallet/history**';
  await page.route(cashflowUrl,route=>route.fulfill({status:503,json:{statusCode:503,code:'UNAVAILABLE',message:'QA history unavailable'}}));
  await page.reload();await login('Tổng quan');
  await orders.getByRole('alert').waitFor();
  await main.getByText('Chưa tải đủ dữ liệu dòng tiền. Thử lại để xem số liệu đã xác nhận.',{exact:true}).waitFor();
  assert.equal(await main.getByText('Thặng dư tích lũy ròng',{exact:true}).count(),0);
  assert.equal(await orders.getByRole('link',{name:'Xem chi tiết đơn',exact:true}).count(),0);
  await page.unroute(ordersUrl);
  await page.unroute(cashflowUrl);
  await main.getByRole('button',{name:'Tải lại dòng tiền',exact:true}).click();
  await main.getByText('Biến động số dư gần nhất (Sổ cái Lật Lại)',{exact:true}).waitFor();
  await orders.getByRole('button',{name:'Tải lại đơn hàng',exact:true}).click();
  await orders.getByText('Chưa có đơn mua trong danh sách gần đây.',{exact:true}).waitFor();
  await account();
  await main.getByRole('link',{name:/^Đơn mua\/bán trực tiếp/}).waitFor();
  await main.getByRole('link',{name:/^Trao đổi của tôi/}).waitFor();await main.getByRole('link',{name:/^Đấu giá của tôi/}).waitFor();
  assert.equal(await main.getByText('4.9',{exact:false}).count(),0);
  // Overview and work destinations share the keyboard menu. Financial values
  // remain checked on the actual wallet screen as well.
  const menu=page.getByRole('button',{name:/^Tài khoản của/});await menu.click();await menu.press('ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement?.textContent?.trim()),'Tổng quan');await page.keyboard.press('Escape');
  assert.equal(await menu.getAttribute('aria-expanded'),'false');
  await main.getByRole('link',{name:'Thông tin tài khoản',exact:true}).click();await main.getByRole('heading',{name:'Hồ sơ của tôi',exact:true}).waitFor();await account();
  for(const width of [1440,768,390,320])await capture('task-hub-'+width,width);
  await main.getByRole('link',{name:'Cách mua, bán, đổi và đấu giá',exact:true}).click();await page.getByRole('heading',{name:'Bắt đầu với Lật lại',exact:true}).waitFor();
  const guide=page.getByRole('navigation',{name:'Bạn muốn làm gì?'});await guide.getByRole('link',{name:'Tôi muốn đổi sách',exact:true}).focus();await page.keyboard.press('Enter');
  await page.getByRole('heading',{name:'Tôi muốn đổi sách',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Tìm sách để đổi',exact:true}).getAttribute('href'),'/books?mode=Exchange');
  assert.equal(await page.locator('ol').evaluate(el=>getComputedStyle(el).listStyleType),'decimal');
  await page.getByRole('link',{name:'Về việc của tôi',exact:true}).click();await main.getByRole('link',{name:'Ví của tôi',exact:true}).click();
  await main.getByText('Số dư khả dụng',{exact:true}).waitFor();await account();
  await main.getByRole('link',{name:'Cách mua, bán, đổi và đấu giá',exact:true}).waitFor();
  // A server-side restriction must not advertise creating a new listing on the
  // hub; existing transaction destinations remain discoverable.
  await fixture.setUserStatus(fixture.member.user.id,'LOCKED');
  await page.getByRole('button',{name:'Đăng xuất',exact:true}).first().click();
  await page.goto(origin+'/account/work');await login();await main.getByRole('status').filter({hasText:'hạn chế hoặc khóa'}).waitFor();
  assert.equal(await main.getByRole('link',{name:/^Đăng sách mới/}).count(),0);
  for(const name of [/^Kệ sách của tôi/,/^Trò chuyện/,/^Đánh giá của tôi/])assert.equal(await main.getByRole('link',{name}).count(),0,'LOCKED hub must not advertise a denied destination');
  await main.getByRole('link',{name:'Ví của tôi',exact:true}).waitFor();
  await main.getByRole('link',{name:'Hồ sơ uy tín của tôi',exact:true}).waitFor();
  await main.getByRole('link',{name:/^Đơn mua\/bán trực tiếp/}).waitFor();await capture('locked-task-hub',390);
  assert.deepEqual(pageErrors,[]);
  console.log('PASS restored account overview and separate work hub: live isolated session/profile/wallet/empty-order reads; intercepted order positive/error/retry fixtures; keyboard menu and guide; responsive1440/768/390/320; LOCKED work entry. Native NOT RUN.');

} finally {
  await browser?.close();
  await server?.close();
  await fixture?.close();
}
