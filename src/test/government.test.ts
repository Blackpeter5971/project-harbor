import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, canAccessGovernment } from '@/lib/game/career';
import { advanceTurn } from '@/lib/game/gameplay';
import { launchCampaign, publishEdition } from '@/lib/game/campaign';
import { govStats, govActions, govAction, govPriorities, govDeadlines, termProgress } from '@/lib/game/government';

const base = () => createCareer({ ...defaultDraft, name: 'Alex Morgan', party: 'Democrat' });
const eligible = () => ({ ...base(), date: '2027-07-01', experience: 100, reputation: 40, money: 5000, skills: { communication: 30, leadership: 30, knowledge: 30 } });
const winCouncil = () => {
  const launch = launchCampaign(eligible(), 'council', 'A stronger city', 'grassroots');
  if (!launch.ok || !launch.career.campaign) throw new Error('Launch failed');
  const c = { ...launch.career, campaign: { ...launch.career.campaign, support: 10000 } };
  const first = advanceTurn(c).career;
  const final = advanceTurn({ ...first, report: null, pendingEvent: null, newspaperPending: false }).career;
  if (!final.office) throw new Error('Expected a won election');
  return final;
};
const withOffice = (id: string, title: string) => ({ ...base(), date: '2028-06-01', publicOffice: true, reputation: 50, office: { id, title, jurisdiction: 'Test jurisdiction', since: '2028-01-01', party: 'Democrat' as const, elected: '2027-11-01', termEnd: '2032-01-01', margin: 8 } });

describe('Government control center', () => {
  it('unelected players cannot act', () => {
    const c = base();
    expect(govActions(c)).toHaveLength(0);
    expect(govStats(c)).toBeNull();
    expect(termProgress(c)).toBeNull();
    const r = govAction(c, 'constituents');
    expect(r.ok).toBe(false);
    expect(canAccessGovernment(c)).toBe(false);
  });
  it('each office shows different panels and actions', () => {
    const ids = ['council', 'mayor', 'stateLeg', 'house', 'governor', 'senate', 'president'];
    const signatures = ids.map(id => govActions(withOffice(id, 'X')).map(a => a.id).join(','));
    expect(new Set(signatures).size).toBe(ids.length);
    expect(govPriorities('council')).not.toEqual(govPriorities('president'));
    for (const id of ids) expect(govActions(withOffice(id, 'X')).length).toBeGreaterThanOrEqual(5);
  });
  it('term progress and deadlines reflect the office', () => {
    const c = withOffice('council', 'City Council Member');
    const tp = termProgress(c)!;
    expect(tp.total).toBe(48);
    expect(tp.elapsed).toBe(5);
    expect(tp.monthsLeft).toBe(43);
    const dl = govDeadlines(c);
    expect(dl.some(d => d.label === 'Term ends' && d.date === '2032-01-01')).toBe(true);
    expect(dl.some(d => d.label === 'Next election')).toBe(true);
  });
  it('a budget proposal uses one action and makes news without granting passage gains', () => {
    const c = withOffice('mayor', 'Mayor');
    const before = govStats(c)!;
    expect(before.approval).toBeGreaterThan(0);
    const r = govAction(c, 'citybudget');
    if (!r.ok) throw new Error(r.message);
    expect(r.career.actions).toBe(c.actions - 15);
    expect(r.career.reputation).toBe(c.reputation);
    expect(r.career.bills[0]?.stage).toBe('proposed');
    expect(r.career.newsQueue.some(s => s.tag === 'government' && s.h.includes('budget'))).toBe(true);
    // out of actions → blocked
    const spent = { ...r.career, actions: 0 };
    expect(govAction(spent, 'constituents').ok).toBe(false);
  });
  it('government decisions are newsworthy enough to publish an edition', () => {
    const c = { ...withOffice('governor', 'Governor'), relationships: 100, skills: { communication: 80, leadership: 100, knowledge: 80 } };
    const r = govAction(c, 'order');
    if (!r.ok) throw new Error(r.message);
    const published = publishEdition(r.career, c, c.date, c.date, []);
    expect(published.news.length).toBe(c.news.length + 1);
    expect(published.news[0]!.stories.some(s => s.tag === 'government')).toBe(true);
  });
  it('an action from another office is rejected', () => {
    const c = withOffice('council', 'City Council Member');
    expect(govAction(c, 'address').ok).toBe(false); // president-only
    expect(govAction(c, 'order').ok).toBe(false); // governor/president-only
  });
});
