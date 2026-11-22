import { z } from 'zod';
import type { Career } from './career';
import { registerScandal } from './scandals';

/**
 * Support Groups & Political Loyalty (Phase 2A). Pure, browser-safe.
 * Loyalty is per voter bloc and distinct from public approval (career.approval),
 * overall reputation (career.reputation), campaign endorsement favorability (career.groups)
 * and party standing (standing inside the player's own party organisation).
 */
export const supportGroupIds = ['labor', 'business', 'veterans', 'youth', 'religious', 'rural'] as const;
export type SupportGroupId = typeof supportGroupIds[number];

export const supportGroupsSchema = z.object({
  loyalty: z.record(z.string(), z.number()).default({}),
  partyStanding: z.number().default(50),
  /** Quarter start already drifted — prevents duplicate decay on replays. */
  lastDrift: z.string().default(''),
  /** Open promises made to a group via Policy Pledge; broken by contrary policy. */
  pledges: z.array(z.object({ group: z.string(), date: z.string() })).default([]),
  history: z.array(z.object({ date: z.string(), reason: z.string(), changes: z.record(z.string(), z.number()) })).default([]),
});
export type SupportGroups = z.infer<typeof supportGroupsSchema>;

type Party = Career['character']['party'];
export type SupportGroupDef = { id: SupportGroupId; name: string; alignment: string; lean: Party | null; concerns: string[]; expects: string };

export const supportGroupCatalog: SupportGroupDef[] = [
  { id: 'labor', name: 'Labor & Workers', alignment: 'Center-left', lean: 'Democrat', concerns: ['Wages', 'Job security', 'Union rights'], expects: 'Fair pay and protection for working families' },
  { id: 'business', name: 'Business Owners', alignment: 'Center-right', lean: 'Republican', concerns: ['Taxes', 'Regulation', 'Growth'], expects: 'A predictable, low-cost climate for enterprise' },
  { id: 'veterans', name: 'Veterans', alignment: 'Patriotic, cross-party', lean: null, concerns: ['VA care', 'Security', 'Benefits'], expects: 'Respect for service and reliable benefits' },
  { id: 'youth', name: 'Youth', alignment: 'Progressive', lean: 'Democrat', concerns: ['Education', 'Climate', 'Housing costs'], expects: 'Affordable futures and bold reform' },
  { id: 'religious', name: 'Religious Communities', alignment: 'Traditional', lean: 'Republican', concerns: ['Family values', 'Charity', 'Community'], expects: 'Moral leadership and support for congregations' },
  { id: 'rural', name: 'Rural Communities', alignment: 'Conservative-leaning', lean: 'Republican', concerns: ['Farming', 'Roads', 'Local services'], expects: 'Attention to towns outside the big cities' },
];

/** Background tilt applied to the neutral 50% baseline (small, ±6 max). */
const backgroundTilt: Record<string, Partial<Record<SupportGroupId, number>>> = {
  'Nobody': { labor: 2, youth: 2, business: -2 },
  'Working-Class Family': { labor: 6, rural: 3, business: -3 },
  'Self-Made': { business: 4, youth: 2 },
  'Wealthy Family': { business: 6, labor: -4, youth: -2 },
  'Political Dynasty': { business: 3, religious: 2, youth: -3 },
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n * 10) / 10));
const partyTilt = (lean: Party | null, p: Party) => (!lean || p === 'Independent' ? 0 : lean === p ? 4 : -4);

/** Neutral baseline used for new characters and for older saves without loyalty data. */
export function baselineSupportGroups(c: Career): SupportGroups {
  const tilt = backgroundTilt[c.character.background] ?? {};
  const loyalty = Object.fromEntries(supportGroupCatalog.map(g => [g.id, clamp(50 + (tilt[g.id] ?? 0) + partyTilt(g.lean, c.character.party))]));
  const party = c.character.party === 'Independent' ? 0
    : clamp(40 + (c.position === 'committee' ? 15 : c.position === 'captain' ? 5 : 0) + Math.min(10, c.relationships));
  return { loyalty, partyStanding: party, lastDrift: '', pledges: [], history: [] };
}

