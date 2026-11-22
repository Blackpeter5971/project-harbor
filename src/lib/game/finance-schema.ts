import { z } from 'zod';

/** Cycle-free schema for government finance state embedded in the tenure-scoped treasury. */
const economy = z.object({ business: z.number().default(50), employment: z.number().default(50), household: z.number().default(50), happiness: z.number().default(50) });
export const loanSchema = z.object({
  id: z.string(), taken: z.string(), principal: z.number().nonnegative(), rate: z.number().nonnegative(),
  quarters: z.number().int().positive(), payment: z.number().nonnegative(), remaining: z.number().int().nonnegative(),
  arrears: z.number().nonnegative().default(0), missed: z.number().int().nonnegative().default(0), lastPaidEnd: z.string().default(''),
});
export const annualReportSchema = z.object({
  year: z.number(), revenue: z.number(), expenditure: z.number(), planned: z.number(), variance: z.number(), debt: z.number(),
  completed: z.array(z.string()).default([]), unfinished: z.array(z.string()).default([]), ignored: z.array(z.string()).default([]),
  economyStart: economy, economyEnd: economy,
});
export const govEventSchema = z.object({
  id: z.string(), catalogId: z.string(), name: z.string(), detail: z.string().default(''),
  kind: z.enum(['manageable', 'external', 'positive']), severity: z.enum(['low', 'moderate', 'high', 'critical']),
  date: z.string(), remaining: z.number().int().nonnegative(), status: z.enum(['active', 'resolved']).default('active'),
  response: z.string().nullable().default(null), petitioned: z.boolean().default(false), emergency: z.boolean().default(false),
  pressure: z.number().default(0), treasury: z.number().default(0), happiness: z.number().default(0), approval: z.number().default(0),
  outcome: z.string().default(''), lastEnd: z.string().default(''),
});
export const financeSchema = z.object({
  events: z.array(govEventSchema).default([]), eventEnd: z.string().default(''),
  economy: economy.default({ business: 50, employment: 50, household: 50, happiness: 50 }),
  yearStart: z.object({ year: z.number(), economy }).nullable().default(null),
  loans: z.array(loanSchema).default([]),
  decisions: z.array(z.object({ year: z.number(), catalogId: z.string(), decision: z.enum(['approved', 'rejected', 'postponed', 'ignored']), date: z.string() })).default([]),
  reports: z.array(annualReportSchema).default([]),
  pendingReport: z.number().nullable().default(null),
  mood: z.object({ score: z.number().int().min(-5).max(5).default(0), unrestQuarters: z.number().int().nonnegative().default(0), history: z.array(z.object({ date: z.string(), score: z.number() })).default([]) }).nullable().default(null),
  lastEnd: z.string().default(''), taxTurn: z.string().default(''), grantTurn: z.string().default(''),
});
export type Finance = z.infer<typeof financeSchema>;
export type Economy = Finance['economy'];
export type GovEvent = z.infer<typeof govEventSchema>;
export type GovLoan = z.infer<typeof loanSchema>;
export type AnnualReport = z.infer<typeof annualReportSchema>;
