import { medicalSchema } from './legacy-schema';
import type { Career } from './career';
import type { Result } from './support';
import { defaultSocial, normalizeSocial, type SocialState } from './relationships';
import { campaignTravelRelief, collectTransport, defaultVehicleState, normalizeVehicleState, type OwnedPossession, type OwnedVehicle } from './vehicles';
import { propertyById } from './housing';
import { collectObligations } from './obligations';
import { lifestyleCatalog, quarterlyLifestyleCost, isBurnedOut, energyStatus, stressStatus } from './lifestyle';
import { DEFAULT_ENERGY, DEFAULT_STRESS, clampVital, defaultLifestyle, lifestyleState, lifestyleById, type LifestyleState } from './lifestyle';

export type DietTierId = 'budget' | 'standard' | 'premium' | 'organic_chef';

export interface DietTier { id: DietTierId; name: string; description: string; monthlyCost: number; healthDeltaPerQuarter: number; asset: string }
export interface DietState { tierId: DietTierId; monthlyCost: number; healthDeltaPerQuarter: number }
export type InsurancePlanId = 'none' | 'basic_hmo' | 'comprehensive_ppo';
export interface InsurancePlan { id: InsurancePlanId; name: string; description: string; monthlyCost: number; coverage: number; asset: string; risky: boolean }
export interface InsuranceState { planId: InsurancePlanId; monthlyCost: number; coverage: number }
export interface LifeState { medical?: ReturnType<typeof medicalSchema.parse>; diet: DietState; insurance: InsuranceState; medicalDebt: number; energy: number; stress: number; lifestyle: LifestyleState; foodArrears?: number | undefined; frugal?: boolean | undefined; lastLivingPeriod?: string | undefined; insurancePaidPeriod?: string | undefined; vehicles: OwnedVehicle[]; activeVehicleId: string | null; possessions: OwnedPossession[]; maintenanceOverdue?: boolean | undefined; lastTransportPeriod?: string | undefined; billArrears?: number | undefined; lastBillsPeriod?: string | undefined; taxStance?: 'honest' | 'loophole' | 'evade' | undefined; lastTaxPeriod?: string | undefined; unpaidTax?: number | undefined; social?: SocialState | undefined }

/** coverage = share of medical bills the plan pays; the rest is out-of-pocket from personal cash. */
export const insuranceCatalog: InsurancePlan[] = [
  { id: 'none', name: 'No Insurance', description: 'You pay every medical bill yourself. Cheap until something goes wrong.', monthlyCost: 0, coverage: 0, asset: '/images/life/insurance-none.jpg', risky: true },
  { id: 'basic_hmo', name: 'Basic Plan', description: 'In-network doctors and emergency care. Covers 50% of emergency bills; you pay a 50% copay. Checkups cost $50.', monthlyCost: 100, coverage: 0.5, asset: '/images/life/insurance-hmo.jpg', risky: false },
  { id: 'comprehensive_ppo', name: 'Executive Plan', description: 'Any doctor, specialists and hospitals. Covers 90% of emergency bills; you pay 10%. Checkups cost $50.', monthlyCost: 350, coverage: 0.9, asset: '/images/life/insurance-ppo.jpg', risky: false },
];
export const insuranceById = (id: string): InsurancePlan => insuranceCatalog.find(p => p.id === id) ?? insuranceCatalog[0]!;
const insuranceState = (p: InsurancePlan): InsuranceState => ({ planId: p.id, monthlyCost: p.monthlyCost, coverage: p.coverage });

export type HealthStatus = 'Vibrant' | 'Healthy' | 'Fatigued' | 'Ill';
export function healthStatus(h: number): HealthStatus {
  if (h >= 85) return 'Vibrant';
  if (h >= 60) return 'Healthy';
  if (h >= 35) return 'Fatigued';
  return 'Ill';
}

