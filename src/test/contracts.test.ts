import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { ensureTreasury } from '@/lib/game/budget';
import { approveProject, publicProjects, publicProjectsTurn, CONTRACT_COST_RATIO } from '@/lib/game/public-projects';
import { startBusiness } from '@/lib/game/business';
import { awardContract, SELF_DEALING_EVIDENCE } from '@/lib/game/contracts';
import { corruptionOf, corruptionTurn } from '@/lib/game/corruption';

const ok = (r: { ok: boolean; message: string; career?: Career }) => { if (!r.ok || !r.career) throw new Error(r.message); return r.career; };
const setup = () => {
  const c = ensureTreasury({ ...createCareer({ ...defaultDraft, name: 'Alex Morgan' }), date: '2028-04-01', money: 100_000, actions: 90, publicOffice: true, office: { id: 'mayor', title: 'Mayor', jurisdiction: 'Test', since: '2028-01-01', party: 'Independent', elected: '2027-11-01', termEnd: '2032-01-01', margin: 10 } });
  return ok(approveProject(ok(startBusiness(c, 'local-retail')), 'transportation'));
};
const pid = (c: Career) => publicProjects(c)[0]!.id;

describe('Phase 5B government contracts', () => {
  it('a milestone debits treasury and credits the owned business, never personal cash', () => {
    const c = ok(awardContract(setup(), pid(setup()), 'direct', setup().businesses[0]!.id));
    const n = publicProjectsTurn(c, c.date, '2028-07-01');
    expect(c.treasury!.balance - n.treasury!.balance).toBe(320_000);
    expect(n.businesses[0]!.account - c.businesses[0]!.account).toBe(320_000 - Math.round(320_000 * CONTRACT_COST_RATIO));
    expect(n.businesses[0]?.operatingCash).toBe(n.businesses[0]?.account);
    expect(n.businesses[0]?.retainedEarnings).toBe(48_000);
    expect(n.money).toBe(c.money); expect(n.ledger).toEqual(c.ledger);
    expect(publicProjects(n)[0]!.contract!.paid).toBe(320_000);
    const saved = parseCareer(JSON.stringify(n))!;
    expect(publicProjectsTurn(saved, c.date, '2028-07-01')).toEqual(saved);
  });
  it('direct self-award records self-dealing evidence and exposure', () => {
    const s = setup(), c = ok(awardContract(s, pid(s), 'direct', s.businesses[0]!.id));
    const k = corruptionOf(c);
    expect(k.txns[0]).toMatchObject({ kind: 'self_dealing', destination: 'business' });
    expect(k.exposure).toBe(SELF_DEALING_EVIDENCE);
    expect(k.reserve).toBe(0); expect(c.money).toBe(s.money);
  });
  it('an open tender with an owned bidder is a disclosed conflict, not corruption', () => {
    const s = setup(), c = ok(awardContract(s, pid(s), 'open_tender', s.businesses[0]!.id));
    expect(publicProjects(c)[0]!.contract).toMatchObject({ method: 'open_tender', selfDealing: false, conflict: true });
    expect(corruptionOf(c).exposure).toBe(0);
  });
  it('a contract can only be awarded once', () => {
    const s = setup(), c = ok(awardContract(s, pid(s), 'open_tender', null));
    expect(awardContract(c, pid(c), 'direct', c.businesses[0]!.id).ok).toBe(false);
  });
  it('a whistleblower can report a self-dealing award, only once', () => {
    const s = setup(), c = ok(awardContract(s, pid(s), 'direct', s.businesses[0]!.id));
    let n = c, found = 0;
    for (const end of ['2028-07-01', '2028-10-01', '2029-01-01', '2029-04-01', '2029-07-01', '2029-10-01', '2030-01-01', '2030-04-01']) n = corruptionTurn(n, end, 1).career;
    found = n.scandals.filter(x => x.id.startsWith('corruption|whistle|')).length;
    expect(found).toBe(1);
  });
});
