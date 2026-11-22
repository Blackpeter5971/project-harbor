import { describe, it, expect } from 'vitest';
import { MAX_ENERGY } from '@/lib/game/energy-costs';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { claimAchievement, missionOffer, acceptMission, declineMission, claimMission, activeMission, useCoinDecision, coinDecisionAvailable, bountyFor } from '@/lib/game/rewards';

const base = (): Career => createCareer({ ...defaultDraft, name: 'Ada' }, () => 0);

describe('rewards', () => {
  it('achievement pays its bounty once', () => {
    const b = base(); const c = { ...b, life: { ...b.life!, social: { ...b.life!.social!, maritalStatus: 'married' } } } as Career;
    const r = claimAchievement(c, 'married');
    expect(r.ok && r.coins).toBe(10);
    if (!r.ok) return;
    expect(r.career.money).toBe(c.money + 5_000);
    expect(claimAchievement(r.career, 'married').ok).toBe(false);
    expect(bountyFor('president').coins).toBe(100);
  });
  it('locked achievement cannot be claimed', () => { expect(claimAchievement(base(), 'president').ok).toBe(false); });
  const firstOffer = (c: Career) => { for (let y = 2026; y < 2080; y++) { const d = { ...c, date: `${y}-01-01` }; const o = missionOffer(d); if (o) return { c: d, o }; } throw new Error('no offer'); };
  it('mission coins stay between 5 and 100', () => {
    for (let y = 2026; y < 2080; y++) { const o = missionOffer({ ...base(), date: `${y}-01-01` }); if (o) { expect(o.coins).toBeGreaterThanOrEqual(5); expect(o.coins).toBeLessThanOrEqual(100); } }
  });
  it('missions arrive randomly: some years have none', () => {
    const years = Array.from({ length: 40 }, (_, i) => missionOffer({ ...base(), date: `${2026 + i}-01-01` }));
    expect(years.some(o => o === null)).toBe(true);
    expect(years.some(o => o !== null)).toBe(true);
  });
  it('a new citizen never gets office-only missions like Master the Brief', () => {
    for (let y = 2026; y < 2080; y++) { const o = missionOffer({ ...base(), date: `${y}-01-01` }); if (o) { expect(['Master the Brief', 'Legislative Push', 'Executive Initiative', 'Public Approval']).not.toContain(o.title); expect(o.difficulty).toBe('routine'); } }
  });
  it('leaving a mission closes that year', () => {
    const { c } = firstOffer(base());
    const d = declineMission(c); expect(d.ok).toBe(true); if (!d.ok) return;
    expect(missionOffer(d.career)).toBeNull();
  });
  it('accepted mission pays when target met and expires after two years', () => {
    const { c } = firstOffer(base());
    const a = acceptMission(c); if (!a.ok) throw 0;
    const m = activeMission(a.career)!;
    expect(claimMission(a.career).ok).toBe(false);
    const done = { ...a.career, [m.metric]: (a.career as Record<string, unknown>)[m.metric] as number + m.target * 100 } as Career;
    if (['reputation', 'relationships', 'experience'].includes(m.metric)) { const r = claimMission(done); expect(r.ok && r.coins).toBe(m.coins); }
    const y = Number(c.date.slice(0, 4));
    expect(activeMission({ ...a.career, date: `${y + 1}-06-01` })).not.toBeNull();
    expect(activeMission({ ...a.career, date: `${y + 2}-01-01` })).toBeNull();
  });
  it('debt bailout needs negative cash and 30 coins', () => {
    const c = { ...base(), money: -500 };
    expect(useCoinDecision(c, 'bailout', 10).ok).toBe(false);
    const r = useCoinDecision(c, 'bailout', 30); expect(r.ok && r.coins).toBe(-30);
    if (r.ok) expect(r.career.money).toBe(0);
    expect(useCoinDecision(base(), 'bailout', 100).ok).toBe(false);
  });
});

describe('mission skill rewards', () => {
  it('a leadership mission adds to the leadership skill on claim', () => {
    const c = base();
    const m = { id: 'mx', cycle: 0, title: 'T', detail: 'd', metric: 'reputation' as const, baseline: c.reputation, target: 1, difficulty: 'routine' as const, coins: 5, cash: 0, attribute: { key: 'leadership' as const, amount: 10 }, status: 'active' as const };
    const done = { ...c, reputation: c.reputation + 5, rewards: { claimed: [], mission: m, declinedCycles: [], completedMissions: [] } } as Career;
    const r = claimMission(done); if (!r.ok) throw new Error(r.message);
    expect(r.career.skills.leadership).toBe(c.skills.leadership + 10);
  });
});