export const DEFAULT_HEALTH = 85;
export const HEALTH_MIN = 0;
export const HEALTH_MAX = 100;
export const DEFAULT_DIET_ID: DietTierId = 'standard';

export const dietCatalog: DietTier[] = [
  { id: 'budget', name: 'Budget Groceries', description: 'Ramen, canned goods and basic staples. Cheap, filling, not great for you.', monthlyCost: 150, healthDeltaPerQuarter: -2, asset: '/images/life/budget.jpg' },
  { id: 'standard', name: 'Balanced Home Cooking', description: 'Fresh produce and standard meats cooked at home.', monthlyCost: 350, healthDeltaPerQuarter: 0, asset: '/images/life/standard.jpg' },
  { id: 'premium', name: 'Premium Dining & Delivery', description: 'High-end restaurants and fresh organic delivery.', monthlyCost: 750, healthDeltaPerQuarter: 2, asset: '/images/life/premium.jpg' },
  { id: 'organic_chef', name: 'Private Nutritionist & Chef', description: 'Catered meals planned for peak wellness.', monthlyCost: 1500, healthDeltaPerQuarter: 4, asset: '/images/life/organic_chef.jpg' },
];

export const dietById = (id: string): DietTier => dietCatalog.find(d => d.id === id) ?? dietCatalog[1]!;
export const quarterlyDietCost = (t: Pick<DietTier, 'monthlyCost'>) => t.monthlyCost * 3;
export const clampHealth = (n: number) => Math.min(HEALTH_MAX, Math.max(HEALTH_MIN, Math.round(n)));

const dietState = (t: DietTier): DietState => ({ tierId: t.id, monthlyCost: t.monthlyCost, healthDeltaPerQuarter: t.healthDeltaPerQuarter });
export const defaultLife = (): LifeState => ({ medical: medicalSchema.parse({}), diet: dietState(dietById(DEFAULT_DIET_ID)), insurance: insuranceState(insuranceById('none')), medicalDebt: 0, energy: DEFAULT_ENERGY, stress: DEFAULT_STRESS, lifestyle: defaultLifestyle(), foodArrears: 0, frugal: false, lastLivingPeriod: '', insurancePaidPeriod: '', ...defaultVehicleState(), social: defaultSocial() });

const vital = (v: unknown, d: number) => typeof v === 'number' && Number.isFinite(v) ? clampVital(v) : d;
/** Backfills health and diet for saves made before Life Phase 2. */
export function ensureLife(c: Career): Career {
  const health = typeof c.health === 'number' && Number.isFinite(c.health) ? clampHealth(c.health) : DEFAULT_HEALTH;
  const life = c.life?.diet ? { medical: medicalSchema.parse(c.life.medical ?? {}), diet: dietState(dietById(c.life.diet.tierId)), insurance: insuranceState(insuranceById(c.life.insurance?.planId ?? 'none')), medicalDebt: Math.max(0, Math.round(c.life.medicalDebt ?? 0)), energy: vital(c.life.energy, DEFAULT_ENERGY), stress: vital(c.life.stress, DEFAULT_STRESS), lifestyle: lifestyleState(lifestyleById(c.life.lifestyle?.tierId ?? '')), foodArrears: Math.max(0, Math.round(c.life.foodArrears ?? 0)), frugal: !!c.life.frugal, lastLivingPeriod: c.life.lastLivingPeriod ?? '', insurancePaidPeriod: c.life.insurancePaidPeriod ?? '', ...(c.life.maintenanceOverdue !== undefined ? { maintenanceOverdue: c.life.maintenanceOverdue } : {}), ...(c.life.lastTransportPeriod !== undefined ? { lastTransportPeriod: c.life.lastTransportPeriod } : {}), ...(c.life.billArrears !== undefined ? { billArrears: Math.max(0, Math.round(c.life.billArrears)) } : {}), ...(c.life.lastBillsPeriod !== undefined ? { lastBillsPeriod: c.life.lastBillsPeriod } : {}), ...(c.life.taxStance !== undefined ? { taxStance: c.life.taxStance } : {}), ...(c.life.lastTaxPeriod !== undefined ? { lastTaxPeriod: c.life.lastTaxPeriod } : {}), ...(c.life.unpaidTax !== undefined ? { unpaidTax: Math.max(0, Math.round(c.life.unpaidTax)) } : {}), ...normalizeVehicleState(c.life), social: normalizeSocial(c.life.social) } : defaultLife();
  return { ...c, health, life };
}

