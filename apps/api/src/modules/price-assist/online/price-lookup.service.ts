import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Filter } from 'mongodb';
import type { OnlinePriceOfferDoc, PriceLookupDoc } from '../../../database/mongo/documents.js';
import { MongoService } from '../../../database/mongo/mongo.service.js';
import type { Tx } from '../../../database/mongo/transaction.js';
import { costMicroUsd, rateFor } from '../price-model.js';
import { checkPage, normalize, type BookIdentity } from './page-check.js';
import { FinderError, PriceFinder, type FinderBook, type FinderResult } from './price-finder.js';
import { fetchPage, FetchRejected, shopPageUrl } from './safe-fetch.js';

// Online price lookup (ADR 0029). One search per book per refresh period:
// a lease on price_lookups/<bookId> keeps a single run going across sellers
// and API instances; the run happens after the caller's request, and only
// prices read and matched on an allowed shop page are stored.

const DAY_MS = 86_400_000;
const LEASE_MS = 90_000;
const RETRY_AFTER_FAILURE_MS = DAY_MS;
const RETRY_AFTER_NOTHING_MS = 7 * DAY_MS;
const MAX_OFFERS = 5;
const PAGE_CHECK_CONCURRENCY = 2;
const SHOP_FAILURE_LIMIT = 2;
// The search model's redirect links; allowed only as the first hop.
const GROUNDING_REDIRECT_HOSTS = ['vertexaisearch.cloud.google.com'];

export abstract class PageFetcher {
  abstract fetch(
    url: string, allowedHosts: string[], skipHost?: (host: string) => boolean,
  ): Promise<{ url: string; html: string }>;
}
export class SafePageFetcher extends PageFetcher {
  fetch(url: string, allowedHosts: string[], skipHost?: (host: string) => boolean) {
    return fetchPage(url, { allowedHosts, redirectHosts: GROUNDING_REDIRECT_HOSTS, skipHost });
  }
}

type CheckedOffer = { host?: string; unavailable?: boolean; offer?: OnlinePriceOfferDoc };
const isAccessFailure = (reason: string) =>
  reason === 'Timeout' || reason === 'Network' || /^Http(?:401|403|408|429|5[0-9]{2})$/.test(reason);

export type LookupBook = Omit<FinderBook, 'edition'> & BookIdentity & {
  id: string;
  revisionId: string;
  confirmed: boolean;
};
export type LookupState = 'Disabled' | 'Running' | 'Done' | 'Unavailable' | 'NeedIdentity';

export function activeOnlineOffers(bookId: string, revisionId: string, confirmed: boolean): Filter<OnlinePriceOfferDoc> {
  const revision = { catalogRevisionId: revisionId };
  return {
    bookId,
    retiredAt: null,
    // Legacy offers were only written for confirmed, immutable catalog books.
    ...(confirmed ? { $or: [revision, { catalogRevisionId: { $exists: false } }] } : revision),
  };
}

@Injectable()
export class PriceLookupService {
  private readonly logger = new Logger(PriceLookupService.name);
  constructor(
    private readonly mongo: MongoService,
    private readonly config: ConfigService,
    private readonly pages: PageFetcher,
    @Optional() @Inject(PriceFinder) private readonly finder: PriceFinder | null,
  ) {}

  get enabled() {
    return !!this.finder && this.config.get('PRICE_LOOKUP_ENABLED') === 'true';
  }
  private get shops() {
    return String(this.config.get('PRICE_LOOKUP_SHOPS') ?? '')
      .split(',')
      .filter(Boolean);
  }

  // The catalog revision, lease and usage reservation are checked together.
  // Search only starts once that transaction commits.
  async ensure(book: LookupBook, now: Date, ownerId: string): Promise<LookupState | undefined> {
    if (!this.enabled) return 'Disabled';
    if (!book.confirmed && !book.isbn &&
      (!normalize(book.title) || !book.authors.some((name) => normalize(name)))) return 'NeedIdentity';
    try {
      const result = await this.mongo.tx((tx) => this.acquire(tx, book, now, ownerId));
      if (typeof result === 'object') {
        void this.run(book, result.runId);
        return 'Running';
      }
      return result;
    } catch (e) {
      // A concurrent first reservation (including another book's daily usage
      // row) can win the insert before this transaction commits.
      if ((e as { code?: number }).code === 11000) {
        const current = await this.mongo.c.price_lookups.findOne({ _id: book.id }).catch(() => null);
        if (current?.status === 'Running' && current.leaseUntil > now && this.sameRevision(current, book)) return 'Running';
      }
      this.logger.warn(JSON.stringify({ bookId: book.id, step: 'acquire', code: (e as { code?: number }).code }));
      return 'Unavailable';
    }
  }

