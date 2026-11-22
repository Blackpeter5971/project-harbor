import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { corruptionSchema } from '@/lib/game/corruption-schema';
import { legalCaseSchema, legalSchema, type LegalCase } from '@/lib/game/legal-schema';
import { activeCase, chooseTrialStrategy, inPrison, legalOf, legalTurn } from '@/lib/game/legal';
import { convictionChance } from '@/lib/game/court';

const office = { id: 'mayor', title: 'Mayor', jurisdiction: 'Testville', party: 'Democrat', since: '2026-01-01', elected: '2025-11-01', termEnd: '2030-01-01', margin: 5 } as Career['office'];
const txn = (kind: string, amount: number) => ({ id: `${kind}|2026-01-01`, date: '2026-01-01', amount, kind, source: 'X', destination: kind === 'embezzlement' ? 'personal' : 'illicit_reserve', favor: '', risk: 'High', evidence: 20 });
function trialCareer(o: { kinds?: string[]; strength?: number; defense?: number; money?: number; reserve?: number; id?: string; inOffice?: boolean }): Career {
  const k: LegalCase = legalCaseSchema.parse({ id: o.id ?? 'case|t', opened: '2025-01-01', stage: 'indicted', strength: o.strength ?? 80, defense: o.defense ?? 0, role: 'official', stageSince: '2026-01-01',
    trial: { courtDate: '2026-04-01', tier: 'minor', charges: [], strategy: null, verdict: null } });
  const base = createCareer({ ...defaultDraft, name: 'Ada' }, () => 0);
  const c: Career = { ...base, date: '2026-01-01', money: o.money ?? 500_000, actions: 75, office: o.inOffice === false ? null : office, publicOffice: o.inOffice !== false,
    corruption: corruptionSchema.parse({ exposure: 60, reserve: o.reserve ?? 0, txns: (o.kinds ?? []).map(kd => txn(kd, 50_000)) }), legal: legalSchema.parse({ cases: [k] }) };
  // Recompute the charge sheet like a real indictment would.
  return c;
}
const withTier = (c: Career, tier: 'minor' | 'felony' | 'high_felony') => ({ ...c, legal: { ...c.legal!, cases: c.legal!.cases.map(k => ({ ...k, trial: { ...k.trial!, tier } })) } });
const ok = (r: ReturnType<typeof chooseTrialStrategy>) => { if (!r.ok) throw new Error(r.message); return r.career; };
const verdictOf = (c: Career) => legalOf(c).cases[0]!.trial!.verdict!;

describe('Phase 6B court proceedings', () => {
  it('a strong defense can win an acquittal that clears legal status and restores some reputation', () => {
    const c = trialCareer({ strength: 40, defense: 45 });
    expect(convictionChance(activeCase(c)!)).toBe(0.05);
    const n = legalTurn(ok(chooseTrialStrategy(c, 'fight')), '2026-04-01').career;
    expect(verdictOf(n).type).toBe('acquitted');
    expect(activeCase(n)).toBeNull(); expect(inPrison(n)).toBe(false);
    expect(n.reputation).toBeGreaterThan(c.reputation);
    expect(n.money).toBe(c.money);
  });

  it('a minor guilty plea is censure plus a fine — no prison, office kept', () => {
    const c = withTier(trialCareer({ strength: 40 }), 'minor');
    const n = legalTurn(ok(chooseTrialStrategy(c, 'plea')), '2026-04-01').career;
    const v = verdictOf(n);
    expect(v.type).toBe('censure'); expect(v.sentence).toBe(0);
    expect(c.money - n.money).toBe(v.fine);
    expect(n.office?.id).toBe('mayor');
  });

  it('fines and restitution come only from personal cash and illicit reserves are seized', () => {
    const c = withTier(trialCareer({ kinds: ['bribe'], strength: 30, reserve: 20_000 }), 'felony');
    const n = legalTurn(ok(chooseTrialStrategy(c, 'plea')), '2026-04-01').career, v = verdictOf(n);
    expect(v.restitution).toBeGreaterThan(0);
    expect(c.money - n.money).toBe(v.fine + v.restitution);
    expect(n.corruption!.reserve).toBe(0); expect(v.confiscated).toBe(20_000);
    expect(n.campaign).toEqual(c.campaign); expect(n.treasury).toEqual(c.treasury);
  });

  it('unaffordable penalties become court debt instead of negative cash', () => {
    const c = withTier(trialCareer({ money: 1000, strength: 40 }), 'minor');
    const n = legalTurn(ok(chooseTrialStrategy(c, 'plea')), '2026-04-01').career;
    expect(n.money).toBe(0); expect(legalOf(n).owed).toBe(verdictOf(n).fine - 1000);
  });

  it('a high-felony conviction removes the player from office and sets the prison flag without breaking the save', () => {
    const c = withTier(trialCareer({ kinds: ['embezzlement'], strength: 95 }), 'high_felony');
    const n = legalTurn(c, '2026-04-01').career, v = verdictOf(n);
    expect(v.type).toBe('prison'); expect(v.removed).toBe(true); expect(v.sentence).toBeGreaterThan(0);
    expect(n.office).toBeNull(); expect(n.termHistory.at(-1)?.reason).toBe('removed from office');
    expect(legalOf(n).prison).toMatchObject({ quarters: v.sentence, since: '2026-04-01' });
    const reloaded = parseCareer(JSON.stringify(n))!;
    expect(reloaded).not.toBeNull(); expect(inPrison(reloaded)).toBe(true);
    expect(n.newsQueue.some(s => s.h.includes('sentenced'))).toBe(true);
    expect(n.socialMedia?.reactionFeed.some(p => p.author === 'Channel 7 Live')).toBe(true);
  });

  it('a verdict is written once: replaying the quarter or later quarters never re-sentences or re-fines', () => {
    const c = withTier(trialCareer({ strength: 40 }), 'minor');
    const n = legalTurn(ok(chooseTrialStrategy(c, 'plea')), '2026-04-01').career;
    expect(legalTurn(n, '2026-04-01').career).toEqual(n);
    const later = legalTurn(n, '2026-07-01').career;
    expect(later.money).toBe(n.money); expect(legalOf(later).cases.filter(k => k.trial?.verdict).length).toBe(1);
  });

  it('a strategy is filed only once', () => {
    const c = ok(chooseTrialStrategy(trialCareer({}), 'fight'));
    expect(chooseTrialStrategy(c, 'plea').ok).toBe(false);
  });
});
