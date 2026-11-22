import { describe, expect, it } from 'vitest';
import { moodFor, musicGain, MOODS } from '@/lib/game/music-player';
import { DEFAULT_AUDIO } from '@/lib/game/audio';

describe('music player', () => {
  it('plays menu music outside a career', () => { expect(moodFor('menu', null)).toBe('menu'); expect(moodFor('creation', null)).toBe('menu'); });
  it('plays office music during a calm career', () => { expect(moodFor('career', { crises: [{ status: 'resolved' }] })).toBe('office'); });
  it('switches to tense music during an unresolved crisis', () => { expect(moodFor('career', { crises: [{ status: 'active' }] })).toBe('tense'); });
  it('mute silences music', () => { expect(musicGain({ ...DEFAULT_AUDIO, muted: true })).toBe(0); });
  it('music volume zero silences music', () => { expect(musicGain({ ...DEFAULT_AUDIO, musicVolume: 0 })).toBe(0); });
  it('every mood has chords', () => { Object.values(MOODS).forEach(m => expect(m.chords.length).toBeGreaterThan(0)); });
});
