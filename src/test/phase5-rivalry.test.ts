import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { campaignAction, campaignTurn, independentStateFactor, scores, stateProjections, STATE_SWING_CAP, type Campaign, type Cand } from '@/lib/game/campaign';
import { scandalSchema } from '@/lib/game/scandal-schema';
import { recordPledge } from '@/lib/game/support-groups';
import { debateQuestionText, respondDebate, SCANDAL_QUESTION, TAX_QUESTION, PLEDGE_QUESTION } from '@/lib/game/debates';
import { townHallEffects, townHallQuestions } from '@/lib/game/town-halls';
import { rivalFeedItems } from '@/lib/game/rival-feed';
import { RIVAL_DAMAGE_CAP } from '@/lib/game/rival-pressure';
import type { Debate } from '@/lib/game/debate-schema';

const ME = 'Alex Morgan';
const cand = (name: string, party: Cand['party'], over: Partial<Cand> = {}): Cand => ({ name, party, bio: 'Senator', policy: 'Lower taxes', trait: 'money', quality: 10, funds: 1e7, raised: 1e7, spent: 0, staff: 10, volunteers: 100, support: 20, momentum: 0, primary: false, out: false, ...over });
function race(party: Career['character']['party'], opponents: Cand[], over: Partial<Campaign> = {}): Career {
  const base = { ...createCareer({ ...defaultDraft, name: ME, party }), date: '2028-07-01', actions: 75 };
  const camp: Campaign = { office: 'president', title: 'President of the United States', jurisdiction: 'United States · Electoral College', party, electionDate: '2028-11-01', primaryDate: null, startDate: '2028-01-01', phase: 'general', slogan: 's', strategy: 'grassroots', manager: null, funds: 5e7, raised: 0, spent: 0, donors: 0, staff: 10, volunteers: 100, support: 20, momentum: 0, opponents, polls: [], txns: [], endorsements: [], headlines: [], attack: null, allegation: null, turnActs: [], lastProcessedEnd: '2028-07-01', ...over };
  return { ...base, campaign: camp };
}
/** Pin each candidate's national score so only the Electoral College rules differ. */
function pin(c: Career, target: Record<string, number>): Career {
  const camp = c.campaign!, s = scores(c, camp);
  return { ...c, campaign: { ...camp, adScoreOffsets: Object.fromEntries(Object.entries(target).map(([n, v]) => [n, v - (s[n] ?? 0)])) } };
}
const strongDebate = (camp: Campaign): Debate => ({ id: `${camp.office}|${camp.startDate}|${camp.electionDate}`, date: '2028-07-01', office: camp.office, title: camp.title, electionDate: camp.electionDate, status: 'completed', opponents: [], round: 4, answers: [], score: 8, transcript: [], supportDelta: 0, approvalDelta: 0, outcome: '' });
const scandal = (severity: 'Minor' | 'Moderate' | 'Severe' = 'Severe') => scandalSchema.parse({ id: 'probe-1', tenure: '', date: '2028-01-01', subject: ME, allegation: 'Kickbacks', status: 'proven', title: 'Kickback probe', severity });
const taxTxn = { id: 'tax|2028-01-01', date: '2028-01-01', amount: 5000, kind: 'tax_evasion' as const, source: 'Undeclared income', destination: 'personal' as const, favor: '', risk: 'High' as const, evidence: 10 };
const withTax = (c: Career): Career => ({ ...c, corruption: { reserve: 0, exposure: 10, txns: [taxTxn], bribeTurn: '', darkMoneyTurn: '', lastTurn: '', lastAudit: '', launderTurn: '', influenceTurn: '', embezzleTurn: '', whistled: [] } });

describe('Independent presidential structural resistance', () => {
  it('partisan states resist Independents; only funding, battleground appeal and debates narrow it', () => {
    const c = race('Independent', [cand('Rita Vance', 'Republican')]), camp = c.campaign!;
    expect(independentStateFactor(c, camp, 'Wyoming', -25, false)).toBeCloseTo(0.45, 5);
    expect(independentStateFactor(c, camp, 'Pennsylvania', -2, true)).toBeCloseTo(0.772, 5);
    const boosted = { ...c, debateHistory: [strongDebate(camp)] };
    const full = { ...camp, raised: 24_000_000, stateSwing: { Pennsylvania: STATE_SWING_CAP } };
    expect(independentStateFactor(boosted, full, 'Pennsylvania', -2, true)).toBeCloseTo(0.772 + 0.23 * 0.95, 5);
    expect(independentStateFactor(boosted, full, 'Wyoming', -25, true)).toBeCloseTo(0.45 + 0.15 * 0.375, 5);
  });

  it('a 40% national score edge no longer sweeps 500+ electoral votes', () => {
    const ind = pin(race('Independent', [cand('Rita Vance', 'Republican')]), { [ME]: 70, 'Rita Vance': 50 });
    const p = stateProjections(ind, ind.campaign!);
    expect(p.myEv).toBeLessThan(400);
    expect(p.rows.find(r => r.state === 'Wyoming')?.leader).toBe('Rita Vance');
    expect(p.rows.find(r => r.state === 'Texas')?.leader).toBe('Rita Vance');
    const dem = pin(race('Democrat', [cand('Rita Vance', 'Republican')]), { [ME]: 70, 'Rita Vance': 50 });
    expect(stateProjections(dem, dem.campaign!).myEv).toBeGreaterThan(p.myEv);
  });

  it('in a three-way race only exceptional funding, swing pushes and a debate win carry battlegrounds', () => {
    const field = [cand('Rita Vance', 'Republican'), cand('Dana Cole', 'Democrat')];
    const plain = pin(race('Independent', field), { [ME]: 60, 'Rita Vance': 50, 'Dana Cole': 50 });
    const plainEv = stateProjections(plain, plain.campaign!);
    expect(plainEv.rows.find(r => r.state === 'Pennsylvania')?.leader).not.toBe(ME);
    const camp = plain.campaign!;
    const swing = { Pennsylvania: STATE_SWING_CAP, Michigan: STATE_SWING_CAP, Wisconsin: STATE_SWING_CAP, Georgia: STATE_SWING_CAP, Arizona: STATE_SWING_CAP };
    const pushed = { ...plain, debateHistory: [strongDebate(camp)], campaign: { ...camp, raised: 24_000_000, stateSwing: swing } };
    const pushedEv = stateProjections(pushed, pushed.campaign);
    expect(pushedEv.rows.find(r => r.state === 'Pennsylvania')?.leader).toBe(ME);
    expect(pushedEv.myEv).toBeGreaterThan(plainEv.myEv);
    expect(pushedEv.rows.find(r => r.state === 'California')?.leader).toBe('Dana Cole');
    expect(pushedEv.rows.find(r => r.state === 'Wyoming')?.leader).toBe('Rita Vance');
  });
});

