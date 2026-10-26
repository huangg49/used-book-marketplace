import type { Wire } from '../commands/domain-error.js';
import { invalidField } from '../commands/domain-error.js';

const conditions = ['LikeNew', 'Good', 'Fair', 'Worn'] as const;
export function bundleCondition(bundle: Wire['BookBundle']) {
  return conditions[Math.max(...bundle.items.map(item => conditions.indexOf(item.condition)))];
}

export function validateBundle(
  content: { bundle?: Wire['BookBundle'] | null; mode?: string | null; condition?: string | null },
  previous?: { bundle?: Wire['BookBundle'] | null },
) {
  if (previous?.bundle && content.bundle === undefined)
    invalidField('/content/bundle', 'Gửi đầy đủ danh sách bộ sách; không được bỏ trường khi sửa bộ.');
  const bundle = content.bundle;
  if (!bundle) return;
  if (content.mode !== 'Sale')
    invalidField('/content/mode', 'Bộ sách chỉ hỗ trợ bán nguyên bộ.');
  if (!bundle.title.trim()) invalidField('/content/bundle/title', 'Nhập tên bộ sách.');
  const labels = bundle.items.map(item => item.label.trim().normalize('NFC').toLocaleLowerCase('vi-VN'));
  if (labels.some(label => !label) || new Set(labels).size !== labels.length)
    invalidField('/content/bundle/items', 'Mỗi cuốn/tập cần tên riêng, không để trống hoặc trùng tên.');
  if (content.condition && content.condition !== bundleCondition(bundle))
    invalidField('/content/condition', 'Tình trạng chung phải theo cuốn có tình trạng thấp nhất trong bộ.');
}

export function normalizeBundle(bundle: Wire['BookBundle'] | null | undefined) {
  return bundle ? { ...bundle, title: bundle.title.trim(), items: bundle.items.map(item => ({
    ...item, label: item.label.trim().normalize('NFC'), notes: item.notes.trim(),
  })) } : null;
}
