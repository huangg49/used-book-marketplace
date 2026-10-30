// V1 derivation used by migration0042: keep stable; a changed derivation needs a new migration.
export const recoveryText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
export function recoveryKeys(title: string, authors: string[]) {
  return [
    ...new Set(
      recoveryText([title, ...authors].join(' '))
        .split(' ')
        .filter((w) => w.length >= 2)
        .map((w) => w.slice(0, 3)),
    ),
  ].sort();
}
