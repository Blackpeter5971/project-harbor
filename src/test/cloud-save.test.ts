import { beforeEach, describe, expect, it } from 'vitest';
import { collectCloudPayload, formatRecoveryKey, generateRecoveryKey, isRecoveryKey, restoreCloudPayload, SYNC_KEYS } from '@/lib/game/cloud-save';
import { createCareer, defaultDraft, parseCareer, SAVE_KEY } from '@/lib/game/career';
import { INTEGRITY_FLAG_KEY, openSave, readVerified, sealSave } from '@/lib/game/save-integrity';
import { STORY_SAVE_KEY, STORY_PROGRESS_KEY, STORY_UNLOCKS_KEY } from '@/lib/game/story-mode';

const bundle = () => ({
  [SAVE_KEY]: sealSave(JSON.stringify(createCareer({ ...defaultDraft, name: 'Cloud Player' }))),
  [STORY_SAVE_KEY]: sealSave('{"mode":"story"}'),
  [STORY_PROGRESS_KEY]: '{"completed":["enemy-across-the-aisle"]}',
  [STORY_UNLOCKS_KEY]: '["enemy-across-the-aisle"]',
  'president-wallet-v1': sealSave('{"coins":75,"adsWatched":3,"dynastyUnlocked":true}'),
  [INTEGRITY_FLAG_KEY]: '1',
});
beforeEach(() => localStorage.clear());

describe('manual cloud saves', () => {
  it('generates full random CROS recovery keys', () => {
    const keys = Array.from({ length: 100 }, generateRecoveryKey);
    keys.forEach(key => expect(key).toMatch(/^CROS-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/));
    expect(new Set(keys).size).toBe(100);
  });
  it('formats lowercase, whitespace and missing separators', () => {
    expect(formatRecoveryKey(' cros abcd 2345 efgh ')).toBe('CROS-ABCD-2345-EFGH');
    expect(formatRecoveryKey('crosabcd2345efgh')).toBe('CROS-ABCD-2345-EFGH');
    expect(formatRecoveryKey('cros-a')).toBe('CROS-A');
    expect(formatRecoveryKey('')).toBe('');
  });
  it('requires all three groups and the correct prefix', () => {
    expect(isRecoveryKey('CROS-ABCD-2345-EFGH')).toBe(true);
    expect(isRecoveryKey('CROS-ABCD-2345')).toBe(false);
    expect(isRecoveryKey('WRNG-ABCD-2345-EFGH')).toBe(false);
  });
  it('serializes every required progress key, without unrelated settings', () => {
    const payload = bundle();
    Object.entries(payload).forEach(([key, value]) => localStorage.setItem(key, value));
    localStorage.setItem('unrelated', 'keep');
    expect(SYNC_KEYS).toEqual([SAVE_KEY, STORY_SAVE_KEY, STORY_PROGRESS_KEY, STORY_UNLOCKS_KEY, 'president-wallet-v1', INTEGRITY_FLAG_KEY]);
    expect(JSON.parse(JSON.stringify(collectCloudPayload(localStorage)))).toEqual(payload);
  });
  it('omits missing keys when collecting a backup', () => {
    localStorage.setItem(STORY_PROGRESS_KEY, '[]');
    expect(collectCloudPayload(localStorage)).toEqual({ [STORY_PROGRESS_KEY]: '[]' });
  });
  it('restores all six progress keys unchanged onto a clean phone', () => {
    const payload = bundle();
    restoreCloudPayload(localStorage, payload);
    expect(collectCloudPayload(localStorage)).toEqual(payload);
    expect(openSave(localStorage.getItem(SAVE_KEY)).status).toBe('signed');
    expect(openSave(localStorage.getItem('president-wallet-v1')).status).toBe('signed');
    expect(readVerified(localStorage, SAVE_KEY).tampered).toBe(false);
    expect(parseCareer(readVerified(localStorage, SAVE_KEY).data)?.character.name).toBe('Cloud Player');
  });
  it('overwrites existing progress and ignores unknown remote keys', () => {
    localStorage.setItem('president-wallet-v1', sealSave('{"coins":999}'));
    localStorage.setItem('unrelated', 'keep');
    restoreCloudPayload(localStorage, { ...bundle(), unrelated: 'replace', injected: 'bad' });
    expect(collectCloudPayload(localStorage)).toEqual(bundle());
    expect(localStorage.getItem('unrelated')).toBe('keep');
    expect(localStorage.getItem('injected')).toBeNull();
  });
  it('clears progress absent in the backup instead of mixing devices', () => {
    Object.entries(bundle()).forEach(([key, value]) => localStorage.setItem(key, value));
    restoreCloudPayload(localStorage, { [SAVE_KEY]: bundle()[SAVE_KEY] });
    expect(collectCloudPayload(localStorage)).toEqual({ [SAVE_KEY]: bundle()[SAVE_KEY], [INTEGRITY_FLAG_KEY]: '1' });
  });
  it('rejects altered envelopes before touching device progress', () => {
    localStorage.setItem(SAVE_KEY, 'original');
    expect(() => restoreCloudPayload(localStorage, { ...bundle(), 'president-wallet-v1': bundle()['president-wallet-v1'].replace('75', '999') })).toThrow('verification failed');
    expect(localStorage.getItem(SAVE_KEY)).toBe('original');
    expect(localStorage.getItem('president-wallet-v1')).toBeNull();
  });
  it('rejects unsigned careers even when the remote seal flag is missing', () => {
    expect(() => restoreCloudPayload(localStorage, { [SAVE_KEY]: '{"money":999}' })).toThrow('verification failed');
    expect(collectCloudPayload(localStorage)).toEqual({});
  });
  it('rejects malformed data and backups with no career', () => {
    for (const payload of [null, [], {}, { ...bundle(), [STORY_UNLOCKS_KEY]: 123 }, { ...bundle(), [STORY_PROGRESS_KEY]: 'invalid' }]) {
      expect(() => restoreCloudPayload(localStorage, payload)).toThrow();
    }
    expect(collectCloudPayload(localStorage)).toEqual({});
  });
  it('rolls back every replaced key on a partial storage failure', () => {
    const values = new Map<string, string>([[SAVE_KEY, 'original'], [STORY_PROGRESS_KEY, '[]']]);
    let failed = false;
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => { values.delete(key); },
      setItem: (key: string, value: string) => {
        if (key === STORY_SAVE_KEY && !failed) { failed = true; throw new Error('Storage full'); }
        values.set(key, value);
      },
    };
    expect(() => restoreCloudPayload(storage, bundle())).toThrow('Storage full');
    expect(Object.fromEntries(values)).toEqual({ [SAVE_KEY]: 'original', [STORY_PROGRESS_KEY]: '[]' });
  });
});