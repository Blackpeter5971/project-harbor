import type { Career } from './career';
import type { Result } from './support';

export type LifestyleTierId = 'minimalist' | 'balanced' | 'affluent' | 'luxury';
export interface LifestyleTier { id: LifestyleTierId; name: string; description: string; monthlyCost: number; stressReductionPerQuarter: number; energyBonusPerQuarter: number; asset: string }
export interface LifestyleState { tierId: LifestyleTierId; monthlyCost: number; stressReductionPerQuarter: number; energyBonusPerQuarter: number }

export const DEFAULT_ENERGY = 80;
export const DEFAULT_STRESS = 20;
export const DEFAULT_LIFESTYLE_ID: LifestyleTierId = 'balanced';
export const clampVital = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

export const lifestyleCatalog: LifestyleTier[] = [
  { id: 'minimalist', name: 'Frugal / Minimalist', description: 'Low expenses, library books and basic entertainment. Modest stress relief.', monthlyCost: 100, stressReductionPerQuarter: -2, energyBonusPerQuarter: 0, asset: '/images/life/lifestyle-minimalist.jpg' },
  { id: 'balanced', name: 'Balanced / Comfortable', description: 'Dining out, streaming and social hobbies.', monthlyCost: 400, stressReductionPerQuarter: -5, energyBonusPerQuarter: 3, asset: '/images/life/lifestyle-balanced.jpg' },
  { id: 'affluent', name: 'Affluent / High-End', description: 'Private clubs, a personal trainer and fine leisure.', monthlyCost: 1200, stressReductionPerQuarter: -10, energyBonusPerQuarter: 6, asset: '/images/life/lifestyle-affluent.jpg' },
  { id: 'luxury', name: 'Luxury / Elite', description: 'Private travel, exclusive clubs and peak comfort.', monthlyCost: 3500, stressReductionPerQuarter: -18, energyBonusPerQuarter: 10, asset: '/images/life/lifestyle-luxury.jpg' },
];
export const lifestyleById = (id: string): LifestyleTier => lifestyleCatalog.find(t => t.id === id) ?? lifestyleCatalog[1]!;
export const quarterlyLifestyleCost = (t: Pick<LifestyleTier, 'monthlyCost'>) => t.monthlyCost * 3;
export const lifestyleState = (t: LifestyleTier): LifestyleState => ({ tierId: t.id, monthlyCost: t.monthlyCost, stressReductionPerQuarter: t.stressReductionPerQuarter, energyBonusPerQuarter: t.energyBonusPerQuarter });
export const defaultLifestyle = () => lifestyleState(lifestyleById(DEFAULT_LIFESTYLE_ID));

/** Expected next-quarter energy/stress from a lifestyle alone (preview only). */
export function projectedVitality(c: Career, tierId?: string) {
  const t = tierId ? lifestyleById(tierId) : lifestyleById(c.life?.lifestyle?.tierId ?? DEFAULT_LIFESTYLE_ID);
  const energy = c.life?.energy ?? DEFAULT_ENERGY, stress = c.life?.stress ?? DEFAULT_STRESS;
  return { energy: clampVital(energy + t.energyBonusPerQuarter), stress: clampVital(stress + t.stressReductionPerQuarter) };
}

/** Choose a lifestyle. Personal cash must cover one quarter; nothing is charged now. */
export function selectLifestyle(c: Career, tierId: string): Result {
  const t = lifestyleCatalog.find(x => x.id === tierId);
  if (!t) return { ok: false, message: 'That lifestyle is not available.' };
  if (!c.life) return { ok: false, message: 'Life data is not ready yet.' };
  if (c.life.lifestyle?.tierId === t.id) return { ok: false, message: `You already live a ${t.name} lifestyle.` };
  const short = quarterlyLifestyleCost(t) - c.money;
  if (short > 0) return { ok: false, message: `You need $${short.toLocaleString('en-US')} more in personal cash to afford a quarter of ${t.name}.` };
  return { ok: true, message: `Lifestyle changed to ${t.name}.`, career: { ...c, life: { ...c.life, lifestyle: lifestyleState(t) } } };
}

export type EnergyStatus = 'Exhausted' | 'Tired' | 'Energetic' | 'Peak';
export type StressStatus = 'Serene' | 'Manageable' | 'Stressed' | 'Burnout Risk';
export const energyStatus = (e: number): EnergyStatus => e >= 80 ? 'Peak' : e >= 50 ? 'Energetic' : e >= 25 ? 'Tired' : 'Exhausted';
export const stressStatus = (s: number): StressStatus => s >= 75 ? 'Burnout Risk' : s >= 50 ? 'Stressed' : s >= 25 ? 'Manageable' : 'Serene';

export type RestActionId = 'getaway' | 'fitness' | 'vacation';
export interface RestAction { id: RestActionId; name: string; description: string; cost: number; stress: number; energy: number; health: number }
export const restCatalog: RestAction[] = [
  { id: 'getaway', name: 'Weekend Getaway', description: 'Two days away from the phone and the press.', cost: 500, stress: -15, energy: 10, health: 0 },
  { id: 'fitness', name: 'Fitness & Wellness Routine', description: 'Gym sessions, sleep schedule and stretching.', cost: 250, stress: -5, energy: 15, health: 1 },
  { id: 'vacation', name: 'Luxury Vacation', description: 'A full week at a resort, far from politics.', cost: 3000, stress: -35, energy: 25, health: 0 },
];

/** Leisure paid from personal cash only; energy, stress and health stay within 0–100. */
export function takeRestAction(c: Career, actionId: string): Result {
  const a = restCatalog.find(x => x.id === actionId);
  if (!a) return { ok: false, message: 'That activity is not available.' };
  if (!c.life) return { ok: false, message: 'Life data is not ready yet.' };
  if (c.money < a.cost) return { ok: false, message: `You need $${(a.cost - c.money).toLocaleString('en-US')} more in personal cash for a ${a.name}.` };
  const energy = clampVital(c.life.energy + a.energy), stress = clampVital(c.life.stress + a.stress);
  const health = clampVital((c.health ?? 85) + a.health);
  return { ok: true, message: `${a.name}: Energy ${energy}%, Stress ${stress}%.`, career: {
    ...c, money: c.money - a.cost, health,
    ledger: [{ month: c.date, label: `Leisure · ${a.name}`, amount: -a.cost }, ...c.ledger],
    life: { ...c.life, energy, stress },
  } };
}

export const BURNOUT_STRESS = 80;
export const DEPLETED_ENERGY = 20;
export const BURNOUT_FOCUS = 0.85;
export const isBurnedOut = (c: Pick<Career, 'life'>) => !!c.life && (c.life.stress > BURNOUT_STRESS || c.life.energy < DEPLETED_ENERGY);
/** Multiplier on political performance: 0.85 while burned out, 1 otherwise. */
export const focusMultiplier = (c: Pick<Career, 'life'>) => isBurnedOut(c) ? BURNOUT_FOCUS : 1;