describe('situational coin decisions', () => {
  const opp = (name: string, support: number) => ({ name, party: 'Republican' as const, bio: '', policy: '', trait: 'money' as const, quality: 10, funds: 0, raised: 0, spent: 0, staff: 0, volunteers: 0, support, momentum: 0, primary: false, out: false });
  const withCampaign = (me: number, rival: number): Career => { const c = base(); return { ...c, campaign: { office: 'mayor', title: 'Mayor', jurisdiction: 'X', party: 'Democrat', electionDate: '2030-11-01', primaryDate: null, startDate: c.date, phase: 'general', slogan: '', strategy: 'grassroots', manager: null, funds: 0, raised: 0, spent: 0, donors: 0, staff: 0, volunteers: 0, support: 10, momentum: 0, opponents: [opp('Rival', 20)], polls: [{ date: c.date, shares: { [c.character.name]: me, Rival: rival } }], txns: [], endorsements: [], headlines: [], attack: null, allegation: null, turnActs: [], lastProcessedEnd: '' } } as Career; };
  const withCase = (): Career => { const c = base(); return { ...c, legal: { cases: [{ id: 'k1', opened: c.date, stage: 'formal', strength: 50, counsel: 'none', defense: 0, role: 'citizen', stageSince: c.date, delays: 0, contestTurn: '', closed: null, history: [], trial: null }], lastTurn: '', adjudicated: '', owed: 0, prison: null, executed: '', served: [] } } as Career; };

  it('legal defense needs an open case and 50 coins, then dismisses it', () => {
    expect(useCoinDecision(base(), 'legal-defense', 100).ok).toBe(false);
    expect(useCoinDecision(withCase(), 'legal-defense', 49).ok).toBe(false);
    const r = useCoinDecision(withCase(), 'legal-defense', 50); if (!r.ok) throw new Error(r.message);
    expect(r.coins).toBe(-50);
    expect(r.career.legal!.cases[0]!.stage).toBe('dismissed');
    expect(coinDecisionAvailable(r.career, 'legal-defense')).not.toBeNull();
  });
  it('recount only within 5 points: +5 support, +15 momentum for 40 coins', () => {
    expect(coinDecisionAvailable(base(), 'election-recount')).not.toBeNull();
    expect(coinDecisionAvailable(withCampaign(50, 40), 'election-recount')).not.toBeNull();
    expect(useCoinDecision(withCampaign(40, 44), 'election-recount', 39).ok).toBe(false);
    const r = useCoinDecision(withCampaign(40, 44), 'election-recount', 40); if (!r.ok) throw new Error(r.message);
    expect(r.coins).toBe(-40); expect(r.career.campaign!.support).toBe(15); expect(r.career.campaign!.momentum).toBe(15);
  });
  it('oppo dossier needs rivals and cuts the leading rival by 6', () => {
    expect(coinDecisionAvailable(base(), 'oppo-leak')).not.toBeNull();
    const r = useCoinDecision(withCampaign(50, 30), 'oppo-leak', 35); if (!r.ok) throw new Error(r.message);
    expect(r.coins).toBe(-35); expect(r.career.campaign!.opponents[0]!.support).toBe(14);
  });
  it('executive coaching adds 15 to each skill and 10 experience', () => {
    const c = base(); expect(useCoinDecision(c, 'executive-coaching', 24).ok).toBe(false);
    const r = useCoinDecision(c, 'executive-coaching', 25); if (!r.ok) throw new Error(r.message);
    expect(r.career.skills.leadership).toBe(c.skills.leadership + 15); expect(r.career.skills.knowledge).toBe(c.skills.knowledge + 15);
    expect(r.career.skills.communication).toBe(c.skills.communication + 15); expect(r.career.experience).toBe(c.experience + 10);
  });
  it('vitality injection refills energy and cuts stress by 25 only when energy is not full', () => {
    const c = base(); expect(coinDecisionAvailable({ ...c, actions: MAX_ENERGY }, 'vitality-injection')).not.toBeNull();
    const tired = { ...c, actions: 10, life: { ...c.life!, stress: 60 } } as Career;
    const r = useCoinDecision(tired, 'vitality-injection', 15); if (!r.ok) throw new Error(r.message);
    expect(r.coins).toBe(-15); expect(r.career.actions).toBe(MAX_ENERGY); expect(r.career.life!.stress).toBe(35);
  });
});
