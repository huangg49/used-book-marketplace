// Small, curated educational UI sample; never writes to the application DB.
import { writeFile } from "node:fs/promises";

const selections = [
  ["Manga", "Naruto", "Masashi Kishimoto"],
  ["Manga", "Chainsaw Man", "Tatsuki Fujimoto"],
  ["Manga", "Spy x Family", "Tatsuya Endo"],
  ["Manga", "Frieren", "山田鐘人"],
  ["Manga", "Jujutsu Kaisen", "Gege Akutami"],
  ["Manga", "Fullmetal Alchemist", "荒川弘"],
  ["Manga", "Dandadan", "Yukinobu Tatsu"],
  ["Light novel", "Re:ZERO", "長月達平"],
  ["Light novel", "Overlord", "丸山くがね"],
  ["Light novel", "86", "安里アサト"],
  ["Light novel", "Classroom of the Elite", "衣笠彰梧"],
  ["Văn học", "Howl's Moving Castle", "Diana Wynne Jones"],
  ["Văn học", "The Little Prince", "Antoine de Saint-Exupéry"],
];
const items = [];
const queries = [];
for (const [category, title, author] of selections) {
  const q = `title:"${title}" author:"${author}" language:eng${category === "Light novel" ? ' "light novel"' : ""}`;
  const url = new URL("https://openlibrary.org/search.json");
  url.search = new URLSearchParams({
    q,
    limit: "12",
    fields:
      "key,title,author_name,subject,editions,editions.key,editions.title,editions.language,editions.isbn,editions.cover_i",
  });
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: {
      "User-Agent": "LatLai-UI-Preview/1.0 (educational local prototype)",
    },
  });
  if (!response.ok)
    throw new Error(
      `Open Library: ${response.status}; existing snapshot retained`,
    );
  const data = await response.json();
  queries.push(String(url));
  let added = 0;
  for (const work of data.docs ?? []) {
    const edition = work.editions?.docs?.[0];
    if (
      !/^\/books\/OL\d+M$/.test(edition?.key ?? "") ||
      !Number.isInteger(edition?.cover_i) ||
      (category === "Light novel" &&
        ![work.title, ...(work.subject ?? [])].some((value) =>
          /light novel/i.test(value),
        ))
    )
      continue;
    if (
      !edition?.cover_i ||
      !edition.language?.includes("eng") ||
      !work.author_name?.length ||
      items.some((item) => item.id === edition.key)
    )
      continue;
    items.push({
      id: edition.key,
      title: edition.title,
      authors: work.author_name,
      category,
      language: "eng",
      isbn:
        edition.isbn?.find((value) => value.length === 13) ??
        edition.isbn?.[0] ??
        null,
      coverId: edition.cover_i,
      coverUrl: `https://covers.openlibrary.org/b/id/${edition.cover_i}-L.jpg?default=false`,
      sourceUrl: `https://openlibrary.org${edition.key}`,
      series: title,
    });
    if (++added === 4) break;
  }
  console.log(`${category}: ${title}: ${added}`);
  // Stay below the public API's one-request-per-second default.
  await new Promise((resolve) => setTimeout(resolve, 1200));
}
if (items.length < 36)
  throw new Error(
    `Only ${items.length} validated editions; existing snapshot retained`,
  );
// Interleave series: the opening shelf should not contain four copies of one series.
items.sort(
  (a, b) =>
    selections.findIndex((s) => s[1] === a.series) -
    selections.findIndex((s) => s[1] === b.series),
);
const ordered = [];
for (let round = 0; round < 4; round++)
  for (const [, series] of selections) {
    const item = items.filter((book) => book.series === series)[round];
    if (item) ordered.push(item);
  }
const snapshot = {
  provider: "Open Library",
  fetchedAt: new Date().toISOString(),
  purpose:
    "Owner-requested UI preview only; no inventory, seller or transaction data",
  queries,
  items: ordered.slice(0, 48),
};
await writeFile(
  new URL("../src/data/preview-catalog.json", import.meta.url),
  JSON.stringify(snapshot, null, 2) + "\n",
);
console.log(
  `Saved ${snapshot.items.length} editions; covers remain remote, not downloaded.`,
);
