import { getDomain } from 'tldts';

export const SOURCE_GROUP_PATTERN = '^[a-z0-9][a-z0-9._:-]{1,99}$';
type Origin = { sourceGroup?: string | null; url: string | null };
export function sourceAliases(source: Origin): string[] {
  const aliases: string[] = [];
  if (
    source.sourceGroup &&
    new RegExp(SOURCE_GROUP_PATTERN).test(source.sourceGroup)
  )
    aliases.push(`org:${source.sourceGroup}`);
  try {
    const url = new URL(source.url ?? '');
    const domain = getDomain(url.hostname, { allowPrivateDomains: true });
    if (url.protocol === 'https:' && !url.username && !url.password && domain)
      aliases.push(`site:${domain}`);
  } catch {
    /* Legacy references can have no website. Never infer origin from display labels. */
  }
  return aliases;
}
// Join shared organization OR website identities. Different labels, subdomains and
// tracking URLs cannot manufacture independence; explicit curator IDs can join sites.
export function originGroups(sources: Origin[]): (string | null)[] {
  const aliases = sources.map(sourceAliases),
    parent = new Map<string, string>();
  const root = (key: string): string => {
    const next = parent.get(key);
    if (!next) {
      parent.set(key, key);
      return key;
    }
    if (next === key) return key;
    const value = root(next);
    parent.set(key, value);
    return value;
  };
  for (const group of aliases)
    for (const key of group) {
      const a = root(group[0]),
        b = root(key);
      if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
    }
  return aliases.map((group) => (group.length ? root(group[0]) : null));
}
