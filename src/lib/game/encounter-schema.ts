import { z } from 'zod';

/** Display/context snapshots only; no asset imports or gameplay dependencies. */
export const encounterSceneSchema = z.object({
  archetype: z.enum(['nepotism', 'corruption', 'romance', 'rival', 'crisis', 'milestone']),
  backdrop: z.string(), setting: z.string(), speaker: z.string(), role: z.string(),
  portrait: z.string().optional(), personId: z.string().optional(),
  campaignId: z.string().optional(), contextId: z.string().optional(),
  reaction: z.enum(['heart', 'stress', 'alert', 'handshake']),
  opening: z.string(),
});
export type EncounterScene = z.infer<typeof encounterSceneSchema>;