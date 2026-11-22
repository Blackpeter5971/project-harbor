import { describe, expect, it, vi } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { generalBaselineSupport, actCost, availableElections, baseCosts, callCeiling, callsUsed, campaignAction, campaignTurn, launchCampaign, offices, selfFund, resignOffice, policyMessage, supportGain, scores, takePoll, toShares } from '@/lib/game/campaign';
import { advanceTurn } from '@/lib/game/gameplay';
import { respondDebate, dismissDebate } from '@/lib/game/debates';
// Salary/campaign accounting checks run rent-free; turn rent is covered in housing.test.ts.
vi.mock('@/lib/game/housing', async orig => ({ ...(await orig<typeof import('@/lib/game/housing')>()), collectRent: (career: unknown) => ({ career, notice: null, evicted: false }) }));
vi.mock('@/lib/game/life', async orig => ({ ...(await orig<typeof import('@/lib/game/life')>()), collectLiving: (career: unknown) => ({ career, notices: [] }) }));


const eligible = () => ({ ...createCareer({ ...defaultDraft, name: 'Alex Morgan' }), date: '2027-07-01', money: 5000, experience: 100, reputation: 40, skills: { communication: 30, leadership: 30, knowledge: 30 }, job: { id: 'retail', since: '2026-01-01' }, workMonths: 12 });
function launched() {
  const result = launchCampaign(eligible(), 'council', 'Together for our city', 'grassroots');
  if (!result.ok) throw new Error(result.message);
  return result.career;
}
describe('Campaign integration', () => {
  it.each(['event', 'volunteers', 'staff', 'rally', 'ads', 'poll'] as const)('rejects unaffordable %s without changing actions, balances or ledgers', action => {
    const c = launched();
    if (!c.campaign) throw new Error('Missing campaign');
    const input = { ...c, campaign: { ...c.campaign, funds: actCost(c.campaign, action) * (action === 'ads' ? 0.5 : 1) - 1 } };
    const before = structuredClone(input);
    expect(campaignAction(input, action).ok).toBe(false);
    expect(input).toEqual(before);
  });
  it('dampens support by the specified 25-point scale without amplifying negative support', () => {
    expect(supportGain(10, 0)).toBe(10);
    expect(supportGain(10, 25)).toBe(5);
    expect(supportGain(10, 75)).toBe(2.5);
    expect(supportGain(10, -5)).toBe(10);
  });
  it.each(['ads', 'rally', 'policy'] as const)('dampens actual %s support gains at higher support', action => {
    const c = launched();
    if (!c.campaign) throw new Error('Missing campaign');
    // Find a successful rally without making the test depend on a gaffe seed.
    let checked = false;
    for (let funds = 20000; funds < 20100; funds++) {
      const low = { ...c, campaign: { ...c.campaign, funds, support: 0 } };
      const high = { ...low, campaign: { ...low.campaign, support: 75 } };
      const run = (input: typeof low) => action === 'policy' ? policyMessage(input, 'education') : campaignAction(input, action);
      const a = run(low), b = run(high);
      if (!a.ok || !b.ok) throw new Error('Action failed');
      const base = a.career.campaign?.support ?? 0;
      if (base === 0) continue;
      expect((b.career.campaign?.support ?? 75) - 75).toBeCloseTo(base / 4, 1);
      checked = true; break;
    }
    expect(checked).toBe(true);
  });
  it('keeps a five-point score lead competitive rather than producing a blowout', () => {
    expect(toShares({ Player: 45, Rival: 40 }, 10)).toEqual({ Player: 48, Rival: 42, Undecided: 10 });
  });
  it.each([0, 6, 13, 26])('allocates exactly 100 percent with %s undecided across field sizes', undecided => {
    for (let size = 1; size <= 8; size++) {
      const shares = toShares(Object.fromEntries(Array.from({ length: size }, (_, i) => [`Candidate ${i}`, 20 + i * 5])), undecided);
      expect(Object.values(shares).reduce((sum, n) => sum + n, 0)).toBe(100);
      expect(shares['Undecided']).toBe(undecided);
      expect(Object.values(shares).every(n => Number.isInteger(n) && n >= 0)).toBe(true);
    }
  });
  it('handles zero scores and empty fields without losing votes', () => {
    expect(toShares({ A: 0, B: 0 }, 6)).toEqual({ A: 47, B: 47, Undecided: 6 });
    expect(toShares({}, 26)).toEqual({ Undecided: 100 });
  });
  it('resolves undecided voters toward the actual election deadline, including late launches', () => {
    const c = launched();
    if (!c.campaign) throw new Error('Missing campaign');
    const camp = c.campaign;
    expect(['2027-07-01', '2027-09-01', '2027-11-01', '2028-01-01'].map(date => takePoll(c, camp, date).shares['Undecided'])).toEqual([26, 16, 6, 6]);
    const primary = { ...c.campaign, phase: 'primary' as const, primaryDate: '2027-09-01' };
    expect(takePoll(c, primary, '2027-09-01').shares['Undecided']).toBe(6);
  });
  it('decays momentum without adding automatic earned support', () => {
    const c = launched();
    if (!c.campaign) throw new Error('Missing campaign');
    const input = { ...c, campaign: { ...c.campaign, momentum: 10, support: 25, opponents: [], allegation: { target: 'Absent rival', text: 'Test', status: 'cleared' as const, date: c.date } } };
    const next = campaignTurn(input, c.date, '2027-10-01').career;
    expect(next.campaign?.support).toBe(25);
    expect(next.campaign?.momentum).toBe(6);
    expect(scores(next, next.campaign ?? input.campaign)[c.character.name]).toBeLessThan(scores(input, input.campaign)[c.character.name] ?? 0);
  });
  it.each(['money', 'ground', 'media'] as const)('makes funded %s rivals buy ads, rally and hire staff within their resources', trait => {
    const c = launched();
    if (!c.campaign || !c.campaign.opponents[0]) throw new Error('Missing rival');
    const rival = { ...c.campaign.opponents[0], trait, funds: 20000, staff: 1, support: 0 };
    const input = { ...c, campaign: { ...c.campaign, opponents: [rival] } };
    const result = campaignTurn(input, c.date, '2027-10-01');
    const next = result.career.campaign?.opponents[0];
    expect(next?.staff).toBe(2);
    expect(next?.spent).toBe(rival.spent + 200 + 3000 + 5000 + 2500);
    expect(next?.funds).toBe(rival.funds + (next?.raised ?? 0) - rival.raised - 10700);
    expect(next?.support).toBeGreaterThan(6);
    expect(result.lines.some(line => line.includes('bought advertising') && line.includes('held a rally') && line.includes('hired staff'))).toBe(true);
    expect(parseCareer(JSON.stringify(result.career))).toEqual(result.career);
  });
  it('lets a funded opponent catch an idle player while a well-run player can pull ahead', () => {
    const c = launched();
    if (!c.campaign || !c.campaign.opponents[0]) throw new Error('Missing rival');
    const rival = { ...c.campaign.opponents[0], party: c.campaign.party, funds: 100000, quality: 20, volunteers: 5, staff: 0, support: 0, momentum: 0, trait: 'media' as const };
    let idle: Career & { campaign: NonNullable<Career['campaign']> } = { ...c, date: '2027-01-01', campaign: { ...c.campaign, startDate: '2027-01-01', lastProcessedEnd: '2027-01-01', polls: [], opponents: [rival], support: 0, momentum: 0, volunteers: 5, funds: 100000, allegation: { target: 'Absent rival', text: 'Test', status: 'cleared' as const, date: c.date } } };
    const before = scores(idle, idle.campaign);
    expect(before[c.character.name]).toBeGreaterThan(before[rival.name] ?? 0);
    let run: Career & { campaign: NonNullable<Career['campaign']> } = { ...idle, campaign: { ...idle.campaign, strategy: 'media' } };
    for (const [start, end] of [['2027-01-01', '2027-04-01'], ['2027-04-01', '2027-07-01'], ['2027-07-01', '2027-10-01']]) {
      run = { ...run, actions: 75, date: start ?? run.date };
      for (const action of ['volunteers', 'volunteers', 'staff', 'ads', 'rally'] as const) {
        const result = campaignAction(run, action === 'staff' && run.campaign.staff >= 2 ? 'volunteers' : action);
        if (!result.ok || !result.career.campaign) throw new Error('Campaign action failed');
        run = { ...result.career, campaign: result.career.campaign };
      }
      const worked = campaignTurn(run, start ?? '', end ?? '').career;
      if (!worked.campaign) throw new Error('Campaign ended');
      run = { ...worked, campaign: worked.campaign };
      const next = campaignTurn(idle, start ?? '', end ?? '').career;
      if (!next.campaign) throw new Error('Campaign ended');
      idle = { ...idle, ...next, campaign: { ...idle.campaign, ...next.campaign, allegation: idle.campaign.allegation } };
    }
    const after = scores(idle, idle.campaign);
    expect(after[rival.name]).toBeGreaterThan(after[c.character.name] ?? 0);
    const strong = scores(run, run.campaign);
    expect(strong[c.character.name]).toBeGreaterThan(after[c.character.name] ?? 0);
    expect((strong[rival.name] ?? 0) - (strong[c.character.name] ?? 0)).toBeLessThan((after[rival.name] ?? 0) - (after[c.character.name] ?? 0));
  });
  it('transfers a custom amount between separate balances and records both ledgers without using an action', () => {
    const c = launched();
    const result = selfFund(c, 1250);
    if (!result.ok) throw new Error(result.message);
    expect(result.career.money).toBe(3750);
    expect(result.career.campaign?.funds).toBe(1250);
    expect(result.career.campaign?.raised).toBe(1250);
    expect(result.career.ledger[0]).toEqual({ month: c.date, label: 'Contribution to own campaign', amount: -1250 });
    expect(result.career.campaign?.txns[0]).toEqual({ month: c.date, label: 'Candidate self-funding', amount: 1250 });
    expect(result.career.actions).toBe(c.actions);
    expect(parseCareer(JSON.stringify(result.career))).toEqual(result.career);
    expect(c.money).toBe(5000);
    expect(c.campaign?.funds).toBe(0);
  });
  it('keeps the default office-sized contribution capped by savings', () => {
    const result = selfFund(launched());
    if (!result.ok) throw new Error(result.message);
    expect(result.career.campaign?.funds).toBe(400);
    const small = selfFund({ ...launched(), money: 150 });
    if (!small.ok) throw new Error(small.message);
    expect(small.career.money).toBe(0);
    expect(small.career.campaign?.funds).toBe(150);
  });
  it('requires an active campaign and positive personal savings', () => {
    expect(selfFund(eligible(), 100).ok).toBe(false);
    expect(selfFund({ ...launched(), money: 0 }, 100).ok).toBe(false);
    expect(selfFund({ ...launched(), money: -100 }, 100).ok).toBe(false);
  });
  it.each([0, -1, NaN, Infinity, -Infinity])('rejects invalid contribution %s', amount => {
    expect(selfFund(launched(), amount).ok).toBe(false);
  });
  it('rejects contributions exceeding savings but allows transferring the entire balance', () => {
    expect(selfFund(launched(), 5001).ok).toBe(false);
    const result = selfFund(launched(), 5000);
    if (!result.ok) throw new Error(result.message);
    expect(result.career.money).toBe(0);
    expect(result.career.campaign?.funds).toBe(5000);
  });
  it('uses all seven existing offices and gates campaigns by their requirements', () => {
    expect(offices.map(o => o.id)).toEqual(['council', 'mayor', 'stateLeg', 'house', 'governor', 'senate', 'president']);
    expect(availableElections(createCareer({ ...defaultDraft, name: 'New' }))).toHaveLength(0);
    expect(availableElections(eligible()).some(e => e.office.id === 'council')).toBe(true);
  });
  it('launch ends employment without changing personal savings or history and uses one action', () => {
    const c = launched();
    expect(c.job).toBeNull();
    expect(c.money).toBe(5000);
    expect(c.workMonths).toBe(12);
    expect(c.actions).toBe(85);
    expect(c.campaign?.funds).toBe(0);
    expect(launchCampaign(c, 'mayor', 'Another bid', 'media').ok).toBe(false);
  });
  it('fundraising, rally, ads, and polling each use a regular action and separate campaign funds', () => {
    let c = launched();
    if (!c.campaign) throw new Error('Missing campaign');
    c = { ...c, campaign: { ...c.campaign, funds: 20000 } };
    for (const action of ['fundraise', 'rally', 'ads', 'poll'] as const) {
      const result = campaignAction(c, action);
      if (!result.ok) throw new Error(result.message);
      c = result.career;
    }
    expect(c.actions).toBe(25);
    expect(c.money).toBe(5000);
    expect(c.ledger).toHaveLength(0);
    expect(c.campaign?.spent).toBe(6000);
    expect(c.campaign?.txns).toHaveLength(4);
    expect(campaignAction(c, 'fundraise').ok).toBe(false);
    expect(Object.values(c.campaign?.polls.at(-1)?.shares ?? {}).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it('prices every campaign action at the target base cost for each office', () => {
    const camp = launched().campaign!;
    const expected: Record<string, [number, number, number, number, number, number]> = {
      council: [2000, 500, 3000, 2500, 5000, 1000],
      mayor: [10000, 2500, 15000, 12000, 25000, 5000],
      stateLeg: [5000, 1500, 7500, 6000, 12500, 2500],
      governor: [100000, 25000, 150000, 120000, 250000, 50000],
      house: [25000, 7500, 37500, 30000, 62500, 12500],
      senate: [125000, 30000, 187500, 150000, 312500, 62500],
      president: [1000000, 250000, 1500000, 1200000, 2500000, 500000],
    };
    for (const o of offices) {
      const c = { ...camp, office: o.id };
      const [event, volunteers, staff, rally, ads, poll] = expected[o.id]!;
      expect(actCost(c, 'event')).toBe(event);
      expect(actCost(c, 'volunteers')).toBe(volunteers);
      expect(actCost(c, 'staff')).toBe(staff);
      expect(actCost(c, 'rally')).toBe(rally);
      expect(actCost(c, 'ads')).toBe(ads);
      expect(actCost(c, 'poll')).toBe(poll);
      expect(actCost(c, 'fundraise')).toBe(0);
      expect(actCost(c, 'respond')).toBe(0);
      expect(baseCosts[o.id]).toEqual({ event, volunteers, staff, rally, ads, poll });
    }
  });
  it('allows only one fundraising call per turn, rejecting further calls without spending actions or funds', () => {
    let c = launched();
    const first = campaignAction(c, 'fundraise');
    if (!first.ok) throw new Error(first.message);
    c = first.career;
    expect(c.actions).toBe(70);
    expect(callsUsed(c.campaign!)).toBe(1);
    const funds = c.campaign!.funds;
    const second = campaignAction(c, 'fundraise');
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error('should be rejected');
    expect(second.message).toContain('fundraising calls this turn');
    expect(c.actions).toBe(70);
    expect(c.campaign!.funds).toBe(funds);
  });
  it('resets the fundraising-call limit when a new turn begins', () => {
    let c = launched();
    const first = campaignAction(c, 'fundraise');
    if (!first.ok) throw new Error(first.message);
    const next = advanceTurn(first.career).career;
    expect(callsUsed(next.campaign!)).toBe(0);
    const again = campaignAction(next, 'fundraise');
    expect(again.ok).toBe(true);
    if (again.ok) c = again.career;
    expect(callsUsed(c.campaign!)).toBe(1);
  });
  it('caps a single fundraising-call payout at the office-specific ceiling', () => {
    const base = { ...eligible(), contacts: 100000, reputation: 100 };
    const launch = launchCampaign(base, 'council', 'Together for our city', 'grassroots');
    if (!launch.ok || !launch.career.campaign) throw new Error('Launch failed');
    const c = { ...launch.career, campaign: { ...launch.career.campaign, office: 'president' as const } };
    const result = campaignAction(c, 'fundraise');
    if (!result.ok) throw new Error(result.message);
    const gained = result.career.campaign!.funds;
    expect(gained).toBeGreaterThan(0);
    expect(gained).toBeLessThanOrEqual(callCeiling(c.campaign!));
    expect(callCeiling(c.campaign!)).toBe(2000000);
  });
  it('persists opponents and finance after a turn and prevents replaying the same period', () => {
    const c = launched();
    const next = advanceTurn(c).career;
    expect(next.date).toBe('2027-10-01');
    expect(next.actions).toBe(100);
    expect(next.money).toBe(5000);
    expect(next.campaign?.opponents.map(o => o.name)).toEqual(c.campaign?.opponents.map(o => o.name));
    expect(next.campaign?.opponents[0]?.raised).toBeGreaterThan(0);
    expect(parseCareer(JSON.stringify(next))).toEqual(next);
    expect(advanceTurn(next).career).toEqual(next);
    expect(campaignTurn(next, c.date, next.date).career).toEqual(next);
  });
  it('resolves election in the turn containing November and does not duplicate results', () => {
    const first = advanceTurn(launched()).career;
    const final = advanceTurn({ ...first, report: null, pendingEvent: null, newspaperPending: false }).career;
    expect(final.date).toBe('2028-01-01');
    expect(final.campaign).toBeNull();
    expect(final.elections).toHaveLength(1);
    expect(final.elections[0]?.date).toBe('2027-11-01');
    expect(final.elections[0]?.rows.length).toBe(3);
    const votes = final.elections[0]?.rows.reduce((sum, r) => sum + r.pct, 0) ?? 0;
    expect(votes).toBeCloseTo(100, 0);
    expect(final.publicOffice).toBe(final.elections[0]?.won);
    expect(final.news[0]?.stories.some(s => s.tag === 'election')).toBe(true);
    expect(advanceTurn({ ...final, report: null, pendingEvent: null, newspaperPending: false }).career.elections).toEqual(final.elections);
  });
  it('advances a winning primary into a persisted general campaign', () => {
    const base = { ...eligible(), date: '2028-04-01', character: { ...eligible().character, party: 'Democrat' as const } };
    const launch = launchCampaign(base, 'stateLeg', 'Better schools', 'policy');
    if (!launch.ok || !launch.career.campaign) throw new Error('Launch failed');
    const c = { ...launch.career, campaign: { ...launch.career.campaign, support: 10000 } };
    const next = advanceTurn(c).career;
    expect(next.elections[0]?.stage).toBe('primary');
    expect(next.elections[0]?.won).toBe(true);
    expect(next.campaign?.phase).toBe('general');
    expect(next.campaign?.opponents.filter(o => o.primary).every(o => o.out)).toBe(true);
    // Primary points (10000) never become the general-election score.
    expect(next.campaign?.support).toBe(generalBaselineSupport(next, next.campaign!));
    expect(next.campaign!.support).toBeLessThanOrEqual(25);
    expect(next.campaign!.momentum).toBeGreaterThan(0);
    expect(parseCareer(JSON.stringify(next))?.campaign).toEqual(next.campaign);
  });
  it('records presidential Electoral College totals and the elected office without a job salary', () => {
    const base = { ...eligible(), date: '2028-07-01', age: 40, experience: 300, reputation: 90, contacts: 500, office: { id: 'governor', title: 'Governor', jurisdiction: 'California', since: '2026-01-01', party: 'Democrat' as const, elected: '2025-11-01', termEnd: '2030-01-01', margin: 4 } };
    const resigned = resignOffice(base);
    if (!resigned.ok) throw new Error(resigned.message);
    const launch = launchCampaign(resigned.career, 'president', 'One nation', 'grassroots');
    if (!launch.ok || !launch.career.campaign) throw new Error('Launch failed');
    const c = { ...launch.career, campaign: { ...launch.career.campaign, support: 10000 } };
    const first = advanceTurn(c).career;
    const ready = { ...first, report: null, pendingEvent: null, newspaperPending: false };
    const debateId = ready.debate?.id;
    if (!debateId) throw new Error('Presidential debate missing');
    const skipped = respondDebate(ready, debateId, 0, 'skip');
    if (!skipped.ok) throw new Error(skipped.message);
    const final = advanceTurn(dismissDebate(skipped.career, debateId)).career;
    expect(final.elections[0]?.ec?.reduce((sum, r) => sum + r.ev, 0)).toBe(538);
    expect(final.elections[0]?.won).toBe(true);
    expect(final.office?.id).toBe('president');
    expect(final.job).toBeNull();
    // Resigned before campaigning; no governor salary is paid.
    expect(final.money).toBe(5000);
    expect(final.officePayHistory).toHaveLength(0);
    expect(final.officePayHistory.every(p => p.officeId === 'governor')).toBe(true);
    expect(final.ledger.some(e => e.label.startsWith('Salary ·'))).toBe(false);
  });
});