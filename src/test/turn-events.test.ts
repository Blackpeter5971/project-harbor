import { describe, expect, it, vi } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { advanceTurn, continueAfterNewspaper, continueTurnReport, getEvent, resolveEvent } from '@/lib/game/gameplay';
import { launchCampaign, campaignTurn } from '@/lib/game/campaign';
// Pay/accounting tests isolate income from personal taxes (covered in taxes.test.ts).
vi.mock('@/lib/game/taxes', async (orig) => ({ ...(await orig<typeof import('@/lib/game/taxes')>()), collectTaxes: (c: unknown) => ({ career: c, notices: [] }) }));

// Salary/campaign accounting checks run rent-free; turn rent is covered in housing.test.ts.
vi.mock('@/lib/game/housing', async orig => ({ ...(await orig<typeof import('@/lib/game/housing')>()), collectRent: (career: unknown) => ({ career, notice: null, evicted: false }) }));
vi.mock('@/lib/game/life', async orig => ({ ...(await orig<typeof import('@/lib/game/life')>()), collectLiving: (career: unknown) => ({ career, notices: [] }) }));


const base = () => createCareer({ ...defaultDraft, name: 'Alex Morgan', party: 'Democrat' });
const reload = (career: Career) => { const saved = parseCareer(JSON.stringify(career)); if (!saved) throw new Error('Invalid save'); return saved; };
describe('Contextual quarterly events', () => {
  it('advances exactly three months and resets exactly five actions', () => {
    const next = advanceTurn({ ...base(), actions: 0 }).career;
    expect(next.date).toBe('2026-04-01');
    expect(next.actions).toBe(100);
  });
  it('blocks turn accounting through report, newspaper and unresolved event, including reloads', () => {
    const start = { ...base(), money: 1000, job: { id: 'retail', since: '2026-01-01' }, ledger: [{ month: '2026-01-01', label: 'Community event', amount: -50 }] };
    const report = { ...advanceTurn(start).career, pendingEvent: 'contact' };
    expect(report.money).toBe(3550);
    expect(report.ledger.filter(e => e.amount === 850)).toHaveLength(3);
    expect(report.report?.lines).toContain('Expenses this turn: $50.');
    expect(advanceTurn(reload(report)).career).toEqual(report);
    expect(resolveEvent(report, 'dine').ok).toBe(false);
    const paper = continueTurnReport(report);
    expect(paper.newspaperPending).toBe(false); // quiet turn: no newsworthy event, no edition
    expect(paper.eventEncounter?.presented).toBe(true);
    expect(advanceTurn(reload(paper)).career).toEqual(paper);
    const event = continueAfterNewspaper(paper);
    expect(event.eventEncounter?.presented).toBe(true);
    expect(advanceTurn(reload(event)).career).toEqual(event);
    const result = resolveEvent(reload(event), 'dine');
    if (!result.ok) throw new Error(result.message);
    expect(result.career.money).toBe(3350);
    expect(result.career.contacts).toBe(1);
    expect(result.career.actions).toBe(100);
    expect(result.career.ledger.filter(e => e.label === 'Dinner with organiser')).toHaveLength(1);
    expect(result.career.eventHistory[0]?.choice).toBe('dine');
    expect(getEvent(reload(result.career))).toBeNull();
    expect(resolveEvent(reload(result.career), 'dine').ok).toBe(false);
    expect(continueAfterNewspaper(reload(result.career)).money).toBe(3350);
    expect(result.career.news).toEqual(report.news);
  });
  it('rejects invalid choices without clearing the event or changing its effects', () => {
    const career = continueAfterNewspaper({ ...base(), pendingEvent: 'meeting' });
    const snapshot = JSON.stringify(career);
    expect(resolveEvent(career, 'unknown').ok).toBe(false);
    expect(JSON.stringify(career)).toBe(snapshot);
  });
  it('has occasional quiet turns and only eligible saved event candidates', () => {
    const events = Array.from({ length: 60 }, (_, i) => advanceTurn({ ...base(), character: { ...base().character, name: `Citizen ${i}`, party: 'Independent' as const } }).career);
    expect(events.some(c => c.pendingEvent === null)).toBe(true);
    expect(events.some(c => c.pendingEvent !== null)).toBe(true);
    for (const c of events) {
      expect(['meeting', 'dispute', 'contact', 'campaignFunds'].includes(c.pendingEvent ?? '')).toBe(false);
      if (getEvent(c)) expect(getEvent(c)?.choices.length).toBeGreaterThanOrEqual(2);
      expect(getEvent(reload(c))).toEqual(getEvent(c));
    }
  });
  it('returns directly Home-ready for a quiet turn without rerolling', () => {
    const processed = { ...advanceTurn(base()).career, pendingEvent: null };
    const next = continueAfterNewspaper(continueTurnReport(processed));
    expect(next.newspaperPending).toBe(false);
    expect(next.eventEncounter).toBeNull();
    expect(next.date).toBe('2026-04-01');
    expect(next.actions).toBe(100);
    expect(next.news).toEqual(processed.news);
  });
  it('applies group effects immediately to the existing campaign without repeating finance or granting endorsements', () => {
    const launch = launchCampaign({ ...base(), date: '2027-07-01', money: 5000, experience: 100, reputation: 40, skills: { communication: 30, leadership: 30, knowledge: 30 } }, 'council', 'Our city', 'grassroots');
    if (!launch.ok || !launch.career.campaign) throw new Error('Missing campaign');
    const input = { ...launch.career, groups: { labor: 30 }, campaign: { ...launch.career.campaign, funds: 2000, staff: 1 } };
    const processed = { ...advanceTurn(input).career, pendingEvent: 'group:labor' };
    const event = continueAfterNewspaper(continueTurnReport(processed));
    const result = resolveEvent(event, 'listen');
    if (!result.ok) throw new Error(result.message);
    expect(result.career.groups['labor']).toBe(32);
    expect(result.career.skills.communication).toBe(event.skills.communication + 0.5);
    expect(result.career.campaign?.funds).toBe(event.campaign?.funds);
    expect(result.career.campaign?.txns).toEqual(event.campaign?.txns);
    expect(result.career.campaign?.endorsements).toEqual(event.campaign?.endorsements);
    expect(result.career.money).toBe(5000);
    expect(result.career.actions).toBe(100);
    expect(Object.values(result.career.campaign?.polls.at(-1)?.shares ?? {}).reduce((a,b) => a+b, 0)).toBe(100);
    expect(campaignTurn(result.career, input.date, processed.date).career).toEqual(result.career);
    expect(resolveEvent(reload(result.career), 'listen').ok).toBe(false);
  });
});