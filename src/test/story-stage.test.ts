import { describe, expect, it } from 'vitest';
import { createStoryCareer, defaultDraft, parseCareer } from '@/lib/game/career';
import { chooseScene, continueScene, ensureSession } from '@/lib/game/story-engine';
import { ENEMY_ACROSS_THE_AISLE_SCENES as SCENES, ENEMY_ACROSS_THE_AISLE_SCRIPT as SCRIPT } from '@/lib/game/scenarios/enemy-across-the-aisle';

const fresh = () => { const c = createStoryCareer({ ...defaultDraft, name: 'Stage Tester' }, 'enemy-across-the-aisle'); return { ...c, story: ensureSession(c.story!) }; };

describe('Enemy Across the Aisle script', () => {
  it('has 72 unique scenes: 4 acts × 3 chapters × 6 scenes', () => {
    expect(SCENES).toHaveLength(72);
    expect(new Set(SCENES.map(s => s.id)).size).toBe(72);
    for (let ch = 1; ch <= 12; ch++) expect(SCENES.filter(s => s.chapter === ch).map(s => s.sceneNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(SCENES.map(s => s.act))).toEqual(new Set([1, 2, 3, 4]));
  });

  it('has no broken nextSceneId links and only the finale ends the story', () => {
    const ids = new Set(SCENES.map(s => s.id));
    for (const s of SCENES) {
      for (const n of [s.nextSceneId, ...(s.choices ?? []).map(c => c.nextSceneId)]) if (n) expect(ids.has(n)).toBe(true);
    }
    expect(SCENES.filter(s => !s.nextSceneId).map(s => s.id)).toEqual(['act4_ch12_sc6']);
  });

  it('every chapter has a major decision in scene 4 that only touches the 4 meters', () => {
    const meters = new Set(SCRIPT.meters.map(m => m.id));
    for (const s of SCENES.filter(x => x.sceneNumber === 4)) {
      expect(s.choices!.length).toBeGreaterThanOrEqual(2);
      for (const c of s.choices!) for (const k of Object.keys(c.effects)) expect(meters.has(k)).toBe(true);
    }
  });

  it('all four meters start at 50', () => {
    expect(fresh().story.session?.meters).toEqual({ affinity: 50, party: 50, integrity: 50, momentum: 50 });
  });

  it('plays all 72 scenes start to finish, applying decisions to the meters', () => {
    let s = fresh().story; let steps = 0;
    while (!s.session!.complete && steps++ < 200) {
      const scene = SCENES.find(x => x.id === s.session!.sceneId)!;
      if (scene.choices) { const r = chooseScene(s, scene.id, scene.choices[0]!.id); if (!r.ok) throw new Error(r.message); s = r.story; }
      s = continueScene(s);
    }
    expect(s.session!.complete).toBe(true);
    expect(s.session!.visited).toHaveLength(72);
    expect(s.session!.meters).not.toEqual({ affinity: 50, party: 50, integrity: 50, momentum: 50 });
  });
});

describe('story stage engine', () => {
  it('starts with Senator Vance', () => { expect(fresh().story.session?.sceneId).toBe('act1_ch1_sc1'); });

  it('applies meter effects once and rejects a repeated choice', () => {
    const r = chooseScene(fresh().story, 'act1_ch1_sc1', 'spar');
    if (!r.ok) throw new Error();
    expect(r.story.session?.meters['affinity']).toBe(60);
    expect(r.story.session?.meters['momentum']).toBe(55);
    expect(chooseScene(r.story, 'act1_ch1_sc1', 'spar').ok).toBe(false);
  });

  it('cannot continue past a choice scene before choosing', () => {
    expect(continueScene(fresh().story).session?.sceneId).toBe('act1_ch1_sc1');
  });

  it('resumes at the exact scene after reload', () => {
    const c = fresh();
    const r = chooseScene(c.story, 'act1_ch1_sc1', 'snub'); if (!r.ok) throw new Error();
    const s2 = continueScene(r.story);
    const reloaded = parseCareer(JSON.stringify({ ...c, story: s2 }));
    expect(reloaded?.story?.session?.sceneId).toBe('act1_ch1_sc2');
    expect(reloaded?.story?.session?.meters['party']).toBe(60);
  });
});

import { SCENE_SCRIPTS as ALL_SCRIPTS, sceneById as findScene } from '@/lib/game/story-engine';
describe('scenario dashboards', () => {
  it('each scenario has its own meters and fully linked scenes', () => {
    const meterSets = new Set<string>();
    for (const [id, s] of Object.entries(ALL_SCRIPTS)) {
      meterSets.add(s.meters.map(m => m.id).join(','));
      for (const sc of s.scenes) {
        if (sc.nextSceneId) expect(findScene(s, sc.nextSceneId), `${id}:${sc.id}`).toBeDefined();
        for (const ch of sc.choices ?? []) for (const k of Object.keys(ch.effects)) expect(s.meters.some(m => m.id === k), `${id}:${ch.id}:${k}`).toBe(true);
      }
    }
    expect(meterSets.size).toBe(Object.keys(ALL_SCRIPTS).length);
  });
});