  private sameRevision(lookup: PriceLookupDoc, book: LookupBook) {
    return lookup.catalogRevisionId === book.revisionId || (book.confirmed && !lookup.catalogRevisionId);
  }

  private async acquire(tx: Tx, book: LookupBook, now: Date, ownerId: string): Promise<LookupState | { runId: string }> {
    const bookId = book.id;
    await tx.lock('catalog_books', [bookId]);
    const catalog = await tx.c.catalog_books.findOne({ _id: bookId });
    if (catalog?.currentRevisionId !== book.revisionId ||
      (catalog.status !== 'Confirmed' && !(catalog.status === 'Pending' && catalog.requesterId === ownerId))) return 'Unavailable';
    const lookups = tx.c.price_lookups;
    const current = await lookups.findOne({ _id: bookId });
    if (current && this.sameRevision(current, book)) {
      if (current.status === 'Running' && current.leaseUntil > now) return 'Running';
      // A previous provider's empty/failed lookup should not mask a new primary.
      const switched = current.status !== 'Running' && current.offersFound === 0 &&
        current.model !== null && current.model !== this.finder!.lookupKey;
      if (current.nextAt > now && !switched) return current.status === 'Failed' ? 'Unavailable' : 'Done';
    }
    const day = now.toISOString().slice(0, 10);
    const globalKey = `lookup:${day}`;
    const pendingKey = `lookup-user:${ownerId}:${day}`;
    const usage = tx.c.price_assist_usage;
    const daily = await usage.findOne({ _id: globalKey });
    const global = await usage.findOne({ _id: `global:${day}` });
    const limit = Number(this.config.get('PRICE_LOOKUP_DAILY_LIMIT') ?? 50);
    const budget = Number(this.config.get('PRICE_ASSIST_DAILY_BUDGET_USD') ?? 2) * 1e6;
    if ((daily?.calls ?? 0) >= limit || (global?.costMicroUsd ?? 0) >= budget) return 'Unavailable';
    const pending = catalog.status === 'Pending';
    if (pending) {
      const memberUsage = await usage.findOne({ _id: pendingKey });
      const userLimit = Number(this.config.get('PRICE_ASSIST_USER_DAILY_LIMIT') ?? 20);
      if ((memberUsage?.calls ?? 0) >= userLimit) return 'Unavailable';
    }
    const runId = randomUUID();
    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    const running = {
      status: 'Running' as const,
      catalogRevisionId: book.revisionId,
      runId,
      leaseUntil,
      nextAt: leaseUntil,
      lastRunAt: now,
      failure: null,
      updatedAt: now,
    };
    const expiresAt = new Date(Date.parse(day) + 2 * DAY_MS);
    for (const key of pending ? [globalKey, pendingKey] : [globalKey]) {
      await usage.updateOne({ _id: key }, { $inc: { calls: 1 }, $setOnInsert: { costMicroUsd: 0, expiresAt } }, { upsert: true });
    }
    if (!current) {
      await lookups.insertOne({
        _id: bookId,
        ...running,
        offersFound: 0,
        model: null,
        inputTokens: 0,
        outputTokens: 0,
        searches: 0,
        costMicroUsd: 0,
        createdAt: now,
      });
    } else {
      await lookups.updateOne({ _id: bookId }, { $set: running });
    }
    return { runId };
  }

