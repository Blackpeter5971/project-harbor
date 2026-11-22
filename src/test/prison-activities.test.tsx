import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { writeFileSync } from 'node:fs';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { legalSchema, legalCaseSchema } from '@/lib/game/legal-schema';
import { advanceTurn, continueTurnReport, continueAfterNewspaper, doActivity, type Result } from '@/lib/game/gameplay';
import { doPrisonActivity, prisonCorrespondents, sendPrisonLetter, prisonManager, prisonBusinessFunding, appealEligibility } from '@/lib/game/prison-activities';
import { prisonOf, prisonTurn, isIncarcerated, remainingTurns } from '@/lib/game/prison';
import { ballotRestriction, convictionStatus } from '@/lib/game/conviction';
import { availableElections, launchCampaign } from '@/lib/game/campaign';
import { startBusiness, collectBusinesses, businessOperations, trustedManagers } from '@/lib/game/business';
import { contactFrom, archetypes, defaultSocial } from '@/lib/game/relationships';
import { CareerView } from '@/components/game/career-view';

afterEach(cleanup);
const ok = (r: Result): Career => { if (!r.ok) throw new Error(r.message); return r.career; };
const loaded = (c: Career): Career => { const n = parseCareer(JSON.stringify(c)); if (!n) throw new Error('Invalid save'); return n; };
function jailed(): Career {
  const base = createCareer({ ...defaultDraft, name: 'Ada Release' }, () => 0);
  const k = legalCaseSchema.parse({ id: 'phase7b', opened: '2025-01-01', stage: 'convicted', strength: 50, defense: 30, role: 'official', stageSince: '2026-01-01', closed: '2026-01-01', trial: { courtDate: '2026-01-01', tier: 'felony', verdict: { type: 'prison', date: '2026-01-01', sentence: 2, text: 'Convicted' } } });
  return { ...base, money: 100_000, health: 60, experience: 100, reputation: 60, skills: { communication: 25, leadership: 25, knowledge: 25 }, date: '2026-01-01',
    legal: legalSchema.parse({ cases: [k], adjudicated: '2026-01-01', lastTurn: '2026-01-01', prison: { caseId: k.id, since: '2026-01-01', quarters: 2, release: '2026-07-01', tier: 'Felony', lastTurn: '2026-01-01', prisonRep: 10 } }) };
}
const revision = (c: Career) => prisonOf(c)?.actionRevision ?? -1;
function settle(c: Career) { let n = continueTurnReport(c); if (n.newspaperPending) n = continueAfterNewspaper(n); return n; }
function withManager(c: Career) {
  const a = archetypes.find(p => p.id === 'executive');
  if (!a || !c.life) throw new Error('Missing executive/life');
  return { ...c, life: { ...c.life, social: { ...defaultSocial(), contacts: [contactFrom(a, { affinity: 80, status: 'close' })] } } };
}
describe('Phase 7B prison activities', () => {
  it('spends quarterly actions on exercise, study and respect across consecutive turns', () => {
    const c = jailed();
    const e = ok(doPrisonActivity(c, 'exercise', revision(c)));
    expect(e.actions).toBe(85); expect(e.health).toBe(66); expect(e.life?.energy).toBe(Math.min(100, (c.life?.energy ?? 0) + 8));
    const s = ok(doPrisonActivity(e, 'study', revision(e)));
    expect(s.actions).toBe(70); expect(s.skills.knowledge).toBe(27); expect(prisonOf(s)?.legalKnowledge).toBe(10);
    const r = ok(doPrisonActivity(s, 'respect', revision(s)));
    expect(r.actions).toBe(55); expect(prisonOf(r)?.prisonRep).toBe(20);
    expect(doPrisonActivity({ ...r, actions: 0 }, 'appeal', revision(r)).ok).toBe(false);
    const next = loaded(settle(advanceTurn(r).career));
    expect(next.actions).toBe(100); expect(next.date).toBe('2026-04-01');
    expect(ok(doPrisonActivity(next, 'study', revision(next))).skills.knowledge).toBe(29);
  });
  it('rejects stale requests, repeat quarterly actions and pending reports without spending anything', () => {
    const c = jailed(), n = loaded(ok(doPrisonActivity(c, 'study', revision(c))));
    expect(doPrisonActivity(n, 'study', revision(c)).ok).toBe(false);
    expect(doPrisonActivity(n, 'study', revision(n)).ok).toBe(false);
    expect(n.actions).toBe(85); expect(prisonOf(n)?.legalKnowledge).toBe(10);
    expect(doPrisonActivity(advanceTurn(n).career, 'exercise', revision(n)).ok).toBe(false);
    expect(doPrisonActivity({ ...n, legal: null }, 'exercise', 0).ok).toBe(false);
  });
  it('reduces yard danger through earned prison respect', () => {
    const c = jailed(), p = prisonOf(c);
    if (!p || !c.legal) throw new Error('No prison');
    let lowHarm = 0, highHarm = 0;
    for (let i = 2027; i < 2127; i++) {
      const end = `${i}-04-01`;
      lowHarm += c.health - prisonTurn({ ...c, legal: { ...c.legal, prison: { ...p, quarters: 999, prisonRep: 0 } } }, end).career.health;
      highHarm += c.health - prisonTurn({ ...c, legal: { ...c.legal, prison: { ...p, quarters: 999, prisonRep: 100 } } }, end).career.health;
    }
    expect(highHarm).toBeLessThan(lowHarm);
  });
  it('permits evidence-qualified deterministic appeals without changing the original verdict or taking money', () => {
    let c = jailed();
    const p = prisonOf(c); if (!c.legal || !p) throw new Error('No prison');
    c = { ...c, legal: { ...c.legal, prison: { ...p, quarters: 8, release: '2028-01-01', legalKnowledge: 100 } } };
    expect(appealEligibility(c).eligible).toBe(true);
    const n = ok(doPrisonActivity(c, 'appeal', revision(c)));
    expect(doPrisonActivity(c, 'appeal', revision(c))).toEqual(doPrisonActivity(loaded(c), 'appeal', revision(c)));
    expect(n.legal?.cases[0]?.trial?.verdict).toEqual(c.legal?.cases[0]?.trial?.verdict);
    expect(n.money).toBe(c.money); expect(n.actions).toBe(85);
    expect([7, 8]).toContain(prisonOf(n)?.quarters);
    expect(doPrisonActivity(loaded(n), 'appeal', revision(n)).ok).toBe(false);
  });
  it('denies appeals where evidence is too strong and does not shorten life or death sentences', () => {
    const c = jailed(), p = prisonOf(c); if (!c.legal || !p) throw new Error('No prison');
    const strong = { ...c, legal: { ...c.legal, cases: c.legal.cases.map(k => ({ ...k, strength: 95, defense: 0 })) } };
    expect(appealEligibility(strong).eligible).toBe(false);
    expect(doPrisonActivity(strong, 'appeal', 0).ok).toBe(false);
    for (const kind of ['life', 'death'] as const) {
      const n = { ...c, legal: { ...c.legal, prison: { ...p, [kind]: true, executionDate: '2027-01-01' } } };
      expect(appealEligibility(n).eligible).toBe(false);
      expect(remainingTurns(prisonOf(n) ?? p)).toBe(Infinity);
      expect(isIncarcerated(prisonTurn(n, '2026-04-01').career)).toBe(true);
    }
  });
  it('a successful appeal shortens release by exactly three months and cannot be replayed', () => {
    const base = jailed(), p = prisonOf(base); if (!base.legal || !p) throw new Error('No prison');
    let successful: { before: Career; after: Career } | null = null;
    for (let year = 2026; year < 2050 && !successful; year++) {
      const before = { ...base, date: `${year}-01-01`, legal: { ...base.legal, prison: { ...p, quarters: 8, release: '2028-01-01', legalKnowledge: 100 } } };
      const after = ok(doPrisonActivity(before, 'appeal', 0));
      if (prisonOf(after)?.quarters === 7) successful = { before, after };
    }
    if (!successful) throw new Error('No successful deterministic appeal in test cases');
    expect(prisonOf(successful.after)?.quarters).toBe(7);
    expect(prisonOf(successful.after)?.release).toBe('2027-10-01');
    expect(doPrisonActivity(loaded(successful.after), 'appeal', 0).ok).toBe(false);
    expect(successful.after.legal?.cases[0]?.trial?.verdict).toEqual(successful.before.legal?.cases[0]?.trial?.verdict);
  });
});
describe('Phase 7B outside operations', () => {
  it('does not invent correspondents or managers when there are none', () => {
    const c = jailed(); if (!c.life) throw new Error('No life');
    const n = { ...c, life: { ...c.life, social: defaultSocial() } };
    expect(prisonCorrespondents(n)).toEqual([]); expect(trustedManagers(n)).toEqual([]);
    expect(sendPrisonLetter(n, 'invented-ally', 0).ok).toBe(false);
    const b = ok(startBusiness(n, 'local-retail')).businesses[0]; if (!b) throw new Error('No business');
    expect(prisonManager({ ...n, businesses: [b] }, b.id, 'invented-manager', 0).ok).toBe(false);
  });
  it('limits letters to one existing-circle contact each quarter and keeps relationships intact', () => {
    const c = jailed(), person = prisonCorrespondents(c)[0]; if (!person) throw new Error('No person');
    const n = ok(sendPrisonLetter(c, person.id, 0));
    expect(n.actions).toBe(85); expect(n.contacts).toBe(c.contacts);
    expect(prisonCorrespondents(n).map(p => p.id)).toEqual(prisonCorrespondents(c).map(p => p.id));
    expect(prisonCorrespondents(n)[0]?.affinity).toBe(person.affinity + 3);
    expect(sendPrisonLetter(loaded(n), person.id, revision(n)).ok).toBe(false);
    const next = settle(advanceTurn(n).career);
    expect(sendPrisonLetter(next, person.id, revision(next)).ok).toBe(true);
  });
  it('removes custody penalties with a GM while keeping empty-catalog overhead and balances isolated', () => {
    const c = ok(startBusiness(withManager(jailed()), 'local-retail')), b = c.businesses[0], person = trustedManagers(c)[0];
    if (!b || !person) throw new Error('No business/manager');
    expect(businessOperations(c, b).efficiency).toBe(0.5);
    const managed = ok(prisonManager(c, b.id, person.id, 0));
    expect(managed.actions).toBe(85); expect(businessOperations(managed, managed.businesses[0] ?? b).efficiency).toBeCloseTo(1.102);
    expect(businessOperations(managed, { ...b, managerId: person.id, account: 0 }).efficiency).toBeCloseTo(1.102);
    const n = collectBusinesses(c, c.date).career;
    expect(n.businesses[0]?.lastRevenue).toBe(0); expect(n.businesses[0]?.lastExpenses).toBe(7000);
    expect(n.businesses[0]?.reputation).toBe(17);
    expect(n.money).toBe(c.money); expect(n.warChest).toBe(c.warChest); expect(n.treasury).toEqual(c.treasury); expect(n.ledger).toEqual(c.ledger);
    expect(collectBusinesses(loaded(n), c.date).career.businesses).toEqual(n.businesses);
    const funded = ok(prisonBusinessFunding(c, b.id, 1000, 0));
    expect(funded.money).toBe(c.money - 1000); expect(funded.businesses[0]?.account).toBe(b.account + 1000); expect(funded.actions).toBe(85);
    expect(prisonBusinessFunding(funded, b.id, Infinity, revision(funded)).ok).toBe(false);
  });
});
describe('Phase 7B sentence completion', () => {
  it('releases at zero, restores activities and preserves remaining cash, assets, character and history across reloads', () => {
    const c = ok(startBusiness(jailed(), 'local-retail'));
    const first = loaded(settle(advanceTurn(c).career));
    expect(remainingTurns(prisonOf(first) ?? (() => { throw new Error('No prison'); })())).toBe(1);
    const final = advanceTurn(first).career;
    expect(final.legal?.prison).toBeNull(); expect(final.date).toBe('2026-07-01');
    expect(advanceTurn(final).career).toEqual(final);
    const n = loaded(settle(final));
    expect(isIncarcerated(n)).toBe(false); expect(n.legal?.served).toHaveLength(1);
    expect(n.character).toEqual(c.character); expect(n.money).toBe(c.money); expect(n.housing).toEqual(c.housing);
    expect(n.life?.vehicles).toEqual(c.life?.vehicles); expect(n.life?.possessions).toEqual(c.life?.possessions);
    expect(n.life?.social?.contacts).toEqual(final.life?.social?.contacts);
    expect(n.life?.social?.contacts.map(p => p.id)).toEqual(c.life?.social?.contacts.map(p => p.id));
    expect(n.termHistory).toEqual(c.termHistory); expect(n.elections).toEqual(c.elections);
    expect(n.workMonths).toBe(c.workMonths); expect(n.businesses[0]?.id).toBe(c.businesses[0]?.id); expect(n.legal?.cases).toEqual(c.legal?.cases);
    expect(ok(doActivity(n, 'study', n.politicalActivityRevision, 0.5)).skills.knowledge).toBeGreaterThan(n.skills.knowledge);
    const subsequent = advanceTurn(n).career;
    expect(subsequent.date).toBe('2026-10-01'); expect(subsequent.legal?.served).toHaveLength(1);
    expect(convictionStatus(n)?.restricted).toBe(true); expect(availableElections(n)).toEqual([]);
    expect(launchCampaign(n, 'council', 'Return', 'grassroots').ok).toBe(false);
    const rehabilitated = loaded({ ...n, date: '2027-07-01' });
    expect(ballotRestriction(rehabilitated)).toBeNull(); expect(convictionStatus(rehabilitated)?.felony).toBe(true);
    expect(availableElections(rehabilitated).some(e => e.office.id === 'council')).toBe(true);
    expect(launchCampaign(rehabilitated, 'council', 'Return', 'grassroots').ok).toBe(true);
  });
  it('restores all civilian screens when custody ends, while government still requires a new office', () => {
    const c = jailed(), released = loaded(settle(advanceTurn(settle(advanceTurn(c).career)).career));
    const noop = () => {};
    const props = { setSection: noop, onMenu: noop, onSave: noop, onSettings: noop, saved: true, onUpdate: noop, onPoliticalActivity: noop, onNotice: noop, onAdvance: noop };
    const { rerender } = render(<CareerView {...props} career={c} section="Politics" />);
    expect(screen.getByText(/You are incarcerated/)).toBeTruthy();
    for (const section of ['Politics', 'Government', 'Life', 'Career & Business', 'More'] as const) {
      rerender(<CareerView {...props} career={released} section={section} />);
      expect(screen.queryByText(/You are incarcerated/)).toBeNull();
    }
    rerender(<CareerView {...props} career={released} section="Media" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open S' }));
    expect(screen.getByRole('navigation', { name: 'S navigation' })).toBeTruthy();
  });
  it('loads old prison saves without new fields and retains post-conviction flags beyond capped case history', () => {
    const c = jailed(), raw = JSON.parse(JSON.stringify(c));
    delete raw.legal.prison.legalKnowledge; delete raw.legal.prison.actionRevision; delete raw.legal.prison.activityTurn; delete raw.legal.prison.activityUses;
    const n = parseCareer(JSON.stringify(raw)); if (!n) throw new Error('Legacy save rejected');
    expect(prisonOf(n)?.actionRevision).toBe(0); expect(prisonOf(n)?.legalKnowledge).toBe(0);
    const released = settle(advanceTurn(settle(advanceTurn(n).career)).career);
    if (!released.legal) throw new Error('Missing record');
    const trimmed = loaded({ ...released, legal: { ...released.legal, cases: [] } });
    expect(convictionStatus(trimmed)?.restricted).toBe(true);
    if (!trimmed.legal) throw new Error('Missing legal data');
    const pardoned = loaded({ ...trimmed, legal: { ...trimmed.legal, served: trimmed.legal.served.map(s => ({ ...s, pardoned: true })) } });
    expect(ballotRestriction(pardoned)).toBeNull(); expect(convictionStatus(pardoned)?.felony).toBe(true);
  });
});

// Optional real-save fixture for the local preview check, never seeded into the game itself.
if (process.env['EXPORT_PRISON_FIXTURE'] === '1') {
  const c = ok(startBusiness(withManager(jailed()), 'local-retail'));
  writeFileSync('/tmp/browser/prison-7b-save.json', JSON.stringify(c));
}