// Development-only delivery viewer. It is not an API endpoint or token store.
import { createServer } from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(process.env.AUTH_MAIL_LOCAL_DIR || resolve(root, 'apps/api/.tmp/auth-mail'));
const port = Number(process.env.AUTH_MAILBOX_PORT || 3186);
const escape = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
  // Reject rebinding and cross-origin browser requests; bind IPv4 loopback only.
  const expected = `http://127.0.0.1:${port}`;
  if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== expected) ||
    (req.headers['sec-fetch-site'] && !['none', 'same-origin'].includes(req.headers['sec-fetch-site'])) || req.method !== 'GET') {
    res.writeHead(403); res.end(); return;
  }
  const path = new URL(req.url || '/', expected).pathname;
  try {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (path === '/') {
      const files = (await readdir(directory).catch(() => [])).filter((name) => /^[a-f0-9-]{36}\.html$/.test(name));
      const items = await Promise.all(files.map(async (name) => {
        const file = resolve(directory, name); const info = await stat(file); const html = await readFile(file, 'utf8');
        const subject = html.match(/<h1>([^<]*)<\/h1>/)?.[1] || 'Email Lật Lại';
        return { name, time: info.mtimeMs, subject };
      }));
      items.sort((a, b) => b.time - a.time);
      res.end(`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hộp thư demo · Lật Lại</title><body style="font-family:Arial;background:#fff8e9;color:#54100e;max-width:760px;margin:40px auto;padding:24px"><h1>Hộp thư demo · Lật Lại</h1><p>Thư chỉ lưu trên máy này; không gửi ra Internet. Tải lại để xem thư mới.</p><p><a href="/">Tải lại hộp thư</a></p><ul>${items.map((item) => `<li style="padding:12px"><a href="/${item.name}">${escape(item.subject)}</a> · ${escape(new Date(item.time).toLocaleString('vi-VN'))}</li>`).join('') || '<li>Chưa có thư. Đăng ký hoặc yêu cầu khôi phục trên web.</li>'}</ul></body></html>`);
    } else if (/^\/[a-f0-9-]{36}\.html$/.test(path)) res.end(await readFile(resolve(directory, path.slice(1)), 'utf8'));
    else { res.writeHead(404); res.end('Không tìm thấy thư.'); }
  } catch { res.writeHead(404); res.end('Không tìm thấy thư.'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Hộp thư demo: http://127.0.0.1:${port}/`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
