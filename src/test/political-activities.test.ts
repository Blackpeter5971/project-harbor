import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { activities, activityEnergy, advanceTurn, continueAfterNewspaper, continueTurnReport, doActivity, resolveEvent, type Result } from '@/lib/game/gameplay';
import { launchCampaign } from '@/lib/game/campaign';

const base = (): Career => ({ ...createCareer({ ...defaultDraft, name: 'Activity Player', party: 'Democrat' }), money: 50000, experience: 100, reputation: 40, relationships: 30, position: 'committee', skills: { communication: 30, knowledge: 30, leadership: 30 } });
const success = (r: Result) => { if (!r.ok) throw new Error(r.message); return r.career; };
const reload = (c: Career) => { const next = parseCareer(JSON.stringify(c)); if (!next) throw new Error('Save rejected'); return next; };

describe('Political activity transaction rules', () => {
  it('has exactly one free grassroots activity and all other prices between $500 and $10,000', () => {
    expect(activities.filter(a => a.cost === 0).map(a => a.id)).toEqual(['initiative']);
    for (const a of activities.filter(a => a.id !== 'initiative')) {
      expect(a.cost).toBeGreaterThanOrEqual(500);
      expect(a.cost).toBeLessThanOrEqual(10000);
    }
    expect(activities.find(a => a.id === 'drive')?.cost).toBe(10000);
  });
  it('saves one free use, rejects replay without effects and leaves money and ledger unchanged', () => {
    const c = base();
    const used = reload(success(doActivity(c, 'initiative')));
    expect(used.freePoliticalActivityUsed).toBe(true);
    expect(used.actions).toBe(90);
    expect(used.money).toBe(c.money);
    expect(used.ledger).toEqual(c.ledger);
    const snapshot = JSON.stringify(used);
    expect(doActivity(used, 'initiative')).toMatchObject({ ok: false, message: expect.stringContaining('already been used') });
    expect(JSON.stringify(used)).toBe(snapshot);
  });
  it('resets the free limit only when advancing three months, not while continuing a report', () => {
    const used = success(doActivity(base(), 'initiative'));
    const blocked = { ...used, report: { period: 'Jan – Mar 2026', lines: [] } };
    expect(advanceTurn(blocked).career.freePoliticalActivityUsed).toBe(true);
    expect(continueTurnReport(blocked).freePoliticalActivityUsed).toBe(true);
    let next = advanceTurn(used).career;
    expect(next.date).toBe('2026-04-01');
    expect(next.actions).toBe(100);
    expect(next.freePoliticalActivityUsed).toBe(false);
    next = continueAfterNewspaper(continueTurnReport(next));
    if (next.eventEncounter) next = success(resolveEvent(next, next.eventEncounter.choices[0]?.id ?? ''));
    expect(success(doActivity(reload(next), 'initiative')).freePoliticalActivityUsed).toBe(true);
  });
  it('rejects every unaffordable paid activity without spending actions or applying gains', () => {
    for (const a of activities.filter(a => a.cost > 0)) {
      const c = { ...base(), money: a.cost - 1 };
      const snapshot = JSON.stringify(c);
      expect(doActivity(c, a.id)).toMatchObject({ ok: false, message: expect.stringContaining('personal funds') });
      expect(JSON.stringify(c)).toBe(snapshot);
    }
  });
  it('deducts each paid price exactly once with an exact balance boundary', () => {
    for (const a of activities.filter(a => a.cost > 0)) {
      const c = { ...base(), money: a.cost };
      const next = success(doActivity(c, a.id));
      expect(next.money).toBe(0);
      expect(next.actions).toBe(c.actions - activityEnergy(a.id));
      expect(next.ledger).toEqual([{ month: c.date, label: a.name, amount: -a.cost }]);
      const snapshot = JSON.stringify(next);
      expect(doActivity(next, a.id).ok).toBe(false);
      expect(JSON.stringify(next)).toBe(snapshot);
    }
  });
  it('rejects duplicate request revisions after saving, while permitting a new deliberate paid request', () => {
    const c = base();
    const once = reload(success(doActivity(c, 'study', c.politicalActivityRevision)));
    const snapshot = JSON.stringify(once);
    expect(doActivity(once, 'study', c.politicalActivityRevision).ok).toBe(false);
    expect(JSON.stringify(once)).toBe(snapshot);
    const twice = success(doActivity(once, 'study', once.politicalActivityRevision));
    expect(twice.money).toBe(c.money - 1000);
    expect(twice.actions).toBe(80);
    expect(twice.ledger).toHaveLength(2);
  });
  it('does not spend campaign cash for personal activities', () => {
    const launched = success(launchCampaign({ ...base(), date: '2027-07-01' }, 'council', 'Local voice', 'grassroots'));
    const c = { ...launched, money: 500 };
    const next = success(doActivity(c, 'study'));
    expect(next.money).toBe(0);
    expect(next.campaign).toEqual(c.campaign);
    expect(doActivity({ ...c, money: 0 }, 'study').ok).toBe(false);
  });
  it('adds defaults to older saves without dropping existing records or balances', () => {
    const c = base();
    const { freePoliticalActivityUsed: _free, politicalActivityRevision: _revision, ...old } = c;
    const parsed = parseCareer(JSON.stringify(old));
    expect(parsed).toEqual(c);
    expect(parsed?.freePoliticalActivityUsed).toBe(false);
    expect(parsed?.politicalActivityRevision).toBe(0);
  });
  it('lets a legacy save missing every activity field play immediately and keeps its records intact', () => {
    const c = base();
    const { freePoliticalActivityUsed: _free, politicalActivityRevision: _revision, politicalActivityUses: _uses, ...legacy } = c;
    const parsed = parseCareer(JSON.stringify(legacy));
    if (!parsed) throw new Error('Legacy save rejected');
    expect(parsed.politicalActivityUses).toEqual({});
    const afterFree = success(doActivity(parsed, 'initiative', undefined, 0.5));
    expect(afterFree.freePoliticalActivityUsed).toBe(true);
    expect(afterFree.money).toBe(parsed.money);
    expect(doActivity(afterFree, 'initiative').ok).toBe(false);
    const afterPaid = success(doActivity(afterFree, 'study', undefined, 0.5));
    expect(afterPaid.money).toBe(parsed.money - 500);
    expect(afterPaid.ledger).toHaveLength(parsed.ledger.length + 1);
    expect(afterPaid.eventHistory).toEqual(parsed.eventHistory);
    expect(afterPaid.log.length).toBeGreaterThan(0);
  });
});