export interface QuarterlyExpenses { housing: number; groceries: number; medical: number; lifestyle: number; total: number }
/** Upcoming quarter's personal living costs (3 months). Preview only; billing happens in turn processing later. */
export function quarterlyExpenses(c: Career, override: { dietId?: string; insuranceId?: string; lifestyleId?: string } = {}): QuarterlyExpenses {
  const cur = ensureLife(c);
  const h = c.housing;
  const housing = h && h.status === 'renting' ? h.monthlyRent * 3 : 0;
  const groceries = (override.dietId ? dietById(override.dietId).monthlyCost : cur.life!.diet.monthlyCost) * 3;
  const medical = (override.insuranceId ? insuranceById(override.insuranceId).monthlyCost : cur.life!.insurance.monthlyCost) * 3;
  const lifestyle = (override.lifestyleId ? lifestyleById(override.lifestyleId).monthlyCost : cur.life!.lifestyle.monthlyCost) * 3;
  return { housing, groceries, medical, lifestyle, total: housing + groceries + medical + lifestyle };
}

const shortBy = (c: Career, required: number) => Math.max(0, required - c.money);
const fmt = (n: number) => `$${n.toLocaleString('en-US')}`;

/** Choose a diet plan. Only personal cash (career.money) must cover the upcoming quarter's groceries; nothing is charged now. */
export function selectDiet(c: Career, tierId: string): Result {
  const t = dietCatalog.find(d => d.id === tierId);
  if (!t) return { ok: false, message: 'That diet plan is not available.' };
  const cur = ensureLife(c);
  if (cur.life!.diet.tierId === t.id) return { ok: false, message: `You already follow ${t.name}.` };
  const short = shortBy(c, quarterlyDietCost(t));
  if (short > 0) return { ok: false, message: `You need ${fmt(short)} more in personal cash to afford a quarter of ${t.name}.` };
  return { ok: true, message: `Diet changed to ${t.name}.`, career: { ...cur, life: { ...cur.life!, diet: dietState(t) } } };
}

export const insuranceQuarterCost = (p: Pick<InsurancePlan, 'monthlyCost'>) => p.monthlyCost * 3;
const charge = (c: Career, label: string, amount: number): Career => amount > 0 ? { ...c, money: c.money - amount, ledger: [{ month: c.date, label, amount: -amount }, ...c.ledger] } : c;

/** Enroll in a health plan. The first quarter's premium is paid now from personal cash only. */
export function selectInsurance(c: Career, planId: string): Result {
  const p = insuranceCatalog.find(x => x.id === planId);
  if (!p) return { ok: false, message: 'That health plan is not available.' };
  const cur = ensureLife(c);
  if (cur.life!.insurance.planId === p.id) return { ok: false, message: `You already have ${p.name}.` };
  const cost = insuranceQuarterCost(p);
  const short = shortBy(c, cost);
  if (short > 0) return { ok: false, message: `You need ${fmt(short)} more in personal cash to cover a quarter of ${p.name}.` };
  const paid = charge(cur, `Health insurance · ${p.name} (3 months)`, cost);
  return { ok: true, message: p.id === 'none' ? 'You dropped your health insurance.' : `Enrolled in ${p.name}. Paid ${fmt(cost)} for this quarter.`, career: { ...paid, life: { ...paid.life!, insurance: insuranceState(p), insurancePaidPeriod: p.id === 'none' ? '' : c.date } } };
}

