import { describe, expect, it } from 'vitest';
import { continueScene, evaluateStageEnding, replayStory, startSessionForTest } from './story-endings.helpers';
import { ENEMY_ACROSS_THE_AISLE_SCRIPT as SCRIPT } from '@/lib/game/scenarios/enemy-across-the-aisle';
import { readDiscoveredEndings, readStoryProgress, recordEndingDiscovered, recordScenarioComplete, STORY_PROGRESS_KEY } from '@/lib/game/story-mode';

const end = (meters: Record<string, number>, flags: string[] = []) => evaluateStageEnding(SCRIPT, { meters, flags })!.id;

describe('Enemy Across the Aisle branching endings', () => {
  it('1 Bipartisan Dynasty', () => expect(end({ affinity: 75, party: 70, integrity: 70, momentum: 60 })).toBe('bipartisan-dynasty'));
  it('2 Crown Without a Heart', () => expect(end({ affinity: 30, party: 70, integrity: 50, momentum: 60 })).toBe('crown-without-heart'));
  it('3 Exiled by Love (lost)', () => expect(end({ affinity: 80, party: 30, integrity: 50, momentum: 40 })).toBe('exiled-by-love'));
  it('3 Exiled by Love (withdrawn)', () => expect(end({ affinity: 80, party: 30, integrity: 50, momentum: 90 }, ['offered-resignation'])).toBe('exiled-by-love'));
  it('4 Scorched Earth needs mutual sabotage', () => {
    expect(end({ affinity: 20, party: 50, integrity: 20, momentum: 40 }, ['leaked-broadband', 'attacked-family'])).toBe('scorched-earth');
    expect(end({ affinity: 20, party: 50, integrity: 20, momentum: 40 }, ['leaked-broadband'])).not.toBe('scorched-earth');
  });
  it('5 Unbroken Reformer', () => expect(end({ affinity: 50, party: 30, integrity: 85, momentum: 60 }, ['exposed-records'])).toBe('unbroken-reformer'));
  it('6 Impeached Puppet requires the bargain and a win', () => {
    expect(end({ affinity: 50, party: 70, integrity: 20, momentum: 60 }, ['osborne-deal'])).toBe('impeached-puppet');
    expect(end({ affinity: 50, party: 70, integrity: 20, momentum: 40 }, ['osborne-deal'])).not.toBe('impeached-puppet');
  });
  it('7 Political Divorce is the balanced fallback', () => expect(end({ affinity: 50, party: 50, integrity: 50, momentum: 60 }, ['romance-ended'])).toBe('political-divorce'));
  it('has exactly 7 numbered endings with hints', () => {
    expect(SCRIPT.endings!.map(e => e.number).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const e of SCRIPT.endings!) expect(e.hint.startsWith('Hint:')).toBe(true);
  });
});

describe('finishing, replay and gallery persistence', () => {
  it('stamps the ending once when the final scene closes, and replay resets meters', () => {
    let story = startSessionForTest();
    const last = SCRIPT.scenes[SCRIPT.scenes.length - 1]!;
    story = { ...story, session: { ...story.session!, sceneId: last.id, meters: { affinity: 30, party: 70, integrity: 50, momentum: 60 } } };
    story = continueScene(story);
    expect(story.session!.complete).toBe(true);
    expect(story.ending).toBe('crown-without-heart');
    const again = replayStory(story);
    expect(again.ending).toBeNull();
    expect(again.session!.meters).toEqual({ affinity: 50, party: 50, integrity: 50, momentum: 50 });
    expect(again.session!.complete).toBe(false);
  });

  it('discovered endings persist across restarts and replays', () => {
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
    recordEndingDiscovered(storage, 'enemy-across-the-aisle', 'crown-without-heart', '2026-11-06T00:00:00.000Z');
    recordEndingDiscovered(storage, 'enemy-across-the-aisle', 'crown-without-heart', '2027-01-01T00:00:00.000Z');
    recordScenarioComplete(storage, 'the-underdog');
    // "restart": a brand new reader over the same persisted string
    const persisted = map.get(STORY_PROGRESS_KEY)!;
    const reloaded = { getItem: () => persisted, setItem: () => {} };
    expect(readDiscoveredEndings(reloaded, 'enemy-across-the-aisle')).toEqual([{ id: 'crown-without-heart', achievedAt: '2026-11-06T00:00:00.000Z' }]);
    expect(readStoryProgress(reloaded)).toEqual(['enemy-across-the-aisle', 'the-underdog']);
  });

  it('reads legacy progress without endings', () => {
    const storage = { getItem: () => JSON.stringify({ completed: ['x'] }), setItem: () => {} };
    expect(readStoryProgress(storage)).toEqual(['x']);
    expect(readDiscoveredEndings(storage, 'x')).toEqual([]);
  });
});
