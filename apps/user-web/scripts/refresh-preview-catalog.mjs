// Small, curated educational UI sample; never writes to the application DB.
import { readFile, writeFile } from "node:fs/promises";
import {
  categories,
  categoryFor,
  rootCategory,
} from "../../../packages/api-contract/src/catalog-taxonomy.js";

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
  ["Văn học", "The Great Gatsby", "F. Scott Fitzgerald", 1],
  ["Văn học", "To Kill a Mockingbird", "Harper Lee", 1],
  ["Văn học", "The Old Man and the Sea", "Ernest Hemingway", 1],
  ["Văn học", "Jane Eyre", "Charlotte Brontë", 1],
  ["Văn học", "Little Women", "Louisa May Alcott", 1],
  ["Văn học", "The Alchemist", "Paulo Coelho", 1],
  ["Văn học", "The Kite Runner", "Khaled Hosseini", 1],
  ["Văn học", "The Book Thief", "Markus Zusak", 1],
  ["Kỹ năng sống", "Atomic Habits", "James Clear", 1],
  ["Kỹ năng sống", "Deep Work", "Cal Newport", 1],
  ["Kỹ năng sống", "Essentialism", "Greg McKeown", 1],
  ["Kỹ năng sống", "Mindset", "Carol Dweck", 1],
  ["Kỹ năng sống", "The Power of Habit", "Charles Duhigg", 1],
  ["Kỹ năng sống", "How to Win Friends", "Dale Carnegie", 1],
  ["Kỹ năng sống", "The 7 Habits", "Stephen Covey", 1],
  ["Kỹ năng sống", "Four Thousand Weeks", "Oliver Burkeman", 1],
  ["Kinh doanh", "The Psychology of Money", "Morgan Housel", 1],
  ["Kinh doanh", "The Lean Startup", "Eric Ries", 1],
  ["Kinh doanh", "Zero to One", "Peter Thiel", 1],
  ["Kinh doanh", "Good to Great", "Jim Collins", 1],
  ["Kinh doanh", "Start with Why", "Simon Sinek", 1],
  ["Kinh doanh", "The Intelligent Investor", "Benjamin Graham", 1],
  ["Kinh doanh", "Thinking Fast and Slow", "Daniel Kahneman", 1],
  ["Kinh doanh", "The Personal MBA", "Josh Kaufman", 1],
  ["Khoa học", "A Brief History of Time", "Stephen Hawking", 1],
  ["Khoa học", "Cosmos", "Carl Sagan", 1],
  ["Khoa học", "A Short History of Nearly Everything", "Bill Bryson", 1],
  ["Khoa học", "The Selfish Gene", "Richard Dawkins", 1],
  ["Khoa học", "The Gene", "Siddhartha Mukherjee", 1],
  ["Khoa học", "The Hidden Life of Trees", "Peter Wohlleben", 1],
  ["Khoa học", "Silent Spring", "Rachel Carson", 1],
  ["Khoa học", "The Body", "Bill Bryson", 1],
  ["Lịch sử", "Sapiens", "Yuval Noah Harari", 1],
  ["Lịch sử", "Guns Germs and Steel", "Jared Diamond", 1],
  ["Lịch sử", "The Silk Roads", "Peter Frankopan", 1],
  ["Lịch sử", "SPQR", "Mary Beard", 1],
  ["Lịch sử", "A Little History of the World", "Ernst Gombrich", 1],
  ["Lịch sử", "The Diary of a Young Girl", "Anne Frank", 1],
  ["Lịch sử", "The Wright Brothers", "David McCullough", 1],
  ["Lịch sử", "The Story of Art", "Ernst Gombrich", 1],
  ["Thiếu nhi", "Charlotte's Web", "E. B. White", 1],
  ["Thiếu nhi", "Matilda", "Roald Dahl", 1],
  ["Thiếu nhi", "The Very Hungry Caterpillar", "Eric Carle", 1],
  ["Thiếu nhi", "Where the Wild Things Are", "Maurice Sendak", 1],
  ["Thiếu nhi", "Winnie the Pooh", "A. A. Milne", 1],
  ["Thiếu nhi", "The Tale of Peter Rabbit", "Beatrix Potter", 1],
  ["Thiếu nhi", "The Secret Garden", "Frances Hodgson Burnett", 1],
  ["Thiếu nhi", "The Gruffalo", "Julia Donaldson", 1],
  ["Học ngoại ngữ", "Japanese from Zero", "George Trombley", 1],
  ["Học ngoại ngữ", "English Grammar in Use", "Raymond Murphy", 1],
  ["Học ngoại ngữ", "Integrated Chinese", "Yuehua Liu", 1],
  ["Giáo khoa / tham khảo", "Calculus", "James Stewart", 1],
  ["Giáo khoa / tham khảo", "Algebra 1", "John Saxon", 1],
  ["Giáo khoa / tham khảo", "Biology", "Kenneth Miller", 1],
];
const snapshotPath = new URL(
  "../src/data/preview-catalog.json",
  import.meta.url,
);
// Expansion preserves the reviewed manga/LN cache; a full refresh remains explicit.
const saved = JSON.parse(await readFile(snapshotPath, "utf8"));
// A full refresh must also include the expanded, individually curated titles.
for (const book of saved.items)
  if (!selections.some((s) => s[1] === book.series))
    selections.push([book.category, book.series, book.authors[0], 1]);