export type ClinicVisitId = 'checkup' | 'retreat';
export interface ClinicVisit { id: ClinicVisitId; name: string; description: string; cost: number; insuredCost: number; healthGain: number }
export const clinicCatalog: ClinicVisit[] = [
  { id: 'checkup', name: 'Standard Checkup', description: 'A routine visit with a family doctor.', cost: 250, insuredCost: 50, healthGain: 10 },
  { id: 'retreat', name: 'Wellness Retreat', description: 'A week of rest, therapy and coaching.', cost: 1500, insuredCost: 1500, healthGain: 25 },
];
export const clinicById = (id: string) => clinicCatalog.find(v => v.id === id);
export const isInsured = (c: Career) => (ensureLife(c).life!.insurance.planId !== 'none');
export const clinicCost = (c: Career, v: ClinicVisit) => isInsured(c) ? v.insuredCost : v.cost;

/** Elective care paid from personal cash; health never exceeds 100. */
export function visitClinic(c: Career, visitId: string): Result {
  const v = clinicById(visitId);
  if (!v) return { ok: false, message: 'That clinic service is not available.' };
  const cur = ensureLife(c);
  if ((cur.health ?? DEFAULT_HEALTH) >= HEALTH_MAX) return { ok: false, message: 'You are already in perfect health.' };
  const cost = clinicCost(cur, v);
  const short = shortBy(cur, cost);
  if (short > 0) return { ok: false, message: `You need ${fmt(short)} more in personal cash for a ${v.name}.` };
  const paid = charge(cur, `Medical · ${v.name}`, cost);
  const health = clampHealth((cur.health ?? DEFAULT_HEALTH) + v.healthGain);
  return { ok: true, message: `${v.name} done for ${fmt(cost)}. Health is now ${health}%.`, career: { ...paid, health, life: paid.life ? { ...paid.life, medical: { ...medicalSchema.parse(paid.life.medical ?? {}), lastCheckup: c.date, chronic: paid.life.medical?.chronic ?? null, emergencies: (paid.life.medical?.emergencies ?? []).map(e => ({ ...e, untreated: false })) } } : paid.life } };
}

export const EMERGENCY_HEALTH_THRESHOLD = 50;
export const EMERGENCY_CHANCE = 0.35;
export const UNPAID_BILL_HEALTH_PENALTY = 5;
export interface HealthEmergency { id: string; name: string; bill: number; healthLoss: number }
export const emergencyCatalog: HealthEmergency[] = [
  { id: 'exhaustion', name: 'Sudden Exhaustion', bill: 1200, healthLoss: 5 },
  { id: 'infection', name: 'Severe Infection', bill: 4000, healthLoss: 10 },
  { id: 'cardiac', name: 'Heart Scare', bill: 9000, healthLoss: 15 },
];

/** Only players with health below 50 risk an emergency. rng returns [0,1). */
export function rollHealthEmergency(c: Career, rng: () => number = Math.random): HealthEmergency | null {
  if ((ensureLife(c).health ?? DEFAULT_HEALTH) >= EMERGENCY_HEALTH_THRESHOLD) return null;
  if (rng() >= EMERGENCY_CHANCE) return null;
  return emergencyCatalog[Math.min(emergencyCatalog.length - 1, Math.floor(rng() * emergencyCatalog.length))]!;
}

/** Out-of-pocket share after insurance: uninsured 100%, Basic 50%, Executive 10%. */
export const outOfPocket = (c: Career, bill: number) => Math.round(bill * (1 - ensureLife(c).life!.insurance.coverage));

