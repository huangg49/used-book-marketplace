import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { OnlinePriceOfferDoc } from '../../../database/mongo/documents.js';
import { MongoService } from '../../../database/mongo/mongo.service.js';
import { costMicroUsd, rateFor } from '../price-model.js';
import { checkPage, type BookIdentity } from './page-check.js';
import { FinderError, PriceFinder, type FinderBook, type FinderResult } from './price-finder.js';
import { fetchPage, FetchRejected } from './safe-fetch.js';

// Online price lookup (ADR 0029). One search per book per refresh period:
// a lease on price_lookups/<bookId> keeps a single run going across sellers
// and API instances; the run happens after the caller's request, and only
// prices read and matched on an allowed shop page are stored.

const DAY_MS = 86_400_000;
const LEASE_MS = 90_000;
const RETRY_AFTER_FAILURE_MS = DAY_MS;
const RETRY_AFTER_NOTHING_MS = 7 * DAY_MS;
const MAX_OFFERS = 5;
// The search model's redirect links; allowed only as the first hop.
const GROUNDING_REDIRECT_HOSTS = ['vertexaisearch.cloud.google.com'];

export abstract class PageFetcher {
  abstract fetch(url: string, allowedHosts: string[]): Promise<{ url: string; html: string }>;
}
export class SafePageFetcher extends PageFetcher {
  fetch(url: string, allowedHosts: string[]) {
    return fetchPage(url, { allowedHosts, redirectHosts: GROUNDING_REDIRECT_HOSTS });
  }
}

export type LookupBook = FinderBook & BookIdentity & { id: string };
export interface LookupState {
  running: boolean;
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

  // Starts a lookup when the book is due and none is running. Returns whether
  // one is running now (so the caller can say "searching" instead of "no
  // data"). Never throws: the assistant works without online prices.
  async ensure(book: LookupBook, now: Date): Promise<LookupState> {
    if (!this.enabled) return { running: false };
    try {
      const runId = await this.acquire(book.id, now);
      if (runId) {
        void this.run(book, runId);
        return { running: true };
      }
      const current = await this.mongo.c.price_lookups.findOne({ _id: book.id });
      return { running: current?.status === 'Running' && current.leaseUntil > now };
    } catch (e) {
      this.logger.warn(JSON.stringify({ bookId: book.id, step: 'acquire', detail: String(e).slice(0, 200) }));
      return { running: false };
    }
  }

  private async acquire(bookId: string, now: Date): Promise<string | null> {
    const lookups = this.mongo.c.price_lookups;
    const current = await lookups.findOne({ _id: bookId });
    if (current) {
      if (current.status === 'Running' && current.leaseUntil > now) return null;
      // A previous provider's empty/failed lookup should not mask a new primary.
      const switched = current.status !== 'Running' && current.offersFound === 0 &&
        current.model !== null && current.model !== this.finder!.model;
      if (current.nextAt > now && !switched) return null;
    }
    if (!(await this.withinLimits(now))) return null;
    const runId = randomUUID();
    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    const running = {
      status: 'Running' as const,
      runId,
      leaseUntil,
      nextAt: leaseUntil,
      lastRunAt: now,
      failure: null,
      updatedAt: now,
    };
    if (!current) {
      try {
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
      } catch (e) {
        if ((e as { code?: number }).code === 11000) return null;
        throw e;
      }
    } else {
      // Conditional on what was read: two callers cannot both take the lease.
      const taken = await lookups.updateOne(
        { _id: bookId, runId: current.runId, updatedAt: current.updatedAt },
        { $set: running },
      );
      if (!taken.modifiedCount) return null;
    }
    const day = now.toISOString().slice(0, 10);
    await this.mongo.c.price_assist_usage.updateOne(
      { _id: `lookup:${day}` },
      { $inc: { calls: 1 }, $setOnInsert: { costMicroUsd: 0, expiresAt: new Date(Date.parse(day) + 2 * DAY_MS) } },
      { upsert: true },
    );
    return runId;
  }

