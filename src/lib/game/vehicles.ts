import type { Career, CharacterDraft } from './career';
import type { Result } from './support';

/** Vehicles & possessions catalog (Life 4A). Schema/catalog only; purchases and upkeep billing arrive in 4B/4C and touch only personal cash. */
export type VehicleModelId = 'transit_pass' | 'economy_sedan' | 'executive_suv' | 'armored_sedan' | 'chauffeur_limo';
export type VehicleTier = 1 | 2 | 3 | 4 | 5;
export interface VehicleModel { id: VehicleModelId; tier: VehicleTier; name: string; description: string; purchasePrice: number; monthlyUpkeep: number; prestige: number; campaignTravelBonus: number; asset: string; isDefault?: boolean }
export interface OwnedVehicle { id: string; modelId: VehicleModelId; purchaseDate: string; condition: number; monthlyUpkeep: number }

export type PossessionCategory = 'wardrobe' | 'luxury' | 'technology';
export type PossessionId = 'tailored_suit' | 'executive_watch' | 'high_end_tech' | 'leather_briefcase';
export interface PossessionItem { id: PossessionId; category: PossessionCategory; name: string; description: string; purchasePrice: number; prestige: number; asset: string }
export interface OwnedPossession { id: string; itemId: PossessionId; purchaseDate: string }

export interface VehicleState { vehicles: OwnedVehicle[]; activeVehicleId: string | null; possessions: OwnedPossession[] }

export const TRANSIT_MONTHLY_COST = 50;

export const vehicleModels: VehicleModel[] = [
  { id: 'transit_pass', tier: 1, name: 'Public Transit Pass', description: 'Buses and trains to every meeting. No car, no fuss.', purchasePrice: 0, monthlyUpkeep: TRANSIT_MONTHLY_COST, prestige: 0, campaignTravelBonus: 0, asset: '/images/life/vehicle-transit.jpg', isDefault: true },
  { id: 'economy_sedan', tier: 2, name: 'Used Economy Sedan', description: 'Basic, reliable transport with a few miles on it.', purchasePrice: 4500, monthlyUpkeep: 120, prestige: 1, campaignTravelBonus: 0, asset: '/images/life/vehicle-sedan.jpg' },
  { id: 'executive_suv', tier: 3, name: 'Mid-Size Executive SUV', description: 'Comfortable, roomy and a quiet signal of status.', purchasePrice: 28000, monthlyUpkeep: 350, prestige: 3, campaignTravelBonus: 0, asset: '/images/life/vehicle-suv.jpg' },
  { id: 'armored_sedan', tier: 4, name: 'Luxury Armored Sedan', description: 'High prestige and secure travel across the campaign trail.', purchasePrice: 75000, monthlyUpkeep: 800, prestige: 6, campaignTravelBonus: 1, asset: '/images/life/vehicle-armored.jpg' },
  { id: 'chauffeur_limo', tier: 5, name: 'Private Chauffeur & Limousine', description: 'A driver on call and a limousine at the door. Peak executive prestige.', purchasePrice: 180000, monthlyUpkeep: 2500, prestige: 10, campaignTravelBonus: 2, asset: '/images/life/vehicle-limousine.jpg' },
];

export const possessionCatalog: PossessionItem[] = [
  { id: 'tailored_suit', category: 'wardrobe', name: 'Tailored Suit', description: 'Hand-cut wool that fits like a promise kept.', purchasePrice: 2500, prestige: 1, asset: '/images/life/possession-suit.jpg' },
  { id: 'executive_watch', category: 'luxury', name: 'Executive Watch', description: 'Gold case, navy dial, never late.', purchasePrice: 12000, prestige: 2, asset: '/images/life/possession-watch.jpg' },
  { id: 'high_end_tech', category: 'technology', name: 'High-End Tech Kit', description: 'Premium laptop and secure phone for work on the move.', purchasePrice: 4000, prestige: 1, asset: '/images/life/possession-tech.jpg' },
  { id: 'leather_briefcase', category: 'luxury', name: 'Leather Briefcase', description: 'Polished leather with gold clasps for the corridors of power.', purchasePrice: 1800, prestige: 1, asset: '/images/life/possession-briefcase.jpg' },
];

