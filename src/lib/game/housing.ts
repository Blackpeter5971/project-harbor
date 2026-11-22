import type { Result } from './support';
import type { Career, CharacterDraft } from './career';

export type HousingStatus = 'renting' | 'owning';

export type PropertyQuality = 'Basic' | 'Modest' | 'Comfortable' | 'Luxury';

export interface HousingProperty {
  id: string;
  name: string;
  tier: string;
  description: string;
  monthlyRent: number;
  purchasePrice: number;
  asset: string;
  quality: PropertyQuality;
  kind: string;
}

export interface HousingState {
  currentPropertyId: string;
  status: HousingStatus;
  monthlyRent: number;
  arrears: number;
  missedQuarters?: number | undefined;
  lastRentPeriod?: string | undefined;
  since?: string | undefined;
  history: { propertyId: string; from: string; to: string; status: HousingStatus }[];
}

export const housingCatalog: HousingProperty[] = [
  { id: 'room', name: 'Basic Rented Room', tier: 'Budget starter', description: 'A small furnished room in a shared house. A roof over your head and little else.', monthlyRent: 150, purchasePrice: 18000, asset: '/images/housing/room.jpg', quality: 'Basic', kind: 'Shared room' },
  { id: 'apartment', name: 'Modest Suburban Apartment', tier: 'Affordable', description: 'A quiet one-bedroom flat on the edge of town. Commutable, comfortable, yours to keep tidy.', monthlyRent: 450, purchasePrice: 95000, asset: '/images/housing/apartment.jpg', quality: 'Modest', kind: 'Apartment' },
  { id: 'condo', name: 'Modern Downtown Condo', tier: 'Comfortable', description: 'Floor-to-ceiling windows over the city center. Doorman, gym, and a view that impresses donors.', monthlyRent: 1200, purchasePrice: 320000, asset: '/images/housing/condo.jpg', quality: 'Comfortable', kind: 'Condo' },
  { id: 'house', name: 'Suburban Single-Family Home', tier: 'Family', description: 'A three-bedroom home with a yard in a good school district. The classic American anchor.', monthlyRent: 1800, purchasePrice: 450000, asset: '/images/housing/house.jpg', quality: 'Comfortable', kind: 'House' },
  { id: 'estate', name: 'Luxury Estate', tier: 'High-end', description: 'A gated estate with grounds, staff quarters, and a driveway built for motorcades.', monthlyRent: 6000, purchasePrice: 2500000, asset: '/images/housing/estate.jpg', quality: 'Luxury', kind: 'Estate' },
];

export function propertyById(id: string): HousingProperty {
  return housingCatalog.find(p => p.id === id) ?? housingCatalog[0]!;
}

export function startingHousing(background: CharacterDraft['background']): HousingState {
  if (background === 'Political Dynasty') return { currentPropertyId: 'house', status: 'owning', monthlyRent: 0, arrears: 0, missedQuarters: 0, lastRentPeriod: '', since: '', history: [] };
  if (background === 'Wealthy Family') return { currentPropertyId: 'condo', status: 'renting', monthlyRent: 1200, arrears: 0, missedQuarters: 0, lastRentPeriod: '', since: '', history: [] };
  return { currentPropertyId: 'room', status: 'renting', monthlyRent: 200, arrears: 0, missedQuarters: 0, lastRentPeriod: '', since: '', history: [] };
}

export function ensureHousing(c: Career): Career {
  if (c.housing) return c;
  return { ...c, housing: startingHousing(c.character.background) };
}

export function currentHousing(c: Career): { property: HousingProperty; state: HousingState } {
  const state = c.housing ?? startingHousing(c.character.background);
  return { property: propertyById(state.currentPropertyId), state };
}

/** Move-in for a rental is three months of rent up front. */
export const RENT_MOVE_IN_MONTHS = 3;
export const moveInCost = (monthlyRent: number) => monthlyRent * RENT_MOVE_IN_MONTHS;

export interface Affordability { required: number; affordable: boolean; shortfall: number }
/** Affordability only ever uses personal cash (career.money); campaign and public funds are never spendable here. */
export function affordability(personalCash: number, required: number): Affordability {
  const shortfall = Math.max(0, required - personalCash);
  return { required, affordable: shortfall === 0, shortfall };
}

