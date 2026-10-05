import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// Fetches one shop page for the online price check (ADR 0029). Only https,
// only hosts on the owner's list (or their subdomains), never a private,
// loopback or link-local address, redirects followed by hand and re-checked,
// bounded in time and size, no cookies or credentials.

export class FetchRejected extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

export interface SafeFetchOptions {
  allowedHosts: string[];
  // Hosts allowed only as the first hop (the search engine's redirect link).
  redirectHosts?: string[];
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  fetcher?: typeof fetch;
  resolve?: (host: string) => Promise<string[]>;
}

const USER_AGENT = 'LatLaiPriceCheck/1.0 (+https://github.com/huangg49/used-book-marketplace)';

const hostAllowed = (host: string, list: string[]) =>
  list.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return (
    v6 === '::' ||
    v6 === '::1' ||
    v6.startsWith('fc') ||
    v6.startsWith('fd') ||
    v6.startsWith('fe8') ||
    v6.startsWith('fe9') ||
    v6.startsWith('fea') ||
    v6.startsWith('feb') ||
    v6.startsWith('ff')
  );
}

const defaultResolve = async (host: string) =>
  (await dnsLookup(host, { all: true })).map((a) => a.address);

export async function fetchPage(rawUrl: string, options: SafeFetchOptions): Promise<{ url: string; html: string }> {
  const fetcher = options.fetcher ?? fetch;
  const resolve = options.resolve ?? defaultResolve;
  const maxBytes = options.maxBytes ?? 2_000_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5_000);
  try {
    let url = rawUrl;
    for (let hop = 0; hop <= (options.maxRedirects ?? 3); hop++) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new FetchRejected('BadUrl');
      }
      const host = parsed.hostname.toLowerCase();
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
        throw new FetchRejected('NotHttps');
      const viaRedirect = hop === 0 && hostAllowed(host, options.redirectHosts ?? []);
      if (!viaRedirect && !hostAllowed(host, options.allowedHosts))
        throw new FetchRejected('HostNotAllowed');
      if (isIP(host) || (await resolve(host)).some(isPrivateAddress))
        throw new FetchRejected('PrivateAddress');
      const response = await fetcher(parsed.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        credentials: 'omit',
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      });
      if (response.status >= 300 && response.status < 400) {
        const next = response.headers.get('location');
        if (!next) throw new FetchRejected('BadRedirect');
        url = new URL(next, parsed).toString();
        continue;
      }
      if (viaRedirect) throw new FetchRejected('HostNotAllowed');
      if (!response.ok) throw new FetchRejected(`Http${response.status}`);
      const type = response.headers.get('content-type') ?? '';
      if (!/text\/html|application\/xhtml/i.test(type)) throw new FetchRejected('NotHtml');
      const declared = Number(response.headers.get('content-length') ?? 0);
      if (declared > maxBytes) throw new FetchRejected('TooLarge');
      return { url: parsed.toString(), html: await readCapped(response, maxBytes) };
    }
    throw new FetchRejected('TooManyRedirects');
  } catch (e) {
    if (e instanceof FetchRejected) throw e;
    throw new FetchRejected(controller.signal.aborted ? 'Timeout' : 'Network');
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new FetchRejected('TooLarge');
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}
