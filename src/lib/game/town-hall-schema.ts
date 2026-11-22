import { z } from 'zod';

export const townHallAnswerKinds = ['populist', 'fiscal', 'reformist'] as const;
export type TownHallAnswerKind = typeof townHallAnswerKinds[number];

/** A saved town-hall encounter. Questions are frozen when hosted so reloads never reroll them. */
export const townHallSchema = z.object({
  id: z.string(), quarter: z.string(), date: z.string(), venue: z.string(),
  status: z.enum(['live', 'completed']),
  round: z.number().int().min(0).max(3),
  questions: z.array(z.object({ id: z.string(), topic: z.string(), speaker: z.string(), role: z.string(), text: z.string() })),
  answers: z.array(z.object({ question: z.string(), kind: z.enum(townHallAnswerKinds) })),
  loyalty: z.record(z.string(), z.number()).default({}),
  momentum: z.number().default(0),
  supportDelta: z.number().default(0),
  outcome: z.string().default(''),
});
export type TownHall = z.infer<typeof townHallSchema>;
