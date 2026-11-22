import type { Career } from './career';
import { employmentPay } from './employment';
import { quarterlyExpenses } from './life';
import { familyCosts, socialOf } from './relationships';
import { garageView } from './garage';
export function employmentForecast(c: Career) {
  const income = employmentPay(c).quarterly;
  const living = quarterlyExpenses(c).total;
  const family = familyCosts(socialOf(c)).total;
  const transport = garageView(c).upkeep.total;
  const loans = (c.banking?.loans ?? []).reduce((s, l) => s + l.fees + l.arrears + (l.elapsed < l.turns ? Math.min(l.payment, Math.max(0, l.remaining - l.arrears)) : Math.max(0, l.remaining - l.arrears)), 0);
  const expenses = Math.round((living + family + transport + loans) * 100) / 100;
  return { income, living, family, transport, loans, expenses, net: Math.round((income - expenses) * 100) / 100 };
}