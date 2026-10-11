import type { Document } from 'mongodb';
import {
  allCategories,
  categoryFor,
  classificationErrors,
  descendantIds,
  type Attributes,
} from '@used-books/api-contract/catalog-taxonomy';
import { invalidField } from '../commands/domain-error.js';
import { regexLiteral } from '../commands/mongo-page.service.js';

export function validateClassification(metadata: {
  category: string;
  categoryId?: string | null;
  attributes?: Attributes;
  series?: string | null;
}) {
  const attributes = metadata.attributes ?? {};
  if (!metadata.categoryId) {
    if (Object.keys(attributes).length || metadata.series)
      invalidField(
        '/metadata/categoryId',
        'Chọn danh mục trước khi bổ sung thuộc tính.',
      );
    return;
  }
  const category = categoryFor(metadata.categoryId);
  if (!category || category.label !== metadata.category)
    invalidField(
      '/metadata/categoryId',
      'Danh mục và tên danh mục phải khớp bộ phân loại.',
    );
  const errors = classificationErrors(metadata.categoryId, attributes);
  if (errors.length)
    invalidField(
      '/metadata/attributes',
      'Thuộc tính không phù hợp danh mục, ngôn ngữ học hoặc cấp học đã chọn.',
    );
  if (
    metadata.series &&
    !['manga', 'light-novel'].includes(metadata.categoryId)
  )
    invalidField(
      '/metadata/series',
      'Bộ truyện chỉ áp dụng cho Manga và Light Novel.',
    );
}

export function catalogFilters(query: Record<string, string | number>) {
  let attributes: Attributes = {};
  try {
    attributes = query.facets ? JSON.parse(String(query.facets)) : {};
  } catch {
    invalidField(
      '/facets',
      'Bộ lọc thuộc tính cần là một đối tượng JSON hợp lệ.',
    );
  }
  const categoryId = String(query.categoryId ?? '');
  if (
    !attributes ||
    typeof attributes !== 'object' ||
    Array.isArray(attributes)
  )
    invalidField('/facets', 'Bộ lọc thuộc tính không hợp lệ.');
  if (Object.keys(attributes).length && !categoryId)
    invalidField('/categoryId', 'Chọn danh mục để lọc thuộc tính riêng.');
  if (
    (categoryId && !categoryFor(categoryId)) ||
    (categoryId && classificationErrors(categoryId, attributes).length)
  )
    invalidField(
      '/facets',
      'Bộ lọc không thuộc danh mục hoặc có lựa chọn không tương thích.',
    );
  const series = String(query.series ?? '')
    .normalize('NFC')
    .toLowerCase();
  if (series && !['manga', 'light-novel'].includes(categoryId))
    invalidField(
      '/series',
      'Chọn Manga hoặc Light Novel trước khi tìm bộ truyện.',
    );
  return {
    categoryId,
    language: String(query.language ?? '').toLowerCase(),
    series,
    attributes: Object.fromEntries(
      Object.keys(attributes)
        .sort()
        .map((key) => [key, [...attributes[key]!].sort()]),
    ) as Attributes,
  };
}

export function catalogFilterStages(
  filters: ReturnType<typeof catalogFilters>,
  bookPath: string,
): Document[] {
  if (
    !filters.categoryId &&
    !filters.language &&
    !filters.series &&
    !Object.keys(filters.attributes).length
  )
    return [];
  const match: Document = {};
  if (filters.categoryId) {
    const ids = descendantIds(filters.categoryId);
    const labels = [
      ...allCategories.map((c) => c.label),
      'Manga',
      'Light novel',
      'Kỹ năng sống',
      'Kinh doanh',
      'Khoa học',
      'Lịch sử',
      'Khác',
    ].filter((label) => ids.includes(categoryFor(label)?.id ?? ''));
    match.$or = [
      { 'cm.categoryId': { $in: ids } },
      { $and: [{ 'cm.categoryId': null }, { 'cm.category': { $in: labels } }] },
    ];
  }
  if (filters.language)
    match['cm.language'] = {
      $regex: `^${regexLiteral(filters.language)}(?:-|$)`,
      $options: 'i',
    };
  if (filters.series)
    match['cm.series'] = {
      $regex: `^${regexLiteral(filters.series)}$`,
      $options: 'i',
    };
  for (const [key, values] of Object.entries(filters.attributes))
    match[`cm.attributes.${key}`] = { $in: values };
  return [
    {
      $lookup: {
        from: 'catalog_revisions',
        localField: bookPath,
        foreignField: '_id',
        as: 'cm',
      },
    },
    { $unwind: '$cm' },
    { $match: match },
  ];
}