  private async withinLimits(now: Date) {
    const day = now.toISOString().slice(0, 10);
    const [lookups, global] = await Promise.all([
      this.mongo.c.price_assist_usage.findOne({ _id: `lookup:${day}` }),
      this.mongo.c.price_assist_usage.findOne({ _id: `global:${day}` }),
    ]);
    const limit = Number(this.config.get('PRICE_LOOKUP_DAILY_LIMIT') ?? 50);
    const budget = Number(this.config.get('PRICE_ASSIST_DAILY_BUDGET_USD') ?? 2) * 1e6;
    return (lookups?.calls ?? 0) < limit && (global?.costMicroUsd ?? 0) < budget;
  }

  // Exposed for tests; production calls it through ensure().
  async run(book: LookupBook, runId: string): Promise<void> {
    const started = new Date();
    const usage = { inputTokens: 0, outputTokens: 0, searches: 0, costMicroUsd: 0 };
    let failure: string | null = null;
    const finder = this.finder!;
    let model = finder.model;
    const offers: OnlinePriceOfferDoc[] = [];
    const identity: FinderBook = {
      title: book.title, authors: book.authors, publisher: book.publisher,
      publicationYear: book.publicationYear, isbn: book.isbn,
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
    const attempt = async (provider: PriceFinder) => {
      model = provider.model;
      try {
        const result = await provider.find(identity, this.shops);
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
      const seen = new Set<string>();
      for (const url of found.urls) {
        if (offers.length >= MAX_OFFERS) break;
        try {
          const page = await this.pages.fetch(url, this.shops);
          const check = checkPage(page.html, book);
          const shop = new URL(page.url).hostname.replace(/^www\./, '');
          if (!check.ok || seen.has(page.url)) {
            this.logger.log(JSON.stringify({ bookId: book.id, shop, rejected: check.ok ? 'Duplicate' : check.reason }));
            continue;
          }
          seen.add(page.url);
          offers.push({
            _id: randomUUID(),
            bookId: book.id,
            runId,
            shop,
            url: page.url.slice(0, 500),
            amount: check.amount,
            isbnMatched: check.isbnMatched,
            pageTitle: check.pageTitle?.slice(0, 300) ?? null,
            observedAt: started,
            retiredAt: null,
            createdAt: started,
          });
        } catch (e) {
          const reason = e instanceof FetchRejected ? e.reason : 'CheckFailed';
          this.logger.log(JSON.stringify({ bookId: book.id, rejected: reason }));
        }
      }
    } catch (e) {
      failure = (e as { kind?: string }).kind ?? 'ProviderError';
      this.logger.warn(JSON.stringify({ bookId: book.id, step: 'search', failure, model }));
    }
    await this.finish(book.id, runId, started, offers, usage, failure, model).catch((e) =>
      this.logger.warn(JSON.stringify({ bookId: book.id, step: 'store', detail: String(e).slice(0, 200) })),
    );
  }

  private async finish(
    bookId: string,
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
      // A run whose lease was taken over by a newer run stores nothing.
      const current = await tx.c.price_lookups.findOne({ _id: bookId });
      if (current?.runId !== runId) return;
      if (offers.length) {
        await tx.c.online_price_offers.updateMany(
          { bookId, retiredAt: null },
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
            // With no offers, keep the primary for the cooldown check even if fallback ran.
            model: offers.length ? model : this.finder!.model,
            updatedAt: now,
          },
          $inc: usage,
        },
      );
      const expiresAt = new Date(Date.parse(day) + 2 * DAY_MS);
      for (const key of [`global:${day}`, `lookup:${day}`])
        await tx.c.price_assist_usage.updateOne(
          { _id: key },
          { $inc: { costMicroUsd: usage.costMicroUsd }, $setOnInsert: { calls: 0, expiresAt } },
          { upsert: true },
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
