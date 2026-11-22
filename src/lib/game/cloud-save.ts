import { SAVE_KEY } from './career';
import { STORY_SAVE_KEY, STORY_PROGRESS_KEY, STORY_UNLOCKS_KEY } from './story-mode';
import { INTEGRITY_FLAG_KEY, openSave } from './save-integrity';

/** Signed envelopes travel unchanged; absence means deletion on restore, not a merge. */
export const SYNC_KEYS = [SAVE_KEY, STORY_SAVE_KEY, STORY_PROGRESS_KEY, STORY_UNLOCKS_KEY, 'president-wallet-v1', INTEGRITY_FLAG_KEY] as const;
export const CLOUD_KEY_STORE = 'president-cloud-key';
export const CLOUD_LAST_STORE = 'president-cloud-last';
const SIGNED_KEYS = [SAVE_KEY, STORY_SAVE_KEY, 'president-wallet-v1'];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export class CloudSaveValidationError extends Error {}

export function generateRecoveryKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = Array.from(bytes, byte => ALPHABET[byte % ALPHABET.length]).join('');
  return `CROS-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

export function formatRecoveryKey(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  return compact.match(/.{1,4}/g)?.join('-') ?? '';
}

export function isRecoveryKey(value: string): boolean {
  return /^CROS-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value);
}

export function collectCloudPayload(storage: Pick<Storage, 'getItem'>): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const key of SYNC_KEYS) {
    const value = storage.getItem(key);
    if (value !== null) payload[key] = value;
  }
  return payload;
}

/** Check everything before writing anything. Unknown keys are never restored. */
export function validateCloudPayload(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CloudSaveValidationError('This cloud save is invalid. Your device progress has not changed.');
  const record = value as Record<string, unknown>;
  const payload: Record<string, string> = {};
  for (const key of SYNC_KEYS) {
    const raw = record[key];
    if (raw === undefined) continue;
    if (typeof raw !== 'string') throw new CloudSaveValidationError('This cloud save is invalid. Your device progress has not changed.');
    if (SIGNED_KEYS.includes(key)) {
      const opened = openSave(raw);
      if (opened.status !== 'signed') throw new CloudSaveValidationError('Save verification failed. Your device progress has not changed.');
      try { JSON.parse(opened.data); } catch { throw new CloudSaveValidationError('This cloud save is invalid. Your device progress has not changed.'); }
    } else if (key !== INTEGRITY_FLAG_KEY) {
      try { JSON.parse(raw); } catch { throw new CloudSaveValidationError('This cloud save is invalid. Your device progress has not changed.'); }
    } else if (raw !== '1') {
      throw new CloudSaveValidationError('Save verification failed. Your device progress has not changed.');
    }
    payload[key] = raw;
  }
  if (!payload[SAVE_KEY] && !payload[STORY_SAVE_KEY]) throw new CloudSaveValidationError('No career to save or restore yet.');
  payload[INTEGRITY_FLAG_KEY] = '1';
  return payload;
}

/** Roll back partial replacements if device storage is unavailable or full. */
export function restoreCloudPayload(storage: SaveStorage, value: unknown): void {
  const payload = validateCloudPayload(value);
  const previous = collectCloudPayload(storage);
  try {
    for (const key of SYNC_KEYS) {
      const raw = payload[key];
      if (raw === undefined) storage.removeItem(key);
      else storage.setItem(key, raw);
    }
  } catch (error) {
    for (const key of SYNC_KEYS) {
      const raw = previous[key];
      if (raw === undefined) storage.removeItem(key);
      else storage.setItem(key, raw);
    }
    throw error;
  }
}