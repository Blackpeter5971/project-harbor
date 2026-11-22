import type { Career } from './career';
import { judgeLegislativeTerm } from './legislative-record';
import { captureLegacy } from './legacy';

export const termYears: Record<string, number> = { council: 4, mayor: 4, stateLeg: 2, house: 2, governor: 4, senate: 6, president: 4 };
export const termEndDate = (start: string, id: string) => `${Number(start.slice(0, 4)) + (termYears[id] ?? 4)}${start.slice(4)}`;
export const termKey = (c: Career) => c.office ? `${c.office.id}|${c.office.jurisdiction}|${c.office.since}` : '';
export function monthsRemaining(c: Career): number {
  if (!c.office?.termEnd) return 0;
  const [ey = 0, em = 1] = c.office.termEnd.split('-').map(Number);
  const [y = 0, m = 1] = c.date.split('-').map(Number);
  return Math.max(0, (ey - y) * 12 + em - m);
}
/** Incumbents contest their own seat, not an earlier Senate seat or local mid-term cycle. */
export function incumbentElection(c: Career): string | null {
  if (!c.office?.termEnd) return null;
  return `${Number(c.office.termEnd.slice(0, 4)) - 1}-11-01`;
}
export function presidentialTerms(c: Career): number {
  const starts = new Set(c.termHistory.filter(t => t.office.id === 'president').map(t => t.office.since));
  if (c.office?.id === 'president') starts.add(c.office.since);
  return starts.size;
}
export function termLimitReason(c: Career, id: string): string | null {
  return id === 'president' && presidentialTerms(c) >= 2 ? 'Presidential limit reached: two elected terms. Choose another office or leave public service.' : null;
}
export function nearTermEnd(c: Career): boolean {
  return !!c.office && monthsRemaining(c) <= 12 && c.date < c.office.termEnd;
}
export function chooseTermPlan(c: Career, choice: 'run' | 'leave'): { ok: true; career: Career; message: string } | { ok: false; message: string } {
  if (!nearTermEnd(c) || !c.office) return { ok: false, message: 'Term choices open in the final year of an active term.' };
  if (choice === 'run' && termLimitReason(c, c.office.id)) return { ok: false, message: termLimitReason(c, c.office.id) ?? 'Term limit reached.' };
  if (choice === 'leave' && c.campaign) return { ok: false, message: 'An active campaign is already in progress.' };
  if (c.termPlan?.tenure === termKey(c) && c.termPlan.choice === choice) return { ok: false, message: 'That term choice is already saved.' };
  const message = choice === 'leave' ? 'You will leave at term end. Salary continues only for months served; personal savings are preserved.' : 'Re-election requires a new campaign and a new election win. Your term has not been extended.';
  return { ok: true, career: { ...c, termPlan: { tenure: termKey(c), choice }, log: [message, ...c.log].slice(0, 12) }, message };
}
/** Capture the whole tenure before active allocations are cleared. Never erase salary or personal records. */
export function archiveTerm(c: Career, ended: string, reason: 'term ended' | 'resigned' | 're-elected' | 'changed office' | 'removed from office' | 'retired' | 'died in office'): Career {
  const office = c.office;
  if (!office || c.termHistory.some(t => t.office.id === office.id && t.office.since === office.since && t.ended !== null)) return c;
  c = judgeLegislativeTerm(c);
  const record = { office, ended, reason, government: { budget: c.budget, treasury: c.treasury, approval: c.approval, city: c.city, stateGovernment: c.stateGovernment, federalGovernment: c.federalGovernment } };
  return { ...captureLegacy({ ...c, date: ended, termPlan: null, termHistory: [...c.termHistory.filter(t => !(t.office.id === office.id && t.office.since === office.since)), record] }), date: c.date };
}