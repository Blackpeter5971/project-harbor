import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { advanceTurn } from '@/lib/game/gameplay';
import { launchCampaign } from '@/lib/game/campaign';
import { supportGroupsOf } from '@/lib/game/support-groups';
import { answerTownHall, hostTownHall, townHallCost, townHallEffects, townHallQuarter } from '@/lib/game/town-halls';

function fixture(over: Partial<Career> = {}): Career {
  const c = { ...createCareer({ ...defaultDraft, name: 'Hall Player' }), date: '2027-07-01', experience: 150, reputation: 50, skills: { communication: 0, knowledge: 40, leadership: 40 }, ...over };
  const r = launchCampaign(c, 'mayor', 'Listen first', 'policy');
  if (!r.ok || !r.career.campaign) throw new Error(r.ok ? 'no campaign' : r.message);
  return { ...r.career, campaign: { ...r.career.campaign, funds: 100000 } };
}
const reload = (c: Career) => { const n = parseCareer(JSON.stringify(c)); if (!n) throw new Error('Invalid save'); return n; };
const hosted = (c = fixture()) => { const r = hostTownHall(c); if (!r.ok) throw new Error(r.message); return r.career; };

describe('Town halls', () => {
  it('costs 1 action and a quarter of the event price, and asks 3 questions', () => {
    const c = fixture();
    const n = hosted(c);
    expect(n.actions).toBe(c.actions - 15);
    expect(townHallCost(c.campaign!)).toBe(2500);
    expect(n.campaign?.funds).toBe(c.campaign!.funds - 2500);
    expect(n.campaign?.townHall?.questions).toHaveLength(3);
    expect(n.campaign?.townHall?.status).toBe('live');
  });

  it('allows only one town hall per quarter, even after a reload', () => {
    let c = hosted();
    for (const [i, kind] of (['populist', 'fiscal', 'reformist'] as const).entries()) {
      const r = answerTownHall(c, c.campaign!.townHall!.id, i, kind); if (!r.ok) throw new Error(r.message); c = r.career;
    }
    expect(hostTownHall(reload(c)).ok).toBe(false);
    expect(townHallQuarter('2027-07-01')).toBe('2027-Q3');
  });

  it('populist answers raise labor and youth loyalty and lower business loyalty', () => {
    const c = hosted();
    const before = supportGroupsOf(c).loyalty;
    const r = answerTownHall(c, c.campaign!.townHall!.id, 0, 'populist');
    if (!r.ok) throw new Error(r.message);
    const after = supportGroupsOf(r.career).loyalty;
    expect(after['labor']! - before['labor']!).toBeGreaterThanOrEqual(3);
    expect(after['youth']! - before['youth']!).toBeGreaterThanOrEqual(2);
    expect(after['business']! - before['business']!).toBeLessThanOrEqual(-3);
    expect(r.career.campaign!.momentum).toBe(c.campaign!.momentum + 1.5);
  });

  it('fiscal answers raise business and rural loyalty and lower labor loyalty', () => {
    const c = hosted();
    const fx = townHallEffects(c, 'taxes', 'fiscal');
    expect(fx.deltas.business).toBe(3);
    expect(fx.deltas.rural).toBe(2);
    expect(fx.deltas.labor).toBe(-3);
  });

  it('reformist answers never lower any group and add independent appeal', () => {
    const fx = townHallEffects(fixture(), 'economy', 'reformist');
    expect(Object.values(fx.deltas).every(d => (d ?? 0) >= 0)).toBe(true);
    expect(fx.support).toBe(1);
  });

  it('rejects replayed or out-of-order answers, including after a reload', () => {
    const c = hosted(); const id = c.campaign!.townHall!.id;
    const r = answerTownHall(c, id, 0, 'fiscal');
    if (!r.ok) throw new Error(r.message);
    expect(answerTownHall(r.career, id, 0, 'fiscal').ok).toBe(false);
    expect(answerTownHall(reload(r.career), id, 0, 'populist').ok).toBe(false);
    expect(answerTownHall(r.career, id, 2, 'fiscal').ok).toBe(false);
  });

  it('completing awards support, refreshes a 100% poll and queues one news story', () => {
    let c = hosted(); const id = c.campaign!.townHall!.id; const support = c.campaign!.support; const news = c.newsQueue.length;
    for (let i = 0; i < 3; i++) { const r = answerTownHall(reload(c), id, i, 'reformist'); if (!r.ok) throw new Error(r.message); c = r.career; }
    expect(c.campaign!.townHall!.status).toBe('completed');
    expect(c.campaign!.support).toBeGreaterThan(support);
    expect(Object.values(c.campaign!.polls.at(-1)!.shares).reduce((a, b) => a + b, 0)).toBe(100);
    expect(c.newsQueue.length).toBe(news + 1);
    expect(answerTownHall(c, id, 3, 'reformist').ok).toBe(false);
  });

  it('can be hosted again in the next quarter', () => {
    let c = hosted();
    for (let i = 0; i < 3; i++) { const r = answerTownHall(c, c.campaign!.townHall!.id, i, 'populist'); if (!r.ok) throw new Error(r.message); c = r.career; }
    const next = advanceTurn(c).career;
    if (!next.campaign) return; // election may have ended the race
    expect(townHallQuarter(next.date)).not.toBe(townHallQuarter(c.date));
    expect(hostTownHall({ ...next, debate: null, report: null, newspaperPending: false, campaign: { ...next.campaign, funds: 100000 } }).ok).toBe(true);
  });

  it('asks about the voting record when the candidate held office', () => {
    const c = hosted({ ...fixture(), office: { id: 'council', title: 'City Council Member', jurisdiction: 'Ward 1', since: '2025-01-01', party: 'Democrat', elected: '2024-11-01', termEnd: '2029-01-01', margin: 5 } });
    expect(c.campaign!.townHall!.questions[0]!.id).toBe('record');
  });

  it('loads older campaigns without town-hall fields', () => {
    const c = fixture();
    const { townHall: _t, townHallQuarters: _q, ...legacy } = c.campaign!;
    const loaded = reload({ ...c, campaign: legacy as typeof c.campaign });
    expect(hostTownHall(loaded).ok).toBe(true);
  });
});