describe('Aggressive rivals', () => {
  const leading = (c: Career): Career => ({ ...c, campaign: { ...c.campaign!, polls: [{ date: '2028-07-01', shares: { [ME]: 52, 'Rita Vance': 30, Undecided: 18 } }] } });

  it('a frontrunner draws attack ads plus a one-time opposition-research leak on the worst weak spot', () => {
    const c = leading({ ...race('Democrat', [cand('Rita Vance', 'Republican')]), scandals: [scandal('Severe')] });
    const t = campaignTurn(c, '2028-07-01', '2028-10-01');
    const camp = t.career.campaign!;
    expect(camp.attack).toBe('Rita Vance');
    // Attack ad on a 22-point lead: 1 + 3 = 4; Severe proven scandal leak: 1.5 × 4 = 6.
    expect(camp.rivalPressure?.damage).toBe(10);
    expect(camp.rivalPressure?.leaked).toEqual(['scandal|probe-1']);
    expect(t.stories.some(s => s.h.startsWith('Opposition research'))).toBe(true);
    expect(scores(t.career, camp)[ME]).toBeCloseTo(scores(t.career, { ...camp, rivalPressure: undefined })[ME]! - 10, 5);
    expect(rivalFeedItems(t.career).find(p => p.author === 'Rita Vance')?.text).toContain('Kickback probe');
  });

  it('never leaks the same weak spot twice and caps total rival damage', () => {
    const c = leading(withTax({ ...race('Democrat', [cand('Rita Vance', 'Republican')], { electionDate: '2032-11-01' }), scandals: [scandal('Moderate')] }));
    const first = campaignTurn(c, '2028-07-01', '2028-10-01').career;
    expect(first.campaign?.rivalPressure?.damage).toBe(8.5);
    const again = leading({ ...first, date: '2028-10-01' });
    const second = campaignTurn(again, '2028-10-01', '2029-01-01').career.campaign!;
    expect(second.rivalPressure?.leaked).toEqual(['scandal|probe-1', 'tax-evasion|tax|2028-01-01']);
    expect(second.rivalPressure?.damage).toBe(RIVAL_DAMAGE_CAP);
  });

  it('rebutting the attack from Campaign HQ removes 40% of the damage', () => {
    const c = leading({ ...race('Democrat', [cand('Rita Vance', 'Republican')]), scandals: [scandal('Severe')] });
    const hit = { ...campaignTurn(c, '2028-07-01', '2028-10-01').career, actions: 75 };
    const r = campaignAction(hit, 'respond'); if (!r.ok) throw new Error(r.message);
    expect(r.career.campaign?.rivalPressure?.damage).toBe(6);
  });

  it('debate rebuttals target scandals, then hidden taxes, and the follow-up counters pledges', () => {
    const base = race('Democrat', [cand('Rita Vance', 'Republican')]);
    expect(debateQuestionText({ ...base, scandals: [scandal()] }, 1)).toBe(SCANDAL_QUESTION('Kickback probe'));
    expect(debateQuestionText(withTax(base), 1)).toBe(TAX_QUESTION);
    const pledged = recordPledge(base, 'labor');
    expect(debateQuestionText(pledged, 2)).toBe(PLEDGE_QUESTION(['labor unions']));
    const camp = pledged.campaign!;
    const live: Debate = { ...strongDebate(camp), status: 'live', round: 2, score: 0 };
    const vague = respondDebate({ ...pledged, debate: live }, live.id, 2, 'review');
    const firm = respondDebate({ ...pledged, debate: live }, live.id, 2, 'tradeoff');
    if (!vague.ok || !firm.ok) throw new Error('Debate answer rejected');
    expect(vague.career.debate?.score).toBe(0);
    expect(firm.career.debate?.score).toBe(2);
  });

  it('town halls plant rival questions whose weak answers cost momentum', () => {
    const c = recordPledge({ ...race('Democrat', [cand('Rita Vance', 'Republican')]), scandals: [scandal()] }, 'labor');
    expect(townHallQuestions(c, 'seed').slice(0, 2).map(q => q.id)).toEqual(['scandal', 'pledge-counter']);
    expect(townHallEffects(c, 'scandal', 'populist').momentum).toBe(0);
    expect(townHallEffects(c, 'scandal', 'reformist').momentum).toBe(0.5);
    expect(townHallEffects(c, 'pledge-counter', 'populist').momentum).toBe(0.5);
  });
});
