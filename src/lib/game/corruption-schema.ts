import { z } from 'zod';

/** Illicit ledger — kept fully separate from personal, campaign and government accounts. */
export const illicitTxnSchema = z.object({
  id: z.string(), date: z.string(), amount: z.number(),
  kind: z.enum(['bribe', 'dark_money', 'self_dealing', 'laundering', 'influence', 'embezzlement', 'tax_evasion']),
  /** Who paid, as recorded in the paper trail. */
  source: z.string(),
  /** Where the money landed: off-books reserve or campaign coffers (flagged undisclosed). */
  destination: z.enum(['illicit_reserve', 'campaign', 'business', 'personal']),
  favor: z.string().default(''),
  risk: z.enum(['Low', 'Medium', 'High']),
  /** Exposure points this transaction added to the paper trail. */
  evidence: z.number(),
});
export type IllicitTxn = z.infer<typeof illicitTxnSchema>;

export const corruptionSchema = z.object({
  /** Off-books cash; never counted in career.money. */
  reserve: z.number().default(0),
  /** Evidence / exposure risk, 0–100. */
  exposure: z.number().min(0).max(100).default(0),
  txns: z.array(illicitTxnSchema).default([]),
  /** Turn date whose bribe offer has been answered (accepted or declined). */
  bribeTurn: z.string().default(''),
  darkMoneyTurn: z.string().default(''),
  /** Quarter end already processed for decay, leaks and audits. */
  lastTurn: z.string().default(''),
  lastAudit: z.string().default(''),
  launderTurn: z.string().default(''),
  influenceTurn: z.string().default(''),
  embezzleTurn: z.string().default(''),
  /** Self-dealing txn ids already reported by a whistleblower. */
  whistled: z.array(z.string()).default([]),
});
export type Corruption = z.infer<typeof corruptionSchema>;