export interface EmergencyOutcome { career: Career; billed: number; paid: number; debt: number; notice: string }
/** Bills the emergency to personal cash; any unpaid part becomes medical debt and costs extra health. */
export function applyHealthEmergency(c: Career, e: HealthEmergency): EmergencyOutcome {
  const cur = ensureLife(c);
  const billed = outOfPocket(cur, e.bill);
  const paid = Math.min(billed, Math.max(0, cur.money));
  const debt = billed - paid;
  const after = charge(cur, `Medical emergency · ${e.name}`, paid);
  const health = clampHealth((cur.health ?? DEFAULT_HEALTH) - e.healthLoss - (debt > 0 ? UNPAID_BILL_HEALTH_PENALTY : 0));
  const notice = debt > 0
    ? `Health Emergency: ${e.name}. Paid ${fmt(paid)}; ${fmt(debt)} is now overdue medical debt.`
    : `Health Emergency: ${e.name}. Paid ${fmt(billed)} out of pocket.`;
  return { billed, paid, debt, notice, career: { ...after, health, life: { ...after.life!, medicalDebt: after.life!.medicalDebt + debt, medical: { ...medicalSchema.parse(after.life?.medical ?? {}), chronic: e.id === 'cardiac' ? 'cardiac' : after.life?.medical?.chronic ?? null, emergencies: [...(after.life?.medical?.emergencies ?? []), { date: c.date, name: e.name, untreated: debt > 0 }] } } } };
}

export const FOOD_SHORTFALL_HEALTH_PENALTY = 10;
export interface LivingCollection { career: Career; notices: string[] }
/** Quarterly groceries, insurance premium, diet health drift and emergency risk. Keyed to the turn start date so a period is billed once. */
export function collectLiving(c: Career, periodStart: string, rng: () => number = Math.random): LivingCollection {
  const living = collectHouseholdLiving(c, periodStart, rng);
  const transport = collectTransport(living.career, periodStart);
  const bills = collectObligations(transport.career, periodStart);
  if (bills.career === living.career) return living;
  return { career: bills.career, notices: [...living.notices, ...transport.notices, ...bills.notices] };
}
function collectHouseholdLiving(c: Career, periodStart: string, rng: () => number): LivingCollection {
  let n = ensureLife(c);
  const life = n.life!;
  if (life.lastLivingPeriod && periodStart <= life.lastLivingPeriod) return { career: c, notices: [] };
  const notices: string[] = [];
  const diet = dietById(life.diet.tierId);
  const food = quarterlyDietCost(diet);
  let health = n.health ?? DEFAULT_HEALTH;
  let foodArrears = life.foodArrears ?? 0;
  let frugal = false;
  const withDate = (x: Career) => ({ ...x, date: periodStart });
  if (n.money >= food) {
    n = { ...charge(withDate(n), `Groceries · ${diet.name} (3 months)`, food), date: n.date };
    health += diet.healthDeltaPerQuarter;
    notices.push(`Groceries: ${fmt(food)} paid (${diet.name}).`);
  } else {
    const part = Math.max(0, n.money);
    n = { ...charge(withDate(n), `Groceries (partial) · ${diet.name}`, part), date: n.date };
    foodArrears += food - part; frugal = true;
    health -= FOOD_SHORTFALL_HEALTH_PENALTY;
    notices.push(`Health Alert: Could not afford groceries — paid ${fmt(part)}, ${fmt(food - part)} unpaid. Eating frugally (-${FOOD_SHORTFALL_HEALTH_PENALTY} health).`);
  }
  let insurance = n.life!.insurance;
  let insurancePaidPeriod = life.insurancePaidPeriod ?? '';
  const plan = insuranceById(insurance.planId);
  if (plan.id !== 'none' && !(insurancePaidPeriod && periodStart <= insurancePaidPeriod)) {
    const prem = insuranceQuarterCost(plan);
    if (n.money >= prem) {
      n = { ...charge(withDate(n), `Health insurance · ${plan.name} (3 months)`, prem), date: n.date };
      insurancePaidPeriod = periodStart;
      notices.push(`Healthcare: ${fmt(prem)} paid (${plan.name}).`);
    } else {
      insurance = insuranceState(insuranceById('none')); insurancePaidPeriod = '';
      notices.push(`Health Alert: Could not pay the ${plan.name} premium. Your coverage has lapsed.`);
    }
  }
  let lifestyle = n.life!.lifestyle;
  const style = lifestyleById(lifestyle.tierId);
  const styleCost = quarterlyLifestyleCost(style);
  let energy = n.life!.energy, stress = n.life!.stress;
  if (n.money >= styleCost) {
    n = { ...charge(withDate(n), `Lifestyle · ${style.name} (3 months)`, styleCost), date: n.date };
    energy += style.energyBonusPerQuarter; stress += style.stressReductionPerQuarter;
    notices.push(`Lifestyle: ${fmt(styleCost)} paid (${style.name}).`);
  } else {
    const frugalTier = lifestyleCatalog[0]!;
    const fc = Math.min(quarterlyLifestyleCost(frugalTier), Math.max(0, n.money));
    n = { ...charge(withDate(n), `Lifestyle · ${frugalTier.name} (3 months)`, fc), date: n.date };
    lifestyle = lifestyleState(frugalTier);
    stress += LIFESTYLE_SHORTFALL_STRESS;
    notices.push(`Lifestyle Alert: Could not afford ${style.name}. Downgraded to ${frugalTier.name} (+${LIFESTYLE_SHORTFALL_STRESS} stress).`);
  }
  const v = vitalityDrift(n);
  energy += v.energy; stress += v.stress;
  n = { ...n, health: clampHealth(health), life: { ...n.life!, insurance, lifestyle, energy: clampVital(energy), stress: clampVital(stress), foodArrears, frugal, insurancePaidPeriod, lastLivingPeriod: periodStart } };
  notices.push(isBurnedOut(n)
    ? `Burnout Warning: Energy ${n.life!.energy}%, Stress ${n.life!.stress}%. Rallies are less effective until you rest.`
    : `Well-being: Energy ${n.life!.energy}% (${energyStatus(n.life!.energy)}), Stress ${n.life!.stress}% (${stressStatus(n.life!.stress)}).`);
  const e = rollHealthEmergency(n, rng);
  if (e) { const o = applyHealthEmergency({ ...n, date: periodStart }, e); n = { ...o.career, date: n.date }; notices.push(o.notice); }
  if ((n.health ?? DEFAULT_HEALTH) < EMERGENCY_HEALTH_THRESHOLD) notices.push(`Health Alert: Health is ${n.health}% — emergencies are likely. Consider a clinic visit.`);
  return { career: n, notices };
}

