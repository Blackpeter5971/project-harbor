import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer } from '@/lib/game/career';
import { ensureLife } from '@/lib/game/life';
import { collectTaxes, progressiveTax, propertyTax, setTaxStance } from '@/lib/game/taxes';

const base = () => ensureLife(createCareer({ ...defaultDraft, name: 'Tax Payer' }));
const earning = (amount: number, label = 'Salary · Clerk') => { const c = base(); return { ...c, money: 100_000, ledger: [{ month: c.date, label, amount }, ...c.ledger] }; };

describe('personal taxes', () => {
  it('applies progressive brackets', () => {
    expect(progressiveTax(10_000)).toBe(1_000);
    expect(progressiveTax(30_000)).toBe(1_500 + 3_000);
    expect(progressiveTax(80_000)).toBe(1_500 + 7_000 + 10_500);
  });
  it('taxes dividends like wages', () => {
    const c = earning(30_000, 'Dividend · Acme');
    const r = collectTaxes(c, c.date).career;
    expect(r.money).toBe(100_000 - 4_500);
  });
  it('honest filing pays in full, no exposure, and credits the treasury', () => {
    const c0 = earning(10_000);
    const c = { ...c0, treasury: { tenure: 't', balance: 500, lastProcessedEnd: '', transactions: [] } };
    const r = collectTaxes(c, c.date).career;
    expect(r.money).toBe(99_000);
    expect(r.treasury!.balance).toBe(1_500);
    expect(r.corruption?.exposure ?? 0).toBe(0);
    expect(collectTaxes(r, c.date).career).toBe(r);
  });
  it('evasion keeps cash and adds 30 exposure', () => {
    const c0 = earning(10_000), s = setTaxStance(c0, 'evade');
    if (!s.ok) throw new Error(s.message);
    const r = collectTaxes(s.career, c0.date).career;
    expect(r.money).toBe(100_000);
    expect(r.corruption!.exposure).toBe(30);
    expect(r.life!.unpaidTax).toBe(1_000);
  });
  it('high exposure triggers an audit with back taxes + 50% and a scandal', () => {
    const c0 = earning(10_000), s = setTaxStance(c0, 'evade');
    if (!s.ok) throw new Error(s.message);
    const c = { ...s.career, corruption: { reserve: 0, exposure: 60, txns: [], bribeTurn: '', darkMoneyTurn: '', lastTurn: '', lastAudit: '', launderTurn: '', influenceTurn: '', embezzleTurn: '', whistled: [] } };
    const r = collectTaxes(c, c.date).career;
    expect(r.money).toBe(100_000 - 1_500);
    expect(r.life!.unpaidTax).toBe(0);
    expect(r.scandals.some(x => x.title === 'Tax Evasion Allegations' || x.related.includes(`tax|audit|${c.date}`))).toBe(true);
  });
  it('charges 0.5% property tax on an owned estate', () => {
    const c = base();
    expect(propertyTax({ ...c, housing: { ...c.housing!, currentPropertyId: 'estate', status: 'owning' } })).toBe(12_500);
  });
  it('older saves load with honest filing', () => {
    const loaded = parseCareer(JSON.parse(JSON.stringify(base())));
    expect(loaded?.life?.taxStance ?? 'honest').toBe('honest');
  });
});
