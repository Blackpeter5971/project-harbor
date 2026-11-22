import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { launchCampaign, campaignAction } from '@/lib/game/campaign';
import { advanceTurn, continueTurnReport, continueAfterNewspaper, resolveEvent, doActivity } from '@/lib/game/gameplay';
import { debateReady, prepareDebate, respondDebate, dismissDebate } from '@/lib/game/debates';

export function debateFixture(): Career {
  const c = { ...createCareer({ ...defaultDraft, name: 'Debate Player' }), date: '2027-07-01', experience: 150, reputation: 50, skills: { communication: 40, knowledge: 40, leadership: 40 } };
  const r = launchCampaign(c, 'mayor', 'A city for everyone', 'policy');
  if (!r.ok || !r.career.campaign) throw new Error('Campaign fixture failed');
  return { ...r.career, campaign: { ...r.career.campaign, volunteers: 100, support: 10 } };
}
const reload = (c: Career) => { const n = parseCareer(JSON.stringify(c)); if (!n) throw new Error('Invalid save'); return n; };
const ready = () => {
  const report = advanceTurn(debateFixture()).career;
  return continueAfterNewspaper(continueTurnReport(report));
};
describe('General-election debates', () => {
  it('schedules after the next quarter crosses election-minus-three-months, not earlier', () => {
    const c = debateFixture();
    expect(prepareDebate(c, '2027-04-01', '2027-07-01').debate).toBeUndefined();
    expect(prepareDebate(c, '2027-07-01', '2027-10-01').debate?.date).toBe('2027-10-01');
    expect(prepareDebate(c, '2027-10-01', '2028-01-01').debate).toBeUndefined();
  });
  it('excludes city council', () => {
    const c = debateFixture();
    if (!c.campaign) throw new Error('Missing campaign');
    expect(prepareDebate({ ...c, campaign: { ...c.campaign, office: 'council' } }, c.date, '2027-10-01').debate).toBeUndefined();
  });
  it('excludes party primaries', () => {
    const c = debateFixture();
    if (!c.campaign) throw new Error('Missing campaign');
    expect(prepareDebate({ ...c, campaign: { ...c.campaign, phase: 'primary' } }, c.date, '2027-10-01').debate).toBeUndefined();
  });
  it('includes every general-election office except council', () => {
    const c = debateFixture();
    if (!c.campaign) throw new Error('Missing campaign');
    for (const office of ['mayor', 'stateLeg', 'house', 'governor', 'senate', 'president']) expect(prepareDebate({ ...c, campaign: { ...c.campaign, office } }, c.date, '2027-10-01').debate?.office).toBe(office);
  });
  it('presents only after report and newspaper, blocking time/event replay on reload', () => {
    const c = advanceTurn(debateFixture()).career;
    expect(c.date).toBe('2027-10-01');
    expect(debateReady(c)).toBe(false);
    expect(respondDebate(c, c.debate?.id ?? '', 0, 'skip').ok).toBe(false);
    const paper = continueTurnReport(reload(c));
    expect(paper.newspaperPending).toBe(true);
    expect(debateReady(paper)).toBe(false);
    const debate = continueAfterNewspaper(reload(paper));
    expect(debateReady(debate)).toBe(true);
    expect(advanceTurn(reload(debate)).career).toEqual(debate);
    expect(resolveEvent(debate, 'listen').ok).toBe(false);
    expect(campaignAction(debate, 'fundraise').ok).toBe(false);
    expect(doActivity(debate, 'study').ok).toBe(false);
  });
  it('skipping loses support and approval once and persists a social trend', () => {
    const c = ready();
    const r = respondDebate(c, c.debate?.id ?? '', 0, 'skip');
    if (!r.ok) throw new Error(r.message);
    expect(r.career.campaign?.support).toBe((c.campaign?.support ?? 0) - 3);
    expect(r.career.debate?.approvalDelta).toBe(-2);
    expect(r.career.socialMedia?.reactionFeed[0]?.text).toContain('#MayorDebate');
    expect(respondDebate(reload(r.career), r.career.debate?.id ?? '', 0, 'skip').ok).toBe(false);
    expect(r.career.money).toBe(c.money);
  });
  it('saves dialogue across reloads, applies choices once and refreshes a 100% poll', () => {
    let c = ready(); const id = c.debate?.id ?? '';
    const attend = respondDebate(c, id, 0, 'attend');
    if (!attend.ok) throw new Error(attend.message);
    c = attend.career;
    for (const [i, answer] of ['plan', 'evidence', 'tradeoff', 'unite'].entries()) {
      const r = respondDebate(reload(c), id, i, answer);
      if (!r.ok) throw new Error(r.message);
      c = r.career;
      expect(respondDebate(c, id, i, answer).ok).toBe(false);
    }
    expect(c.debate?.status).toBe('completed');
    expect(c.debate?.score).toBe(8);
    expect(c.debate?.supportDelta).toBeGreaterThan(0);
    expect(c.debate?.transcript).toHaveLength(12);
    expect(Object.values(c.campaign?.polls.at(-1)?.shares ?? {}).reduce((a, b) => a + b, 0)).toBe(100);
    const dismissed = dismissDebate(reload(c), id);
    expect(dismissed.debateHistory).toHaveLength(1);
    expect(prepareDebate(dismissed, '2027-07-01', '2027-10-01').debate).toBeNull();
  });
  it('bad dialogue choices can lose voter support and approval', () => {
    let c = ready(); const id = c.debate?.id ?? '';
    for (const [round, choice] of [[0, 'attend'], [0, 'promise'], [1, 'attack'], [2, 'dodge'], [3, 'divide']] as const) {
      const r = respondDebate(c, id, round, choice); if (!r.ok) throw new Error(r.message); c = r.career;
    }
    expect(c.debate?.supportDelta).toBe(-3);
    expect(c.debate?.approvalDelta).toBe(-2);
  });
  it('loads old careers without debate fields', () => {
    const c = debateFixture();
    expect(reload(c).character).toEqual(c.character);
    expect(reload(c).campaign?.funds).toBe(c.campaign?.funds);
  });
});