export const vehicleModelById = (id: string): VehicleModel | undefined => vehicleModels.find(v => v.id === id);
export const possessionById = (id: string): PossessionItem | undefined => possessionCatalog.find(p => p.id === id);
export const defaultVehicleState = (): VehicleState => ({ vehicles: [], activeVehicleId: null, possessions: [] });

const clampCondition = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 100;

/** Sanitizes saved vehicle/possession data; unknown models are dropped and a dangling active id falls back to transit (null). */
export function normalizeVehicleState(raw: { vehicles?: unknown; activeVehicleId?: unknown; possessions?: unknown } | null | undefined): VehicleState {
  const vehicles: OwnedVehicle[] = Array.isArray(raw?.vehicles) ? raw!.vehicles.flatMap((v: any) => {
    const m = v && typeof v.id === 'string' ? vehicleModelById(v.modelId) : undefined;
    if (!m || m.isDefault) return [];
    return [{ id: v.id, modelId: m.id, purchaseDate: typeof v.purchaseDate === 'string' ? v.purchaseDate : '', condition: clampCondition(v.condition), monthlyUpkeep: m.monthlyUpkeep }];
  }) : [];
  const possessions: OwnedPossession[] = Array.isArray(raw?.possessions) ? raw!.possessions.flatMap((p: any) => p && typeof p.id === 'string' && possessionById(p.itemId) ? [{ id: p.id, itemId: p.itemId, purchaseDate: typeof p.purchaseDate === 'string' ? p.purchaseDate : '' }] : []) : [];
  const active = typeof raw?.activeVehicleId === 'string' && vehicles.some(v => v.id === raw.activeVehicleId) ? raw.activeVehicleId : null;
  return { vehicles, activeVehicleId: active, possessions };
}

/** Starter transport by background lore. Others begin on the transit pass. */
export function startingVehicles(background: CharacterDraft['background'], date = '2026-01-01'): VehicleState {
  const model: VehicleModelId | null = background === 'Political Dynasty' ? 'armored_sedan' : background === 'Wealthy Family' ? 'executive_suv' : null;
  if (!model) return defaultVehicleState();
  const m = vehicleModelById(model)!;
  const id = `starter-${model}`;
  return { vehicles: [{ id, modelId: m.id, purchaseDate: date, condition: 90, monthlyUpkeep: m.monthlyUpkeep }], activeVehicleId: id, possessions: [] };
}

/** Monthly transport cost for the active vehicle, or the transit pass when none. Preview only. */
export function monthlyTransportCost(s: VehicleState): number {
  const v = s.vehicles.find(x => x.id === s.activeVehicleId);
  return v ? v.monthlyUpkeep : TRANSIT_MONTHLY_COST;
}

/* ---------- Transactions (Life 4C): personal cash + personal ledger only ---------- */

export interface ServiceOption { id: 'tuneup' | 'overhaul'; name: string; cost: number; restore: number | 'full' }
export const serviceCatalog: ServiceOption[] = [
  { id: 'tuneup', name: 'Oil Change & Tune-Up', cost: 150, restore: 15 },
  { id: 'overhaul', name: 'Full Mechanical Overhaul', cost: 600, restore: 'full' },
];
const money = (n: number) => `$${n.toLocaleString('en-US')}`;
const lifeOf = (c: Career) => ({ ...defaultVehicleState(), ...c.life!, ...normalizeVehicleState(c.life) });
const post = (c: Career, label: string, amount: number): Career => ({ ...c, money: c.money + amount, ledger: [{ month: c.date, label, amount }, ...c.ledger] });

/** Trade-in: 50% of the original price at 0 condition up to 70% at 100 condition. */
export const resaleValue = (modelId: string, condition: number) => { const m = vehicleModelById(modelId); return m ? Math.round(m.purchasePrice * (0.5 + 0.2 * Math.min(100, Math.max(0, condition)) / 100)) : 0; };

