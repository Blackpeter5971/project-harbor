/**
 * Turn energy: career.actions stores energy percentage points (100 base per turn, adjusted by diet).
 * A former "1 action" costs ACTION_COST; political activities and S posts use their own tiers.
 * Cycle-free: no imports, safe for every game module.
 */
export const BASE_TURN_ENERGY = 100;
export const ACTION_COST = 15;
export const POST_COST = 5;
export const ENERGY_TIER = { small: 10, medium: 15, big: 20 } as const;
export const MAX_ENERGY = 300;
/** Coin purchases unlock only when energy is below this level. */
export const RECHARGE_THRESHOLD = 50;
/** Low-energy alert level for Needs Attention. */
export const LOW_ENERGY = 30;
export const DIET_ENERGY: Record<string, number> = { budget: -5, standard: 0, premium: 5, organic_chef: 10 };
export const turnEnergyFor = (dietId: string | undefined) => BASE_TURN_ENERGY + (DIET_ENERGY[dietId ?? 'standard'] ?? 0);
export const ENERGY_RECHARGES = [
  { id: 'weekend', name: 'Weekend Getaway', coins: 5, energy: 10, summary: 'A quick break out of town.' },
  { id: 'fitness', name: 'Fitness & Well-being Routine', coins: 25, energy: 50, summary: 'Trainer, sleep and recovery plan.' },
  { id: 'vacation', name: 'Luxury Vacation', coins: 50, energy: 110, summary: 'Fully recharge somewhere far away.' },
] as const;
export type RechargeId = typeof ENERGY_RECHARGES[number]['id'];
