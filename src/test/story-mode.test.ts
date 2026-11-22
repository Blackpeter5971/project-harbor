import { describe, expect, it } from 'vitest';
import { SAVE_KEY, careerSchema, createCareer, createStoryCareer, defaultDraft, parseCareer } from '@/lib/game/career';
import {
  CORE_FEATURES, FEATURE_STATES, SCENARIOS, STORY_PROGRESS_KEY, STORY_SAVE_KEY,
  createStoryState, featureState, isFeatureActive, readStoryProgress, recordScenarioComplete,
  scenarioById, scenarioCardStatus, scenarioSchema,
} from '@/lib/game/story-mode';

const draft = { ...defaultDraft, name: 'Test Runner' };

describe('save isolation', () => {
  it('story and sandbox saves use different keys', () => {
    expect(STORY_SAVE_KEY).not.toBe(SAVE_KEY);
    expect(STORY_PROGRESS_KEY).not.toBe(SAVE_KEY);
    expect(STORY_PROGRESS_KEY).not.toBe(STORY_SAVE_KEY);
  });

  it('sandbox careers carry no story state and default to sandbox mode', () => {
    const c = createCareer(draft);
    expect(c.mode).toBe('sandbox');
    expect(c.story ?? null).toBeNull();
  });

  it('legacy saves without a mode field parse as sandbox', () => {
    const c = createCareer(draft) as Record<string, unknown>;
    delete c['mode'];
    delete c['story'];
    const parsed = parseCareer(JSON.stringify(c));
    expect(parsed?.mode).toBe('sandbox');
  });

  it('story careers round-trip through storage with scenario progress intact', () => {
    const c = createStoryCareer(draft, 'enemy-across-the-aisle');
    const parsed = parseCareer(JSON.stringify(c));
    expect(parsed?.mode).toBe('story');
    expect(parsed?.story?.scenarioId).toBe('enemy-across-the-aisle');
    expect(parsed?.story?.chapter).toBe(1);
  });
});

describe('scenario registry', () => {
  it('every scenario passes its schema and defines every core feature', () => {
    for (const s of SCENARIOS) {
      expect(scenarioSchema.safeParse(s).success).toBe(true);
      for (const f of CORE_FEATURES) expect(FEATURE_STATES).toContain(s.features[f]);
    }
  });

  it('registers Enemy Across the Aisle as active, free, 20 turns and 8 chapters', () => {
    const s = scenarioById('enemy-across-the-aisle');
    expect(s).toBeDefined();
    expect(s?.status).toBe('active');
    expect(s?.free).toBe(true);
    expect(s?.turns).toBe(20);
    expect(s?.chapters).toBe(8);
  });

  it('opens the flagship and base scenarios for play', () => {
    expect(SCENARIOS.filter(s => s.status === 'active').map(s => s.id)).toEqual(['enemy-across-the-aisle', 'the-underdog', 'the-legacy-burden', 'crisis-leadership', 'civil-war-alternate-destiny']);
  });

  it('card status reflects completion and definition status', () => {
    const s = scenarioById('enemy-across-the-aisle')!;
    expect(scenarioCardStatus(s, [])).toBe('active');
    expect(scenarioCardStatus(s, ['enemy-across-the-aisle'])).toBe('completed');
    expect(scenarioCardStatus(scenarioById('red-carpet-blue-blood')!, [])).toBe('locked');
  });
});

describe('feature configuration matrix', () => {
  it('locks business and judiciary in Enemy Across the Aisle', () => {
    expect(featureState('enemy-across-the-aisle', 'business')).toBe('locked');
    expect(featureState('enemy-across-the-aisle', 'judiciary')).toBe('locked');
    expect(featureState('enemy-across-the-aisle', 'elections')).toBe('available');
  });

  it('only AVAILABLE features run background ticks', () => {
    expect(isFeatureActive('enemy-across-the-aisle', 'elections')).toBe(true);
    expect(isFeatureActive('enemy-across-the-aisle', 'business')).toBe(false);
    expect(isFeatureActive('enemy-across-the-aisle', 'judiciary')).toBe(false);
  });

  it('unknown scenarios and features default to hidden (inactive)', () => {
    expect(featureState('no-such-scenario', 'elections')).toBe('hidden');
    expect(isFeatureActive('no-such-scenario', 'elections')).toBe(false);
  });
});

describe('story state', () => {
  it('starts at chapter 1, act 1, turn 0 with no flags', () => {
    const st = createStoryState('enemy-across-the-aisle');
    expect(st).toMatchObject({ scenarioId: 'enemy-across-the-aisle', chapter: 1, act: 1, turn: 0, flags: {}, completedChapters: [] });
  });

  it('rejects unknown scenarios', () => {
    expect(() => createStoryState('nope')).toThrow();
  });

  it('decision flags accept strings, numbers and booleans', () => {
    const parsed = careerSchema.shape.story.unwrap().unwrap().safeParse({ scenarioId: 'enemy-across-the-aisle', flags: { 'bistro-photo': 'A', meetings: 3, married: false } });
    expect(parsed.success).toBe(true);
  });
});

describe('story progress record', () => {
  const fakeStorage = () => {
    const map = new Map<string, string>();
    return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
  };

  it('records completions additively and idempotently', () => {
    const storage = fakeStorage();
    expect(readStoryProgress(storage)).toEqual([]);
    recordScenarioComplete(storage, 'enemy-across-the-aisle');
    recordScenarioComplete(storage, 'enemy-across-the-aisle');
    expect(readStoryProgress(storage)).toEqual(['enemy-across-the-aisle']);
  });

  it('survives corrupted storage', () => {
    const storage = fakeStorage();
    storage.setItem(STORY_PROGRESS_KEY, '{broken');
    expect(readStoryProgress(storage)).toEqual([]);
  });
});

describe('coin balance safety', () => {
  it('free flags match a zero price', () => {
    for (const s of SCENARIOS) expect(s.free).toBe(s.price === 0);
  });
});
