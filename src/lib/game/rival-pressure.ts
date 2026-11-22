import type { Career } from './career';
import { ineffectiveRecord } from './legislative-record';

/**
 * Rival pressure: the weak spots in the player's record that rival campaigns
 * exploit in attack ads, opposition-research leaks, debates and town halls.
 * Pure, browser-safe and cycle-free (type-only Career import) so campaign.ts,
 * debates.ts, town-halls.ts and rival-feed.ts can all share one definition.
 */
export type WeakSpotId = 'scandal' | 'tax' | 'do-nothing';
export type WeakSpot = { id: WeakSpotId; key: string; label: string; charge: string; severity: number };

/** Total score damage rival attacks can hold against the player at once. */
export const RIVAL_DAMAGE_CAP = 12;
/** Share of rival damage that survives each new quarter (voters slowly forget). */
export const RIVAL_DAMAGE_DECAY = 0.75;
/** Share of rival damage kept after the player rebuts an attack from Campaign HQ. */
export const REBUTTAL_KEEP = 0.6;

const r1 = (n: number) => Math.round(n * 10) / 10;
const SEVERITY: Record<string, number> = { Minor: 1, Moderate: 2, Severe: 3 };

/** Every exploitable weakness, strongest first. Cleared allegations are never used. */
export function weakSpots(c: Career): WeakSpot[] {
  const me = c.character.name, out: WeakSpot[] = [];
  const scandal = [...(c.scandals ?? [])].filter(s => s.subject === me && s.status !== 'cleared')
    .sort((a, b) => (SEVERITY[b.severity] ?? 1) - (SEVERITY[a.severity] ?? 1) || b.date.localeCompare(a.date))[0];
  if (scandal) out.push({ id: 'scandal', key: `scandal|${scandal.id}`, label: scandal.title, charge: `${scandal.status === 'proven' ? 'the proven' : 'the open'} scandal "${scandal.title}"`, severity: (SEVERITY[scandal.severity] ?? 1) + (scandal.status === 'proven' ? 1 : 0) });
  const tax = (c.corruption?.txns ?? []).filter(t => t.kind === 'tax_evasion');
  if (tax.length) out.push({ id: 'tax', key: `tax-evasion|${tax[0]!.id}`, label: 'Hidden tax payments', charge: 'unpaid taxes hidden from the authorities', severity: 2 });
  if (ineffectiveRecord(c)) out.push({ id: 'do-nothing', key: `do-nothing|${c.legislativeRecord?.ineffective.length ?? 1}`, label: 'Zero bills passed', charge: 'a legislative term with zero bills passed', severity: 2 });
  return out.sort((a, b) => b.severity - a.severity);
}

const PLEDGE_NAMES: Record<string, string> = { working: 'working families', suburban: 'suburban moderates', business: 'business leaders', labor: 'labor unions', youth: 'youth activists', environment: 'environmentalists', seniors: 'seniors', religious: 'the religious coalition', establishment: 'party insiders' };
/** Recorded policy pledges rivals can call unaffordable pandering. */
export function pledgeTargets(c: Career): string[] {
  return (c.supportGroups?.pledges ?? []).map(p => PLEDGE_NAMES[p.group] ?? p.group);
}

/** Attack-ad chance for the strongest rival when the player leads the latest poll. */
export const leadAttackChance = (lead: number, spots: number) => Math.min(0.95, 0.6 + Math.max(0, lead) * 0.02 + spots * 0.1);
/** Score damage of a rival attack ad against a frontrunner; larger leads draw harder hits. */
export const attackAdDamage = (lead: number) => r1(1 + Math.min(3, Math.max(0, lead) * 0.15));
/** Score damage of an opposition-research leak on one weak spot. */
export const leakDamage = (spot: WeakSpot) => r1(1.5 * spot.severity);
export const capDamage = (n: number) => r1(Math.min(RIVAL_DAMAGE_CAP, Math.max(0, n)));