  // Exposed for tests; production calls it through ensure().
  async run(book: LookupBook, runId: string): Promise<void> {
    const started = new Date();
    const usage = { inputTokens: 0, outputTokens: 0, searches: 0, costMicroUsd: 0 };
    let failure: string | null = null;
    const finder = this.finder!;
    let model = finder.model;
    const offers: OnlinePriceOfferDoc[] = [];
    const attempted = new Set<string>();
    const verified = new Set<string>();
    const shopFailures = new Map<string, number>();
    const shops = this.shops;
    let hadAccessFailure = false;
    const shopForHost = (host: string | undefined) => host &&
      shops.find((shop) => host === shop || host.endsWith(`.${shop}`));
    const skipHost = (host: string) => (shopFailures.get(shopForHost(host) ?? '') ?? 0) >= SHOP_FAILURE_LIMIT;
    const identity: FinderBook = {
      title: book.title, authors: book.authors, publisher: book.publisher,
      publicationYear: book.publicationYear, isbn: book.isbn,
      ...(book.edition ? { edition: book.edition } : {}),
    };
    const addUsage = (provider: PriceFinder, result: Omit<FinderResult, 'urls'>) => {
      const searchUsd = provider.provider === 'openai'
        ? 0.01
        : Number(this.config.get('PRICE_LOOKUP_SEARCH_USD') ?? 0.035);
      const rate = rateFor(provider.model, this.rateOverride(provider));
      usage.inputTokens += result.inputTokens;
      usage.outputTokens += result.outputTokens;
      usage.searches += result.searches;
      usage.costMicroUsd += costMicroUsd(rate, result.inputTokens, result.outputTokens) +
        Math.ceil(result.searches * searchUsd * 1e6);
    };
    const verifyUrls = async (urls: string[]) => {
      const pending = [...new Set(urls)].filter((url) => !attempted.has(url))
        .map((url) => ({ url, shop: shopForHost(URL.parse(url)?.hostname) }));
      let next = 0;
      while (next < pending.length && offers.length < MAX_OFFERS) {
        const batch: typeof pending = [];
        while (next < pending.length && batch.length < PAGE_CHECK_CONCURRENCY) {
          const candidate = pending[next]!;
          const streak = shopFailures.get(candidate.shop ?? '') ?? 0;
          // After one failure, wait for the next result before starting another URL for that store.
          if (streak < SHOP_FAILURE_LIMIT && batch.length && (!candidate.shop ||
              (streak === SHOP_FAILURE_LIMIT - 1 && batch.some((item) => item.shop === candidate.shop)))) break;
          next++;
          attempted.add(candidate.url);
          if (streak >= SHOP_FAILURE_LIMIT) continue;
          batch.push(candidate);
          // Search redirect links do not identify the final store until fetched.
          if (!candidate.shop) break;
        }
        const results = await Promise.all(batch.map(({ url }) => this.checkOffer(book, runId, started, url, skipHost)));
        for (const { offer, host, unavailable } of results) {
          const shop = shopForHost(host);
          if (unavailable) {
            hadAccessFailure = true;
            if (shop) shopFailures.set(shop, (shopFailures.get(shop) ?? 0) + 1);
          } else if (shop) {
            shopFailures.delete(shop);
          }
          if (!offer || verified.has(offer.url) || offers.length >= MAX_OFFERS) continue;
          verified.add(offer.url);
          offers.push(offer);
        }
      }
      return offers.length > 0;
    };
    const attempt = async (provider: PriceFinder) => {
      model = provider.model;
      try {
        const result = await provider.find(identity, shops, verifyUrls);
        addUsage(provider, result);
        return result;
      } catch (e) {
        if (e instanceof FinderError && e.usage) addUsage(provider, e.usage);
        throw e;
      }
    };
    try {
      const found = await attempt(finder).catch((e: unknown) => {
        if (!(e instanceof FinderError) || !e.transient || !finder.fallback) throw e;
        this.logger.log(JSON.stringify({ bookId: book.id, step: 'search-fallback', provider: finder.provider, failure: e.kind }));
        return attempt(finder.fallback);
      });
      await verifyUrls(found.urls);
    } catch (e) {
      failure = (e as { kind?: string }).kind ?? 'ProviderError';
      this.logger.warn(JSON.stringify({ bookId: book.id, step: 'search', failure, model }));
    }
    if (!failure && !offers.length && hadAccessFailure) failure = 'PageUnavailable';
    await this.finish(book, runId, started, offers, usage, failure, model).catch((e) =>
      this.logger.warn(JSON.stringify({ bookId: book.id, step: 'store', code: (e as { code?: number }).code })),
    );
  }