const previous = process.argv.includes("--expand") ? saved : null;
const unwantedSample =
  /collection set|books collection|study guide|summary of/i;
const items = (previous?.items ?? []).filter(
  (book) => !unwantedSample.test(book.title),
);
const queries = previous?.queries ?? [];
for (const [category, title, author, count = 4] of selections) {
  if (previous && items.some((book) => book.series === title)) continue;
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
    if (unwantedSample.test(edition?.title ?? "")) continue;
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
    if (++added === count) break;
  }
  console.log(`${category}: ${title}: ${added}`);
  // Stay below the public API's one-request-per-second default.
  await new Promise((resolve) => setTimeout(resolve, 1200));
}
const categoryOrder = categories
  .filter((c) => c.id !== "other")
  .map((c) => c.id);
for (const book of items) {
  const curated = saved.items.find(
    (item) => item.series === book.series && item.categoryId,
  );
  if (curated) {
    book.categoryId = curated.categoryId;
    book.category = categoryFor(curated.categoryId).label;
    book.attributes = curated.attributes;
    book.classificationSeed = curated.classificationSeed;
  }
}
if (
  items.length < 88 ||
  categoryOrder.some(
    (category) =>
      items.filter(
        (book) =>
          rootCategory(book.categoryId || book.category)?.id === category,
      ).length <
      ([
        "languages",
        "education",
        "history",
        "biography",
        "parenting",
        "health",
        "arts",
        "society",
        "lifestyle",
      ].includes(category)
        ? 3
        : 6),
  )
)
  throw new Error(
    `Only ${items.length} validated editions; existing snapshot retained`,
  );
// Interleave series within each category, then categories: the first shelf spans
// the whole bookstore instead of being dominated by the largest manga series.
items.sort(
  (a, b) =>
    selections.findIndex((s) => s[1] === a.series) -
    selections.findIndex((s) => s[1] === b.series),
);
const bySeries = [];
for (let round = 0; round < 4; round++)
  for (const [, series] of selections) {
    const item = items.filter((book) => book.series === series)[round];
    if (item) bySeries.push(item);
  }
const ordered = [];
for (let round = 0; round < items.length; round++)
  for (const category of categoryOrder) {
    const item = bySeries.filter(
      (book) => rootCategory(book.categoryId || book.category)?.id === category,
    )[round];
    if (item) ordered.push(item);
  }
const snapshot = {
  provider: "Open Library",
  fetchedAt: new Date().toISOString(),
  purpose:
    "Owner-requested UI preview only; no inventory, seller or transaction data",
  queries,
  items: ordered.map((book) => {
    // Preserve the separately curated UI classification, not remote subject tags.
    const curated = saved.items.find(
      (item) => item.series === book.series && item.categoryId,
    );
    return curated
      ? {
          ...book,
          category: categoryFor(curated.categoryId).label,
          categoryId: curated.categoryId,
          attributes: curated.attributes,
          classificationSeed: curated.classificationSeed,
        }
      : book;
  }),
  classificationNote: saved.classificationNote,
  ...(previous ? { previousSnapshotFetchedAt: previous.fetchedAt } : {}),
};
await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2) + "\n");
console.log(
  `Saved ${snapshot.items.length} editions; covers remain remote, not downloaded.`,
);
