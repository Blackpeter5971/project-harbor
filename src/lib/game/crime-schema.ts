import { z } from 'zod';

/** Civilian street crime — separate from political corruption (corruption-schema.ts) and every money account. */
export const crimeIds = ['petty_theft', 'street_fraud', 'burglary', 'smuggling'] as const;
export const civilCounsel = ['none', 'public', 'private', 'firm'] as const;
export const defenseArguments = ['plead', 'contest', 'ties'] as const;
export const custodyStates = ['remand', 'police', 'bail'] as const;

export const civilRecordSchema = z.object({
  id: z.string(), date: z.string(), crimeId: z.enum(crimeIds), charge: z.string(),
  severity: z.enum(['misdemeanor', 'felony']), jurisdiction: z.enum(['state', 'federal']),
  outcome: z.enum(['fined', 'prison']), sentence: z.number().int().min(0).default(0),
  fine: z.number().default(0), restitution: z.number().default(0),
  pardoned: z.boolean().default(false), pardonDate: z.string().default(''),
});
export type CivilRecord = z.infer<typeof civilRecordSchema>;

export const arrestSchema = z.object({
  id: z.string(), date: z.string(), crimeId: z.enum(crimeIds), charge: z.string(),
  /** Value the victim lost; restitution on conviction. */
  loss: z.number().default(0),
  /** Prosecution evidence 0–100. */
  evidence: z.number().min(0).max(100),
  /** 'intake' blocks play until counsel/argument are chosen; then the arraignment sets custody. */
  stage: z.enum(['intake', 'arraigned']),
  counsel: z.enum(civilCounsel).default('none'),
  argument: z.enum(defenseArguments).nullable().default(null),
  defense: z.number().min(0).max(100).default(0),
  flightRisk: z.number().min(0).max(100).default(0),
  custody: z.enum(custodyStates).nullable().default(null),
  bail: z.number().default(0),
  bailPosted: z.boolean().default(false),
  trialDate: z.string().default(''),
  /** Quarter in which the defense was prepared (once per quarter). */
  preparedTurn: z.string().default(''),
  contactTurn: z.string().default(''),
});
export type Arrest = z.infer<typeof arrestSchema>;

export const crimeSchema = z.object({
  /** Untraced street cash; never part of personal, bank, campaign, business or political-illicit balances. */
  stash: z.number().min(0).default(0),
  streetRep: z.number().min(0).max(100).default(0),
  /** Police attention 0–100; decays each quarter. */
  heat: z.number().min(0).max(100).default(0),
  revision: z.number().int().min(0).default(0),
  turn: z.string().default(''),
  uses: z.array(z.string()).default([]),
  spent: z.number().min(0).default(0),
  lastTurn: z.string().default(''),
  arrest: arrestSchema.nullable().default(null),
  /** Permanent conviction history — never trimmed. */
  records: z.array(civilRecordSchema).default([]),
  /** Resolved arrests (dismissals, acquittals and convictions), capped for display. */
  cases: z.array(z.object({ id: z.string(), date: z.string(), charge: z.string(), custody: z.string(), result: z.string() })).default([]),
  attempts: z.array(z.object({ id: z.string(), date: z.string(), crimeId: z.enum(crimeIds), outcome: z.enum(['success', 'arrested']), payout: z.number() })).default([]),
  petitions: z.array(z.object({ id: z.string(), date: z.string(), target: z.string(), authority: z.enum(['Governor', 'President']), chance: z.number(), granted: z.boolean() })).default([]),
});
export type Crime = z.infer<typeof crimeSchema>;
