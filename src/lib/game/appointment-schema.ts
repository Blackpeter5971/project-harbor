import { z } from 'zod';

/* Phase 5 — Political appointments save shape. Zod-only and cycle-free so career.ts can embed it. */
export const appointmentSlotSchema = z.object({
  slot: z.enum(['advisory', 'administration', 'media']),
  dilemma: z.string(),
  resolved: z.boolean().default(false),
  choice: z.string().nullable().default(null),
  outcome: z.string().nullable().default(null),
});
export type AppointmentSlot = z.infer<typeof appointmentSlotSchema>;

export const appointmentNoteSchema = z.object({ end: z.string(), text: z.string(), tone: z.enum(['good', 'bad', 'info']) });
export type AppointmentNote = z.infer<typeof appointmentNoteSchema>;

export const appointmentSchema = z.object({
  roleId: z.string(),
  title: z.string(),
  tier: z.enum(['municipal', 'state', 'federal']),
  jurisdiction: z.string(),
  superiorId: z.string(),
  superiorName: z.string(),
  superiorParty: z.enum(['Democrat', 'Republican', 'Independent']),
  superiorOffice: z.string(),
  pathway: z.enum(['party', 'network', 'campaign']),
  since: z.string(),
  termEnd: z.string(),
  trust: z.number().min(0).max(100).catch(60),
  competency: z.number().min(0).max(100).catch(55),
  /** Agency allocation from the Government Treasury; never the player's personal cash. */
  budget: z.number().nonnegative().catch(0),
  spent: z.number().nonnegative().catch(0),
  quarter: z.string(),
  revision: z.number().int().nonnegative().default(0),
  docket: z.array(appointmentSlotSchema).default([]),
  /** Superior misconduct the player has evidence of; enables whistleblowing. */
  misconduct: z.string().nullable().default(null),
  lastPaidEnd: z.string().default(''),
});
export type Appointment = z.infer<typeof appointmentSchema>;

export const appointmentPledgeSchema = z.object({
  figureId: z.string(),
  race: z.enum(['Mayor', 'Governor', 'President']),
  electionDate: z.string(),
  effort: z.number().int().nonnegative().default(0),
  lastEffort: z.string().default(''),
  since: z.string(),
});
export type AppointmentPledge = z.infer<typeof appointmentPledgeSchema>;

export const appointmentCareerSchema = z.object({
  current: appointmentSchema.nullable().default(null),
  pledge: appointmentPledgeSchema.nullable().default(null),
  /** Superior who owes the player an appointment after a won pledged race. */
  owed: z.string().nullable().default(null),
  history: z.array(z.object({ title: z.string(), superior: z.string(), since: z.string(), ended: z.string(), reason: z.enum(['resigned', 'dismissed', 'term', 'whistleblower']) })).default([]),
  notes: z.array(appointmentNoteSchema).default([]),
  lastEnd: z.string().default(''),
  revision: z.number().int().nonnegative().default(0),
});
export type AppointmentCareer = z.infer<typeof appointmentCareerSchema>;
