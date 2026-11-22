import type { Career } from './career';
/** Fix Phase 2: only non-essential logs can be cleared. Ledgers, elections, terms, scandals, legal records are never touched. */
export type ClearableHistory = 'notifications' | 'news';
/** Remove the selected entries (indices into the list). The latest newspaper edition is always kept. */
export function clearHistory(c: Career, kind: ClearableHistory, indices: number[]): Career {
  const drop = new Set(indices);
  if (kind === 'notifications') return { ...c, log: c.log.filter((_, i) => !drop.has(i)) };
  return { ...c, news: c.news.filter((_, i) => i === 0 || !drop.has(i)) };
}