export const LIFESTYLE_SHORTFALL_STRESS = 10;
/** Baseline quarterly wear: busy life costs energy and adds stress. */
export const BASE_ENERGY_DRIFT = -3;
export const BASE_STRESS_DRIFT = 2;
const housingVitality = { Basic: { energy: 0, stress: 2 }, Modest: { energy: 0, stress: 0 }, Comfortable: { energy: 2, stress: -2 }, Luxury: { energy: 4, stress: -4 } } as const;
const dietEnergy: Record<DietTierId, number> = { budget: -2, standard: 0, premium: 2, organic_chef: 3 };
export const officeWorkloadStress: Record<string, number> = { council: 1, stateLeg: 2, house: 3, mayor: 4, senate: 4, governor: 6, president: 10 };
/** Non-lifestyle vitality drift for a quarter: baseline, housing quality, diet and office workload. */
export function vitalityDrift(c: Career) {
  const home = propertyById(c.housing?.currentPropertyId ?? 'room');
  const hv = housingVitality[home.quality];
  const diet = (c.life?.diet.tierId ?? 'standard') as DietTierId;
  const office = c.office ? (officeWorkloadStress[c.office.id] ?? 2) : 0;
  return { energy: BASE_ENERGY_DRIFT + hv.energy + dietEnergy[diet] + campaignTravelRelief(c), stress: BASE_STRESS_DRIFT + hv.stress + office };
}