  private async checkOffer(
    book: LookupBook, runId: string, started: Date, url: string, skipHost: (host: string) => boolean,
  ): Promise<CheckedOffer> {
    try {
      const page = await this.pages.fetch(url, this.shops, skipHost);
      const check = checkPage(page.html, { ...book, strictIdentity: !book.confirmed });
      const finalUrl = new URL(page.url);
      const shop = finalUrl.hostname.replace(/^www\./, '');
      if (!check.ok) {
        this.logger.log(JSON.stringify({ bookId: book.id, shop, rejected: check.reason }));
        return { host: finalUrl.hostname };
      }
      return {
        host: finalUrl.hostname,
        offer: {
          _id: randomUUID(), bookId: book.id, catalogRevisionId: book.revisionId, runId, shop,
          url: shopPageUrl(finalUrl).slice(0, 500), amount: check.amount, isbnMatched: check.isbnMatched,
          pageTitle: check.pageTitle?.slice(0, 300) ?? null,
          observedAt: started, retiredAt: null, createdAt: started,
        },
      };
    } catch (e) {
      const reason = e instanceof FetchRejected ? e.reason : 'CheckFailed';
      this.logger.log(JSON.stringify({ bookId: book.id, rejected: reason }));
      return e instanceof FetchRejected ? { host: e.host, unavailable: isAccessFailure(reason) } : {};
    }
  }

  private async finish(
    book: LookupBook,
    runId: string,
    started: Date,
    offers: OnlinePriceOfferDoc[],
    usage: Omit<FinderResult, 'urls'> & { costMicroUsd: number },
    failure: string | null,
    model: string,
  ) {
    const ttl = Number(this.config.get('PRICE_LOOKUP_TTL_DAYS') ?? 30) * DAY_MS;
    const now = new Date();
    const nextAt = new Date(
      now.getTime() + (failure ? RETRY_AFTER_FAILURE_MS : offers.length ? ttl : RETRY_AFTER_NOTHING_MS),
    );
    const day = started.toISOString().slice(0, 10);
    await this.mongo.tx(async (tx) => {
      const bookId = book.id;
      const expiresAt = new Date(Date.parse(day) + 2 * DAY_MS);
      for (const key of [`lookup:${day}`, `global:${day}`]) {
        await tx.c.price_assist_usage.updateOne(
          { _id: key },
          { $inc: { costMicroUsd: usage.costMicroUsd }, $setOnInsert: { calls: 0, expiresAt } },
          { upsert: true },
        );
      }
      // A superseded run still incurs costs, but cannot store sources.
      const current = await tx.c.price_lookups.findOne({ _id: bookId });
      if (current?.runId !== runId) return;
      if (offers.length) {
        await tx.c.online_price_offers.updateMany(
          activeOnlineOffers(bookId, book.revisionId, book.confirmed),
          { $set: { retiredAt: now } },
        );
        await tx.c.online_price_offers.insertMany(offers);
      }
      await tx.c.price_lookups.updateOne(
        { _id: bookId, runId },
        {
          $set: {
            status: failure ? 'Failed' : 'Done',
            leaseUntil: now,
            nextAt,
            offersFound: offers.length,
            failure,
            // Empty/failed results track the primary search configuration for the cooldown.
            model: offers.length ? model : this.finder!.lookupKey,
            updatedAt: now,
          },
          $inc: usage,
        },
      );
    });
  }

  private rateOverride(provider: PriceFinder): [number, number] | null {
    if (provider.provider !== 'gemini' || this.config.get('PRICE_ASSIST_PROVIDER') !== 'gemini' ||
        this.config.get('PRICE_ASSIST_MODEL') !== provider.model) return null;
    const input = this.config.get<string>('PRICE_ASSIST_INPUT_USD_PER_MTOK');
    const output = this.config.get<string>('PRICE_ASSIST_OUTPUT_USD_PER_MTOK');
    return input && output ? [Number(input), Number(output)] : null;
  }
}