export const supportGroupsOf = (c: Career): SupportGroups => c.supportGroups ?? baselineSupportGroups(c);

export type Sentiment = 'Hostile' | 'Skeptical' | 'Neutral' | 'Favorable' | 'Loyal';
export const sentiment = (v: number): Sentiment => v < 25 ? 'Hostile' : v < 42 ? 'Skeptical' : v < 58 ? 'Neutral' : v < 75 ? 'Favorable' : 'Loyal';
/** A group actively backs the player once loyalty reaches 60%. */
export const BACKING_THRESHOLD = 60;

export function supportGroupsView(c: Career) {
  const s = supportGroupsOf(c);
  return {
    partyStanding: c.character.party === 'Independent' ? null : s.partyStanding,
    groups: supportGroupCatalog.map(g => {
      const loyalty = s.loyalty[g.id] ?? 50;
      return { ...g, loyalty, sentiment: sentiment(loyalty), backing: loyalty >= BACKING_THRESHOLD };
    }),
  };
}

// ---------- Phase 2B: decision impacts, backing and drift ----------
export type Deltas = Partial<Record<SupportGroupId, number>>;
export type PolicyKey = 'services' | 'business' | 'environment' | 'safety';
/** Targeted trade-offs: every policy pleases some blocs and costs others. */
export const policyImpacts: Record<PolicyKey, Deltas> = {
  services: { labor: 3, rural: 1, business: -2 },
  business: { business: 4, labor: -3, youth: -1 },
  environment: { youth: 4, rural: -3, business: -2 },
  safety: { veterans: 3, religious: 2, youth: -2 },
};
export const projectImpacts: Record<string, Deltas> = {
  transportation: { rural: 3, business: 2, youth: -1 },
  healthcare: { labor: 2, veterans: 3, business: -1 },
  education: { youth: 4, religious: 1, business: -1 },
  water: { rural: 3, religious: 1, business: -1 },
  electricity: { business: 3, rural: 2, youth: -2 },
  housing: { labor: 3, youth: 2, business: -2 },
};
/** Party platforms: enacting a disfavored policy upsets party leadership. */
const partyDislikes: Record<string, PolicyKey[]> = { Democrat: ['business'], Republican: ['environment'], Independent: [] };
const partyLikes: Record<string, PolicyKey[]> = { Democrat: ['services', 'environment'], Republican: ['business', 'safety'], Independent: [] };
/** Campaign voter-group ids whose Policy Pledge maps onto a support bloc. */
export const pledgeMap: Record<string, SupportGroupId> = { labor: 'labor', working: 'labor', business: 'business', youth: 'youth', religious: 'religious', environment: 'youth', seniors: 'veterans', suburban: 'business' };
export const BROKEN_PROMISE = 6, KEPT_PROMISE = 2;

export function shiftLoyalty(c: Career, deltas: Deltas, reason: string, party = 0): Career {
  const s = supportGroupsOf(c);
  const loyalty = { ...s.loyalty };
  const changes: Record<string, number> = {};
  for (const [id, d] of Object.entries(deltas)) { if (!d) continue; loyalty[id] = clamp((loyalty[id] ?? 50) + d); changes[id] = d; }
  const partyStanding = party && c.character.party !== 'Independent' ? clamp(s.partyStanding + party) : s.partyStanding;
  if (party) changes["party"] = party;
  return { ...c, supportGroups: { ...s, loyalty, partyStanding, history: [{ date: c.date, reason, changes }, ...s.history].slice(0, 20) } };
}

