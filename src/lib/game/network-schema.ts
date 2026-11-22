import { z } from 'zod';

/* Phase 4 — Political Network save shape. Zod-only and cycle-free so career.ts can embed it. */
export const figureStateSchema = z.object({
  id: z.string(),
  office: z.string(),
  party: z.enum(['Democrat', 'Republican', 'Independent']),
  score: z.number().min(-100).max(100).catch(0),
  loyalty: z.number().min(0).max(100).catch(50),
  satisfaction: z.number().min(0).max(100).catch(60),
  influence: z.number().min(0).max(100).catch(50),
  reputation: z.number().min(0).max(100).catch(50),
  allied: z.boolean().catch(false),
  lastMet: z.string().catch(''),
  lastSeen: z.string().catch(''),
  endorsedBy: z.string().catch(''),
  endorsedPlayer: z.string().catch(''),
  funded: z.string().catch(''),
  recruitYear: z.number().int().catch(0),
  persuadeTurn: z.string().catch(''),
  allianceTurn: z.string().catch(''),
  /** Undefined only on legacy saves; backfilled by withDiscovery. */
  discovered: z.boolean().optional(),
  discoveredAt: z.string().optional(),
});
export type FigureState = z.infer<typeof figureStateSchema>;

export const networkOfferSchema = z.object({
  id: z.string(), figureId: z.string(), kind: z.enum(['truce', 'endorse', 'appointment', 'alliance', 'support', 'assist']), date: z.string(), text: z.string(),
  /** Assistance requests only: what the politician needs and how big the ask is (1-3). */
  topic: z.string().optional(), stakes: z.number().int().min(1).max(3).optional(),
});
export type NetworkOffer = z.infer<typeof networkOfferSchema>;

export const networkNoteSchema = z.object({
  end: z.string(), figureId: z.string(), text: z.string(), tone: z.enum(['good', 'bad', 'info']),
});
export type NetworkNote = z.infer<typeof networkNoteSchema>;

export const networkSchema = z.object({
  figures: z.array(figureStateSchema).catch([]),
  offers: z.array(networkOfferSchema).catch([]),
  notes: z.array(networkNoteSchema).catch([]),
  lastEnd: z.string().catch(''),
  hostTurn: z.string().catch(''),
  revision: z.number().int().nonnegative().catch(0),
});
export type Network = z.infer<typeof networkSchema>;
