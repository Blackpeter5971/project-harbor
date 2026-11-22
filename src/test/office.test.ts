import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, canAccessGovernment } from '@/lib/game/career';
import { advanceTurn } from '@/lib/game/gameplay';
import { launchCampaign, resignOffice, termEndDate, officeRank } from '@/lib/game/campaign';

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

describe('Office status and election unlock', () => {
  it('records the exact office, jurisdiction, dates, margin and party on a win', () => {
    const won = winCouncil();
    expect(won.office?.id).toBe('council');
    expect(won.office?.title).toContain('Council');
    expect(won.office?.jurisdiction.length).toBeGreaterThan(0);
    expect(won.office?.party).toBe('Democrat');
    expect(won.office?.elected).toBe('2027-11-01');
    expect(won.office?.since).toBe('2028-01-01');
    expect(won.office?.termEnd).toBe(termEndDate('2028-01-01', 'council'));
    expect(won.office?.margin).toBeGreaterThan(0);
    expect(parseCareer(JSON.stringify(won))?.office).toEqual(won.office);
  });
  it('unlocks Government on a win and grants nothing on a loss', () => {
    const won = winCouncil();
    expect(won.publicOffice).toBe(true);
    expect(canAccessGovernment(won)).toBe(true);
    const launch = launchCampaign(eligible(), 'council', 'A stronger city', 'grassroots');
    if (!launch.ok || !launch.career.campaign) throw new Error('Launch failed');
    const c = { ...launch.career, campaign: { ...launch.career.campaign, support: 0, funds: 0, volunteers: 0 } };
    const first = advanceTurn(c).career;
    const final = advanceTurn({ ...first, report: null, pendingEvent: null, newspaperPending: false }).career;
    expect(final.elections).toHaveLength(1);
    expect(final.publicOffice).toBe(final.elections[0]!.won);
    expect(final.office !== null).toBe(final.elections[0]!.won);
    expect(canAccessGovernment(final)).toBe(final.elections[0]!.won);
  });
  it('blocks same-office bids outside the final year', () => {
    const won = winCouncil();
    expect(launchCampaign(won, 'council', 'Again', 'grassroots').ok).toBe(false);
    expect(officeRank['mayor']!).toBeGreaterThan(officeRank['council']!);
  });
  it('requires resignation before a higher-office bid', () => {
    const won = { ...winCouncil(), experience: 500, reputation: 90, contacts: 100, money: 50000 };
    const higher = launchCampaign(won, 'mayor', 'Forward', 'grassroots');
    expect(higher.ok).toBe(false);
    const resigned = resignOffice(won);
    if (!resigned.ok) throw new Error(resigned.message);
    expect(launchCampaign(resigned.career, 'mayor', 'Forward', 'grassroots').ok).toBe(true);
  });
  it('resignation clears the office, locks Government, costs reputation and makes news', () => {
    const won = winCouncil();
    const res = resignOffice(won);
    if (!res.ok) throw new Error(res.message);
    expect(res.career.office).toBeNull();
    expect(res.career.publicOffice).toBe(false);
    expect(canAccessGovernment(res.career)).toBe(false);
    expect(res.career.reputation).toBe(won.reputation - 2);
    expect(res.career.newsQueue.some(s => s.h.includes('resigns'))).toBe(true);
    expect(resignOffice(res.career).ok).toBe(false);
  });
});
