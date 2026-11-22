import { describe, it, expect } from 'vitest';
import { scenarioById } from '@/lib/game/story-mode';
import { sceneScriptFor, startSession, evaluateStageEnding } from '@/lib/game/story-engine';
import { civilWarFaction } from '@/lib/game/civil-war/civil-war-script';

describe('civil war campaign', () => {
  it('is registered as a free, active, hard scenario', () => {
    const s = scenarioById('civil-war-alternate-destiny');
    expect(s?.free).toBe(true); expect(s?.status).toBe('active'); expect(s?.difficulty).toBe('Hard');
  });
  it('starts at the faction choice and each side picks its own ending', () => {
    const script = sceneScriptFor('civil-war-alternate-destiny')!;
    expect(startSession(script).sceneId).toBe('cw_choose');
    expect(civilWarFaction(['faction-union'])).toBe('union');
    expect(evaluateStageEnding(script, { meters: {}, flags: ['faction-union'] })?.id).toBe('cw-union-long-war');
    expect(evaluateStageEnding(script, { meters: {}, flags: ['faction-confederacy'] })?.id).toBe('cw-south-defeat');
  });
});

import { nationalLedger, ledgerStanding } from '@/lib/game/civil-war/national-ledger';
describe('national ledger', () => {
  it('rates standing by thresholds', () => {
    expect([ledgerStanding(70), ledgerStanding(45), ledgerStanding(25), ledgerStanding(24)]).toEqual(['Strong', 'Steady', 'Weak', 'Critical']);
  });
  it('sums changes from decisions and names the government', () => {
    const l = nationalLedger({ meters: { borderLoyalty: 65 }, flags: ['faction-union'], history: [{ label: 'a', deltas: { borderLoyalty: 5 } }, { label: 'b', deltas: { borderLoyalty: 10 } }] });
    expect(l.government).toBe('United States Government');
    expect(l.rows.find(r => r.id === 'borderLoyalty')?.change).toBe(15);
  });
});

import { warMap, borderLean, MAP_STATES } from '@/lib/game/civil-war/war-map';
describe('war map', () => {
  it('has no overlapping tiles', () => {
    expect(new Set(MAP_STATES.map(s => `${s.col},${s.row}`)).size).toBe(MAP_STATES.length);
  });
  it('secedes South Carolina first, then the seven Deep South states', () => {
    expect(warMap({ meters: {}, visited: ['cw_choose'] }).counts.confederate).toBe(0);
    expect(warMap({ meters: {}, visited: ['cw_u_2'] }).counts.confederate).toBe(1);
    expect(warMap({ meters: {}, visited: ['cw_end'] }).counts.confederate).toBe(7);
  });
  it('border states lean with loyalty', () => {
    expect([borderLean(60), borderLean(50), borderLean(35)]).toEqual(['union', 'contested', 'confederate']);
  });
});

describe('civil war secession winter (1B)', () => {
  const script = sceneScriptFor('civil-war-alternate-destiny')!;
  const byId = new Map(script.scenes.map((s) => [s.id, s]));
  const path = (start: string) => {
    const seen: string[] = []; let id: string | undefined = start;
    while (id && !seen.includes(id)) { seen.push(id); const s: (typeof script.scenes)[number] = byId.get(id)!; id = s.choices?.[0]?.nextSceneId ?? s.nextSceneId; }
    return seen;
  };
  it('Union path reaches Fort Sumter before the chapter ends', () => {
    expect(path('cw_u_1')).toEqual(['cw_u_1', 'cw_u_2', 'cw_u_3', 'cw_u_4', 'cw_u_5', 'cw_u_6', 'cw_u_7', 'cw_u_8', 'cw_u_9', 'cw_u_10', 'cw_end']);
  });
  it('Southern path reaches the first shot before the chapter ends', () => {
    expect(path('cw_c_1')).toEqual(['cw_c_1', 'cw_c_2', 'cw_c_3', 'cw_c_4', 'cw_c_5', 'cw_c_6', 'cw_c_7', 'cw_c_8', 'cw_c_9', 'cw_end']);
  });
});

import { warRoom } from '@/lib/game/civil-war/war-room';
describe('civil war room (4)', () => {
  it('starts quiet with no general', () => { const w = warRoom([]); expect(w.general).toBe('Not yet appointed'); expect(w.theaters.map(t => t.status)).toEqual(['Quiet', 'Quiet']); });
  it('reflects a Bull Run defeat and a Western advance', () => {
    const w = warRoom(['gen-mcdowell', 'east-defeat', 'west-advance', 'blockade-full']);
    expect(w.general).toBe('Irvin McDowell'); expect(w.theaters.map(t => t.status)).toEqual(['Retreating', 'Advancing']); expect(w.navy).toEqual(['Full blockade of Southern ports']);
  });
});

describe('civil war endings (5)', () => {
  const script = sceneScriptFor('civil-war-alternate-destiny')!;
  const end = (flags: string[], meters: Record<string, number>) => evaluateStageEnding(script, { meters, flags })?.id;
  it('Union victory needs high enthusiasm and border loyalty plus a West or sea campaign', () => {
    expect(end(['faction-union', 'blockade-full'], { warEnthusiasm: 55, borderLoyalty: 50 })).toBe('cw-union-victory');
    expect(end(['faction-union'], { warEnthusiasm: 55, borderLoyalty: 50 })).toBe('cw-union-long-war');
  });
  it('Union armistice when enthusiasm falls below 35', () => { expect(end(['faction-union'], { warEnthusiasm: 34 })).toBe('cw-union-armistice'); });
  it('Southern independence needs Manassas plus European Favor 45 and enthusiasm 50', () => {
    expect(end(['faction-confederacy', 'east-victory'], { europeanFavor: 45, warEnthusiasm: 50 })).toBe('cw-south-independence');
    expect(end(['faction-confederacy', 'east-victory'], { europeanFavor: 45, warEnthusiasm: 49 })).toBe('cw-south-armistice');
  });
});
