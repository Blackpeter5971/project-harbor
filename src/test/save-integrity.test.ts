import { describe, expect, it } from 'vitest';
import { openSave, readVerified, sealSave, sha256Hex, writeSigned, INTEGRITY_FLAG_KEY } from '@/lib/game/save-integrity';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };

describe('save integrity', () => {
  it('matches the SHA-256 standard', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('accepts an untouched signed save', () => {
    expect(openSave(sealSave('{"money":100}'))).toEqual({ status: 'signed', data: '{"money":100}' });
  });
  it('rejects a save whose money was edited', () => {
    const edited = sealSave('{"money":100}').replace('100', '999999');
    expect(openSave(edited).status).toBe('tampered');
  });
  it('rejects unsigned saves once the device has a signed one', () => {
    const s = mem();
    writeSigned(s, 'k', '{"a":1}');
    expect(s.getItem(INTEGRITY_FLAG_KEY)).toBe('1');
    s.setItem('k', '{"a":2}');
    expect(readVerified(s, 'k')).toEqual({ data: null, tampered: true });
  });
  it('still loads an old unsigned save on a device that never signed one', () => {
    const s = mem(); s.setItem('k', '{"a":1}');
    expect(readVerified(s, 'k')).toEqual({ data: '{"a":1}', tampered: false });
  });
});
