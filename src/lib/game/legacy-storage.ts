import type { Career } from './career';
import { archiveSchema } from './legacy-schema';
import { captureLegacy, legacyOf, mergeArchives } from './legacy';

export const ARCHIVE_KEY = 'crossia-president-national-archive-v1';
/** Called only after hydration or from save actions. Archive survives replacement of the active career. */
export function preserveArchive(c: Career, storage: Pick<Storage, 'getItem' | 'setItem'>): Career {
  const n = captureLegacy(c), l = legacyOf(n);
  let stored = archiveSchema.parse({});
  const raw = storage.getItem(ARCHIVE_KEY);
  if (raw) { try { const parsed = archiveSchema.safeParse(JSON.parse(raw)); if (parsed.success) stored = parsed.data; } catch { /* Keep the valid career's archive. */ } }
  const archive = mergeArchives(stored, l.archive);
  storage.setItem(ARCHIVE_KEY, JSON.stringify(archive));
  return { ...n, legacy: { ...l, archive } };
}