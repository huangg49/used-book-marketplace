import { z } from "zod";
import type { components } from "@used-books/api-contract";
import { allCategories } from "@used-books/api-contract/catalog-taxonomy";
type Metadata = components["schemas"]["CatalogMetadata"];
export const catalogClassificationFields = {
  categoryId: z
    .custom<Metadata["categoryId"]>(
      (v) => v === null || allCategories.some((c) => c.id === v),
    )
    .optional(),
  attributes: z.record(z.string(), z.array(z.string())).optional(),
  series: z.string().nullable().optional(),
};
export function classificationForResubmit(
  value?: Pick<Metadata, "categoryId" | "attributes" | "series">,
) {
  return value?.categoryId
    ? {
        categoryId: value.categoryId,
        attributes: Object.fromEntries(
          Object.entries(value.attributes ?? {}).map(([key, values]) => [
            key,
            [...values],
          ]),
        ),
        series: value.series ?? null,
      }
    : {};
}
