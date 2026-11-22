import { beforeEach, describe, expect, it } from 'vitest';
import { AUDIO_KEY, DEFAULT_AUDIO, modalSound, parseAudioSettings, readAudioSettings, sfxGain, updateAudioSettings } from '@/lib/game/audio';

describe('audio settings', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to master 0.8, sfx 0.8, music 0.5, unmuted', () => {
    expect(readAudioSettings()).toEqual({ masterVolume: 0.8, sfxVolume: 0.8, musicVolume: 0.5, muted: false });
  });

  it('clamps volumes to 0..1', () => {
    expect(parseAudioSettings(JSON.stringify({ masterVolume: 3, sfxVolume: -1, musicVolume: 0.3 }))).toMatchObject({ masterVolume: 1, sfxVolume: 0, musicVolume: 0.3 });
  });

  it('falls back to defaults on corrupt storage', () => {
    expect(parseAudioSettings('{bad')).toEqual(DEFAULT_AUDIO);
  });

  it('muting silences effects', () => {
    expect(sfxGain({ ...DEFAULT_AUDIO, muted: true })).toBe(0);
    expect(sfxGain({ ...DEFAULT_AUDIO, masterVolume: 0.5, sfxVolume: 0.5 })).toBe(0.25);
  });

  it('picks paper for newspapers, open/close for other modals, nothing otherwise', () => {
    const el = (cls: string) => { const d = document.createElement('div'); d.className = cls; return d; };
    expect(modalSound(el('modal-backdrop newspaper-backdrop'), true)).toBe('paper');
    expect(modalSound(el('modal-backdrop'), true)).toBe('open');
    expect(modalSound(el('modal-backdrop'), false)).toBe('close');
    expect(modalSound(el('panel'), true)).toBeNull();
  });

  it('persists changes to device storage', () => {
    updateAudioSettings({ muted: true, sfxVolume: 0.4 });
    expect(JSON.parse(localStorage.getItem(AUDIO_KEY)!)).toMatchObject({ muted: true, sfxVolume: 0.4 });
    expect(readAudioSettings()).toMatchObject({ muted: true, sfxVolume: 0.4, masterVolume: 0.8 });
  });
});
