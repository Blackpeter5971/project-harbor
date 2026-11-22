import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { campaignTurn, launchCampaign, passiveCeiling } from '@/lib/game/campaign';
import { advanceTurn, continueTurnReport, continueAfterNewspaper, resolveEvent } from '@/lib/game/gameplay';

function running(): Career {
  const result = launchCampaign({ ...createCareer({ ...defaultDraft, name: 'Finance Player' }), date: '2027-01-01', money: 5000, reputation: 25, experience: 100, contacts: 0, skills: { leadership: 30, communication: 30, knowledge: 30 } }, 'council', 'Our future', 'grassroots');
  if (!result.ok || !result.career.campaign) throw new Error('Launch failed');
  return { ...result.career, campaign: { ...result.career.campaign, staff: 3, funds: 1000, volunteers: 0, momentum: 0 } };
}
function reload(c: Career): Career {
  const saved = parseCareer(JSON.stringify(c));
  if (!saved) throw new Error('Invalid save');
  return saved;
}
function donations(c: Career) { return c.campaign?.txns.filter(t => t.label.startsWith('Small-dollar')).reduce((sum, t) => sum + t.amount, 0) ?? 0; }

describe('Passive donations and quarterly payroll', () => {
  it.each([
    ['council', 4000], ['mayor', 16000], ['stateLeg', 8000], ['house', 40000],
    ['governor', 160000], ['senate', 180000], ['president', 1600000],
  ] as const)('caps aggregate quarterly gifts for %s at $%s', (office, ceiling) => {
    const c = running();
    if (!c.campaign) throw new Error('Missing campaign');
    const input = { ...c, contacts: 1e6, reputation: 100, campaign: { ...c.campaign, office, primaryDate: null, volunteers: 1e6, momentum: 100 } };
    expect(passiveCeiling(input.campaign)).toBe(ceiling);
    const next = campaignTurn(input, c.date, '2027-04-01').career;
    expect(donations(next)).toBe(ceiling);
    expect(next.money).toBe(5000);
    expect(next.ledger).toEqual(c.ledger);
  });

  it.each(['volunteers', 'reputation', 'contacts', 'momentum'] as const)('retains %s influence below the ceiling', stat => {
    const base = running();
    if (!base.campaign) throw new Error('Missing campaign');
    const c = { ...base, reputation: 0, campaign: { ...base.campaign, staff: 0 } };
    const stronger = stat === 'contacts' || stat === 'reputation' ? { ...c, [stat]: 10 } : { ...c, campaign: { ...c.campaign, [stat]: 10 } };
    const low = donations(campaignTurn(c, c.date, '2027-04-01').career);
    const high = donations(campaignTurn(stronger, c.date, '2027-04-01').career);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThan(4000);
  });

  it.each([
    [1000, 3, 600, 3], [600, 3, 600, 3], [450, 3, 400, 2],
    [199, 3, 0, 0], [0, 3, 0, 0], [1000, 0, 0, 0],
  ])('settles $%s for %s staff safely', (funds, staff, paid, retained) => {
    const c = running();
    if (!c.campaign) throw new Error('Missing campaign');
    const input = { ...c, reputation: 0, campaign: { ...c.campaign, funds, staff } };
    const result = campaignTurn(input, c.date, '2027-04-01');
    const camp = result.career.campaign;
    expect(camp?.staff).toBe(retained);
    expect(camp?.spent).toBe(paid);
    expect(camp?.funds).toBe(funds - paid);
    expect(camp?.txns.filter(t => t.label.startsWith('Staff payroll'))).toHaveLength(paid ? 1 : 0);
    expect(result.lines.some(l => l.includes('staffer(s) quit'))).toBe(retained < staff);
    expect(campaignTurn(reload(result.career), c.date, '2027-04-01')).toEqual({ career: result.career, lines: [], stories: [] });
  });

  it('blocks replay and overlapping periods even after saved polls are removed', () => {
    const c = running();
    const paid = campaignTurn(c, c.date, '2027-04-01').career;
    if (!paid.campaign) throw new Error('Missing campaign');
    const saved = reload({ ...paid, campaign: { ...paid.campaign, polls: [] } });
    for (const [start, end] of [['2027-01-01', '2027-04-01'], ['2027-02-01', '2027-05-01'], ['2027-01-01', '2027-07-01']] as const) {
      expect(campaignTurn(saved, start, end)).toEqual({ career: saved, lines: [], stories: [] });
    }
    const next = campaignTurn(saved, '2027-04-01', '2027-07-01').career;
    expect(next.campaign?.lastProcessedEnd).toBe('2027-07-01');
    expect(next.campaign?.txns.filter(t => t.label.startsWith('Staff payroll'))).toHaveLength(2);
  });

  it('loads legacy campaigns without changing money and retains their poll-based replay guard', () => {
    const c = campaignTurn(running(), '2027-01-01', '2027-04-01').career;
    if (!c.campaign) throw new Error('Missing campaign');
    const { lastProcessedEnd, ...legacy } = c.campaign;
    const loaded = reload({ ...c, campaign: legacy } as Career);
    expect(loaded.campaign?.lastProcessedEnd).toBe('');
    expect(loaded.campaign?.funds).toBe(c.campaign.funds);
    expect(campaignTurn(loaded, '2027-01-01', '2027-04-01').career).toEqual(loaded);
    expect(lastProcessedEnd).toBe('2027-04-01');
  });

  it('settles once through advance, report, newspaper, event and reload, then settles the next quarter', () => {
    const c = running();
    const processed = advanceTurn(c).career;
    expect(advanceTurn(reload(processed)).career).toEqual(processed);
    const txns = processed.campaign?.txns;
    let ready = continueAfterNewspaper(continueTurnReport(reload(processed)));
    if (ready.eventEncounter) {
      const choice = ready.eventEncounter.choices.find(ch => !ch.disabled);
      if (!choice) throw new Error('Missing choice');
      const result = resolveEvent(ready, choice.id);
      if (!result.ok) throw new Error(result.message);
      ready = result.career;
    }
    expect(reload(ready).campaign?.txns).toEqual(txns);
    const next = advanceTurn(reload(ready)).career;
    expect(next.campaign?.lastProcessedEnd).toBe('2027-07-01');
    expect(next.campaign?.txns.filter(t => t.label.startsWith('Staff payroll'))).toHaveLength(2);
    expect(next.campaign?.txns.filter(t => t.label.startsWith('Small-dollar'))).toHaveLength(2);
  });
});