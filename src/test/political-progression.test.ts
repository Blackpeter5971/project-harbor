import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { activities, activityGains, advanceTurn, changeParty, continueAfterNewspaper, continueTurnReport, doActivity, resolveEvent, type Result } from '@/lib/game/gameplay';

const base = (): Career => ({ ...createCareer({ ...defaultDraft, name: 'Progress Player', party: 'Democrat' }), money: 100000, experience: 20, reputation: 10, relationships: 10, contacts: 0, position: 'committee', skills: { communication: 20, leadership: 20, knowledge: 0 } });
const success = (r: Result) => { if (!r.ok) throw new Error(r.message); return r.career; };
const reload = (c: Career) => { const n = parseCareer(JSON.stringify(c)); if (!n) throw new Error('Invalid save'); return n; };

describe('Political progression scaling', () => {
  it('keeps local connections small and county-wide gains moderate, independent of existing communication', () => {
    const c = base();
    const network = success(doActivity(c, 'network', undefined, 0.5));
    expect(network.contacts).toBe(0.4);
    expect(network.relationships).toBe(10.4);
    const county = success(doActivity(c, 'drive', undefined, 0.5));
    expect(county.contacts).toBe(0.6);
    expect(county.reputation).toBe(11.2);
    expect(county.experience).toBe(21.2);
    expect(success(doActivity(c, 'community', undefined, 0.5)).reputation).toBe(10.4);
    for (const a of activities) {
      for (const gain of Object.values(a.gains)) expect(gain).toBeLessThanOrEqual(1.2);
    }
  });
  it('diminishes reputation, relationships, contacts, experience and skills on repeated uses', () => {
    const c = base();
    const deltas: number[] = [];
    let n = c;
    for (let i = 0; i < 5; i++) {
      const next = reload(success(doActivity(n, 'network', undefined, 0.5)));
      deltas.push(Math.round((next.contacts - n.contacts) * 10) / 10);
      n = next;
    }
    expect(deltas).toEqual([0.4, 0.2, 0.1, 0.1, 0]);
    expect(n.relationships).toBe(10.8);
    expect(n.experience).toBe(20.5);
    expect(n.politicalActivityUses).toEqual({ network: 5 });
    expect(n.money).toBe(75000);
    expect(n.actions).toBe(25);
    let speech = c;
    const rep: number[] = [];
    for (let i = 0; i < 3; i++) {
      const next = success(doActivity(speech, 'speech', undefined, 0.5));
      rep.push(Math.round((next.reputation - speech.reputation) * 10) / 10);
      speech = next;
    }
    expect(rep).toEqual([0.8, 0.4, 0.2]);
    expect(speech.skills.communication).toBe(21.1);
  });
  it('uses the same projected rewards for execution and does not let different activities erase repetition', () => {
    const once = success(doActivity(base(), 'network', undefined, 0.5));
    const varied = success(doActivity(once, 'meeting', undefined, 0.5));
    const a = activities.find(a => a.id === 'network');
    if (!a) throw new Error('Missing activity');
    expect(activityGains(varied, a)).toEqual({ contacts: 0.2, relationships: 0.2, experience: 0.1 });
    const next = success(doActivity(varied, 'network', undefined, 0.5));
    expect(next.contacts).toBe(0.6);
    expect(next.politicalActivityUses).toEqual({ network: 2, meeting: 1 });
  });
  it('shares volunteer repetition across party changes', () => {
    const once = success(doActivity(base(), 'volunteer', undefined, 0.5));
    const independent = success(changeParty(once, 'Independent'));
    const next = success(doActivity(independent, 'campaign', undefined, 0.5));
    expect(next.politicalActivityUses).toEqual({ volunteer: 2 });
    expect(next.experience).toBe(20.9);
    expect(next.skills.communication).toBe(20.4);
  });
  it('never increments frequency for rejected or replayed requests', () => {
    const c = success(doActivity(base(), 'network', undefined, 0.5));
    const attempts = [
      { ...c, money: 0 }, { ...c, actions: 0 }, { ...c, experience: 0 },
      { ...c, report: { period: 'Jan – Mar 2026', lines: [] } },
    ];
    for (const attempt of attempts) {
      const snapshot = JSON.stringify(attempt);
      expect(doActivity(attempt, 'network').ok).toBe(false);
      expect(JSON.stringify(attempt)).toBe(snapshot);
    }
    const snapshot = JSON.stringify(c);
    expect(doActivity(c, 'network', 0).ok).toBe(false);
    expect(JSON.stringify(c)).toBe(snapshot);
  });
  it('preserves counts through reload and continuation but clears them only on three-month advancement', () => {
    const used = reload(success(doActivity(base(), 'network', undefined, 0.5)));
    const blocked = { ...used, report: { period: 'Jan – Mar 2026', lines: [] } };
    expect(advanceTurn(blocked).career.politicalActivityUses).toEqual({ network: 1 });
    expect(continueTurnReport(blocked).politicalActivityUses).toEqual({ network: 1 });
    let next = advanceTurn(used).career;
    expect(next.date).toBe('2026-04-01');
    expect(next.politicalActivityUses).toEqual({});
    next = continueAfterNewspaper(continueTurnReport(next));
    if (next.eventEncounter) next = success(resolveEvent(next, next.eventEncounter.choices[0]?.id ?? ''));
    const again = success(doActivity(reload(next), 'network', undefined, 0.5));
    expect(Math.round((again.contacts - next.contacts) * 10) / 10).toBe(0.4);
  });
  it('upgrades older saves without rewriting earned stats, money or records', () => {
    const c = base();
    const { politicalActivityUses: _uses, ...old } = c;
    expect(parseCareer(JSON.stringify(old))).toEqual(c);
    expect(reload(success(doActivity(c, 'network', undefined, 0.5))).politicalActivityUses).toEqual({ network: 1 });
  });
});