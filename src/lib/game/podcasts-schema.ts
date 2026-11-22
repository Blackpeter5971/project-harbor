import { z } from 'zod';

export const podcastEpisodeSchema = z.object({
  id: z.string(), date: z.string(), format: z.string(), title: z.string(),
  downloads: z.number().nonnegative(), listenersGained: z.number(),
  quotes: z.array(z.object({ author: z.string(), text: z.string() })).default([]),
  sponsorPay: z.number().nonnegative().default(0),
});
export const podcastShowSchema = z.object({
  name: z.string(), created: z.string(),
  listeners: z.number().nonnegative().default(0), totalDownloads: z.number().nonnegative().default(0),
  earnings: z.number().nonnegative().default(0), lastQuarterEarnings: z.number().nonnegative().default(0),
  episodes: z.array(podcastEpisodeSchema).default([]),
  quarter: z.string().default(''), quarterEpisodes: z.number().int().nonnegative().default(0),
  /** Quarter key of the last sponsor payout; prevents replayed income. */
  lastPaidQuarter: z.string().default(''),
  /** Turn-start date of the last processed turn; prevents replayed long-tail growth. */
  lastTurn: z.string().default(''),
});
export type PodcastShow = z.infer<typeof podcastShowSchema>;
export type PodcastEpisode = z.infer<typeof podcastEpisodeSchema>;
