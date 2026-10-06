import { describe, expect, it } from 'vitest';
import { checkPage, normalize } from './page-check.js';
import { fetchPage, FetchRejected, isPrivateAddress } from './safe-fetch.js';

const book = { title: 'Dế Mèn phiêu lưu ký', authors: ['Tô Hoài'], isbn: '9786042000000' };
const ld = (data: unknown) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(data)}</script></head><body>Tô Hoài</body></html>`;
const product = (over: Record<string, unknown> = {}) => ({
  '@context': 'https://schema.org',
  '@type': 'Book',
  name: 'Dế Mèn Phiêu Lưu Ký (Tái bản 2020)',
  isbn: '978-604-2000-00-0',
  offers: { '@type': 'Offer', price: '120000', priceCurrency: 'VND' },
  ...over,
});

describe('online price page check', () => {
  it('reads the JSON-LD price when the ISBN matches', () => {
    expect(checkPage(ld(product()), book)).toEqual({
      ok: true,
      amount: 120_000,
      isbnMatched: true,
      pageTitle: 'Dế Mèn Phiêu Lưu Ký (Tái bản 2020)',
    });
    // Nested in @graph, numeric price, vi thousands grouping.
    expect(checkPage(ld({ '@graph': [product({ offers: [{ price: 98000 }] })] }), book)).toMatchObject({ ok: true, amount: 98_000 });
    expect(checkPage(ld(product({ offers: { price: '89.000' } })), book)).toMatchObject({ amount: 89_000 });
  });

  it('rejects another ISBN, another title, a foreign currency and price spans', () => {
    expect(checkPage(ld(product({ isbn: '9780000000002' })), book)).toEqual({ ok: false, reason: 'OtherIsbn' });
    const noIsbn = product({ isbn: undefined, name: 'Tuổi thơ dữ dội' });
    expect(checkPage(ld(noIsbn), book)).toEqual({ ok: false, reason: 'OtherTitle' });
    expect(checkPage(ld(product({ offers: { price: '9.99', priceCurrency: 'USD' } })), book)).toEqual({ ok: false, reason: 'NotVnd' });
    expect(checkPage(ld(product({ offers: { '@type': 'AggregateOffer', lowPrice: 50000 } })), book)).toEqual({ ok: false, reason: 'NoPrice' });
    expect(checkPage('<html><body>120.000 đ</body></html>', book)).toEqual({ ok: false, reason: 'NoPrice' });
  });

  it('accepts a page without an ISBN only on title and author, and reads meta prices', () => {
    const titled = product({ isbn: undefined });
    expect(checkPage(ld(titled), book)).toMatchObject({ ok: true, isbnMatched: false });
    const noAuthor = ld(titled).replace('Tô Hoài', 'Nhà sách');
    expect(checkPage(noAuthor, book)).toEqual({ ok: false, reason: 'OtherTitle' });
    const meta =
      '<meta property="og:title" content="Dế Mèn phiêu lưu ký"><meta property="product:price:amount" content="76000">' +
      '<meta property="product:price:currency" content="VND"><p>Tác giả: Tô Hoài</p>';
    expect(checkPage(meta, book)).toMatchObject({ ok: true, amount: 76_000 });
    expect(normalize('Đất Rừng Phương Nam')).toBe('dat rung phuong nam');
  });
});

describe('safe page fetch', () => {
  const shops = ['fahasa.com'];
  const publicDns = async () => ['203.0.113.10'];
  const html = (body = '<html></html>', status = 200, headers: Record<string, string> = {}) =>
    new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
  const reason = (p: Promise<unknown>) => p.then(() => 'ok', (e: FetchRejected) => e.reason);

  it('fetches an allowed https page and its subdomains', async () => {
    const fetcher = (async () => html('<p>ok</p>')) as unknown as typeof fetch;
    const page = await fetchPage('https://www.fahasa.com/de-men.html', { allowedHosts: shops, fetcher, resolve: publicDns });
    expect(page.html).toBe('<p>ok</p>');
  });

  it('refuses http, other hosts, private addresses and IP literals', async () => {
    const fetcher = (async () => html()) as unknown as typeof fetch;
    const opts = { allowedHosts: shops, fetcher, resolve: publicDns };
    expect(await reason(fetchPage('http://fahasa.com/x', opts))).toBe('NotHttps');
    expect(await reason(fetchPage('https://evilfahasa.com/x', opts))).toBe('HostNotAllowed');
    expect(await reason(fetchPage('https://fahasa.com/x', { ...opts, resolve: async () => ['10.0.0.5'] }))).toBe('PrivateAddress');
    expect(await reason(fetchPage('https://127.0.0.1/x', { ...opts, allowedHosts: ['127.0.0.1'] }))).toBe('PrivateAddress');
    for (const ip of ['127.0.0.1', '169.254.169.254', '192.168.1.1', '::1', 'fd00::1', '::ffff:10.0.0.1'])
      expect(isPrivateAddress(ip), ip).toBe(true);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
  });

  it('follows redirects only within the list; the search redirect host only as first hop', async () => {
    const hops: Record<string, Response> = {
      'https://vertexaisearch.cloud.google.com/r/1': html('', 302, { location: 'https://fahasa.com/de-men' }),
      'https://fahasa.com/de-men': html('<p>book</p>'),
      'https://vertexaisearch.cloud.google.com/r/2': html('', 302, { location: 'https://shopee.vn/x' }),
      'https://fahasa.com/out': html('', 301, { location: 'https://vertexaisearch.cloud.google.com/r/1' }),
    };
    const fetcher = (async (url: string) => hops[url].clone()) as unknown as typeof fetch;
    const opts = { allowedHosts: shops, redirectHosts: ['vertexaisearch.cloud.google.com'], fetcher, resolve: publicDns };
    expect((await fetchPage('https://vertexaisearch.cloud.google.com/r/1', opts)).url).toBe('https://fahasa.com/de-men');
    expect(await reason(fetchPage('https://vertexaisearch.cloud.google.com/r/2', opts))).toBe('HostNotAllowed');
    expect(await reason(fetchPage('https://fahasa.com/out', opts))).toBe('HostNotAllowed');
  });

  it('refuses non-HTML and oversized pages', async () => {
    const json = (async () => new Response('{}', { headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    expect(await reason(fetchPage('https://fahasa.com/x', { allowedHosts: shops, fetcher: json, resolve: publicDns }))).toBe('NotHtml');
    const big = (async () => html('x'.repeat(5_000))) as unknown as typeof fetch;
    expect(await reason(fetchPage('https://fahasa.com/x', { allowedHosts: shops, fetcher: big, resolve: publicDns, maxBytes: 1_000 }))).toBe('TooLarge');
  });
});
