import { z } from 'zod';

/** Zod-only (cycle-free) schemas for the Dispatch mail client and the Magazines kiosk. */
export const mailKinds = ['whip', 'donor', 'leak', 'petition', 'personal'] as const;
export const mailItemSchema = z.object({
  id: z.string(), date: z.string(), kind: z.enum(mailKinds), from: z.string(), subject: z.string(), body: z.string(),
  tag: z.enum(['Urgent', 'Confidential', 'Press', 'Personal', 'Constituent']).nullable().default(null),
  read: z.boolean().default(false), starred: z.boolean().default(false), archived: z.boolean().default(false),
  /** Index into the template's replies once answered; null while open. */
  replied: z.number().int().nullable().default(null),
  template: z.number().int().nonnegative(),
  context: z.object({ type: z.enum(['bill', 'campaign', 'scandal', 'crisis', 'job', 'finance', 'health']), id: z.string() }).optional(),
});
export const dispatchSchema = z.object({
  items: z.array(mailItemSchema).default([]),
  /** Turn-start date of the last delivery, prevents replayed mail. */
  lastTurn: z.string().default(''),
  sent: z.array(z.string()).default([]),
});
export const kioskSchema = z.object({
  covers: z.array(z.object({ id: z.string(), magazine: z.string(), title: z.string(), date: z.string() })).default([]),
  seen: z.number().int().nonnegative().default(0),
  /** Years an exclusive interview was granted or declined. */
  interviews: z.array(z.string()).default([]),
});
export type Dispatch = z.infer<typeof dispatchSchema>;
export type MailItem = z.infer<typeof mailItemSchema>;
export type Kiosk = z.infer<typeof kioskSchema>;
