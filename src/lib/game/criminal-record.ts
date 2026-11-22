import type { Career } from './career';

/**
 * Read-only criminal record view. Type-only imports keep it safe for job-market.ts and conviction.ts.
 * Records are permanent: a pardon flags an entry, it never removes it.
 */
export type RecordEntry = { id: string; date: string; charge: string; severity: 'misdemeanor' | 'felony'; source: 'civil' | 'court'; pardoned: boolean; outcome: string };

export function criminalRecord(c: Career): RecordEntry[] {
  const civil: RecordEntry[] = (c.crime?.records ?? []).map(r => ({ id: r.id, date: r.date, charge: r.charge, severity: r.severity, source: 'civil', pardoned: r.pardoned,
    outcome: r.outcome === 'prison' ? `${r.sentence} quarter${r.sentence === 1 ? '' : 's'} in custody` : `Fined $${Math.round(r.fine + r.restitution).toLocaleString('en-US')}` }));
  const court: RecordEntry[] = (c.legal?.cases ?? []).flatMap(k => {
    const trial = k.trial, v = trial?.verdict;
    if (k.stage !== 'convicted' || k.id.startsWith('civil|') || !trial || !v) return [];
    const served = c.legal?.served.find(s => s.caseId === k.id);
    return [{ id: k.id, date: v.date, charge: trial.charges.join('; ') || 'Official misconduct', severity: trial.tier === 'minor' ? 'misdemeanor' as const : 'felony' as const, source: 'court' as const,
      pardoned: !!served?.pardoned, outcome: v.type === 'prison' ? 'Custodial sentence' : v.type === 'censure' ? 'Censure' : 'Fined' }];
  });
  return [...civil, ...court].sort((a, b) => b.date.localeCompare(a.date));
}
export const unpardonedRecords = (c: Career) => criminalRecord(c).filter(r => !r.pardoned);
export const hasUnpardonedFelony = (c: Career) => unpardonedRecords(c).some(r => r.severity === 'felony');

/** Sectors that run background checks. Retail, construction, farm/factory and most tech/media work stay open to everyone. */
export const STRICT_SECTORS = ['Banking & Finance', 'Security & Law Enforcement'];
export const FELONY_SECTORS = ['Public Administration', 'Education', 'Healthcare'];
export function backgroundCheckLabel(sector: string, tier: number): string | null {
  if (STRICT_SECTORS.includes(sector)) return 'Background check: no unpardoned convictions';
  if (FELONY_SECTORS.includes(sector) || tier === 3) return 'Background check: no unpardoned felony';
  return null;
}
export function passesBackgroundCheck(c: Career, sector: string, tier: number): boolean {
  if (STRICT_SECTORS.includes(sector)) return unpardonedRecords(c).length === 0;
  if (FELONY_SECTORS.includes(sector) || tier === 3) return !hasUnpardonedFelony(c);
  return true;
}
