import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Commands, ScenarioError, openJournal, writeJson } from "./journal.mjs";
import { createHttp } from "./http.mjs";
import { root, bindingFor } from "./sandbox.mjs";

const require = createRequire(path.join(root, "apps/api/package.json"));
const assert = (condition, message) => {
  if (!condition) throw new ScenarioError("PROJECTION_MISMATCH", message);
};

async function demoPhoto(directory) {
  const file = path.join(directory, "demo-cover.png");
  try {
    return await readFile(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  // Original, explicitly simulated artwork. It does not represent a physical book.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1050"><rect width="800" height="1050" fill="#efe8d8"/><rect x="52" y="52" width="696" height="946" fill="#254f46"/><g fill="#efe8d8" font-family="Arial,sans-serif"><text x="96" y="170" font-size="42">LAT LAI</text><text x="96" y="465" font-size="88">DEMO</text><text x="96" y="535" font-size="30">Anh mo phong - khong phai sach that</text><path d="M100 660h270v160H100zM380 660h270v160H380z" fill="none" stroke="#efe8d8" stroke-width="8"/><text x="96" y="932" font-size="26">Chuyen tay mot cau chuyen</text></g></svg>`;
  const bytes = await require("sharp")(Buffer.from(svg)).png().toBuffer();
  await writeFile(file, bytes, { flag: "wx", mode: 0o600 });
  return bytes;
}

export async function runBooks(
  config,
  directory,
  sandbox,
  {
    onStep = () => {},
    fetcher = fetch,
    journal: sharedJournal,
    prefix = "",
    fulfillment,
  } = {},
) {
  if (prefix && !/^orders\.(awaiting|paid|preparing)\.book$/.test(prefix))
    throw new ScenarioError("INVALID_SCOPE", "Unknown book scenario scope.");
  const journal =
    sharedJournal ?? (await openJournal(directory, bindingFor(config)));
  const tokens = sandbox.tokens;
  const http = createHttp(sandbox.base, tokens, { fetcher });
  const photo = await demoPhoto(directory);
  const photoDigest = createHash("sha256").update(photo).digest("hex");
  for (const actor of ["seller", "reviewer"]) {
    const account = config.accounts[actor];
    if (!tokens[actor]) {
      const session = await http("/auth/login", {
        method: "POST",
        body: { email: account.email, password: account.password },
      });
      tokens[actor] = session.accessToken;
    }
    const user = await http("/auth/me", { actor });
    assert(
      user.id === account.id,
      "Logged-in actor differs from the sandbox identity.",
    );
  }
  const commands = new Commands(journal, async (intent) => {
    if (intent.kind === "photo") {
      assert(
        intent.body.sha256 === photoDigest &&
          intent.body.byteSize === photo.length,
        "Saved upload bytes changed; preserve the original demo-cover.png.",
      );
      const ticket = await http(
        intent.route.replace(/\/content$/, "/upload-ticket"),
        { actor: intent.actor },
      );
      assert(
        ticket.path === intent.route && ticket.method === "PUT",
        "Upload ticket points to a different resource.",
      );
      return http(intent.route, {
        actor: intent.actor,
        method: "PUT",
        headers: { ...ticket.headers, "Idempotency-Key": intent.key },
        body: photo,
        binary: true,
      });
    }
    return http(intent.route, {
      actor: intent.actor,
      method: intent.method,
      body: intent.body,
      headers: { "Idempotency-Key": intent.key },
    });
  });
  const command = async (name, actor, route, build, method = "POST", kind) => {
    const result = await commands.execute(
      prefix ? `${prefix}.${name}` : name,
      async () => ({
        actor,
        route,
        method,
        body: await build(),
        ...(kind ? { kind } : {}),
      }),
    );
    onStep(name, result.state);
    return result;
  };
  const metadata = {
    title: `[DEMO] Những trang sách chuyền tay — ${config.id.slice(0, 6)}`,
    authors: ["Tác giả mô phỏng"],
    publisher: "Dữ liệu demo Lật lại",
    publicationYear: 2026,
    language: "vi",
    edition: "Bản mô phỏng",
    category: "Văn học",
    isbn: null,
  };
  const catalog = await command(
    "catalog.request",
    "seller",
    "/catalog/requests",
    () => ({ metadata }),
  );
  const bookId = catalog.entityId;
  await command(
    "catalog.confirm",
    "reviewer",
    `/operations/catalog-requests/${bookId}/decision`,
    async () => {
      const current = await http(`/operations/catalog-requests/${bookId}`, {
        actor: "reviewer",
      });
      return {
        expectedVersion: current.version,
        revisionId: current.currentRevision.id,
        decision: "Confirm",
      };
    },
  );
  const book = await http(`/catalog/books/${bookId}`);
  assert(
    book.id === bookId,
    "Confirmed book is missing from the public catalog.",
  );
  const content = {
    bookId,
    mode: "Both",
    condition: "Good",
    pages: "Mô phỏng sách đủ trang.",
    coverNote: "Ảnh bìa do công cụ demo tự tạo.",
    notes: "DỮ LIỆU DEMO — không phải lời rao sách thật.",
    accessories: "Không có",
    description:
      "DỮ LIỆU DEMO. Một câu chuyện chuyền tay để nhóm kiểm tra kệ sách, chi tiết và quy trình duyệt. Ảnh minh họa do dự án tự tạo, không chứng minh quyền sở hữu hay tình trạng của sách thật.",
    readable: true,
    hasMissingPages: false,
    missingEssentialContent: false,
    salePrice: 125000,
    exchangeValue: 150000,
    mediaIds: [],
    ...(fulfillment ? { fulfillment } : {}),
  };
  const listing = await command("listing.draft", "seller", "/listings", () => ({
    content,
  }));
  const id = listing.entityId;
  const media = await command(
    "media.reserve",
    "seller",
    `/listings/${id}/media`,
    async () => {
      const current = await http(`/me/listings/${id}`, { actor: "seller" });
      return {
        expectedVersion: current.version,
        mimeType: "image/png",
        byteSize: photo.length,
        sha256: photoDigest,
      };
    },
  );
  const mediaId = media.entityId;
  await command(
    "media.upload",
    "seller",
    `/listings/${id}/media/${mediaId}/content`,
    () => ({ byteSize: photo.length, sha256: photoDigest }),
    "PUT",
    "photo",
  );
  await command(
    "media.finalize",
    "seller",
    `/listings/${id}/media/${mediaId}/finalize`,
    async () => {
      const current = await http(`/me/listings/${id}/media/${mediaId}`, {
        actor: "seller",
      });
      return { expectedVersion: current.version };
    },
  );
  const deadline = Date.now() + 90_000;
  for (;;) {
    const current = await http(`/me/listings/${id}/media/${mediaId}`, {
      actor: "seller",
    });
    if (current.status === "Ready") break;
    assert(
      current.status !== "Failed",
      "Image pipeline failed; inspect the media status before retrying.",
    );
    if (Date.now() >= deadline)
      throw new ScenarioError(
        "MEDIA_BLOCKED",
        "Image pipeline did not finish within 90 seconds. Keep this run and retry later.",
      );
    await sandbox.processMedia();
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await command(
    "listing.attach-media",
    "seller",
    `/listings/${id}/draft`,
    async () => {
      const current = await http(`/me/listings/${id}`, { actor: "seller" });
      return {
        expectedVersion: current.version,
        content: { ...content, mediaIds: [mediaId] },
      };
    },
    "PUT",
  );
  await command(
    "listing.submit",
    "seller",
    `/listings/${id}/submit`,
    async () => {
      const current = await http(`/me/listings/${id}`, { actor: "seller" });
      return { expectedVersion: current.version, ownershipDeclared: true };
    },
  );
  await command(
    "listing.approve",
    "reviewer",
    `/operations/listings/${id}/decision`,
    async () => {
      const current = await http(`/operations/listings/${id}`, {
        actor: "reviewer",
      });
      return {
        expectedVersion: current.version,
        revisionId: current.currentRevision.id,
        decision: "Approve",
        checklist: {
          catalogMatches: true,
          photosClear: true,
          conditionDisclosed: true,
          readable: true,
          pricingValid: true,
          contentAppropriate: true,
        },
      };
    },
  );
  const detail = await http(`/listings/${id}`);
  const shelf = await http(`/listings?q=${config.id.slice(0, 6)}`);
  assert(
    detail.id === id && shelf.items.some((item) => item.id === id),
    "Approved listing is not eligible for the public shelf.",
  );
  const image = await http(`/listings/${id}/media/${mediaId}/read`);
  let imageResponse;
  try {
    imageResponse = await fetcher(image.url, {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ScenarioError(
      "MEDIA_BLOCKED",
      "Public image could not be fetched.",
    );
  }
  assert(
    imageResponse.ok &&
      imageResponse.headers.get("content-type")?.startsWith("image/webp"),
    "Public derivative is unavailable or has the wrong content type.",
  );
  const derivative = Buffer.from(await imageResponse.arrayBuffer());
  assert(
    derivative.length > 0 && derivative.length <= 2_000_000,
    "Public derivative has an invalid size.",
  );
  const dimensions = await require("sharp")(derivative).metadata();
  assert(
    dimensions.format === "webp" &&
      dimensions.width === image.width &&
      dimensions.height === image.height,
    "Public derivative does not match the processed image projection.",
  );
  const manifest = {
    schema: 1,
    scenario: "H01a",
    run: config.id,
    status: "PASS",
    storage:
      config.storage === "live"
        ? "Supabase live"
        : "FAKE fixture — not live storage acceptance",
    completedAt: new Date().toISOString(),
    bookId,
    listingId: id,
    mediaId,
    roles: {
      seller: config.accounts.seller.id,
      reviewer: config.accounts.reviewer.id,
    },
    steps: Object.fromEntries(
      Object.entries(journal.data.steps)
        .filter(([name]) =>
          prefix
            ? name.startsWith(prefix + ".")
            : !name.startsWith("orders.") && !name.startsWith("funding."),
        )
        .map(([name, intent]) => [
          name,
          { status: intent.state, receipt: intent.receipt },
        ]),
    ),
    limitations: [
      "Isolated demo data, not production data",
      "Generated cover, not evidence of a physical book",
      "No transaction or native/human-review gate closed",
    ],
  };
  await writeJson(
    path.join(
      directory,
      prefix ? `manifest-${prefix.replaceAll(".", "-")}.json` : "manifest.json",
    ),
    manifest,
  );
  return manifest;
}
