import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { activities, activityGains, activityOdds, activityOutcome, activityRoll, doActivity, type Result } from '@/lib/game/gameplay';

const base = (): Career => ({ ...createCareer({ ...defaultDraft, name: 'Outcome Player', party: 'Democrat' }), money: 100000, experience: 20, reputation: 10, relationships: 10, contacts: 0, position: 'committee', skills: { communication: 20, leadership: 20, knowledge: 0 } });
const success = (r: Result) => { if (!r.ok) throw new Error(r.message); return r.career; };
const reload = (c: Career) => { const n = parseCareer(JSON.stringify(c)); if (!n) throw new Error('Invalid save'); return n; };
const activity = (id: string) => { const a = activities.find(x => x.id === id); if (!a) throw new Error('Missing activity'); return a; };

describe('Activity outcome dynamics', () => {
  it('gives every activity success, mediocre and setback odds that sum to one', () => {
    const c = base();
    for (const a of activities) {
      const odds = activityOdds(c, a);
      expect(odds.success + odds.mediocre + odds.setback).toBeCloseTo(1, 10);
      expect(odds.success).toBeGreaterThan(0.5);
      expect(odds.mediocre).toBeGreaterThan(0);
    }
  });
  it('only lets costly, high-profile activities backfire', () => {
    const c = base();
    for (const a of activities) {
      const odds = activityOdds(c, a);
      if (a.cost >= 2500) expect(odds.setback).toBeGreaterThanOrEqual(0.03);
      else expect(odds.setback).toBe(0);
    }
  });
  it('rewards stronger stats, relationships and contacts with better odds', () => {
    const weak: Career = { ...base(), relationships: 0, contacts: 0, skills: { communication: 0, leadership: 0, knowledge: 0 } };
    const strong: Career = { ...base(), relationships: 60, contacts: 40, skills: { communication: 80, leadership: 80, knowledge: 80 } };
    const drive = activity('drive');
    const weakOdds = activityOdds(weak, drive);
    const strongOdds = activityOdds(strong, drive);
    expect(weakOdds.success).toBeCloseTo(0.65, 10);
    expect(weakOdds.setback).toBeCloseTo(0.1, 10);
    expect(strongOdds.success).toBe(0.9);
    expect(strongOdds.setback).toBe(0.03);
    expect(strongOdds.success).toBeGreaterThan(weakOdds.success);
    expect(strongOdds.setback).toBeLessThan(weakOdds.setback);
  });
  it('pays full expected gains on a success', () => {
    const c = base();
    const r = doActivity(c, 'network', undefined, 0.5);
    expect(r.ok).toBe(true);
    const n = success(r);
    expect(n.contacts).toBe(0.4);
    expect(n.relationships).toBe(10.4);
    expect(n.experience).toBe(20.3);
    expect(n.money).toBe(95000);
    expect(r.message).not.toContain('fell flat');
    expect(r.message).not.toContain('backfired');
  });
  it('consumes resources but delivers negligible impact on a mediocre result', () => {
    const c = base();
    const r = doActivity(c, 'network', undefined, 0.99);
    expect(r.ok).toBe(true);
    const n = success(r);
    expect(n.contacts).toBe(0.1);
    expect(n.relationships).toBe(10.1);
    expect(n.experience).toBe(20);
    expect(n.money).toBe(95000);
    expect(n.actions).toBe(c.actions - 15);
    expect(r.message).toContain('fell flat');
  });
  it('applies a minor reputational hit on a setback while still charging the cost', () => {
    const c = base();
    const r = doActivity(c, 'drive', undefined, 0.01);
    expect(r.ok).toBe(true);
    const n = success(r);
    expect(n.reputation).toBe(9);
    expect(n.experience).toBe(20);
    expect(n.contacts).toBe(0);
    expect(n.money).toBe(90000);
    expect(n.actions).toBe(c.actions - 20);
    expect(r.message).toContain('backfired');
    expect(r.message).toContain('minor controversy');
  });
  it('never lets cheap grassroots activities backfire, even on the worst roll', () => {
    const c = base();
    const r = doActivity(c, 'volunteer', undefined, 0.01);
    expect(r.ok).toBe(true);
    expect(r.message).not.toContain('backfired');
    expect(success(r).reputation).toBeGreaterThan(c.reputation);
  });
  it('scales mediocre gains down from the same diminishing-returns baseline', () => {
    const c = base();
    const a = activity('speech');
    const full = activityOutcome(c, a, 0.5);
    const flat = activityOutcome(c, a, 0.99);
    expect(full.tier).toBe('success');
    expect(flat.tier).toBe('mediocre');
    expect(full.gains).toEqual(activityGains(c, a));
    for (const [k, v = 0] of Object.entries(flat.gains)) expect(v).toBeLessThanOrEqual((full.gains[k as keyof typeof full.gains] ?? 0) * 0.25 + 1e-9);
  });
  it('seeds the roll from saved state so reloads and retried requests cannot reroll', () => {
    const c = base();
    const direct = doActivity(c, 'network');
    const afterReload = doActivity(reload(c), 'network');
    expect(direct.ok).toBe(true);
    expect(afterReload.ok).toBe(true);
    if (direct.ok && afterReload.ok) {
      expect(afterReload.message).toBe(direct.message);
      expect(afterReload.career).toEqual(direct.career);
    }
    // A rejected attempt consumes nothing: the next real attempt gets the same roll and outcome.
    const broke = { ...c, money: 0 };
    expect(doActivity(broke, 'network').ok).toBe(false);
    expect(activityRoll(broke, 'network')).toBe(activityRoll(c, 'network'));
    const retry = doActivity(c, 'network');
    if (direct.ok && retry.ok) expect(retry.message).toBe(direct.message);
  });
});
