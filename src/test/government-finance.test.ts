import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { ensureTreasury, treasuryTurn, currentBudget } from '@/lib/game/budget';
import { ensureApproval } from '@/lib/game/approval';
import { annualAgenda, decideAgenda, financeTurn, loanOffers, loanVisible, revenueStreams, setTaxStance, takeLoan, debtTotal, financeOf, pendingAnnualReport } from '@/lib/game/government-finance';
import type { Result } from '@/lib/game/support';

const take = (r: Result) => { if (!r.ok) throw new Error(r.message); return r.career; };
const holder = (id = 'mayor', date = '2028-04-01'): Career => ensureTreasury(ensureApproval({ ...createCareer({ ...defaultDraft, name: 'Fin', party: 'Democrat' }), date, money: 5000, warChest: 77, relationships: 60, publicOffice: true, office: { id, title: id, jurisdiction: 'Test', since: '2028-01-01', elected: '2027-11-01', termEnd: '2032-01-01', party: 'Democrat', margin: 10 } }));
const broke = (c: Career): Career => ({ ...c, treasury: { ...c.treasury!, balance: 1000 } });

describe('Government finance', () => {
  it('statutory allocations ignore the economy; tax streams do not', () => {
    const c = holder();
    const weak: Career = { ...c, treasury: { ...c.treasury!, finance: { ...financeOf(c), economy: { business: 20, employment: 20, household: 50, happiness: 50 } } } };
    const stat = (x: Career) => revenueStreams(x).find(s => s.kind === 'statutory')!.amount;
    expect(stat(weak)).toBe(stat(c));
    expect(revenueStreams(weak)[0]!.amount).toBeLessThan(revenueStreams(c)[0]!.amount);
  });

  it('loans appear only under 10% of annual budget and credit the treasury only', () => {
    expect(loanVisible(holder())).toBe(false);
    const c = broke(holder());
    expect(loanVisible(c)).toBe(true);
    const offer = loanOffers(c)[0]!;
    const n = take(takeLoan(c, offer.quarters));
    expect(n.treasury!.balance).toBe(1000 + offer.principal);
    expect(n.money).toBe(5000); expect(n.warChest).toBe(77);
    expect(debtTotal(n)).toBe(offer.payment * offer.quarters);
    expect(takeLoan(n, offer.quarters).ok).toBe(false);
  });

  it('debt service is deducted once per quarter, even after reload', () => {
    const loaned = take(takeLoan(broke(holder()), 4));
    const loan = financeOf(loaned).loans[0]!;
    const settled = treasuryTurn(loaned, '2028-04-01', '2028-07-01');
    const once = financeTurn(settled, '2028-04-01', '2028-07-01').career;
    expect(financeOf(once).loans[0]!.remaining).toBe(3);
    expect(once.treasury!.transactions.some(t => t.label.startsWith('Debt service') && t.amount === -loan.payment)).toBe(true);
    const reloaded = parseCareer(JSON.stringify(once))!;
    expect(financeTurn(reloaded, '2028-04-01', '2028-07-01').career).toBe(reloaded);
  });

  it('raising taxes increases revenue and costs approval; once per quarter', () => {
    const c = holder();
    const n = take(setTaxStance(c, 'raise'));
    expect(currentBudget(n).revenue).toBeGreaterThan(currentBudget(c).revenue);
    expect(n.approval!.overall).toBeLessThan(c.approval!.overall);
    expect(setTaxStance(n, 'cut').ok).toBe(false);
  });

  it('rejecting a critical project costs 3 approval; critical projects cannot be postponed', () => {
    const c = holder();
    const crit = annualAgenda(c).find(i => i.critical)!;
    expect(decideAgenda(c, crit.catalogId, 'postpone').ok).toBe(false);
    const n = take(decideAgenda(c, crit.catalogId, 'reject'));
    expect(Math.round((c.approval!.overall - n.approval!.overall) * 10) / 10).toBe(3);
  });

  it('closing Q4 produces one annual report', () => {
    const c = holder('mayor', '2028-10-01');
    const settled = treasuryTurn(c, '2028-10-01', '2029-01-01');
    const n = financeTurn(settled, '2028-10-01', '2029-01-01').career;
    const r = pendingAnnualReport(n)!;
    expect(r.year).toBe(2028);
    expect(r.revenue).toBeGreaterThan(0);
    expect(r.ignored.length).toBe(3);
  });
});
