import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { OnlinePriceOfferDoc } from '../../../database/mongo/documents.js';
import { MongoService } from '../../../database/mongo/mongo.service.js';
import { costMicroUsd, rateFor } from '../price-model.js';
import { checkPage, type BookIdentity } from './page-check.js';
import { PriceFinder, type FinderBook } from './price-finder.js';
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
    if (current && (current.nextAt > now || (current.status === 'Running' && current.leaseUntil > now)))
      return null;
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
    let usage = { inputTokens: 0, outputTokens: 0, searches: 0 };
    let failure: string | null = null;
    const offers: OnlinePriceOfferDoc[] = [];
    try {
      const found = await this.finder!.find(
        {
          title: book.title,
          authors: book.authors,
          publisher: book.publisher,
          publicationYear: book.publicationYear,
          isbn: book.isbn,
        },
        this.shops,
      );
      usage = found;
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
      usage = (e as { usage?: typeof usage }).usage ?? usage;
      this.logger.warn(JSON.stringify({ bookId: book.id, step: 'search', failure, detail: String((e as Error).message).slice(0, 300) }));
    }
    await this.finish(book.id, runId, started, offers, usage, failure).catch((e) =>
      this.logger.warn(JSON.stringify({ bookId: book.id, step: 'store', detail: String(e).slice(0, 200) })),
    );
  }

  private async finish(
    bookId: string,
    runId: string,
    started: Date,
    offers: OnlinePriceOfferDoc[],
    usage: { inputTokens: number; outputTokens: number; searches: number },
    failure: string | null,
  ) {
    const finder = this.finder!;
    const rate = rateFor(finder.model, this.rateOverride());
    const cost =
      costMicroUsd(rate, usage.inputTokens, usage.outputTokens) +
      Math.ceil(usage.searches * Number(this.config.get('PRICE_LOOKUP_SEARCH_USD') ?? 0.035) * 1e6);
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
            model: finder.model,
            updatedAt: now,
          },
          $inc: {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            searches: usage.searches,
            costMicroUsd: cost,
          },
        },
      );
      const expiresAt = new Date(Date.parse(day) + 2 * DAY_MS);
      for (const key of [`global:${day}`, `lookup:${day}`])
        await tx.c.price_assist_usage.updateOne(
          { _id: key },
          { $inc: { costMicroUsd: cost }, $setOnInsert: { calls: 0, expiresAt } },
          { upsert: true },
        );
    });
  }

  private rateOverride(): [number, number] | null {
    const input = this.config.get('PRICE_ASSIST_INPUT_USD_PER_MTOK');
    const output = this.config.get('PRICE_ASSIST_OUTPUT_USD_PER_MTOK');
    return input != null && output != null ? [Number(input), Number(output)] : null;
  }
}
