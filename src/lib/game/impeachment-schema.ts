import { z } from 'zod';

/** Cycle-free save schema for public unrest and impeachment (embedded as optional career.impeachment). */
export const unrestChoices = ['address', 'concessions', 'enforcement'] as const;
export type UnrestChoice = typeof unrestChoices[number];
export const impeachmentStages = ['investigation', 'house_vote', 'senate_trial'] as const;

export const impeachmentVoteSchema = z.object({ label: z.string(), chamber: z.string(), seats: z.number().int(), yes: z.number().int(), no: z.number().int(), needed: z.number().int(), passed: z.boolean(), date: z.string() });
export type ImpeachmentVote = z.infer<typeof impeachmentVoteSchema>;

export const impeachmentSchema = z.object({
  tenure: z.string().default(''),
  /** Quarter watermark so turn processing never runs twice for one quarter. */
  lastQuarter: z.string().default(''),
  lowQuarters: z.number().int().nonnegative().default(0),
  unrest: z.object({ id: z.string(), title: z.string(), since: z.string(), quarters: z.number().int().nonnegative().default(0), respondedQuarter: z.string().default('') }).nullable().default(null),
  proceeding: z.object({
    id: z.string(), office: z.string(), stage: z.enum(impeachmentStages), since: z.string(), reason: z.string(),
    articles: z.array(z.string()), votes: z.array(impeachmentVoteSchema).default([]), defense: z.number().int().nonnegative().default(0), defenseQuarter: z.string().default(''),
  }).nullable().default(null),
  cooldownUntil: z.string().default(''),
  barred: z.boolean().default(false),
  acquittals: z.number().int().nonnegative().default(0),
  history: z.array(z.object({ date: z.string(), text: z.string() })).default([]),
});
export type Impeachment = z.infer<typeof impeachmentSchema>;
