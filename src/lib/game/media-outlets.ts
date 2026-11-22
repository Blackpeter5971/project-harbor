import type { Career } from './career';
import type { SupportGroupId } from './support-groups';
import { activeScandals } from './scandals';
import { monthsBefore } from './social-context';

/**
 * Media Hub foundations: the outlet catalogue and the grounded news stories outlets can ask about.
 * Pure and browser-safe. Shared by media.ts (live TV/radio bookings) and media-hub.ts (invitations),
 * so neither imports the other's turn logic.
 */
export type Channel = 'tv' | 'radio' | 'newspaper';
export type Slant = 'Left' | 'Lean left' | 'Center' | 'Lean right' | 'Right';
export type Scope = 'Local' | 'Statewide' | 'National' | 'Rural';
export type Outlet = { id: string; name: string; channel: Channel; tagline: string; reach: number; unit: 'viewers' | 'listeners' | 'readers'; slant: Slant; scope: Scope };

export const CHANNELS: { id: Channel; label: string }[] = [
  { id: 'tv', label: 'Television' }, { id: 'radio', label: 'Radio' }, { id: 'newspaper', label: 'Newspaper' },
];

export function outletsFor(c: Pick<Career, 'character'>): Outlet[] {
  const st = c.character.state;
  return [
    { id: 'ch7', name: 'Channel 7 Primetime', channel: 'tv', tagline: 'Evening news & interviews', reach: 420_000, unit: 'viewers', slant: 'Center', scope: 'Local' },
    { id: 'capitol-tonight', name: 'Capitol Tonight', channel: 'tv', tagline: 'Political talk show', reach: 1_100_000, unit: 'viewers', slant: 'Lean left', scope: 'Statewide' },
    { id: 'state-of-state', name: 'State of the State', channel: 'tv', tagline: 'Weekly debate hour', reach: 860_000, unit: 'viewers', slant: 'Center', scope: 'Statewide' },
    { id: 'face-voters', name: 'Face the Voters', channel: 'tv', tagline: 'National primetime talk', reach: 4_800_000, unit: 'viewers', slant: 'Lean right', scope: 'National' },
    { id: 'wkrn', name: 'WKRN Talk 1050', channel: 'radio', tagline: 'Call-in talk radio', reach: 180_000, unit: 'listeners', slant: 'Lean right', scope: 'Local' },
    { id: 'city-public', name: 'City Public Radio', channel: 'radio', tagline: 'Public affairs hour', reach: 140_000, unit: 'listeners', slant: 'Lean left', scope: 'Local' },
    { id: 'morning-drive', name: 'The Morning Drive', channel: 'radio', tagline: 'Statewide commuter show', reach: 520_000, unit: 'listeners', slant: 'Center', scope: 'Statewide' },
    { id: 'farm-hour', name: 'Heartland Farm Hour', channel: 'radio', tagline: 'Rural broadcast network', reach: 260_000, unit: 'listeners', slant: 'Right', scope: 'Rural' },
    { id: 'courier', name: `The ${st} Courier`, channel: 'newspaper', tagline: 'Paper of record', reach: 310_000, unit: 'readers', slant: 'Center', scope: 'Statewide' },
    { id: 'ledger', name: 'The Capitol Ledger', channel: 'newspaper', tagline: 'Politics & policy desk', reach: 190_000, unit: 'readers', slant: 'Lean left', scope: 'Statewide' },
    { id: 'herald', name: 'The Heartland Herald', channel: 'newspaper', tagline: 'Small-town weekly', reach: 120_000, unit: 'readers', slant: 'Lean right', scope: 'Rural' },
    { id: 'dispatch', name: 'The National Dispatch', channel: 'newspaper', tagline: 'National daily', reach: 2_200_000, unit: 'readers', slant: 'Center', scope: 'National' },
  ];
}

const LEAN: Record<Slant, number> = { Left: -2, 'Lean left': -1, Center: 0, 'Lean right': 1, Right: 2 };
/** +2 friendly … −2 hostile, from the outlet's slant and the player's party. */
export function friendliness(slant: Slant, party: Career['character']['party']): number {
  const l = LEAN[slant];
  if (party === 'Democrat') return -l;
  if (party === 'Republican') return l;
  return l === 0 ? 1 : -Math.abs(l) / 2;
}
export const friendlinessLabel = (f: number) => f >= 1 ? 'Friendly' : f <= -1 ? 'Hostile' : 'Neutral';

// ------------------------------------------------------------------ grounded stories
/** Months an event stays newsworthy: this turn and the previous one. Active scandals, crises and campaigns stay live. */
export const RECENT_MONTHS = 6;
export type StoryKind = 'scandal' | 'crisis' | 'economy' | 'election' | 'bill' | 'project' | 'campaign';
export type MediaStory = { id: string; kind: StoryKind; title: string; detail: string; good: boolean | null; date: string; groups: SupportGroupId[] };

