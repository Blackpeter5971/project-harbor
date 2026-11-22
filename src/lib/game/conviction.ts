import type { Career } from './career';
import { unpardonedRecords } from './criminal-record';

/** Simplified game rule, not a claim about real-world ballot law. Conviction history is never erased. */
export const REHABILITATION_MONTHS = 12;
export function addCalendarMonths(date: string, months: number): string {
  const [year = 2026, month = 1] = date.split('-').map(Number);
  const index = year * 12 + month - 1 + months;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}-01`;
}
export function convictionStatus(c: Career) {
  const records = (c.legal?.served ?? []).filter(s => {
    const trial = c.legal?.cases.find(k => k.id === s.caseId)?.trial;
    return s.felony || (trial?.tier !== 'minor' && trial?.verdict?.type === 'prison');
  });
  const latest = [...records].sort((a, b) => b.released.localeCompare(a.released))[0];
  if (!latest) return null;
  const until = addCalendarMonths(latest.released, REHABILITATION_MONTHS);
  const restricted = !latest.pardoned && c.date < until;
  return { felony: true, restricted, until, pardoned: latest.pardoned, released: latest.released };
}
export function ballotRestriction(c: Career): string | null {
  if (c.impeachment?.barred) return 'Removed from office by impeachment: permanently barred from public office.';
  if (c.legal?.prison || c.legal?.executed || c.crime?.arrest) return 'You are in custody or awaiting criminal trial. Campaigns are locked until release and case resolution.';
  const civil = unpardonedRecords(c).filter(r => r.source === 'civil' && r.severity === 'felony');
  const pending = civil.find(r => !c.legal?.served.some(s => s.caseId === `civil|${r.id}`));
  if (pending) return 'Unpardoned felony conviction: petition for a pardon before seeking ballot clearance.';
  const restricted = (c.legal?.served ?? []).filter(s => s.felony && !s.pardoned).find(s => c.date < addCalendarMonths(s.released, REHABILITATION_MONTHS));
  if (restricted) return `Felony conviction: ballot access returns after one year of rehabilitation, on ${addCalendarMonths(restricted.released, REHABILITATION_MONTHS)}.`;
  const status = convictionStatus(c);
  return status?.restricted ? `Felony conviction: ballot access returns after one year of rehabilitation, on ${status.until}.` : null;
}