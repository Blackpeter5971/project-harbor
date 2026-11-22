import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { activityCue, careerCues, dramaCues } from '@/lib/game/audio-cues';

const base = () => createCareer({ ...defaultDraft, name: 'Cue Tester', background: 'Nobody' });
const bill = (stage: Career['bills'][number]['stage']): Career['bills'][number] => ({ id: 'b1', tenure: 't', title: 'Bill', kind: 'bill', policy: 'services', stage, date: '2026-01-01', cost: 0, revision: 0, boost: 0, attempts: 0, support: null, chamberVotes: [], history: [], budget: null });

describe('audio cues', () => {
  it('gavel + passing chord when a bill passes', () => {
    const a = { ...base(), bills: [bill('under consideration')] };
    expect(careerCues(a, { ...a, bills: [bill('passed')] })).toEqual(expect.arrayContaining(['gavel', 'pass']));
  });
  it('gavel + failing tone when a bill is rejected', () => {
    const a = { ...base(), bills: [bill('under consideration')] };
    expect(careerCues(a, { ...a, bills: [bill('rejected')] })).toEqual(expect.arrayContaining(['gavel', 'fail']));
  });
  it('cash when money comes in', () => {
    const a = base();
    expect(careerCues(a, { ...a, money: a.money + 100 })).toContain('cash');
  });
  it('no cues across a turn advance', () => {
    const a = base();
    expect(careerCues(a, { ...a, date: '2099-01-01', money: a.money + 100 })).toEqual([]);
  });
  it('election: tally then victory on a win, defeat on a loss, nothing on re-render', () => {
    const a = base();
    const result = (won: boolean) => ({ office: 'council', title: 'Council', jurisdiction: 'X', date: a.date, stage: 'general', won, rows: [], ec: null, statesWon: [], stateCalls: [] }) as unknown as Career['elections'][number];
    expect(dramaCues(a, { ...a, elections: [result(true)] })).toEqual(['tally', 'victory']);
    expect(dramaCues(a, { ...a, elections: [result(false)] })).toEqual(['tally', 'defeat']);
    const done = { ...a, elections: [result(true)] };
    expect(dramaCues(done, done)).toEqual([]);
  });
  it('a newly broken scandal sounds the alert once', () => {
    const a = base();
    const s = { id: 's1', phase: 'Emerging' } as unknown as Career['scandals'][number];
    const b = { ...a, scandals: [s] };
    expect(dramaCues(a, b)).toContain('alert');
    expect(dramaCues(b, { ...b, date: '2099-01-01' })).toEqual([]);
  });
  it('speeches get applause, interviews get the camera', () => {
    expect(activityCue('speech')).toBe('applause');
    expect(activityCue('interview')).toBe('camera');
    expect(activityCue('study')).toBeNull();
  });
});