export interface VehicleListing { id: string; name: string; kind: string; quality: PropertyQuality; description: string; purchasePrice: number; asset: string }
export const vehicleCatalog: VehicleListing[] = [
  { id: 'sedan', name: 'Used Compact Sedan', kind: 'Car', quality: 'Basic', description: 'Reliable, high-mileage, and gets you to every town meeting.', purchasePrice: 9000, asset: '/images/vehicles/sedan.jpg' },
  { id: 'suv', name: 'Full-Size SUV', kind: 'Car', quality: 'Comfortable', description: 'Room for staff, signs and a campaign on the move.', purchasePrice: 58000, asset: '/images/vehicles/suv.jpg' },
  { id: 'luxury', name: 'Executive Luxury Sedan', kind: 'Car', quality: 'Luxury', description: 'Arrive like someone already in charge.', purchasePrice: 120000, asset: '/images/vehicles/luxury.jpg' },
];

// ---- Sub-phase 1C: rental contracts, purchases and arrears ----

/** One-off moving fee charged with every new rental move-in. */
export const MOVING_FEE = 0;
export const EVICTION_PROPERTY_ID = 'room';
export const EVICTION_AFTER_MISSED_QUARTERS = 2;

export const rentalMoveInCost = (p: HousingProperty) => moveInCost(p.monthlyRent) + MOVING_FEE;
const monthKey = (date: string) => date; // ledger entries use the full turn date, like salary entries

function moveTo(c: Career, state: HousingState, next: Partial<HousingState> & Pick<HousingState, 'currentPropertyId' | 'status' | 'monthlyRent'>): HousingState {
  const from = state.since || c.date;
  return {
    ...state, ...next,
    since: c.date,
    lastRentPeriod: next.status === 'renting' ? c.date : '',
    history: [{ propertyId: state.currentPropertyId, from, to: c.date, status: state.status }, ...state.history],
  };
}

/** Rent a property: charges 3 months up front (plus moving fee) from personal cash only, once. */
export function rentProperty(c: Career, propertyId: string): Result {
  const p = housingCatalog.find(x => x.id === propertyId);
  if (!p) return { ok: false, message: 'That property is not on the market.' };
  const state = c.housing ?? startingHousing(c.character.background);
  if (state.currentPropertyId === p.id) return { ok: false, message: state.status === 'owning' ? 'You already own this home.' : 'You already live here.' };
  const cost = rentalMoveInCost(p);
  const a = affordability(c.money, cost);
  if (!a.affordable) return { ok: false, message: `You need $${a.shortfall.toLocaleString('en-US')} more in personal cash to move in.` };
  const housing = moveTo(c, state, { currentPropertyId: p.id, status: 'renting', monthlyRent: p.monthlyRent, missedQuarters: 0 });
  return { ok: true, message: `You moved into ${p.name}.`, career: {
    ...c, money: c.money - cost, housing,
    ledger: [{ month: monthKey(c.date), label: `Rent move-in · ${p.name} (3 months${MOVING_FEE ? ' + moving fee' : ''})`, amount: -cost }, ...c.ledger],
  } };
}

/** Buy a property outright from personal cash; ends any rental obligation immediately. Back rent stays owed. */
export function buyProperty(c: Career, propertyId: string): Result {
  const p = housingCatalog.find(x => x.id === propertyId);
  if (!p) return { ok: false, message: 'That property is not on the market.' };
  const state = c.housing ?? startingHousing(c.character.background);
  if (state.currentPropertyId === p.id && state.status === 'owning') return { ok: false, message: 'You already own this home.' };
  const a = affordability(c.money, p.purchasePrice);
  if (!a.affordable) return { ok: false, message: `You need $${a.shortfall.toLocaleString('en-US')} more in personal cash to buy this home.` };
  const housing = moveTo(c, state, { currentPropertyId: p.id, status: 'owning', monthlyRent: 0, missedQuarters: 0 });
  return { ok: true, message: `You bought ${p.name}.`, career: {
    ...c, money: c.money - p.purchasePrice, housing,
    ledger: [{ month: monthKey(c.date), label: `Home purchase · ${p.name}`, amount: -p.purchasePrice }, ...c.ledger],
  } };
}

export interface RentCollection { career: Career; notice: string | null; evicted: boolean }

/**
 * Collect one quarter of rent for the turn starting at `periodStart` (YYYY-MM-DD).
 * Idempotent per period (housing.lastRentPeriod) and skipped for the quarter prepaid at move-in.
 * Full payment also clears back rent with any cash left over. A short quarter takes what cash there is,
 * adds the rest to arrears and warns; two consecutive short quarters evict to the basic room with arrears carried.
 */
