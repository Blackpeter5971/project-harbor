import type { Career } from './career';
import { ensureLife } from './life';
import { vehicleModelById, vehicleModels, type VehicleModel } from './vehicles';

/** Display helpers for the Garage & Assets view. Read-only: uses only personal cash (career.money). */
export type GarageStatus = 'Daily Driver' | 'In Storage' | 'Public Transit';
export interface UpkeepBreakdown { fuel: number; insurance: number; maintenance: number; total: number }
export interface GarageView { model: VehicleModel; condition: number; status: GarageStatus; upkeep: UpkeepBreakdown }

/** Quarterly upkeep split into fuel (40%), insurance (30%) and maintenance (rest). Transit is all fare. */
export function quarterlyUpkeep(model: VehicleModel): UpkeepBreakdown {
  const total = model.monthlyUpkeep * 3;
  if (model.isDefault) return { fuel: total, insurance: 0, maintenance: 0, total };
  const fuel = Math.round(total * 0.4), insurance = Math.round(total * 0.3);
  return { fuel, insurance, maintenance: total - fuel - insurance, total };
}

export function garageView(c: Career): GarageView {
  const life = ensureLife(c).life!;
  const transit = vehicleModels[0]!;
  const active = (life.vehicles ?? []).find(v => v.id === life.activeVehicleId);
  if (active) { const m = vehicleModelById(active.modelId) ?? transit; return { model: m, condition: active.condition, status: 'Daily Driver', upkeep: quarterlyUpkeep(m) }; }
  return { model: transit, condition: 100, status: (life.vehicles ?? []).length ? 'In Storage' : 'Public Transit', upkeep: quarterlyUpkeep(transit) };
}

export function vehiclePerks(m: VehicleModel): string[] {
  const perks: string[] = [];
  if (m.campaignTravelBonus > 0) perks.push(`+${m.campaignTravelBonus * 5}% Campaign Mobility`);
  if (m.prestige > 0) perks.push(`Status Boost +${m.prestige}`);
  return perks.length ? perks : ['No status effect'];
}

export const canAfford = (c: Pick<Career, 'money'>, price: number) => c.money >= price;
