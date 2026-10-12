import {
  categoryFor,
  type Attributes,
} from "@used-books/api-contract/catalog-taxonomy";
// Only explicitly curated sample attributes. Missing information stays unknown.
export function previewClassification(book: {
  category: string;
  categoryId?: string;
  attributes?: Attributes;
}) {
  return {
    categoryId: book.categoryId || categoryFor(book.category)?.id || "",
    attributes: book.attributes ?? {},
  };
}