export function buyVehicle(c: Career, modelId: string): Result {
  const m = vehicleModelById(modelId);
  if (!m || m.isDefault || !c.life) return { ok: false, message: 'That vehicle is not for sale.' };
  if (c.money < m.purchasePrice) return { ok: false, message: `You need ${money(m.purchasePrice - c.money)} more in personal cash for the ${m.name}.` };
  const life = lifeOf(c);
  let n = 1; while (life.vehicles.some(v => v.id === `${m.id}-${c.date}-${n}`)) n++;
  const id = `${m.id}-${c.date}-${n}`;
  const paid = post(c, `Vehicle purchase · ${m.name}`, -m.purchasePrice);
  return { ok: true, message: `You bought the ${m.name} for ${money(m.purchasePrice)}. It is now your daily driver.`, career: { ...paid, life: { ...paid.life!, vehicles: [...life.vehicles, { id, modelId: m.id, purchaseDate: c.date, condition: 100, monthlyUpkeep: m.monthlyUpkeep }], activeVehicleId: id, possessions: life.possessions } } };
}

export function sellVehicle(c: Career, instanceId: string): Result {
  if (!c.life) return { ok: false, message: 'Vehicle not found.' };
  const life = lifeOf(c);
  const v = life.vehicles.find(x => x.id === instanceId);
  if (!v) return { ok: false, message: 'Vehicle not found in your garage.' };
  const m = vehicleModelById(v.modelId)!;
  const value = resaleValue(v.modelId, v.condition);
  const paid = post(c, `Vehicle sale · ${m.name}`, value);
  const active = life.activeVehicleId === v.id ? null : life.activeVehicleId;
  return { ok: true, message: `Sold the ${m.name} for ${money(value)}.${active === null && life.activeVehicleId === v.id ? ' You are back on public transit.' : ''}`, career: { ...paid, life: { ...paid.life!, vehicles: life.vehicles.filter(x => x.id !== v.id), activeVehicleId: active, possessions: life.possessions } } };
}

export function serviceVehicle(c: Career, instanceId: string, serviceId: ServiceOption['id']): Result {
  const s = serviceCatalog.find(x => x.id === serviceId);
  if (!s || !c.life) return { ok: false, message: 'That service is not available.' };
  const life = lifeOf(c);
  const v = life.vehicles.find(x => x.id === instanceId);
  if (!v) return { ok: false, message: 'Vehicle not found in your garage.' };
  if (v.condition >= 100) return { ok: false, message: 'This vehicle is already in perfect condition.' };
  if (c.money < s.cost) return { ok: false, message: `You need ${money(s.cost - c.money)} more in personal cash for the ${s.name}.` };
  const condition = s.restore === 'full' ? 100 : Math.min(100, v.condition + s.restore);
  const m = vehicleModelById(v.modelId)!;
  const paid = post(c, `Vehicle service · ${s.name} (${m.name})`, -s.cost);
  return { ok: true, message: `${s.name} done. ${m.name} condition is now ${condition}%.`, career: { ...paid, life: { ...paid.life!, vehicles: life.vehicles.map(x => x.id === v.id ? { ...x, condition } : x), activeVehicleId: life.activeVehicleId, possessions: life.possessions } } };
}

/** Choose which owned vehicle to drive, or null for public transit. Free. */
export function setActiveVehicle(c: Career, instanceId: string | null): Result {
  if (!c.life) return { ok: false, message: 'Vehicle not found.' };
  const life = lifeOf(c);
  if (instanceId !== null && !life.vehicles.some(v => v.id === instanceId)) return { ok: false, message: 'Vehicle not found in your garage.' };
  if (life.activeVehicleId === instanceId) return { ok: false, message: 'Already your current transport.' };
  const name = instanceId ? vehicleModelById(life.vehicles.find(v => v.id === instanceId)!.modelId)!.name : 'Public Transit';
  return { ok: true, message: `${name} is now your daily transport.`, career: { ...c, life: { ...c.life, vehicles: life.vehicles, activeVehicleId: instanceId, possessions: life.possessions } } };
}

