import { z } from 'zod';
import type { Career } from './career';

export const docketSlotSchema = z.object({
  slot: z.enum(['legislature', 'policy', 'routine']),
  title: z.string(),
  kind: z.enum(['bill', 'agenda', 'appointments', 'project', 'emergency', 'initiative', 'routine', 'budget']),
  reference: z.string().nullable(),
  resolved: z.boolean().default(false),
  choice: z.string().nullable().default(null),
  outcome: z.string().nullable().default(null),
  /** Legislative pool issue id (slot 1) and how many times it was returned for revision. */
  issue: z.string().nullable().default(null),
  rev: z.number().int().nonnegative().default(0),
});
export const returnedBillSchema = z.object({ issue: z.string(), rev: z.number().int().positive(), due: z.string() });
export const executiveDocketSchema = z.object({
  id: z.string(), tenure: z.string(), quarter: z.string(), inauguration: z.boolean(),
  revision: z.number().int().nonnegative().default(0),
  /** Bills returned to the legislature; each reappears once, with revised text, in its due quarter. */
  returned: z.array(returnedBillSchema).default([]),
  /** Cabinet roles whose nominee the chamber rejected; Slot 2 re-nominates next cycle. */
  renominate: z.array(z.string()).default([]),
  items: z.tuple([
    docketSlotSchema.extend({ slot: z.literal('legislature') }),
    docketSlotSchema.extend({ slot: z.literal('policy') }),
    docketSlotSchema.extend({ slot: z.literal('routine') }),
  ]),
});
export type ExecutiveDocket = z.infer<typeof executiveDocketSchema>;
export type DocketSlot = ExecutiveDocket['items'][number];
export const executiveOffice = (c: Career) => !!c.office && ['mayor', 'governor', 'president'].includes(c.office.id) && c.date >= c.office.since && (!c.office.termEnd || c.date < c.office.termEnd);
export const docketQuarter = (date: string) => `${date.slice(0, 4)}-Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`;
/** Quarter label `n` quarters after `q` (e.g. 2028-Q4 + 2 = 2029-Q2). */
export const addQuarters = (q: string, n: number) => { const i = Number(q.slice(0, 4)) * 4 + Number(q.slice(6)) - 1 + n; return `${Math.floor(i / 4)}-Q${(i % 4) + 1}`; };
/** Q4 closes the fiscal year: Slot 2 always carries the annual budget then. */
export const budgetQuarter = (q: string) => q.endsWith('Q4');
export const ANNUAL_BUDGET_TITLE = 'Annual Executive Budget & Tax Proposal';
export const docketTenure = (c: Career) => c.office ? `${c.office.id}|${c.office.jurisdiction}|${c.office.since}` : '';

/** Schema-only backfill: no treasury, progress, approval or action mutations. */
export function initializeDocket(c: Career): Career {
  if (!executiveOffice(c)) return c;
  const tenure = docketTenure(c), quarter = docketQuarter(c.date);
  if (c.executiveDocket?.tenure === tenure && c.executiveDocket.quarter === quarter) return c;
  const inauguration = docketQuarter(c.office?.since ?? '') === quarter;
  const pending = c.bills.filter(b => b.tenure === tenure && !['passed', 'rejected'].includes(b.stage));
  const bill = pending.find(b => b.stage === 'awaiting approval') ?? pending[0];
  const same = c.executiveDocket?.tenure === tenure;
  const carried = same ? c.executiveDocket?.returned ?? [] : [], renominate = same ? c.executiveDocket?.renominate ?? [] : [];
  const item = <S extends DocketSlot['slot']>(slot: S, title: string, kind: DocketSlot['kind'], reference: string | null = null): Omit<DocketSlot, 'slot'> & { slot: S } => ({ slot, title, kind, reference, resolved: false, choice: null, outcome: null, issue: null, rev: 0 });
  return { ...c, executiveDocket: { id: `${tenure}|${quarter}`, tenure, quarter, inauguration, revision: 0, returned: carried, renominate, items: [
    item('legislature', inauguration ? 'Inaugural agenda' : bill?.title ?? 'Legislative measure', inauguration ? 'agenda' : 'bill', inauguration ? null : bill?.id ?? null),
    inauguration ? item('policy', 'Cabinet appointments', 'appointments') : budgetQuarter(quarter) ? item('policy', ANNUAL_BUDGET_TITLE, 'budget', 'fiscal') : renominate.length || quarter.endsWith('Q2') ? item('policy', 'Cabinet nomination', 'appointments') : item('policy', 'Priority public investment', 'project'),
    item('routine', 'Leadership routine', 'routine'),
  ] } };
}