export function collectRent(c: Career, periodStart: string): RentCollection {
  const state = c.housing ?? startingHousing(c.character.background);
  if (state.status !== 'renting' || state.monthlyRent <= 0) return { career: c, notice: null, evicted: false };
  if (state.lastRentPeriod && periodStart <= state.lastRentPeriod) return { career: c, notice: null, evicted: false };
  const due = moveInCost(state.monthlyRent);
  const name = propertyById(state.currentPropertyId).name;
  const month = monthKey(periodStart);
  const fmt = (n: number) => `$${n.toLocaleString('en-US')}`;
  if (c.money >= due) {
    const backPaid = Math.min(state.arrears, c.money - due);
    const ledger = [{ month, label: `Quarterly rent · ${name}`, amount: -due }, ...c.ledger];
    if (backPaid > 0) ledger.unshift({ month, label: `Back rent repaid · ${name}`, amount: -backPaid });
    return { evicted: false, notice: `Housing: Paid ${fmt(due)} rent for ${name}.${backPaid ? ` Repaid ${fmt(backPaid)} back rent.` : ''}`, career: {
      ...c, money: c.money - due - backPaid, ledger,
      housing: { ...state, arrears: state.arrears - backPaid, lastRentPeriod: periodStart, missedQuarters: 0 },
    } };
  }
  const partial = Math.max(0, c.money);
  const ledger = partial > 0 ? [{ month, label: `Partial rent · ${name}`, amount: -partial }, ...c.ledger] : c.ledger;
  const missed = (state.missedQuarters ?? 0) + 1;
  const arrears = state.arrears + (due - partial);
  const base = { ...c, money: c.money - partial, ledger };
  if (missed >= EVICTION_AFTER_MISSED_QUARTERS && state.currentPropertyId !== EVICTION_PROPERTY_ID) {
    const room = propertyById(EVICTION_PROPERTY_ID);
    const housing: HousingState = {
      ...state, currentPropertyId: room.id, status: 'renting', monthlyRent: room.monthlyRent, arrears, missedQuarters: 0,
      lastRentPeriod: periodStart, since: periodStart,
      history: [{ propertyId: state.currentPropertyId, from: state.since || periodStart, to: periodStart, status: 'renting' }, ...state.history],
    };
    return { evicted: true, notice: `Housing Eviction: Evicted from ${name} after two missed quarters. You now live in ${room.name} (${fmt(arrears)} in arrears).`, career: { ...base, housing } };
  }
  return { evicted: false, notice: `Housing Warning: Missed quarterly rent payment (${fmt(arrears)} in arrears).${missed === 1 && state.currentPropertyId !== EVICTION_PROPERTY_ID ? ' Miss another quarter and you will be evicted.' : ''}`, career: {
    ...base, housing: { ...state, arrears, missedQuarters: missed, lastRentPeriod: periodStart },
  } };
}

/** Owners sell back to the market at 90% (agent and closing costs) and move into the basic room as renters. */
export const HOME_SALE_RATE = 0.9;
export const homeSaleValue = (c: Career, rate = HOME_SALE_RATE) => {
  const state = c.housing;
  return state?.status === 'owning' ? Math.round(propertyById(state.currentPropertyId).purchasePrice * rate) : 0;
};
export function sellProperty(c: Career, rate = HOME_SALE_RATE, label = 'Home sale'): Result {
  const state = c.housing ?? startingHousing(c.character.background);
  if (state.status !== 'owning') return { ok: false, message: 'You do not own a home to sell.' };
  const p = propertyById(state.currentPropertyId), proceeds = homeSaleValue({ ...c, housing: state }, rate);
  const room = propertyById(EVICTION_PROPERTY_ID);
  const housing = moveTo(c, state, { currentPropertyId: room.id, status: 'renting', monthlyRent: room.monthlyRent, missedQuarters: 0 });
  return { ok: true, message: `You sold ${p.name} for $${proceeds.toLocaleString('en-US')} and moved into ${room.name}.`, career: {
    ...c, money: c.money + proceeds, housing,
    ledger: [{ month: monthKey(c.date), label: `${label} · ${p.name}`, amount: proceeds }, ...c.ledger],
  } };
}
