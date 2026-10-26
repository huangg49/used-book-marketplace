import { z } from 'zod';
import type { components } from '@used-books/api-contract';

export const bundleSchema = z.object({
  title: z.string().min(1).max(300),
  wholeOnly: z.literal(true), exclusiveOwnershipDeclared: z.literal(true),
  items: z.array(z.object({
    label: z.string().min(1).max(200),
    condition: z.enum(['LikeNew', 'Good', 'Fair', 'Worn']),
    notes: z.string().max(500),
  })).min(2).max(50),
}) satisfies z.ZodType<components['schemas']['BookBundle']>;
export type BookBundle = z.infer<typeof bundleSchema>;
const levels = ['LikeNew', 'Good', 'Fair', 'Worn'] as const;
export function bundleCondition(bundle: BookBundle) {
  return levels[Math.max(0, ...bundle.items.map(item => levels.indexOf(item.condition)))]!;
}
export function bundleError(bundle: BookBundle) {
  if (!bundleSchema.safeParse(bundle).success || !bundle.title.trim())
    return 'Nhập tên bộ và danh sách từ 2 đến 50 cuốn, mỗi cuốn có tình trạng riêng.';
  const labels = bundle.items.map(item => item.label.trim().normalize('NFC').toLocaleLowerCase('vi-VN'));
  if (labels.some(label => !label) || new Set(labels).size !== labels.length)
    return 'Tên cuốn/tập không được trống hoặc trùng nhau.';
  return undefined;
}
export const listingTitle = (listing: { bundle?: BookBundle | null; book: { title: string } }) => listing.bundle?.title || listing.book.title;
