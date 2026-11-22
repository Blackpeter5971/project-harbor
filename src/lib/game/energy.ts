import type { Career } from './career';
import type { Result } from './support';
import { ENERGY_RECHARGES, MAX_ENERGY, RECHARGE_THRESHOLD } from './energy-costs';

export const canBuyEnergy = (c: Career) => c.actions < RECHARGE_THRESHOLD;

/** Pure coin recharge: adds turn energy (overcharge allowed up to MAX_ENERGY). Coins are charged by the caller only on success; never personal cash. */
export function rechargeEnergy(c: Career, id: string, coins: number): Result {
  const r = ENERGY_RECHARGES.find(x => x.id === id);
  if (!r) return { ok: false, message: 'That recharge is not available.' };
  if (!canBuyEnergy(c)) return { ok: false, message: `Energy can be bought only below ${RECHARGE_THRESHOLD}%.` };
  if (coins < r.coins) return { ok: false, message: `You need ${r.coins - coins} more coins for a ${r.name}.` };
  const actions = Math.min(MAX_ENERGY, c.actions + r.energy);
  const life = c.life ? { ...c.life, stress: Math.max(0, c.life.stress - Math.round(r.energy / 5)) } : c.life;
  return { ok: true, message: `${r.name}: energy now ${actions}%.`, career: { ...c, actions, life } };
}
