import type { Career } from './career';

/** Simplified monthly game salaries in dollars, independent of campaign budgets. */
export const officeSalaries: Record<string, number> = {
  council: 3000, mayor: 8000, stateLeg: 6000, governor: 15000,
  house: 14500, senate: 14500, president: 33333.33,
};
export function officeSalary(c: Career): number {
  const o = c.office;
  return o && c.date >= o.since && (!o.termEnd || c.date < o.termEnd)
    ? officeSalaries[o.id] ?? 0 : 0;
}

/** Each served month is settled once; persisted markers survive modal continuation and reload. */
export function payOfficeMonth(c: Career, month: string): Career {
  const o = c.office;
  const salary = o ? officeSalaries[o.id] ?? 0 : 0;
  if (!o || !salary || month < o.since || (o.termEnd && month >= o.termEnd)
    || (c.lastOfficePaidMonth && month <= c.lastOfficePaidMonth)
    || c.officePayHistory.some(p => p.month === month)) return c;
  const payment = { month, officeId: o.id, title: o.title, jurisdiction: o.jurisdiction, since: o.since, amount: salary };
  return {
    ...c, money: Math.round((c.money + salary) * 100) / 100,
    lastOfficePaidMonth: month,
    officePayHistory: [...c.officePayHistory, payment],
    ledger: [{ month, label: `Office salary · ${o.title}`, amount: salary }, ...c.ledger],
  };
}