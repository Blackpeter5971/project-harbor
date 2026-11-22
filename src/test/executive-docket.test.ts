import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { advanceTurn } from '@/lib/game/gameplay';
import { ensureExecutiveDocket, docketBlocker, docketChoices, resolveDocket, type DocketRequest } from '@/lib/game/executive-docket';
import { legislativePool, legislativeIssue } from '@/lib/game/legislation';
import { incumbencyFatigue } from '@/lib/game/approval';
import { projectCatalog } from '@/lib/game/public-projects';
import { executiveDocketSchema } from '@/lib/game/docket-schema';
import { tenureKey } from '@/lib/game/support';
import { ensureTreasury } from '@/lib/game/budget';
import { stateGovernment } from '@/lib/game/state-government';

export const executive = (id = 'governor', date = '2028-04-01'): Career => ensureExecutiveDocket({
  ...createCareer({ ...defaultDraft, name: 'Alex Morgan', party: 'Democrat' }), date, publicOffice: true, experience: 100, reputation: 80, relationships: 80,
  skills: { communication: 80, leadership: 80, knowledge: 80 },
  office: { id, title: id, jurisdiction: 'California', since: '2028-01-01', party: 'Democrat', elected: '2027-11-01', termEnd: '2032-01-01', margin: 8 },
});
const request = (c: Career, slot: DocketRequest['slot'], choice: string): DocketRequest => {
  const d = c.executiveDocket;
  if (!d) throw new Error('Missing docket');
  return { docketId: d.id, revision: d.revision, slot, choice };
};
const decide = (c: Career, slot: DocketRequest['slot'], choice: string): Career => {
  const result = resolveDocket(c, request(c, slot, choice));
  if (!result.ok) throw new Error(result.message);
  return result.career;
};

