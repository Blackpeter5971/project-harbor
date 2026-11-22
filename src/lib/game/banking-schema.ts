import { z } from 'zod';
const cash = z.number().finite().nonnegative();
export const bankingSchema = z.object({
  savings: cash.default(0), revision: z.number().int().nonnegative().default(0),
  lastProcessedEnd: z.string().default(''), nextId: z.number().int().positive().default(1),
  onTime: z.number().int().nonnegative().default(0), missed: z.number().int().nonnegative().default(0),
  deposits: z.array(z.object({ id: z.string(), principal: cash, apr: cash, turns: z.union([z.literal(1), z.literal(2), z.literal(4)]), opened: z.string(), maturity: z.string(), payout: cash, status: z.enum(['locked', 'matured']) })).default([]),
  loans: z.array(z.object({ id: z.string(), principal: cash, rate: cash, turns: z.number().int().min(4).max(12), opened: z.string(), nextDue: z.string(), payment: cash, total: cash, remaining: cash, elapsed: z.number().int().nonnegative(), arrears: cash, fees: cash })).default([]),
  missedStreak: z.number().int().nonnegative().default(0), foreclosedOn: z.string().optional(),
  transactions: z.array(z.object({ key: z.string(), date: z.string(), label: z.string(), amount: z.number().finite() })).default([]),
});
export type Banking = z.infer<typeof bankingSchema>;