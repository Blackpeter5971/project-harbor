import { z } from 'zod';
import { legacySector, sectorIds } from './business-sectors';

export const businessCategories = ['commerce', 'media'] as const;
export type BusinessCategory = (typeof businessCategories)[number];

const businessEntrySchema = z.object({ month: z.string(), label: z.string(), amount: z.number() });
export const productTiers = ['standard', 'premium', 'signature'] as const;
export const businessProductSchema = z.object({
  id: z.string(), name: z.string().trim().min(1).max(48), tier: z.enum(productTiers),
  price: z.number().finite().positive().max(10000000), active: z.boolean(),
  launched: z.string(), setupCost: z.number().finite().nonnegative(),
  annualVolume: z.number().int().nonnegative().max(100000000).optional(),
});
export type BusinessProduct = z.infer<typeof businessProductSchema>;
export const employeeSchema = z.object({ id: z.string(), hired: z.string(), quarterlySalary: z.number().finite().nonnegative() });
export const generalManagerSchema = z.object({ id: z.string(), name: z.string(), source: z.enum(['contact', 'professional']), quality: z.number().min(0).max(100), quarterlySalary: z.number().finite().nonnegative(), appointed: z.string() });
export type GeneralManager = z.infer<typeof generalManagerSchema>;

/** Player-owned business. `account` is the business's own cash — never personal cash, campaign funds or treasury. */
export const businessSchema = z.object({
  id: z.string(), name: z.string(), kind: z.string(), founded: z.string(), account: z.number().default(0),
  catalogId: z.string().default(''),
  category: z.enum(businessCategories).default('commerce'),
  reputation: z.number().default(25),
  managerId: z.string().nullable().optional(),
  lastProcessed: z.string().nullable().default(null),
  lastRevenue: z.number().default(0),
  lastExpenses: z.number().default(0),
  ledger: z.array(businessEntrySchema).default([]),
  sector: z.enum(sectorIds).optional(),
  focus: z.string().optional(),
  initialInvestment: z.number().finite().nonnegative().optional(),
  additionalCapital: z.number().finite().nonnegative().optional(),
  operatingCash: z.number().finite().optional(),
  retainedEarnings: z.number().finite().optional(),
  valuation: z.number().finite().nonnegative().optional(),
  startupPaid: z.boolean().optional(),
  quarterlyHistory: z.array(z.object({ date: z.string(), revenue: z.number(), expenses: z.number(), netProfit: z.number(), operatingCash: z.number(), retainedEarnings: z.number(), valuation: z.number(), taxes: z.number().optional(), payroll: z.number().optional(), demanded: z.number().optional(), sold: z.number().optional() })).optional(),
  products: z.array(businessProductSchema).optional(),
  employees: z.array(employeeSchema).optional(),
  generalManager: generalManagerSchema.nullable().optional(),
  lastTaxes: z.number().finite().nonnegative().optional(),
  lastUnitsDemanded: z.number().int().nonnegative().optional(),
  lastUnitsSold: z.number().int().nonnegative().optional(),
  financialDistress: z.boolean().optional(),
  lastProcessedEnd: z.string().optional(),
  expansions: z.array(z.string()).optional(),
  branches: z.number().int().min(0).max(30).optional(),
  marketingBudget: z.number().finite().nonnegative().optional(),
  gmAutomation: z.boolean().optional(),
  lastPitch: z.string().optional(),
  investors: z.array(z.object({ id: z.string(), name: z.string(), stake: z.number().min(0).max(1), amount: z.number().nonnegative(), date: z.string() })).optional(),
});
export type Business = z.infer<typeof businessSchema>;
/** Account remains the compatibility cash alias for media/contracts; all cash writes synchronize it. */
export function normalizeBusiness(b: Business) {
  const investments = b.ledger.filter(e => e.label === 'Owner capital investment').reduce((sum, e) => sum + Math.max(0, e.amount), 0);
  const injections = b.ledger.filter(e => e.label === 'Owner capital injection').reduce((sum, e) => sum + Math.max(0, e.amount), 0);
  const initialInvestment = b.initialInvestment ?? (investments || Math.max(0, b.account - injections));
  const additionalCapital = b.additionalCapital ?? injections;
  // Never assume a trimmed old ledger proves profit: unknown balances are locked capital.
  const retainedEarnings = b.retainedEarnings ?? Math.min(0, b.account - initialInvestment - additionalCapital);
  return { ...b, sector: b.sector ?? legacySector(b.catalogId, b.category), focus: b.focus ?? b.kind,
    initialInvestment, additionalCapital, operatingCash: b.account, retainedEarnings,
    valuation: b.valuation ?? Math.max(0, b.account), startupPaid: b.startupPaid ?? true, quarterlyHistory: (b.quarterlyHistory ?? []).slice(-4), products: b.products ?? [], employees: b.employees ?? [], generalManager: b.generalManager ?? null, lastTaxes: b.lastTaxes ?? 0, lastUnitsDemanded: b.lastUnitsDemanded ?? 0, lastUnitsSold: b.lastUnitsSold ?? 0, financialDistress: b.account < 0, lastProcessedEnd: b.lastProcessedEnd ?? '', expansions: b.expansions ?? [] };
}
/** Non-capital company income/expense; external media/contract paths use this same profit accounting. */
export function changeBusinessCash(b: Business, amount: number): Business {
  const n = normalizeBusiness(b), account = n.account + amount;
  return { ...n, account, operatingCash: account, financialDistress: account < 0, retainedEarnings: n.retainedEarnings + amount, valuation: Math.max(0, n.valuation + amount) };
}
