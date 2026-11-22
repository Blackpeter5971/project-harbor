import type { Career } from './career';

/** Essential quarterly obligations: utilities by home, a flat social/healthcare levy, upkeep on owned homes. Personal cash only. */
export const UTILITIES_BY_HOME: Record<string, number> = { room: 150, apartment: 450, condo: 700, house: 900, estate: 2500 };
export const SOCIAL_LEVY = 300;
export const MAINTENANCE_OWNED = 350;
export const LATE_SURCHARGE = 0.1;
export const SHUTOFF_ENERGY_PENALTY = 8;
export const SHUTOFF_HEALTH_PENALTY = 3;
export const ARREARS_CREDIT_PENALTY = 60;

export interface Obligations { rent: number; utilities: number; levies: number; maintenance: number; arrears: number; total: number }

export function essentialObligations(c: Career): Obligations {
  const h = c.housing;
  const rent = h && h.status === 'renting' ? h.monthlyRent * 3 : 0;
  const utilities = UTILITIES_BY_HOME[h?.currentPropertyId ?? 'room'] ?? 150;
  const levies = SOCIAL_LEVY;
  const maintenance = h?.status === 'owning' ? MAINTENANCE_OWNED : 0;
  const arrears = Math.round((c.life?.billArrears ?? 0) * (1 + LATE_SURCHARGE));
  return { rent, utilities, levies, maintenance, arrears, total: rent + utilities + levies + maintenance + arrears };
}

const fmt = (n: number) => `$${n.toLocaleString('en-US')}`;

/** Bills utilities/levies/maintenance once per period (life.lastBillsPeriod); shortfall becomes billArrears and a shutoff. */
export function collectObligations(c: Career, periodStart: string): { career: Career; notices: string[] } {
  const life = c.life;
  if (!life) return { career: c, notices: [] };
  if (life.lastBillsPeriod && periodStart <= life.lastBillsPeriod) return { career: c, notices: [] };
  const o = essentialObligations(c);
  const due = o.utilities + o.levies + o.maintenance + o.arrears;
  const paid = Math.min(due, Math.max(0, Math.floor(c.money)));
  const unpaid = due - paid;
  const ledger = paid > 0 ? [{ month: periodStart, label: `Utilities, levies & upkeep (3 months)${o.arrears ? ' incl. late arrears' : ''}`, amount: -paid }, ...c.ledger] : c.ledger;
  const notices: string[] = [];
  let health = c.health ?? 85, energy = life.energy;
  if (unpaid > 0) {
    health = Math.max(0, health - SHUTOFF_HEALTH_PENALTY);
    energy = Math.max(0, energy - SHUTOFF_ENERGY_PENALTY);
    notices.push(`Past Due: ${fmt(unpaid)} in essential bills unpaid. Utilities shut off (-${SHUTOFF_ENERGY_PENALTY} energy, -${SHUTOFF_HEALTH_PENALTY} health) and your credit rating drops.`);
  } else {
    notices.push(`Bills: ${fmt(paid)} paid for utilities, levies${o.maintenance ? ' and home upkeep' : ''}.`);
  }
  return { career: { ...c, money: c.money - paid, ledger, health, life: { ...life, energy, billArrears: unpaid, lastBillsPeriod: periodStart } }, notices };
}
