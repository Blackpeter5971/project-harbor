import type { Career } from './career';
import type { Banking } from './banking-schema';
import { employmentPay } from './employment';
import type { Result } from './gameplay';
import { housingCatalog, sellProperty } from './housing';
import { normalizeBusiness } from './business-schema';
import { ownerStake } from './business-growth';
import { vehicleModelById, possessionById, resaleValue } from './vehicles';

export const SAVINGS_APR = 0.04;
export const CD_TERMS = [{ turns: 1, apr: 0.05 }, { turns: 2, apr: 0.06 }, { turns: 4, apr: 0.07 }] as const;
export const LOAN_TERMS = [4, 8, 12] as const;
export const cents = (n: number) => Math.round(n * 100) / 100;
export function bankDate(date: string, turns = 1) {
  const [year = 2026, month = 1] = date.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1 + turns * 3, 1));
  return d.toISOString().slice(0, 10);
}
export function bankOf(c: Career): Banking {
  return c.banking ?? { savings: 0, revision: 0, lastProcessedEnd: c.date, nextId: 1, onTime: 0, missed: 0, missedStreak: 0, deposits: [], loans: [], transactions: [] };
}
export function depositQuote(amount: number, turns: number, date: string) {
  const term = CD_TERMS.find(t => t.turns === turns);
  if (!term || !Number.isFinite(amount) || amount <= 0) return null;
  return { ...term, principal: cents(amount), payout: cents(amount * (1 + term.apr * turns / 4)), maturity: bankDate(date, turns) };
}
export function loanQuote(amount: number, turns: number, rate: number) {
  const payment = cents(amount * rate / (1 - Math.pow(1 + rate, -turns)));
  return { payment, total: cents(payment * turns), interest: cents(payment * turns - amount) };
}
export const FORECLOSURE_AFTER_MISSED = 8;
export const FORECLOSURE_SCORE_PENALTY = 250;
/** Personal debts the bank counts against net worth. */
export function personalDebt(c: Career) {
  const b = bankOf(c);
  return cents(b.loans.reduce((s, l) => s + l.remaining + l.fees, 0) + (c.life?.medicalDebt ?? 0) + (c.housing?.arrears ?? 0) + (c.life?.foodArrears ?? 0) + (c.life?.billArrears ?? 0) + (c.legal?.owed ?? 0));
}
/** Total Net Worth = cash + savings (incl. fixed deposits) + owner's business equity + owned real estate − outstanding debts. */
export function netWorthBreakdown(c: Career) {
  const b = bankOf(c);
  const cash = cents(c.money);
  const savings = cents(b.savings + b.deposits.filter(d => d.status === 'locked').reduce((s, d) => s + d.principal, 0));
  const businessEquity = cents(c.businesses.reduce((s, x) => { const n = normalizeBusiness(x); return s + Math.max(0, n.valuation) * ownerStake(n); }, 0));
  const realEstate = c.housing?.status === 'owning' ? housingCatalog.find(h => h.id === c.housing?.currentPropertyId)?.purchasePrice ?? 0 : 0;
  const debts = personalDebt(c);
  return { cash, savings, businessEquity, realEstate, debts, total: cents(cash + savings + businessEquity + realEstate - debts) };
}
export function creditProfile(c: Career, turns = 8) {
  const b = bankOf(c);
  const income = employmentPay(c).quarterly;
  const worth = netWorthBreakdown(c);
  const debt = worth.debts;
  const vehicles = (c.life?.vehicles ?? []).reduce((s, v) => s + (vehicleModelById(v.modelId)?.purchasePrice ?? 0) * 0.6 * v.condition / 100, 0);
  const possessions = (c.life?.possessions ?? []).reduce((s, p) => s + (possessionById(p.itemId)?.purchasePrice ?? 0) * 0.5, 0);
  const netWorth = cents(worth.total + vehicles + possessions);
  // Collateral the bank can secure: owned home, vehicles, savings/deposits and the owner's business equity.
  const collateral = cents(worth.realEstate * 0.6 + vehicles * 0.5 + worth.savings * 0.9 + worth.businessEquity * 0.3);
  const ongoing = b.loans.filter(l => l.remaining > 0).reduce((s, l) => s + (l.elapsed < l.turns ? l.payment : l.arrears), 0);
  const dti = income > 0 ? ongoing / income : debt > 0 ? 1 : 0;
  const overdue = b.loans.some(l => l.arrears > 0 || l.fees > 0);
  const foreclosed = !!b.foreclosedOn && c.date < bankDate(b.foreclosedOn, 12);
  const score = Math.max(300, Math.min(850, Math.round(650 + Math.min(60, b.onTime * 5) - Math.min(200, b.missed * 35) + Math.min(60, Math.max(0, netWorth) / 2000) - Math.min(150, dti * 150) - ((c.life?.billArrears ?? 0) > 0 ? 60 : 0) - (foreclosed ? FORECLOSURE_SCORE_PENALTY : 0))));
  const rate = score >= 720 ? 0.03 : score >= 620 ? 0.04 : 0.05;
  // Repayment capacity comes mainly from wealth and collateral; salary only adds to it.
  const room = Math.max(0, income * 0.35 + Math.max(0, netWorth) * 0.03 + collateral * 0.02 - ongoing - debt * 0.02);
  const factor = rate / (1 - Math.pow(1 + rate, -turns));
  const maximum = Math.max(0, Math.floor(Math.min(1_000_000, Math.max(0, netWorth) * 0.3 + collateral * 0.5 + income * 4, room / factor)));
  const secured = netWorth > 0 || collateral > 0 || income > 0;
  const cap = overdue || score < 500 || !secured || !LOAN_TERMS.some(t => t === turns) ? 0 : maximum;
  const reason = overdue ? 'Clear missed payments and fees before borrowing.' : !secured ? 'Build net worth, collateral or income before borrowing.' : score < 500 ? (foreclosed ? 'A recent foreclosure keeps your credit below the lending threshold.' : 'Credit rating is below the lending threshold.') : cap < 100 ? 'Net worth, collateral and existing debts leave no borrowing capacity.' : '';
  return { income, debt, netWorth, collateral, dti, score, rate, cap, reason, missedStreak: b.missedStreak ?? 0, foreclosed };
}
/** Bank seizes savings, deposits, the home and vehicles to settle all loans, then writes off any remainder. */
export function foreclose(c: Career, end: string): { career: Career; notice: string } {
  let n = c;
  const b = bankOf(c);
  const seized: string[] = [];
  const locked = cents(b.deposits.filter(d => d.status === 'locked').reduce((s, d) => s + d.principal, 0));
  const liquid = cents(b.savings + locked);
  if (liquid > 0) seized.push(`savings/deposits $${liquid.toLocaleString('en-US')}`);
  n = { ...n, money: cents(n.money + liquid), banking: { ...b, savings: 0, deposits: b.deposits.map(d => d.status === 'locked' ? { ...d, status: 'matured' as const } : d) } };
  if (n.housing?.status === 'owning') {
    const sale = sellProperty(n, 0.75, 'Foreclosure sale');
    if (sale.ok) { n = sale.career; seized.push('your home'); }
  }
  const vehicles = n.life?.vehicles ?? [];
  if (n.life && vehicles.length) {
    const value = vehicles.reduce((s, v) => s + resaleValue(v.modelId, v.condition), 0);
    n = { ...n, money: cents(n.money + value), life: { ...n.life, vehicles: [], activeVehicleId: null }, ledger: [{ month: end, label: 'Foreclosure · vehicles repossessed', amount: value }, ...n.ledger] };
    seized.push(`${vehicles.length} vehicle${vehicles.length > 1 ? 's' : ''}`);
  }
  const state = bankOf(n);
  const owed = cents(state.loans.reduce((s, l) => s + l.remaining + l.fees, 0));
  const paid = cents(Math.min(Math.max(0, n.money), owed));
  const writtenOff = cents(owed - paid);
  n = { ...n, money: cents(n.money - paid), banking: { ...state, loans: state.loans.map(l => ({ ...l, remaining: 0, arrears: 0, fees: 0 })), missedStreak: 0, foreclosedOn: end, transactions: [...state.transactions, { key: `foreclosure:${end}`, date: end, label: 'Foreclosure settlement', amount: -paid }] }, ledger: [{ month: end, label: 'Bank foreclosure · loans settled', amount: -paid }, ...n.ledger] };
  return { career: n, notice: `Bank FORECLOSURE after ${FORECLOSURE_AFTER_MISSED} straight missed quarters: seized ${seized.join(', ') || 'your cash'}; $${paid.toLocaleString('en-US')} applied to debt${writtenOff > 0 ? `, $${writtenOff.toLocaleString('en-US')} written off` : ''}. Credit rating crashed.` };
}
export type BankRequest = { revision: number } & ({ kind: 'save'; amount: number } | { kind: 'withdraw'; amount: number } | { kind: 'deposit'; amount: number; turns: number } | { kind: 'loan'; amount: number; turns: number } | { kind: 'clear'; id: string });
function entry(c: Career, b: Banking, key: string, date: string, label: string, amount: number): Career {
  if (b.transactions.some(t => t.key === key)) return c;
  return { ...c, money: cents(c.money + amount), banking: { ...b, transactions: [...b.transactions, { key, date, label, amount }] }, ledger: [{ month: date, label, amount }, ...c.ledger] };
}
export function bankAction(c: Career, request: BankRequest): Result {
  const b = bankOf(c);
  const fail = (message: string): Result => ({ ok: false, message });
  if (request.revision !== b.revision) return fail('This banking request has already changed. Please try again.');
  let n: Career = { ...c, banking: { ...b, revision: b.revision + 1 } };
  const state = n.banking;
  if (!state) return fail('Bank unavailable.');
  const key = `action:${b.revision}`;
  if (request.kind === 'clear') {
    const loan = b.loans.find(l => l.id === request.id);
    if (!loan || loan.arrears + loan.fees <= 0) return fail('No overdue payment to clear.');
    const due = cents(loan.arrears + loan.fees);
    if (c.money < due) return fail('Insufficient checking balance to clear overdue payments.');
    state.loans = b.loans.map(l => l.id === loan.id ? { ...l, remaining: cents(l.remaining - l.arrears), arrears: 0, fees: 0 } : l);
    n = entry(n, state, key, c.date, 'Loan arrears and fees cleared', -due);
  } else {
    const amount = cents(request.amount);
    if (!Number.isFinite(request.amount) || amount <= 0 || request.amount !== amount || amount > 1e12) return fail('Enter a positive amount with at most two decimal places.');
    if (request.kind === 'save' || request.kind === 'deposit') {
      if (c.money < amount) return fail('Insufficient checking balance.');
      if (request.kind === 'save') { state.savings = cents(b.savings + amount); n = entry(n, state, key, c.date, 'Transfer to high-yield savings', -amount); }
      else {
        const quote = depositQuote(amount, request.turns, c.date);
        if (!quote) return fail('Choose a 3, 6 or 12-month fixed deposit.');
        state.deposits = [...b.deposits, { id: `cd:${b.nextId}`, ...quote, opened: c.date, status: 'locked' }];
        state.nextId++;
        n = entry(n, state, key, c.date, 'Fixed deposit principal locked', -amount);
      }
    } else if (request.kind === 'withdraw') {
      if (b.savings < amount) return fail('Insufficient savings balance.');
      state.savings = cents(b.savings - amount); n = entry(n, state, key, c.date, 'Transfer from high-yield savings', amount);
    } else {
      const profile = creditProfile(c, request.turns);
      if (profile.reason || amount > profile.cap) return fail(profile.reason || `Loan exceeds borrowing capacity of $${profile.cap.toLocaleString('en-US')}.`);
      const quote = loanQuote(amount, request.turns, profile.rate);
      state.loans = [...b.loans, { id: `loan:${b.nextId}`, principal: amount, rate: profile.rate, turns: request.turns, opened: c.date, nextDue: bankDate(c.date), ...quote, remaining: quote.total, elapsed: 0, arrears: 0, fees: 0 }];
      state.nextId++;
      n = entry(n, state, key, c.date, 'Personal loan proceeds', amount);
    }
  }
  return { ok: true, career: n, message: 'Personal banking transaction completed.' };
}
/** One settlement per non-overlapping, exact quarter. Principal unlocks before checking repayments. */
export function bankingTurn(c: Career, start: string, end: string): { career: Career; notices: string[] } {
  const b = bankOf(c);
  if (c.date !== start || bankDate(start) !== end || start < b.lastProcessedEnd) return { career: c, notices: [] };
  let n: Career = { ...c, banking: { ...b, lastProcessedEnd: end, revision: b.revision + 1 } };
  const notices: string[] = [];
  let state = n.banking;
  if (!state) return { career: c, notices };
  const interest = cents(state.savings * SAVINGS_APR / 4);
  if (interest > 0) {
    state = { ...state, savings: cents(state.savings + interest), transactions: [...state.transactions, { key: `savings:${end}`, date: end, label: 'Savings interest', amount: interest }] };
    n = { ...n, banking: state };
    notices.push(`Bank: $${interest.toFixed(2)} interest credited to savings.`);
  }
  for (const deposit of state.deposits) {
    if (deposit.status !== 'locked' || deposit.maturity > end) continue;
    state = { ...state, deposits: state.deposits.map(d => d.id === deposit.id ? { ...d, status: 'matured' } : d) };
    n = entry(n, state, `maturity:${deposit.id}`, end, 'Fixed deposit maturity · principal + interest', deposit.payout);
    state = n.banking ?? state;
    notices.push(`Bank: fixed deposit matured; $${deposit.payout.toFixed(2)} credited to checking.`);
  }
  for (const loan of state.loans) {
    if (loan.remaining + loan.fees <= 0 || loan.nextDue > end) continue;
    const unpaid = Math.max(0, cents(loan.remaining - loan.arrears));
    const scheduled = loan.elapsed < loan.turns ? Math.min(loan.payment, unpaid) : unpaid;
    const baseDue = cents(loan.arrears + scheduled);
    const due = cents(baseDue + loan.fees);
    const paid = cents(Math.min(Math.max(0, n.money), due));
    const feePaid = Math.min(paid, loan.fees);
    const basePaid = cents(paid - feePaid);
    const arrears = cents(baseDue - basePaid);
    const missed = paid < due;
    const penalty = missed ? cents(Math.max(25, (due - paid) * 0.02)) : 0;
    const updated = { ...loan, remaining: cents(loan.remaining - basePaid), arrears, fees: cents(loan.fees - feePaid + penalty), elapsed: Math.min(loan.turns, loan.elapsed + 1), nextDue: bankDate(end) };
    state = { ...state, onTime: state.onTime + (missed ? 0 : 1), missed: state.missed + (missed ? 1 : 0), loans: state.loans.map(l => l.id === loan.id ? updated : l) };
    n = entry(n, state, `payment:${loan.id}:${end}`, end, missed ? 'Personal loan partial/missed payment' : 'Personal loan quarterly repayment', -paid);
    state = n.banking ?? state;
    notices.push(missed ? `Bank: missed loan payment; $${penalty.toFixed(2)} penalty, borrowing blocked until cleared.` : `Bank: $${paid.toFixed(2)} loan repayment deducted from checking.`);
  }
  // Track consecutive quarters with any missed loan payment; two straight years triggers foreclosure.
  const missedNow = state.missed > b.missed;
  const hasDebt = state.loans.some(l => l.remaining + l.fees > 0);
  state = { ...state, missedStreak: missedNow ? (b.missedStreak ?? 0) + 1 : hasDebt && state.onTime === b.onTime ? (b.missedStreak ?? 0) : 0 };
  n = { ...n, banking: state };
  if ((state.missedStreak ?? 0) >= FORECLOSURE_AFTER_MISSED) {
    const f = foreclose(n, end);
    return { career: f.career, notices: [...notices, f.notice] };
  }
  if (missedNow && (state.missedStreak ?? 0) >= FORECLOSURE_AFTER_MISSED - 2) notices.push(`Bank: ${state.missedStreak} consecutive missed quarters. Foreclosure at ${FORECLOSURE_AFTER_MISSED}.`);
  return { career: { ...n, banking: state }, notices };
}
