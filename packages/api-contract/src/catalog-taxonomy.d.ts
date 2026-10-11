export interface Option {
  id: string;
  label: string;
}
export interface Facet {
  id: string;
  label: string;
  options: Option[];
}
export interface Category extends Option {
  parentId: string | null;
  facets: string[];
  children?: Category[];
}
export type Attributes = Record<string, string[]>;
export const taxonomyVersion: string;
export const categories: (Category & { children: Category[] })[];
export const allCategories: Category[];
export const facetDefinitions: Facet[];
export const languageOptions: Option[];
export function categoryFor(value: string): Category | undefined;
export function descendantIds(value: string): string[];
export function facetsFor(categoryId: string, attributes?: Attributes): Facet[];
export function compatibleAttributes(
  categoryId: string,
  attributes?: Attributes,
): Attributes;
export function classificationErrors(
  categoryId: string,
  attributes?: unknown,
): string[];
export function matchesClassification(
  book: {
    categoryId?: string | null;
    category: string;
    language: string;
    series?: string | null;
    attributes?: Attributes;
  },
  query: {
    categoryId?: string;
    language?: string;
    series?: string;
    attributes?: Attributes;
  },
): boolean;