describe('Executive docket', () => {
  it.each(['mayor', 'governor', 'president'])('generates exactly three quarterly slots for %s', id => {
    const c = executive(id);
    expect(c.executiveDocket?.items.map(i => i.slot)).toEqual(['legislature', 'policy', 'routine']);
    expect(executiveDocketSchema.safeParse({ ...c.executiveDocket, items: [] }).success).toBe(false);
    const d = c.executiveDocket;
    if (!d) throw new Error('Missing docket');
    expect(executiveDocketSchema.safeParse({ ...d, items: [d.items[0], d.items[0], d.items[0]] }).success).toBe(false);
    expect(ensureExecutiveDocket(c)).toEqual(c);
  });
  it('blocks actual advanceTurn without income, date or settlement changes', () => {
    const c = executive();
    expect(docketBlocker(c)).toBeTruthy();
    expect(advanceTurn(c).career).toBe(c);
    const one = decide(c, 'legislature', 'return');
    const two = decide(one, 'policy', 'decline');
    expect(advanceTurn(two).career).toBe(two);
    const complete = decide(two, 'routine', 'meet');
    expect(docketBlocker(complete)).toBeNull();
    const next = advanceTurn(complete).career;
    expect(next.date).toBe('2028-07-01');
    expect(next.executiveDocket?.quarter).toBe('2028-Q3');
    expect(next.executiveDocket?.items.filter(i => !i.resolved)).toHaveLength(3);
  });
  it('legislative pool has at least 22 distinct issues, each a dilemma with winners and losers', () => {
    expect(legislativePool.length).toBeGreaterThanOrEqual(22);
    expect(new Set(legislativePool.map(i => i.title)).size).toBe(legislativePool.length);
    for (const i of legislativePool) for (const e of [i.sign, i.veto]) {
      const values = Object.values(e.groups);
      expect(values.some(v => (v ?? 0) > 0)).toBe(true);
      expect(values.some(v => (v ?? 0) < 0)).toBe(true);
    }
  });
  it('rotates a different pool issue each quarter instead of a repeating measure', () => {
    const titles = ['2028-04-01', '2028-07-01', '2028-10-01', '2029-04-01'].map(date => executive('governor', date).executiveDocket?.items[0]);
    expect(titles.every(t => legislativePool.some(i => i.id === t?.issue))).toBe(true);
    expect(new Set(titles.map(t => t?.issue)).size).toBe(4);
  });
  it('offers exactly Sign into Law, Veto and Return to Legislature, creating no bill records', () => {
    const c = executive();
    const item = c.executiveDocket!.items[0];
    expect(docketChoices(c, item).map(x => x.label)).toEqual(['Sign into Law', 'Veto', 'Return to Legislature']);
    expect(c.bills).toHaveLength(0);
    for (const choice of ['sign', 'veto', 'return']) expect(decide(c, 'legislature', choice).bills).toHaveLength(0);
  });
  it.each(['sign', 'veto'] as const)('%s applies the issue bloc effects once', choice => {
    const c = executive(), issue = legislativeIssue(c.executiveDocket!.items[0].issue)!;
    const input = request(c, 'legislature', choice);
    const result = resolveDocket(c, input);
    if (!result.ok) throw new Error(result.message);
    const before = c.approval?.groups ?? {}, after = result.career.approval!.groups;
    for (const [g, d] of Object.entries(issue[choice].groups)) expect(Math.sign((after[g] ?? 0) - (before[g] ?? after[g] ?? 0) || d!)).toBe(Math.sign(d!));
    expect(resolveDocket(result.career, input).ok).toBe(false);
  });
  it('a returned bill reappears two quarters later with revised text', () => {
    let c = executive();
    const issue = c.executiveDocket!.items[0].issue;
    c = decide(decide(decide(c, 'legislature', 'return'), 'policy', 'decline'), 'routine', 'defer');
    expect(c.executiveDocket?.returned).toEqual([{ issue, rev: 1, due: '2028-Q4' }]);
    c = { ...advanceTurn(c).career, report: null, newspaperPending: false, pendingEvent: null, eventEncounter: null, debate: null };
    expect(c.executiveDocket?.items[0].issue).not.toBe(issue);
    c = decide(decide(decide(c, 'legislature', 'sign'), 'policy', 'decline'), 'routine', 'defer');
    c = { ...advanceTurn(c).career, report: null, newspaperPending: false, pendingEvent: null, eventEncounter: null, debate: null };
    const back = c.executiveDocket!.items[0];
    expect(back.issue).toBe(issue);
    expect(back.rev).toBe(1);
    expect(back.title).toBe(`${legislativeIssue(issue)!.revised} (Revision 1)`);
    expect(c.executiveDocket?.returned).toEqual([]);
  });
  it('incumbency fatigue lowers approval by 2 to 4 points per quarter', () => {
    const c = executive();
    for (const start of ['2028-04-01', '2028-07-01', '2029-01-01']) {
      const f = incumbencyFatigue(c, start);
      expect(f).toBeGreaterThanOrEqual(2);
      expect(f).toBeLessThanOrEqual(4);
    }
  });
  it('inauguration has an agenda and cabinet appointments with confirmation retained', () => {
    const c = executive('president', '2028-01-01');
    expect(c.executiveDocket?.inauguration).toBe(true);
    expect(c.executiveDocket?.items.map(i => i.kind)).toEqual(['agenda', 'appointments', 'routine']);
    const agenda = decide(c, 'legislature', 'business');
    const next = decide(agenda, 'policy', 'fund');
    expect(next.federalGovernment?.nominations[0]?.status).toBe('nominated');
    expect(next.bills).toHaveLength(0);
    expect(next.money).toBe(c.money);
  });
  it('legacy saves preserve office progress, ledgers and existing measures', () => {
    const c = executive();
    const raw = { ...c, executiveDocket: undefined, actions: 0 };
    const loaded = parseCareer(JSON.stringify(raw));
    expect(loaded?.executiveDocket?.items).toHaveLength(3);
    expect(loaded?.office).toEqual(c.office);
    expect(loaded?.money).toBe(c.money);
    expect(loaded?.ledger).toEqual(c.ledger);
    if (!loaded) throw new Error('Legacy parse failed');
    const done = decide(decide(decide(loaded, 'legislature', 'return'), 'policy', 'decline'), 'routine', 'defer');
    expect(done.actions).toBe(0);
    expect(docketBlocker(done)).toBeNull();
  });
  it('clean award reserves through existing projects and respects the treasury', () => {
    const c = ensureTreasury(executive('governor', '2028-07-01'));
    const funded = decide(c, 'policy', 'clean');
    expect(funded.stateGovernment?.publicProjects).toHaveLength(1);
    expect(funded.money).toBe(c.money);
    expect(funded.corruption?.exposure ?? 0).toBe(0);
    const poor = { ...c, treasury: { ...c.treasury, tenure: tenureKey(c), balance: 0, lastProcessedEnd: c.date, transactions: [] } };
    expect(resolveDocket(poor, request(poor, 'policy', 'clean')).ok).toBe(false);
  });
  it('steering pays a 5% kickback and adds 15 suspicion', () => {
    const c = ensureTreasury(executive('governor', '2028-07-01'));
    const cost = projectCatalog(c).find(p => p.catalogId === c.executiveDocket!.items[1].reference)!.totalCost;
    const next = decide(c, 'policy', 'steer');
    expect(next.stateGovernment?.publicProjects).toHaveLength(1);
    expect(next.money).toBe(c.money + Math.round(cost * 0.05));
    expect(next.corruption?.exposure).toBe(15);
  });
  it('siphoning moves 20% of project funds to the bank, adds 40 suspicion and opens a criminal case', () => {
    const c = ensureTreasury(executive('governor', '2028-07-01'));
    const cost = projectCatalog(c).find(p => p.catalogId === c.executiveDocket!.items[1].reference)!.totalCost;
    const next = decide(c, 'policy', 'siphon');
    expect(next.money).toBe(c.money + Math.round(cost * 0.2));
    expect(next.corruption?.exposure).toBe(40);
    expect(next.scandals.some(s => s.severity === 'Severe' && s.trigger === 'corruption')).toBe(true);
    expect(next.legal?.cases[0]?.stage).toBe('formal');
  });
  it('appointment costs debit only public treasury, once', () => {
    const c = ensureTreasury(executive('governor', '2028-01-01'));
    const result = decide(c, 'policy', 'fund');
    expect(result.stateGovernment?.officials).toHaveLength(1);
    expect(result.treasury?.balance).toBeLessThan(c.treasury?.balance ?? 0);
    expect(result.money).toBe(c.money);
    expect(resolveDocket(result, request(result, 'policy', 'fund')).ok).toBe(false);
  });
  it('leadership strengthens coalition deterministically without passing legislation', () => {
    const c = executive();
    const input = request(c, 'routine', 'meet');
    expect(resolveDocket(c, input)).toEqual(resolveDocket(c, input));
    const next = decide(c, 'routine', 'meet');
    expect(stateGovernment(next).coalition).toBe(stateGovernment(c).coalition + 4);
    expect(next.relationships).toBe(c.relationships + 2);
    expect(next.actions).toBe(c.actions - 15);
    expect(next.bills).toEqual(c.bills);
  });
  it('rejects stale requests and requests from another tenure or quarter', () => {
    const c = executive();
    const input = request(c, 'routine', 'meet');
    expect(resolveDocket(decide(c, 'policy', 'decline'), input).ok).toBe(false);
    expect(resolveDocket({ ...c, date: '2028-07-01' }, input).ok).toBe(false);
    expect(resolveDocket({ ...c, office: c.office ? { ...c.office, since: '2027-01-01' } : null }, input).ok).toBe(false);
  });
  it.each(['press', 'tour'])('%s is a distinct once-only routine with bounded approval and action costs', choice => {
    const c = executive();
    const next = decide(c, 'routine', choice);
    expect(next.actions).toBe(c.actions - 15);
    expect(next.skills.communication).toBe(c.skills.communication + 0.5);
    expect(next.approval?.history[0]?.change).toBe(0.5);
    expect(next.executiveDocket?.items[2].outcome).toContain(choice === 'press' ? 'press conference' : 'Toured regions');
    expect(resolveDocket(next, request(next, 'routine', choice)).ok).toBe(false);
  });
  it.each(['council', 'stateLeg', 'house', 'senate'])('does not impose executive powers or turn gate on %s', id => {
    const c = executive(id);
    expect(c.executiveDocket).toBeUndefined();
    expect(docketBlocker(c)).toBeNull();
    expect(advanceTurn(c).career.date).toBe('2028-07-01');
  });
});