const PRIORITY: Record<StoryKind, number> = { scandal: 0, crisis: 1, election: 2, economy: 3, bill: 4, project: 5, campaign: 6 };
const POLICY_GROUPS: Record<string, SupportGroupId[]> = { services: ['labor'], business: ['business'], environment: ['youth'], safety: ['veterans', 'rural'] };
const PROJECT_GROUPS: Record<string, SupportGroupId[]> = { transportation: ['labor'], healthcare: ['religious', 'labor'], education: ['youth'], water: ['rural'], electricity: ['rural', 'business'], housing: ['labor', 'youth'] };
const CRISIS_GROUPS: Record<string, SupportGroupId[]> = { economic: ['business', 'labor'], health: ['religious'], natural_disaster: ['rural'], utility_failure: ['rural', 'business'], worker_strike: ['labor'], project_failure: ['labor'] };

/** Current events an outlet could reasonably ask about. Empty when nothing newsworthy happened. */
export function mediaStories(c: Career): MediaStory[] {
  const since = monthsBefore(c.date, RECENT_MONTHS), recent = (d: string | null | undefined) => !!d && d >= since && d <= c.date;
  const out: MediaStory[] = [];
  for (const s of activeScandals(c)) if (s.status !== 'cleared') out.push({ id: `scandal|${s.id}`, kind: 'scandal', title: s.title, detail: s.summary, good: false, date: s.date, groups: [] });
  for (const x of c.crises ?? []) {
    const economic = x.type === 'economic';
    if (x.status !== 'resolved') out.push({ id: `crisis|${x.id}`, kind: economic ? 'economy' : 'crisis', title: x.title, detail: x.description, good: false, date: x.turnCreated, groups: CRISIS_GROUPS[x.type] ?? [] });
    else if (recent(x.resolutionDate)) out.push({ id: `crisis-end|${x.id}`, kind: economic ? 'economy' : 'crisis', title: `${x.title} resolved`, detail: x.description, good: x.outcome !== 'neglected', date: x.resolutionDate!, groups: CRISIS_GROUPS[x.type] ?? [] });
  }
  for (const e of c.elections ?? []) if (recent(e.date)) out.push({ id: `election|${e.date}|${e.title}|${e.stage}`, kind: 'election', title: `${e.won ? 'Victory' : 'Defeat'} in the ${e.title} ${e.stage === 'primary' ? 'primary' : 'race'}`, detail: `${e.jurisdiction} · ${e.won ? 'won' : 'lost'}`, good: e.won, date: e.date, groups: [] });
  for (const b of c.bills ?? []) {
    const when = b.history?.at(-1)?.date ?? b.date;
    if (b.stage === 'passed' && recent(when)) out.push({ id: `bill|${b.id}`, kind: b.kind === 'budget' ? 'economy' : 'bill', title: b.kind === 'budget' ? `Budget enacted: ${b.title}` : `“${b.title}” passes`, detail: `A ${b.kind} on ${b.policy}`, good: true, date: when, groups: POLICY_GROUPS[b.policy] ?? [] });
  }
  for (const p of [c.city, c.stateGovernment, c.federalGovernment].flatMap(s => s?.publicProjects ?? [])) {
    if (p.status === 'completed' && recent(p.completionDate)) out.push({ id: `project|${p.id}|done`, kind: 'project', title: `${p.name} opens`, detail: `A completed ${p.category} project`, good: true, date: p.completionDate!, groups: PROJECT_GROUPS[p.category] ?? [] });
    else if (['approved', 'in_progress'].includes(p.status) && recent(p.startDate)) out.push({ id: `project|${p.id}|start`, kind: 'project', title: `Work begins on ${p.name}`, detail: `A new ${p.category} project`, good: true, date: p.startDate!, groups: PROJECT_GROUPS[p.category] ?? [] });
  }
  const proposal = c.budget?.proposals[0];
  if (proposal && recent(proposal.date)) out.push({ id: `budget|${proposal.date}|${proposal.total}`, kind: 'economy', title: 'Your budget proposal', detail: proposal.result, good: null, date: proposal.date, groups: ['business', 'labor'] });
  // An active race is news every quarter, so its key includes the quarter.
  if (c.campaign) out.push({ id: `campaign|${c.campaign.title}|${c.date}`, kind: 'campaign', title: `the ${c.campaign.title} race`, detail: `${c.campaign.jurisdiction} · ${c.campaign.phase}`, good: null, date: c.date, groups: [] });
  return out.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || b.date.localeCompare(a.date)).slice(0, 6);
}