export function buyPossession(c: Career, itemId: string): Result {
  const p = possessionById(itemId);
  if (!p || !c.life) return { ok: false, message: 'That item is not available.' };
  const life = lifeOf(c);
  if (life.possessions.some(x => x.itemId === p.id)) return { ok: false, message: `You already own the ${p.name}.` };
  if (c.money < p.purchasePrice) return { ok: false, message: `You need ${money(p.purchasePrice - c.money)} more in personal cash for the ${p.name}.` };
  const paid = post(c, `Purchase · ${p.name}`, -p.purchasePrice);
  return { ok: true, message: `You bought the ${p.name} for ${money(p.purchasePrice)}.`, career: { ...paid, life: { ...paid.life!, vehicles: life.vehicles, activeVehicleId: life.activeVehicleId, possessions: [...life.possessions, { id: `${p.id}-${c.date}`, itemId: p.id, purchaseDate: c.date }] } } };
}

/* ---------- Mobility perks ---------- */
/** +1 quarterly energy (offsets one point of campaign-travel drain) while campaigning in a reliable executive vehicle: tier 3+ and condition 60%+. */
export function campaignTravelRelief(c: Pick<Career, 'life' | 'campaign'>): number {
  if (!c.campaign || !c.life || c.life.maintenanceOverdue) return 0;
  const s = normalizeVehicleState(c.life);
  const v = s.vehicles.find(x => x.id === s.activeVehicleId);
  const m = v && vehicleModelById(v.modelId);
  return m && m.tier >= 3 && v!.condition >= 60 ? 1 : 0;
}
/** A tailored suit adds +1 effective reputation to early career checks. */
export const wardrobeReputationBonus = (c: Pick<Career, 'life'>) => normalizeVehicleState(c.life).possessions.some(p => p.itemId === 'tailored_suit') ? 1 : 0;

/* ---------- Quarterly transport billing (Life 4D) ---------- */
export const QUARTERLY_WEAR = 5;
export const BREAKDOWN_THRESHOLD = 30;
export const BREAKDOWN_STRESS = 5;
export interface TransportCollection { career: Career; notices: string[] }
/** Bills one quarter of active-vehicle upkeep (or transit), wears the active car, and is keyed to the turn start date so reloads never double-bill. */
export function collectTransport(c: Career, periodStart: string): TransportCollection {
  if (!c.life) return { career: c, notices: [] };
  if (c.life.lastTransportPeriod && periodStart <= c.life.lastTransportPeriod) return { career: c, notices: [] };
  const s = normalizeVehicleState(c.life);
  const v = s.vehicles.find(x => x.id === s.activeVehicleId);
  const m = v ? vehicleModelById(v.modelId)! : vehicleModels[0]!;
  const cost = (v ? v.monthlyUpkeep : TRANSIT_MONTHLY_COST) * 3;
  const notices: string[] = [];
  let n: Career = c, overdue = false;
  if (c.money >= cost) {
    n = { ...c, money: c.money - cost, ledger: [{ month: periodStart, label: `Transportation · ${m.name} (3 months)`, amount: -cost }, ...c.ledger] };
    notices.push(v ? `Transportation: ${money(cost)} paid for ${m.name} upkeep & fuel.` : `Transportation: ${money(cost)} paid for public transit fares.`);
  } else {
    overdue = !!v;
    notices.push(v ? `Maintenance Overdue: Could not pay ${money(cost)} for ${m.name} upkeep. Vehicle perks are suspended.` : `Transportation: Could not afford ${money(cost)} in transit fares.`);
  }
  let vehicles = s.vehicles, stress = c.life.stress;
  if (v) {
    const condition = Math.max(0, v.condition - QUARTERLY_WEAR);
    vehicles = s.vehicles.map(x => x.id === v.id ? { ...x, condition } : x);
    if (condition < BREAKDOWN_THRESHOLD) { stress = Math.min(100, stress + BREAKDOWN_STRESS); notices.push(`Breakdown Warning: ${m.name} is at ${condition}% condition (+${BREAKDOWN_STRESS} stress). Service it in the Garage.`); }
  }
  return { career: { ...n, life: { ...n.life!, ...s, vehicles, stress, maintenanceOverdue: overdue, lastTransportPeriod: periodStart } }, notices };
}
