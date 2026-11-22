import { z } from 'zod';

export const tubeVideoSchema = z.object({
  id: z.string(), date: z.string(), format: z.string(), title: z.string(),
  views: z.number(), likes: z.number(), subsGained: z.number(), watchHours: z.number(),
  comments: z.array(z.object({ author: z.string(), text: z.string(), likes: z.number() })).default([]),
});
export const tubeChannelSchema = z.object({
  name: z.string(), created: z.string(),
  subscribers: z.number().nonnegative().default(0), totalViews: z.number().nonnegative().default(0),
  watchHours: z.number().nonnegative().default(0), earnings: z.number().nonnegative().default(0),
  lastQuarterEarnings: z.number().nonnegative().default(0),
  videos: z.array(tubeVideoSchema).default([]),
  quarter: z.string().default(''), quarterUploads: z.number().int().nonnegative().default(0),
  /** Turn-start date of the last processed turn, prevents replayed passive income. */
  lastTurn: z.string().default(''),
  milestones: z.array(z.string()).default([]),
});
export type TubeChannel = z.infer<typeof tubeChannelSchema>;
export type TubeVideo = z.infer<typeof tubeVideoSchema>;
