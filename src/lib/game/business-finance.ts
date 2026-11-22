import type { Business } from './business-schema';
import type { Career } from './career';
import { quarterlySimulation } from './business-engine';
/** Projection shares the exact demand, capacity, payroll and tax math used by settlement. */
export function businessFinance(b: Business, c?: Career) {
  const f = quarterlySimulation(b, c);
  const rent = Math.round(f.overhead * .5), licenses = Math.round(f.overhead * .2);
  const items = [{ label: 'Operational staff payroll', amount: f.staffPayroll }, { label: 'General manager salary', amount: f.managerPayroll }, { label: 'Production / service unit costs', amount: f.production }, { label: 'Rent & premises', amount: rent }, { label: 'Software licenses', amount: licenses }, { label: 'Equipment & branch upkeep', amount: f.overhead - rent - licenses }, ...(f.marketing ? [{ label: 'Marketing & advertising', amount: f.marketing }] : [])];
  return { ...f, items, netRetainedProfit: f.profit };
}
