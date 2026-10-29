// Shared disposable AI fixture. All books/prices/photos here are explicitly synthetic.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createTestApi,
  root,
  base,
  password,
} from "../apps/admin-web/tests/test-api.mjs";
import { requireQaMongo } from "./test-journey-gate.mjs";
const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const load = (p) =>
  import(pathToFileURL(path.join(root, "apps/api/dist", p)).href);
export const qaMetadata = {
  title: "QA Book",
  authors: ["QA Author"],
  publisher: "QA Publisher",
  publicationYear: 2024,
  language: "en",
  edition: "QA Edition",
  category: "Văn học",
  isbn: null,
};
export async function createAiQa({
  live = false,
  corsOrigin = "http://127.0.0.1:5184,http://127.0.0.1:8087",
} = {}) {
  requireQaMongo(process.env.MONGO_TEST_URL);
  const { PriceModelError } = await load("modules/price-assist/price-model.js");
  const svg = `<svg width="600" height="800" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="800" fill="white"/><g fill="black" font-family="sans-serif" text-anchor="middle"><text x="300" y="180" font-size="65">QA BOOK</text><text x="300" y="300" font-size="40">QA Author</text><text x="300" y="500" font-size="32">QA Publisher</text><text x="300" y="560" font-size="32">2024</text><text x="300" y="620" font-size="32">QA Edition</text></g></svg>`;
  const photo = await require("sharp")(Buffer.from(svg)).png().toBuffer();
  const counters = { price: 0, autofill: 0 };
  const modes = { price: "ok", autofill: "ok" };
  let actualPrice, actualAutofill;
  if (live) {
    // Read only server AI keys into memory; never serialize/log env or tokens.
    const parsed = require("dotenv").parse(
      await readFile(path.join(root, "apps/api/.env")),
    );
    const { priceModelFromConfig } = await load(
      "modules/price-assist/price-model.js",
    );
    const { autofillModelFromConfig } = await load(
      "modules/autofill-assist/autofill-model.js",
    );
    if (parsed.PRICE_ASSIST_PROVIDER !== "nvidia")
      throw new Error(
        "This bounded benchmark requires the configured NVIDIA provider.",
      );
    actualPrice = priceModelFromConfig((key) => parsed[key]);
    actualAutofill = autofillModelFromConfig((key) => parsed[key]);
    if (!actualPrice || !actualAutofill)
      throw new Error(
        "AI adapters are not enabled/configured; values withheld.",
      );
  }
  const price = {
    model: actualPrice?.model ?? "qa/fake-price",
    async draft(system, user) {
      counters.price++;
      if (modes.price === "timeout")
        throw new PriceModelError("Timeout", "QA injected timeout");
      if (actualPrice) return actualPrice.draft(system, user);
      const data = JSON.parse(
        user.slice(user.indexOf("{"), user.lastIndexOf("}") + 1),
      );
      return {
        output: {
          low: data.bounds.low,
          high: data.bounds.high,
          factors: [
            {
              text: "QA giả lập: căn cứ nguồn giá đã gắn nhãn.",
              sourceRefs: [data.sources[0].ref],
            },
          ],
          missing: [],
        },
        inputTokens: 1,
        outputTokens: 1,
        model: this.model,
      };
    },
  };
  const autofill = {
    model: actualAutofill?.model ?? "qa/fake-vision",
    fallback: null,
    async read(...args) {
      counters.autofill++;
      if (modes.autofill === "timeout")
        throw new PriceModelError("Timeout", "QA injected timeout");
      if (actualAutofill) return actualAutofill.read(...args);
      return {
        output: {
          title: qaMetadata.title,
          authors: qaMetadata.authors,
          publisher: qaMetadata.publisher,
          publicationYear: 2024,
          language: "en",
          edition: qaMetadata.edition,
          isbn: null,
          missing: [],
        },
        inputTokens: 1,
        outputTokens: 1,
        model: this.model,
      };
    },
  };
  const fixture = await createTestApi({
    corsOrigin,
    listingCount: 0,
    photoBytes: photo,
    catalogMetadata: qaMetadata,
    aiModels: { price, autofill },
  });
  try {
    const admin = await fixture.api("/auth/login", null, {
      email: "admin@operations.test",
      password,
    });
    const catalog = await fixture.api(
      `/operations/catalog-requests/${fixture.catalogId}`,
      admin.accessToken,
    );
    await fixture.api(
      `/operations/catalog-requests/${fixture.catalogId}/decision`,
      admin.accessToken,
      {
        expectedVersion: catalog.version,
        revisionId: catalog.currentRevision.id,
        decision: "Confirm",
      },
    );
    await fixture.db.collection("price_references").insertMany(
      [
        [100000, "CoverPrice", "QA synthetic cover price"],
        [45000, "EditorialReference", "QA synthetic editorial price"],
        [47000, "EditorialReference", "QA synthetic second reference"],
      ].map(([amount, kind, sourceLabel]) => ({
        _id: randomUUID(),
        bookId: fixture.catalogId,
        isbn: null,
        kind,
        amount,
        condition: null,
        sourceLabel,
        sourceUrl: null,
        observedAt: new Date(),
        enteredBy: "QA fixture",
        rightsNote: "Synthetic QA only; not market evidence",
        retiredAt: null,
        createdAt: new Date(),
      })),
    );
    return {
      ...fixture,
      counters,
      modes,
      base,
      async draftWithPhoto() {
        const draft = await fixture.api(
          "/listings",
          fixture.member.accessToken,
          {
            content: {
              bookId: fixture.catalogId,
              mode: "Sale",
              condition: "Good",
              pages: "QA pages",
              coverNote: "QA cover",
              notes: "",
              accessories: "",
              description:
                "Synthetic QA listing used only for AI transport verification.",
              readable: true,
              hasMissingPages: false,
              missingEssentialContent: false,
              salePrice: 45000,
              exchangeValue: null,
              mediaIds: [],
            },
          },
        );
        const media = await fixture.api(
          `/listings/${draft.entityId}/media`,
          fixture.member.accessToken,
          {
            expectedVersion: draft.version,
            mimeType: "image/png",
            byteSize: photo.length,
            sha256: createHash("sha256").update(photo).digest("hex"),
          },
        );
        const ticket = await fixture.api(
          `/listings/${draft.entityId}/media/${media.entityId}/upload-ticket`,
          fixture.member.accessToken,
        );
        await fixture.api(
          ticket.path,
          fixture.member.accessToken,
          photo,
          "PUT",
          ticket.headers,
        );
        const uploaded = await fixture.api(
          `/me/listings/${draft.entityId}/media/${media.entityId}`,
          fixture.member.accessToken,
        );
        await fixture.api(
          `/listings/${draft.entityId}/media/${media.entityId}/finalize`,
          fixture.member.accessToken,
          { expectedVersion: uploaded.version },
        );
        await fixture.processMedia();
        return { id: draft.entityId, mediaId: media.entityId };
      },
    };
  } catch (error) {
    await fixture.close();
    throw error;
  }
}
