import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { acceptBribe, acceptDarkMoney, bribeOffer, corruptionOf, corruptionTurn, declineBribe, leakChance } from '@/lib/game/corruption';
import { launchCampaign } from '@/lib/game/campaign';

const base = () => createCareer({ ...defaultDraft, name: 'Ada', background: 'Self-Made', party: 'Democrat' }, () => 0);
const mayor = (): Career => ({ ...base(), actions: 75, office: { id: 'mayor', title: 'Mayor', jurisdiction: 'Testville', party: 'Democrat', since: '2026-01-01', elected: '2025-11-01', termEnd: '2030-01-01', margin: 5 }, publicOffice: true });
const ok = (r: ReturnType<typeof acceptBribe>) => { if (!r.ok) throw new Error(r.message); return r.career; };
const withCampaign = () => { const r = launchCampaign({ ...base(), experience: 80, reputation: 30, skills: { communication: 20, leadership: 30, knowledge: 20 } }, 'council', 'Listen', 'grassroots'); if (!r.ok) throw new Error(r.message); return r.career; };

describe('Phase 5A corruption ledger', () => {
  it('a bribe credits only the illicit reserve and logs a distinct audit record', () => {
    const c = mayor(), offer = bribeOffer(c)!, n = ok(acceptBribe(c));
    const k = corruptionOf(n);
    expect(k.reserve).toBe(offer.amount);
    expect(k.txns[0]).toMatchObject({ kind: 'bribe', destination: 'illicit_reserve', amount: offer.amount, source: offer.source, date: c.date, risk: offer.risk });
    expect(k.exposure).toBe(offer.evidence);
  });

  it('bribes never touch clean personal, ledger, treasury or campaign balances', () => {
    const c = mayor(), n = ok(acceptBribe(c));
    expect(n.money).toBe(c.money); expect(n.ledger).toEqual(c.ledger);
    expect(n.treasury).toEqual(c.treasury); expect(n.budget).toEqual(c.budget); expect(n.campaign).toEqual(c.campaign);
  });

  it('dark money enters campaign funds with an explicit undisclosed line and matching illicit record', () => {
    const c = withCampaign(), n = ok(acceptDarkMoney(c));
    const t = corruptionOf(n).txns[0]!;
    expect(t).toMatchObject({ kind: 'dark_money', destination: 'campaign' });
    expect(n.campaign!.funds - c.campaign!.funds).toBe(t.amount);
    expect(n.campaign!.txns[0]?.label).toContain('Undisclosed');
    expect(n.money).toBe(c.money); expect(corruptionOf(n).reserve).toBe(0);
  });

  it('each offer can only be used once per turn', () => {
    const n = ok(acceptBribe(mayor()));
    expect(acceptBribe(n).ok).toBe(false);
    expect(acceptBribe(ok(declineBribe(mayor()))).ok).toBe(false);
    expect(acceptDarkMoney(ok(acceptDarkMoney(withCampaign()))).ok).toBe(false);
  });

  it('non-officeholders get no bribe offers', () => {
    expect(bribeOffer(base())).toBeNull();
  });

  it('exposure raises leak chance and a leak becomes a Phase 4 scandal', () => {
    expect(leakChance(10)).toBe(0); expect(leakChance(80)).toBeGreaterThan(leakChance(40));
    const n = ok(acceptBribe(mayor()));
    const hot = { ...n, corruption: { ...corruptionOf(n), exposure: 60 } };
    const leaked = corruptionTurn(hot, '2026-04-01', 0).career;
    expect(leaked.scandals[0]).toMatchObject({ trigger: 'corruption', source: 'Investigative Reporter', evidence: 60, status: 'alleged' });
    expect(corruptionTurn({ ...n, corruption: { ...corruptionOf(n), exposure: 5 } }, '2026-04-01', 0).career.scandals).toHaveLength(0);
  });

  it('high exposure opens a legal audit, and quarterly processing is idempotent', () => {
    const n = ok(acceptBribe(mayor()));
    const hot = { ...n, corruption: { ...corruptionOf(n), exposure: 80 } };
    const t = corruptionTurn(hot, '2026-04-01', 0.99).career;
    expect(t.scandals.some(s => s.source === 'Legal Audit')).toBe(true);
    expect(corruptionOf(t).exposure).toBe(78);
    expect(corruptionTurn(t, '2026-04-01', 0).career).toBe(t);
  });

  it('save/load preserves the illicit ledger', () => {
    const n = ok(acceptBribe(mayor()));
    expect(parseCareer(JSON.stringify(n))?.corruption).toEqual(n.corruption);
  });
});
