import { z } from 'zod';

export const debateSchema = z.object({
  id: z.string(), date: z.string(), office: z.string(), title: z.string(), electionDate: z.string(),
  status: z.enum(['invited', 'live', 'completed', 'skipped']),
  opponents: z.array(z.object({ name: z.string(), party: z.string(), portrait: z.number().int().min(0).max(5), policy: z.string() })),
  round: z.number().int().min(0).max(4), answers: z.array(z.string()), score: z.number(),
  transcript: z.array(z.object({ speaker: z.string(), text: z.string() })),
  supportDelta: z.number().default(0), approvalDelta: z.number().default(0), outcome: z.string().default(''),
});
export type Debate = z.infer<typeof debateSchema>;