/** Apply a government policy choice: tailored modifiers, broken/kept promises and party alignment. */
export function applyPolicyLoyalty(c: Career, policy: PolicyKey, title: string): Career {
  const impacts = { ...policyImpacts[policy] };
  const s = supportGroupsOf(c);
  const kept: typeof s.pledges = [];
  const remaining = s.pledges.filter(p => {
    const g = pledgeMap[p.group]; const d = g ? impacts[g] ?? 0 : 0;
    if (!g || d === 0) return true;
    impacts[g] = d + (d < 0 ? -BROKEN_PROMISE : KEPT_PROMISE); kept.push(p); return false;
  });
  const p = c.character.party;
  const party = partyDislikes[p]?.includes(policy) ? -4 : partyLikes[p]?.includes(policy) ? 1.5 : 0;
  const broken = kept.some(k => (policyImpacts[policy][pledgeMap[k.group]!] ?? 0) < 0);
  let n: Career = { ...c, supportGroups: { ...s, pledges: remaining } };
  if (broken) n = registerScandal(n, { id: `promise|${c.date}|${title}`, title: `Broken pledge: ${title}`, summary: `The decision on ${title} contradicts a recorded policy pledge to ${kept.map(k => k.group).join(', ')}. Critics allege bad faith; the policy conflict is documented, but intent is unproven.`, source: 'Opposition Leak', severity: 'Moderate', evidence: 65, trigger: 'promise' });
  return shiftLoyalty(n, impacts, broken ? `${title} (broken promise)` : title, party);
}
export const applyProjectLoyalty = (c: Career, category: string, name: string) => shiftLoyalty(c, projectImpacts[category] ?? {}, name);
/** Party forum speech: rallies the party's base blocs, alienates the other side. */
export function applySpeechLoyalty(c: Career, factor = 1): Career {
  const p = c.character.party;
  const base: Deltas = p === 'Democrat' ? { labor: 1.5, youth: 1, business: -1 } : p === 'Republican' ? { business: 1.5, religious: 1, labor: -1 } : { veterans: 1, rural: 1 };
  const d = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, (v ?? 0) > 0 ? Math.round((v ?? 0) * factor * 10) / 10 : v])) as Deltas;
  return shiftLoyalty(c, d, 'Party forum speech', 1);
}
export function recordPledge(c: Career, group: string): Career {
  if (!pledgeMap[group]) return c;
  const s = supportGroupsOf(c);
  return { ...c, supportGroups: { ...s, pledges: [...s.pledges.filter(p => p.group !== group), { group, date: c.date }] } };
}

export const ENDORSE_AT = 70, OPPOSE_BELOW = 30;
export function backing(c: Career) {
  const v = supportGroupsView(c).groups;
  return { endorsers: v.filter(g => g.loyalty > ENDORSE_AT).map(g => g.id), opponents: v.filter(g => g.loyalty < OPPOSE_BELOW).map(g => g.id) };
}
/** Modest election-score effect: +1.5 per endorsing bloc, −1.5 per opposing bloc. */
export const backingScore = (c: Career) => { const b = backing(c); return (b.endorsers.length - b.opponents.length) * 1.5; };
/** Fundraising multiplier: +5% per endorser, −4% per opposing bloc. */
export const backingFundraising = (c: Career) => { const b = backing(c); return Math.max(0.7, 1 + b.endorsers.length * 0.05 - b.opponents.length * 0.04); };

/** Quarterly decay: loyalty and party standing drift 15% back toward baseline. Runs once per quarter start. */
export function supportGroupsTurn(c: Career, quarterStart: string): Career {
  const s = supportGroupsOf(c);
  if (s.lastDrift && s.lastDrift >= quarterStart) return c;
  const base = baselineSupportGroups(c);
  const loyalty = Object.fromEntries(Object.entries(s.loyalty).map(([id, v]) => [id, clamp(v + ((base.loyalty[id] ?? 50) - v) * 0.15)]));
  const partyStanding = clamp(s.partyStanding + (base.partyStanding - s.partyStanding) * 0.15);
  return { ...c, supportGroups: { ...s, loyalty, partyStanding, lastDrift: quarterStart } };
}
