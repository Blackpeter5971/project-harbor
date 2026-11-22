import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { corruptionOf, corruptionTurn } from '@/lib/game/corruption';
import { embezzle, embezzleLimit, launder, peddleInfluence } from '@/lib/game/laundering';
import { ensureTreasury, treasuryFunds } from '@/lib/game/budget';

const base = () => createCareer({ ...defaultDraft, name: 'Ada', background: 'Self-Made', party: 'Democrat' }, () => 0);
const office = (id: string): Career => ensureTreasury({ ...base(), date: '2026-01-01', actions: 75, office: { id, title: id, jurisdiction: 'Testville', party: 'Democrat', since: '2026-01-01', elected: '2025-11-01', termEnd: '2030-01-01', margin: 5 } as Career['office'], publicOffice: true });
const ok = (r: { ok: boolean; message: string; career?: Career }) => { if (!r.ok || !r.career) throw new Error(r.message); return r.career; };

describe('Phase 5B laundering & influence', () => {
  it('influence peddling credits only the off-books reserve', () => {
    const c = office('mayor'), n = ok(peddleInfluence(c));
    expect(n.money).toBe(c.money);
    expect(corruptionOf(n).reserve).toBeGreaterThan(0);
    expect(peddleInfluence(n).ok).toBe(false);
  });
  it('laundering moves reserve to personal cash minus fee, with ledger line and exposure', () => {
    const c = ok(peddleInfluence(office('mayor'))), r = corruptionOf(c).reserve;
    const n = ok(launder(c, r, 'shell'));
    expect(corruptionOf(n).reserve).toBe(0);
    expect(n.money - c.money).toBe(r - Math.round(r * 0.12));
    expect(n.ledger[0]!.amount).toBe(n.money - c.money);
    expect(corruptionOf(n).exposure).toBeGreaterThan(corruptionOf(c).exposure);
    expect(launder(n, 1, 'shell').ok).toBe(false);
  });
  it('cannot launder more than the reserve', () => {
    expect(launder(office('mayor'), 1000, 'offshore').ok).toBe(false);
  });
});

describe('Phase 5B treasury embezzlement', () => {
  it('only executives can divert funds', () => {
    expect(embezzle(office('council'), 100).ok).toBe(false);
  });
  it('debits treasury, credits personal cash, records high-risk evidence, once per quarter', () => {
    const c = office('governor'), cap = embezzleLimit(c);
    expect(cap).toBeGreaterThan(0);
    const n = ok(embezzle(c, cap));
    expect(treasuryFunds(c) - treasuryFunds(n)).toBe(cap);
    expect(n.money - c.money).toBe(cap);
    expect(corruptionOf(n).txns[0]).toMatchObject({ kind: 'embezzlement', destination: 'personal', risk: 'High' });
    expect(corruptionOf(n).exposure).toBeGreaterThanOrEqual(25);
    expect(embezzle(n, 1).ok).toBe(false);
    expect(embezzle(office('governor'), cap + 1).ok).toBe(false);
  });
  it('high exposure from embezzlement can leak into a scandal', () => {
    const n = ok(embezzle(office('president'), embezzleLimit(office('president'))));
    const t = corruptionTurn(n, '2026-04-01', 0);
    expect(t.career.scandals?.some(s => s.title.includes('Public money missing'))).toBe(true);
  });
});
