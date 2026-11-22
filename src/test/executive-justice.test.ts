import { describe, expect, it } from 'vitest';
import { resolveDocket, ensureExecutiveDocket } from '@/lib/game/executive-docket';
import { ensureTreasury } from '@/lib/game/budget';
import { resolveTrial, chooseStrategy, grandCorruption, MAX_STATUTORY_QUARTERS } from '@/lib/game/court';
import { hireCounsel, contestEvidence } from '@/lib/game/legal';
import { legalCaseSchema } from '@/lib/game/legal-schema';
import { executive } from './executive-docket.test';
import type { Career } from '@/lib/game/career';

const act = (c: Career, choice: string) => { const d = c.executiveDocket!; const r = resolveDocket(c, { docketId: d.id, revision: d.revision, slot: 'policy', choice }); if (!r.ok) throw new Error(r.message); return r.career; };
const tried = (id: string, choice: 'siphon' | 'steer') => {
  const c = act(ensureTreasury(executive(id, '2028-07-01')), choice);
  const k = legalCaseSchema.parse({ id: 'case|t', opened: c.date, stage: 'indicted', strength: 30, defense: 90, role: 'official', stageSince: c.date, trial: { courtDate: c.date, tier: 'felony', charges: ['x'], strategy: 'plea', verdict: null } });
  return { c, k, r: resolveTrial({ ...c, money: 50_000, legal: { cases: [k], lastTurn: '', adjudicated: '', owed: 0, prison: null } as never }, k, '2028-10-01', '') };
};

describe('Cabinet nominations', () => {
  it('Slot 2 presents a named nominee for confirmation', () => {
    const item = executive('governor', '2028-04-01').executiveDocket!.items[1];
    expect(item.kind).toBe('appointments');
    expect(item.title).toMatch(/^Nomination: .+ as /);
  });
  it('a rejected post resets to a new nominee next cycle', () => {
    const c = executive('governor', '2028-04-01');
    const role = c.executiveDocket!.items[1].reference!;
    const withReject: Career = { ...c, date: '2028-07-01', executiveDocket: { ...c.executiveDocket!, renominate: [role] } };
    const item = ensureExecutiveDocket(withReject).executiveDocket!.items[1];
    expect(item.kind).toBe('appointments');
    expect(item.title).toMatch(/^Re-nomination/);
    expect(item.reference).not.toBe(role);
  });
});

describe('Grand corruption sentencing', () => {
  it('detects siphoned and steered public funds', () => {
    expect(grandCorruption(tried('governor', 'siphon').c)).toBe('siphon');
    expect(grandCorruption(tried('governor', 'steer').c)).toBe('steer');
  });
  it('siphoning: certain conviction despite strong defense, removal, forfeiture, life', () => {
    const { r } = tried('governor', 'siphon'), v = r.case.trial!.verdict!;
    expect(v.removed).toBe(true);
    expect(v.life).toBe(true);
    expect(r.career.office).toBeNull();
    expect(r.career.money).toBe(0);
  });
  it('a president who siphons federal funds faces capital treason', () => {
    expect(tried('president', 'siphon').r.case.trial!.verdict!.death).toBe(true);
  });
  it('steering: maximum statutory sentence and removal', () => {
    const v = tried('mayor', 'steer').r.case.trial!.verdict!;
    expect(v.sentence).toBe(MAX_STATUTORY_QUARTERS);
    expect(v.removed).toBe(true);
  });
  it('lawyers cannot buy delays, contest evidence or political dismissal', () => {
    const { c, k } = tried('governor', 'siphon');
    const open = { ...c, money: 1e6, legal: { cases: [{ ...k, stage: 'formal' as const, trial: null, counsel: 'public' as const, defense: 0 }], lastTurn: '', adjudicated: '', owed: 0, prison: null } } as Career;
    const hired = hireCounsel(open, 'elite');
    if (!hired.ok) throw new Error(hired.message);
    expect(hired.career.legal!.cases[0]!.delays).toBe(0);
    expect(hired.career.legal!.cases[0]!.defense).toBe(0);
    expect(contestEvidence(open).ok).toBe(false);
    const indicted = { ...open, legal: { ...open.legal!, cases: [{ ...k, trial: { ...k.trial!, strategy: null } }] } } as Career;
    expect(chooseStrategy(indicted, indicted.legal!.cases[0]!, 'political').ok).toBe(false);
  });
});
