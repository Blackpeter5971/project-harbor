import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { bankAction, bankOf, bankingTurn, creditProfile, depositQuote, loanQuote, type BankRequest } from '@/lib/game/banking';
import { advanceTurn } from '@/lib/game/gameplay';
const base = (): Career => ({ ...createCareer({ ...defaultDraft, name: 'Bank Tester' }), money: 20000, job: { id: 'teller', since: '2026-01-01' } });
const apply = (c: Career, r: Omit<BankRequest, 'revision'> | Record<string, unknown>) => {
  const result = bankAction(c, { ...r, revision: bankOf(c).revision } as BankRequest);
  if (!result.ok) throw new Error(result.message);
  return result.career;
};
describe('personal banking', () => {
  it('keeps legacy cash and all ledgers unchanged when loading older saves', () => {
    const c = { ...base(), money: 12345.67 };
    const loaded = parseCareer(JSON.stringify(c));
    expect(loaded?.money).toBe(12345.67);
    expect(loaded?.ledger).toEqual(c.ledger);
    expect(loaded && bankOf(loaded).savings).toBe(0);
  });
  it('transfers savings without fees and pays 1% quarterly into savings only', () => {
    const c = apply(base(), { kind: 'save', amount: 1000 });
    expect(c.money).toBe(19000);
    const next = bankingTurn(c, c.date, '2026-04-01').career;
    expect(bankOf(next).savings).toBe(1010);
    expect(next.money).toBe(19000);
    const withdrawn = apply(next, { kind: 'withdraw', amount: 1010 });
    expect(withdrawn.money).toBe(20010);
    expect(bankOf(withdrawn).savings).toBe(0);
  });
  it('a 3-month CD guarantees 5% APR and credits principal plus interest on turn advance', () => {
    const c = apply(base(), { kind: 'deposit', amount: 1000, turns: 1 });
    expect(c.money).toBe(19000);
    expect(bankOf(c).deposits[0]?.payout).toBe(1012.5);
    const next = advanceTurn(c).career;
    expect(next.date).toBe('2026-04-01');
    expect(bankOf(next).deposits[0]?.status).toBe('matured');
    expect(next.ledger.find(e => e.label.startsWith('Fixed deposit maturity'))?.amount).toBe(1012.5);
  });
  it.each([[2, 1030, '2026-07-01'], [4, 1070, '2027-01-01']] as const)('locks a %s-turn CD until its exact maturity', (turns, payout, maturity) => {
    const c = apply(base(), { kind: 'deposit', amount: 1000, turns });
    expect(depositQuote(1000, turns, c.date)?.payout).toBe(payout);
    expect(bankOf(c).deposits[0]?.maturity).toBe(maturity);
    let next = c;
    for (let i = 0; i < turns; i++) {
      const end = `2026-${String(4 + i * 3).padStart(2, '0')}-01`;
      const date = end === '2026-13-01' ? '2027-01-01' : end;
      next = bankingTurn(next, next.date, date).career;
      next = { ...next, date };
      expect(bankOf(next).deposits[0]?.status).toBe(i === turns - 1 ? 'matured' : 'locked');
    }
    expect(next.money).toBe(19000 + payout);
  });
  it('rejects unsupported CD terms and insufficient personal cash', () => {
    expect(bankAction(base(), { kind: 'deposit', amount: 1000, turns: 3, revision: 0 }).ok).toBe(false);
    expect(bankAction(base(), { kind: 'deposit', amount: 20001, turns: 1, revision: 0 }).ok).toBe(false);
  });
  it('credits a within-capacity loan to checking and deducts its exact quarterly installment', () => {
    const c = apply(base(), { kind: 'loan', amount: 1000, turns: 4 });
    const l = bankOf(c).loans[0];
    if (!l) throw new Error('Missing loan');
    expect(c.money).toBe(21000);
    expect(l.payment).toBe(loanQuote(1000, 4, creditProfile(base(), 4).rate).payment);
    const next = bankingTurn(c, c.date, '2026-04-01').career;
    expect(next.money).toBe(21000 - l.payment);
    expect(bankOf(next).loans[0]?.remaining).toBe(Math.round((l.total - l.payment) * 100) / 100);
    expect(bankOf(next).onTime).toBe(1);
  });
  it('salary and maturity settle before repayment in the real quarterly loop', () => {
    const c = apply(base(), { kind: 'loan', amount: 1000, turns: 4 });
    const next = advanceTurn({ ...c, money: 0 }).career;
    expect(bankOf(next).missed).toBe(0);
    expect(next.ledger.find(e => e.label === 'Personal loan quarterly repayment')?.amount).toBe(-(bankOf(c).loans[0]?.payment ?? 0));
  });
  it('lends to unemployed players with net worth, refuses those with nothing, and reduces caps for low income and high personal debt', () => {
    expect(creditProfile({ ...base(), job: null }).cap).toBeGreaterThan(0);
    expect(creditProfile({ ...base(), job: null, money: 0, life: base().life ? { ...base().life!, vehicles: [], possessions: [] } : null, housing: null }).cap).toBe(0);
    const low = { ...base(), job: { id: 'retail', since: base().date } };
    expect(creditProfile(low).cap).toBeLessThan(creditProfile(base()).cap);
    const life = base().life;
    if (!life) throw new Error('Missing life');
    expect(creditProfile({ ...base(), life: { ...life, medicalDebt: 200000 } }).cap).toBe(0);
  });
  it('never permits borrowing above the live calculated capacity', () => {
    const c = base();
    expect(bankAction(c, { kind: 'loan', amount: creditProfile(c, 8).cap + 1, turns: 8, revision: 0 }).ok).toBe(false);
    expect(bankAction(c, { kind: 'loan', amount: 1000, turns: 5, revision: 0 }).ok).toBe(false);
  });
  it('missed payments add a $25 minimum fee, reduce credit and block loans until cleared', () => {
    const c = apply(base(), { kind: 'loan', amount: 1000, turns: 4 });
    const before = creditProfile(c).score;
    const missed = bankingTurn({ ...c, money: 0 }, c.date, '2026-04-01').career;
    const l = bankOf(missed).loans[0];
    if (!l) throw new Error('Missing loan');
    expect(l.fees).toBe(25);
    expect(l.arrears).toBe(l.payment);
    expect(creditProfile(missed).score).toBeLessThan(before);
    expect(creditProfile(missed).cap).toBe(0);
    const cleared = apply({ ...missed, money: 20000, date: '2026-04-01' }, { kind: 'clear', id: l.id });
    expect(bankOf(cleared).loans[0]?.arrears).toBe(0);
    expect(bankOf(cleared).loans[0]?.fees).toBe(0);
    expect(creditProfile(cleared).cap).toBeGreaterThan(0);
  });
  it('does not draw savings to cover an unaffordable loan payment', () => {
    let c = apply(base(), { kind: 'loan', amount: 1000, turns: 4 });
    c = apply(c, { kind: 'save', amount: 20000 });
    const next = bankingTurn({ ...c, money: 0 }, c.date, '2026-04-01').career;
    expect(bankOf(next).savings).toBe(20200);
    expect(bankOf(next).missed).toBe(1);
  });
  it('rejects stale action revisions and replayed or overlapping settlement after reload', () => {
    const r: BankRequest = { kind: 'deposit', amount: 1000, turns: 1, revision: 0 };
    const c = apply(base(), r);
    expect(bankAction(c, r).ok).toBe(false);
    const settled = bankingTurn(c, c.date, '2026-04-01').career;
    const loaded = parseCareer(JSON.stringify(settled));
    if (!loaded) throw new Error('Save failed');
    expect(bankingTurn(loaded, '2026-01-01', '2026-04-01').career).toBe(loaded);
    expect(bankingTurn({ ...loaded, date: '2026-02-01' }, '2026-02-01', '2026-05-01').notices).toEqual([]);
    expect(bankingTurn(c, c.date, '2026-07-01').career).toBe(c);
  });
  it('fully repays without extra installments across all supported tenures', () => {
    for (const turns of [4, 8, 12]) {
      let c = apply(base(), { kind: 'loan', amount: 1000, turns });
      for (let i = 0; i < turns; i++) {
        const loan = bankOf(c).loans[0];
        if (!loan) throw new Error('Missing loan');
        const end = loan.nextDue;
        c = bankingTurn(c, c.date, end).career;
        c = { ...c, date: end };
      }
      expect(bankOf(c).loans[0]?.remaining).toBe(0);
      expect(bankOf(c).loans[0]?.arrears).toBe(0);
      expect(bankOf(c).onTime).toBe(turns);
    }
  });
  it('leaves campaign, treasury, business and illicit accounts untouched', () => {
    const c = base();
    const next = bankingTurn(apply(c, { kind: 'loan', amount: 1000, turns: 4 }), c.date, '2026-04-01').career;
    expect(next.campaign).toBe(c.campaign);
    expect(next.warChest).toBe(c.warChest);
    expect(next.treasury).toBe(c.treasury);
    expect(next.businesses).toBe(c.businesses);
    expect(next.corruption).toBe(c.corruption);
  });
  it('collects residual loan debt even when a saved repayment schedule has ended', () => {
    const c = apply(base(), { kind: 'loan', amount: 1000, turns: 4 });
    const b = bankOf(c);
    const loan = b.loans[0];
    if (!loan) throw new Error('Missing loan');
    const terminal = { ...c, banking: { ...b, loans: [{ ...loan, elapsed: 4, remaining: 50, arrears: 0 }] } };
    const next = bankingTurn(terminal, c.date, '2026-04-01').career;
    expect(next.money).toBe(c.money - 50);
    expect(bankOf(next).loans[0]?.remaining).toBe(0);
  });
});