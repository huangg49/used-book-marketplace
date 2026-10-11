import {
  categoryFor,
  type Attributes,
} from "@used-books/api-contract/catalog-taxonomy";
// Educational classification examples only. Never persisted as confirmed metadata.
const stories: Record<string, Attributes> = {
  Naruto: { genre: ["action", "adventure", "fantasy"], audience: ["shounen"] },
  "Chainsaw Man": { genre: ["action", "horror"], audience: ["shounen"] },
  "Spy x Family": { genre: ["action", "comedy"], audience: ["shounen"] },
  Frieren: { genre: ["fantasy", "adventure"], audience: ["shounen"] },
  "Jujutsu Kaisen": { genre: ["action", "fantasy"], audience: ["shounen"] },
  "Fullmetal Alchemist": {
    genre: ["action", "adventure", "fantasy"],
    audience: ["shounen"],
  },
  Dandadan: { genre: ["action", "comedy"], audience: ["shounen"] },
  "Re:ZERO": { genre: ["fantasy", "adventure"], setting: ["isekai"] },
  Overlord: { genre: ["fantasy", "action"], setting: ["isekai"] },
  "86": { genre: ["scifi", "drama"], setting: [] },
  "Classroom of the Elite": {
    genre: ["drama", "mystery"],
    setting: ["school"],
  },
};
export function previewClassification(book: {
  category: string;
  series: string;
  categoryId?: string;
  attributes?: Attributes;
}) {
  if (book.categoryId)
    return { categoryId: book.categoryId, attributes: book.attributes ?? {} };
  const categoryId = categoryFor(book.category)?.id || "";
  let attributes: Attributes = stories[book.series] || {};
  if (categoryId === "literature")
    attributes = {
      form: ["novel"],
      genre: book.series === "Howl's Moving Castle" ? ["fantasy"] : ["drama"],
    };
  if (categoryId === "psychology.skills")
    attributes = {
      reader: ["general"],
      topic: /Habit|Essentialism|Weeks|Deep Work/.test(book.series)
        ? ["habits"]
        : ["communication"],
    };
  if (categoryId === "business") attributes = { reader: ["professional"] };
  if (categoryId === "science") attributes = { depth: ["popular"] };
  if (categoryId === "history") attributes = { region: ["world"] };
  if (categoryId === "children") attributes = { form: ["story"] };
  return {
    categoryId,
    attributes: Object.fromEntries(
      Object.entries(attributes).filter(([, v]) => v.length),
    ),
  };
}
