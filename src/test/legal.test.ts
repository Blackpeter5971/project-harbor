import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { corruptionSchema } from '@/lib/game/corruption-schema';
import { activeCase, contestEvidence, hireCounsel, legalOf, legalTurn } from '@/lib/game/legal';

const base = (exposure: number, money = 100_000): Career => ({ ...createCareer({ ...defaultDraft, name: 'Ada' }, () => 0), money, corruption: corruptionSchema.parse({ exposure }) });
const ends = ['2026-04-01', '2026-07-01', '2026-10-01', '2027-01-01', '2027-04-01', '2027-07-01'];
const run = (c: Career, n = ends.length) => ends.slice(0, n).reduce((x, e) => legalTurn(x, e).career, c);
const ok = (r: ReturnType<typeof hireCounsel>) => { if (!r.ok) throw new Error(r.message); return r.career; };

describe('Phase 6A legal investigations', () => {
  it('evidence below the threshold never opens a case', () => {
    expect(activeCase(run(base(40)))).toBeNull();
  });
  it('a weak inquiry is dropped once defense outweighs the evidence', () => {
    let c = run(base(60), 1);
    expect(activeCase(c)?.stage).toBe('inquiry');
    c = ok(hireCounsel(c, 'elite'));
    c = legalTurn(legalTurn(legalTurn(c, ends[1]!).career, ends[2]!).career, ends[3]!).career;
    expect(legalOf(c).cases[0]?.stage).toBe('dismissed');
  });
  it('heavy evidence advances through every stage to indictment', () => {
    const c = run(base(95), 4);
    expect(legalOf(c).cases[0]?.stage).toBe('indicted');
    expect(legalOf(c).cases[0]?.trial?.courtDate).toMatch(/^2027-0[47]-01$/);
  });
  it('legal fees come only from personal funds', () => {
    const c = run(base(95), 1), n = ok(contestEvidence(ok(hireCounsel(c, 'firm'))));
    expect(c.money - n.money).toBe(25_000);
    expect(n.ledger.slice(0, 2).every(e => e.label.startsWith('Legal fees'))).toBe(true);
    expect(n.campaign).toEqual(c.campaign); expect(n.treasury).toEqual(c.treasury); expect(n.businesses).toEqual(c.businesses); expect(n.corruption).toEqual(c.corruption);
  });
  it('a processed quarter never replays after reload', () => {
    const c = run(base(95), 2), saved = parseCareer(JSON.stringify(c))!;
    expect(legalTurn(saved, ends[1]!).career).toEqual(saved);
  });
});
