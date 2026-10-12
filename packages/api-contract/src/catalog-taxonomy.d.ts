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
export const categoryAliases: Record<string, string>;
export const categoryDirectorySections: { label: string; ids: string[] }[];
export const facetRules: {
  restrictions: Record<string, string[]>;
  exams: Record<string, string[]>;
  dependencies: {
    level: { field: string; value: string };
    grade: { field: string; groups: Record<string, string[]> };
  };
  seriesRoots: string[];
};
export type ClassificationContext = "metadata" | "search";
export function categoryFor(value: string): Category | undefined;
export function categoryPath(value: string): Category[];
export function rootCategory(value: string): Category | undefined;
export function supportsSeries(value: string): boolean;
export function foldCatalogText(value: string): string;
export function languageLabel(value: string): string;
export function descendantIds(value: string): string[];
export function facetsFor(
  categoryId: string,
  attributes?: Attributes,
  context?: ClassificationContext,
): Facet[];
export function compatibleAttributes(
  categoryId: string,
  attributes?: Attributes,
  context?: ClassificationContext,
): Attributes;
export function classificationErrors(
  categoryId: string,
  attributes?: unknown,
): string[];
export function searchClassificationErrors(
  categoryId: string,
  attributes?: unknown,
): string[];
export function searchBranches(
  categoryId: string,
  attributes?: Attributes,
): { categoryId: string; attributes: Attributes }[];
export function classificationLabels(book: {
  attributes?: Attributes;
}): { id: string; label: string; values: Option[] }[];
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
