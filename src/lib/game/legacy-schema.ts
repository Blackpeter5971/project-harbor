import { z } from 'zod';

export const classifications = ['Great Leader', 'Transformational Leader', 'Successful Administrator', 'Popular Leader', 'Political Survivor', 'Controversial Leader', 'Failed Leader', 'Corrupt Leader'] as const;
export const medicalSchema = z.object({
  lastCheckup: z.string().default(''), chronic: z.enum(['cardiac']).nullable().default(null),
  emergencies: z.array(z.object({ date: z.string(), name: z.string(), untreated: z.boolean() })).default([]),
});
export const evidenceSchema = z.object({
  id: z.string(), owner: z.string(), date: z.string(), kind: z.enum(['election', 'law', 'project', 'crisis', 'scandal', 'economy', 'family', 'milestone']),
  title: z.string(), detail: z.string(), tenure: z.string().default(''), outcome: z.string().default(''),
});
export const metricsSchema = z.object({
  governance: z.number(), economy: z.number(), happiness: z.number(), integrity: z.number(), score: z.number(),
  classification: z.enum(classifications), years: z.number(), wins: z.number(), losses: z.number(),
  laws: z.number(), projects: z.number(), managed: z.number(), neglected: z.number(), proven: z.number(), weathered: z.number(),
  approval: z.number().nullable(), offices: z.array(z.string()),
});
export const executiveRecordSchema = z.object({
  id: z.string(), owner: z.string(), name: z.string(), number: z.number().int().positive(), office: z.string(), title: z.string(), jurisdiction: z.string(),
  party: z.string(), since: z.string(), ended: z.string(), reason: z.string(), cabinet: z.array(z.string()),
  metrics: metricsSchema, laws: z.array(z.string()), projects: z.array(z.string()), crises: z.array(z.string()),
  economicIndicators: z.record(z.string(), z.number()),
});
export const lifeRecordSchema = z.object({
  id: z.string(), owner: z.string(), name: z.string(), generation: z.number(), age: z.number(), date: z.string(),
  kind: z.enum(['retirement', 'death', 'handoff']), cause: z.string(), officeAtEnd: z.string().nullable(),
  metrics: metricsSchema, obituary: z.string(), reaction: z.string(),
});
export const approvalSampleSchema = z.object({ id: z.string(), owner: z.string(), date: z.string(), tenure: z.string(), approval: z.number(), economy: z.number().nullable(), happiness: z.number().nullable() });
export const archiveSchema = z.object({
  evidence: z.array(evidenceSchema).default([]), executives: z.array(executiveRecordSchema).default([]),
  lives: z.array(lifeRecordSchema).default([]), samples: z.array(approvalSampleSchema).default([]),
});
export const legacySchema = z.object({
  owner: z.string().default(''), archive: archiveSchema.default({}), lastPeriod: z.string().default(''),
  death: lifeRecordSchema.nullable().default(null), retirementSeen: z.boolean().default(false),
  burnoutQuarters: z.number().int().nonnegative().default(0),
  security: z.object({ bodyguardUntil: z.string().default(''), reviewedPeriod: z.string().default(''), warning: z.string().default('') }).default({}),
});
export type Legacy = z.infer<typeof legacySchema>;
export type Archive = z.infer<typeof archiveSchema>;
export type LegacyMetrics = z.infer<typeof metricsSchema>;
export type LifeRecord = z.infer<typeof lifeRecordSchema>;