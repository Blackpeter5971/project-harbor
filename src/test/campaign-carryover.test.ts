import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { campaignAction, campaignTurn, launchCampaign, selfFund } from '@/lib/game/campaign';

function eligible(): Career {
  return { ...createCareer({ ...defaultDraft, name: 'Reserve Player' }), date: '2027-07-01', money: 5000, reputation: 40, experience: 100, skills: { leadership: 30, communication: 30, knowledge: 30 }, warChest: 12500,
    ledger: [{ month: '2027-04-01', label: 'Past personal transaction', amount: -100 }] };
}
function launch(c = eligible()): Career {
  const result = launchCampaign(c, 'council', 'Our community', 'grassroots');
  if (!result.ok) throw new Error(result.message);
  return result.career;
}
function reload(c: Career): Career {
  const saved = parseCareer(JSON.stringify(c));
  if (!saved) throw new Error('Save invalid');
  return saved;
}

describe('Campaign carryover accounting', () => {
  it('credits $12,500 reserves once without new raised totals, donors or personal transactions', () => {
    const before = eligible();
    const c = reload(launch(before));
    expect(c.campaign?.funds).toBe(12500);
    expect(c.campaign?.raised).toBe(0);
    expect(c.campaign?.donors).toBe(0);
    expect(c.campaign?.spent).toBe(0);
    expect(c.campaign?.txns).toEqual([{ month: '2027-07-01', label: 'Carried over from previous campaign', amount: 12500 }]);
    expect(c.warChest).toBe(0);
    expect(c.money).toBe(5000);
    expect(c.ledger).toEqual(before.ledger);
    expect(launchCampaign(c, 'council', 'Again', 'grassroots').ok).toBe(false);
    expect(reload(c)).toEqual(c);
    expect(before.warChest).toBe(12500);
  });

  it('counts new self-funding and donations normally after reserve transfer', () => {
    const transfer = selfFund(launch(), 1000);
    if (!transfer.ok) throw new Error(transfer.message);
    const call = campaignAction(transfer.career, 'fundraise');
    if (!call.ok || !call.career.campaign) throw new Error('Call failed');
    const camp = call.career.campaign;
    expect(camp.raised).toBe(camp.funds - 12500);
    expect(camp.raised).toBeGreaterThan(1000);
    expect(call.career.money).toBe(4000);
    const next = campaignTurn(call.career, '2027-07-01', '2027-10-01').career;
    expect(next.campaign?.raised).toBe((next.campaign?.funds ?? 0) - 12500);
    expect(reload(next)).toEqual(next);
  });

  it.each(['primary', 'ballot', 'general'] as const)('excludes opening reserves from %s election results', stage => {
    const c = launch();
    if (!c.campaign) throw new Error('Missing campaign');
    const input: Career = { ...c, campaign: { ...c.campaign,
      phase: stage === 'primary' ? 'primary' : 'general',
      party: stage === 'primary' ? 'Democrat' : 'Independent',
      primaryDate: stage === 'general' ? null : '2027-08-01',
      electionDate: stage === 'general' ? '2027-08-01' : '2027-11-01',
      volunteers: 0,
    } };
    const result = campaignTurn(input, '2027-07-01', '2027-10-01').career;
    const election = result.elections[0];
    if (!election) throw new Error('No election recorded');
    expect(election.stage).toBe(stage);
    expect(election.raised).toBeGreaterThan(0);
    expect(election.raised).toBeLessThanOrEqual(4000);
    expect(election.spent).toBe(0);
    expect(reload(result).elections).toEqual(result.elections);
  });

  it('preserves legacy totals and complete saved records without retroactive rewriting', () => {
    const current = campaignTurn(launch(), '2027-07-01', '2027-10-01').career;
    if (!current.campaign) throw new Error('Missing campaign');
    const { lastProcessedEnd, ...legacyCampaign } = current.campaign;
    const raw = { ...current, campaign: { ...legacyCampaign, raised: current.campaign.raised + 12500 } };
    const loaded = parseCareer(JSON.stringify(raw));
    if (!loaded) throw new Error('Legacy career rejected');
    expect(loaded).toEqual({ ...raw, campaign: { ...raw.campaign, lastProcessedEnd: '' } });
    expect(reload(loaded)).toEqual(loaded);
    expect(campaignTurn(loaded, '2027-07-01', '2027-10-01').career).toEqual(loaded);
    expect(lastProcessedEnd).toBe('2027-10-01');
  });

  it('carries remaining cash into another race without recounting the prior race donations', () => {
    const c = launch();
    if (!c.campaign) throw new Error('Missing campaign');
    const finished = campaignTurn({ ...c, campaign: { ...c.campaign, electionDate: '2027-08-01', support: -1000 } }, '2027-07-01', '2027-10-01').career;
    expect(finished.campaign).toBeNull();
    expect(finished.warChest).toBeGreaterThanOrEqual(12500);
    const ready = reload({ ...finished, date: '2029-07-01', publicOffice: false, office: null, actions: 75 });
    const next = launch(ready);
    expect(next.campaign?.funds).toBe(finished.warChest);
    expect(next.campaign?.raised).toBe(0);
    expect(next.elections).toEqual(finished.elections);
    expect(next.warChest).toBe(0);
  });
});