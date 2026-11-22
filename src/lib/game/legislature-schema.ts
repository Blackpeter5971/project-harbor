import { z } from 'zod';

/**
 * Lawgivers-style legislature: browser-safe, cycle-free (imports only zod) so career.ts can embed it.
 * Hybrid model: a few named key lawmakers carry individual stats; everyone else is an aggregate
 * backbench voting bloc per party.
 */

// ---------- Chambers & seating ----------
export const chamberIds = ['house', 'senate', 'stateLeg', 'council'] as const;
export type ChamberId = typeof chamberIds[number];
export const CHAMBER_SEATS: Record<ChamberId, number> = { house: 435, senate: 100, stateLeg: 120, council: 15 };
export const CHAMBER_NAMES: Record<ChamberId, string> = { house: 'U.S. House', senate: 'U.S. Senate', stateLeg: 'State Legislature', council: 'City Council' };

export const legislatureParties = ['Republican', 'Democrat', 'Independent'] as const;
export type LegislatureParty = typeof legislatureParties[number];
/** Seat-map colors as design-token names (resolved in CSS), never raw colors. */
export const PARTY_COLOR: Record<LegislatureParty, 'party-red' | 'party-blue' | 'party-green'> = { Republican: 'party-red', Democrat: 'party-blue', Independent: 'party-green' };

export const seatingSchema = z.object({
  chamber: z.enum(chamberIds),
  seats: z.number().int().positive(),
  composition: z.object({ Republican: z.number().int().nonnegative(), Democrat: z.number().int().nonnegative(), Independent: z.number().int().nonnegative() }),
  majorityThreshold: z.number().int().positive(),
  governing: z.enum(legislatureParties),
  opposition: z.enum(legislatureParties),
});
export type Seating = z.infer<typeof seatingSchema>;

// ---------- Key lawmakers ----------
export const committeeIds = ['finance', 'defense', 'health', 'education', 'judiciary', 'infrastructure'] as const;
export type CommitteeId = typeof committeeIds[number];
export const COMMITTEE_NAMES: Record<CommitteeId, string> = { finance: 'Finance', defense: 'Defense', health: 'Health', education: 'Education', judiciary: 'Judiciary', infrastructure: 'Infrastructure' };

export const lawmakerRoles = ['house_speaker', 'house_majority_leader', 'house_minority_leader', 'senate_president', 'senate_majority_leader', 'senate_minority_leader', 'committee_chair', 'swing_member'] as const;
export const ROLE_NAMES: Record<typeof lawmakerRoles[number], string> = { house_speaker: 'House Speaker', house_majority_leader: 'House Majority Leader', house_minority_leader: 'House Minority Leader', senate_president: 'Senate President', senate_majority_leader: 'Senate Majority Leader', senate_minority_leader: 'Senate Minority Leader', committee_chair: 'Committee Chair', swing_member: 'Swing Member' };

export const lawmakerSchema = z.object({
  id: z.string(), name: z.string(),
  portrait: z.number().int().min(0).max(5),
  party: z.enum(legislatureParties),
  chamber: z.enum(chamberIds),
  role: z.enum(lawmakerRoles),
  committee: z.enum(committeeIds).nullable().default(null),
  district: z.string(),
  ideology: z.number().min(-100).max(100),
  loyalty: z.number().min(0).max(100),
  influence: z.number().min(0).max(100),
  relationship: z.number().min(-100).max(100),
});
export type Lawmaker = z.infer<typeof lawmakerSchema>;

/** Rank-and-file members of one party in one chamber, voting together. */
export const backbenchBlocSchema = z.object({
  chamber: z.enum(chamberIds), party: z.enum(legislatureParties),
  seats: z.number().int().nonnegative(),
  ideology: z.number().min(-100).max(100), discipline: z.number().min(0).max(100),
});
export type BackbenchBloc = z.infer<typeof backbenchBlocSchema>;

// ---------- Bills ----------
export const billCategories = ['tax', 'health', 'defense', 'education', 'justice', 'infrastructure'] as const;
export type BillCategory = typeof billCategories[number];
export const CATEGORY_COMMITTEE: Record<BillCategory, CommitteeId> = { tax: 'finance', health: 'health', defense: 'defense', education: 'education', justice: 'judiciary', infrastructure: 'infrastructure' };
export const billStatuses = ['draft', 'introduced', 'in_committee', 'floor_debate', 'passed_house', 'passed_senate', 'awaiting_signature', 'enacted', 'vetoed', 'failed'] as const;
export type BillStatus = typeof billStatuses[number];

export const floorVoteChoices = ['yes', 'no', 'abstain'] as const;
export type FloorVoteChoice = typeof floorVoteChoices[number];
/** One recorded roll call; the player's own vote and whether it broke with their party leader. */
export const rollCallRecordSchema = z.object({
  chamber: z.enum(chamberIds), quarter: z.string(),
  yes: z.number().int().nonnegative(), no: z.number().int().nonnegative(), abstain: z.number().int().nonnegative().default(0),
  passed: z.boolean(),
  playerVote: z.enum(floorVoteChoices).nullable().default(null),
  rebel: z.boolean().default(false),
});
export type RollCallRecord = z.infer<typeof rollCallRecordSchema>;

export const legislativeBillSchema = z.object({
  id: z.string(), title: z.string(), description: z.string(),
  category: z.enum(billCategories),
  sponsor: z.string(),
  status: z.enum(billStatuses).default('draft'),
  quarterIntroduced: z.string(),
  committeeAssigned: z.enum(committeeIds).nullable().default(null),
  urgent: z.boolean().default(false),
  /** Sponsoring party; null = the player's own bill. */
  party: z.enum(legislatureParties).nullable().default(null),
  /** Left (−100) to right (+100) placement of the bill text; amendments move it toward the center. */
  ideology: z.number().min(-100).max(100).default(0),
  /** Projected public cost in $ millions. */
  cost: z.number().nonnegative().default(0),
  amendments: z.number().int().nonnegative().default(0),
  /** Earliest quarter the bill may receive a floor vote (set by a favorable committee report). */
  floorQuarter: z.string().nullable().default(null),
  /** Tabled bills cannot move until this quarter. */
  stalledUntil: z.string().nullable().default(null),
  /** Chamber the bill started in; the other chamber of a bicameral body votes next. Null = lower chamber. */
  origin: z.enum(chamberIds).nullable().default(null),
  rollCalls: z.array(rollCallRecordSchema).default([]),
  /** Who acted on the finished bill (e.g. "President Hartmann signed"). */
  executiveAction: z.string().nullable().default(null),
});
export type LegislativeBill = z.infer<typeof legislativeBillSchema>;

// ---------- Quarterly legislative docket ----------
export const legislativeSlotIds = ['priority', 'committee', 'whip'] as const;
export const legislativeSlotSchema = z.object({
  slot: z.enum(legislativeSlotIds),
  title: z.string(),
  /** priority: introduce | floor_vote | await; committee: favorable | amend | hearing | table; whip: whip | compromise. Legacy ids still parse. */
  actions: z.array(z.enum(['introduce', 'floor_vote', 'await', 'favorable', 'amend', 'hearing', 'table', 'whip', 'compromise', 'review', 'investigate', 'lobby'])),
  billId: z.string().nullable().default(null),
  lawmakerIds: z.array(z.string()).default([]),
  resolved: z.boolean().default(false),
  choice: z.string().nullable().default(null),
  outcome: z.string().nullable().default(null),
});
export type LegislativeSlot = z.infer<typeof legislativeSlotSchema>;

export const legislatureSchema = z.object({
  tenure: z.string(),
  seating: z.array(seatingSchema),
  lawmakers: z.array(lawmakerSchema),
  backbench: z.array(backbenchBlocSchema),
  bills: z.array(legislativeBillSchema).default([]),
  /** `${lawmakerId}|${kind}` → quarter of the last directory interaction (one per lawmaker/kind/quarter). */
  interactions: z.record(z.string(), z.string()).default({}),
  /** Leadership posts the player won, e.g. `house_speaker` or `committee_chair:finance`. */
  playerRoles: z.array(z.string()).default([]),
  /** Leadership post → year of the last bid (one bid per post per year). */
  leadershipBids: z.record(z.string(), z.string()).default({}),
  /** Oversight influence earned through committee hearings (0–100). */
  oversight: z.number().min(0).max(100).default(0),
  /** Turn start of the last simulated Congress session (president only), so turns never replay it. */
  congressSession: z.string().default(''),
  docket: z.object({
    id: z.string(), quarter: z.string(), revision: z.number().int().nonnegative().default(0),
    items: z.tuple([
      legislativeSlotSchema.extend({ slot: z.literal('priority') }),
      legislativeSlotSchema.extend({ slot: z.literal('committee') }),
      legislativeSlotSchema.extend({ slot: z.literal('whip') }),
    ]),
  }).nullable().default(null),
});
export type Legislature = z.infer<typeof legislatureSchema>;

// ---------- Deterministic generators ----------
export function seeded(seed: string) { let h = 2166136261; for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 2 ** 32; }
const between = (seed: string, lo: number, hi: number) => Math.round(lo + seeded(seed) * (hi - lo));

/** Seat split: majority party 50–60%, a small Independent bloc, rest to the minority. */
export function generateSeating(chamber: ChamberId, seed: string): Seating {
  const seats = CHAMBER_SEATS[chamber];
  const independent = Math.max(chamber === 'council' ? 1 : 2, Math.round(seats * (0.01 + seeded(`${seed}|${chamber}|ind`) * 0.03)));
  const lead: LegislatureParty = seeded(`${seed}|${chamber}|lead`) < 0.5 ? 'Republican' : 'Democrat';
  const trail: LegislatureParty = lead === 'Republican' ? 'Democrat' : 'Republican';
  const majority = Math.round(seats * (0.5 + seeded(`${seed}|${chamber}|share`) * 0.1));
  const minority = seats - independent - majority;
  return { chamber, seats, composition: { [lead]: majority, [trail]: minority, Independent: independent } as Seating['composition'], majorityThreshold: Math.floor(seats / 2) + 1, governing: lead, opposition: trail };
}

const FIRST = ['Margaret', 'Robert', 'Elena', 'Marcus', 'Diane', 'Thomas', 'Priya', 'Walter', 'Grace', 'Henry', 'Sofia', 'Calvin', 'Ruth', 'Daniel', 'Naomi', 'Victor'];
const LAST = ['Hartmann', 'Caldwell', 'Okafor', 'Whitaker', 'Reyes', 'Brennan', 'Sato', 'Holloway', 'Delgado', 'Ashford', 'Nguyen', 'Pierce', 'Lindqvist', 'Monroe', 'Abernathy', 'Castillo'];
const DISTRICTS = ['Ohio-3', 'Texas-14', 'California-22', 'New York-9', 'Georgia-6', 'Michigan-11', 'Arizona-5', 'Pennsylvania-8', 'Florida-17', 'Illinois-2', 'Colorado-4', 'Wisconsin-7', 'Nevada-1', 'Virginia-10', 'Oregon-3', 'Iowa-2'];
const lean = (p: LegislatureParty) => p === 'Republican' ? 1 : p === 'Democrat' ? -1 : 0;

/** 14 key lawmakers: 3 House leaders, 3 Senate leaders (or council equivalents), 6 committee chairs, plus 2 swing votes. */
export function generateLawmakers(house: Seating, senate: Seating, seed: string, upper: ChamberId = 'senate', lower: ChamberId = 'house'): Lawmaker[] {
  const used = new Set<number>();
  const make = (i: number, role: Lawmaker['role'], party: LegislatureParty, chamber: ChamberId, committee: CommitteeId | null = null, swing = false): Lawmaker => {
    let n = Math.floor(seeded(`${seed}|name|${i}`) * FIRST.length);
    while (used.has(n)) n = (n + 1) % FIRST.length;
    used.add(n);
    const s = `${seed}|lm|${i}`;
    const ideology = swing ? between(`${s}|ideo`, -20, 20) : lean(party) * between(`${s}|ideo`, 25, 85);
    return { id: `lm-${i}`, name: `${FIRST[n]} ${LAST[(n * 7 + i) % LAST.length]}`, portrait: between(`${s}|portrait`, 0, 5), party, chamber, role, committee,
      district: DISTRICTS[(n + i) % DISTRICTS.length]!, ideology, loyalty: swing ? between(`${s}|loy`, 25, 50) : between(`${s}|loy`, 55, 95),
      influence: role === 'committee_chair' ? between(`${s}|inf`, 45, 75) : swing ? between(`${s}|inf`, 30, 55) : between(`${s}|inf`, 70, 95), relationship: between(`${s}|rel`, -20, 20) };
  };
  const out: Lawmaker[] = [
    make(0, 'house_speaker', house.governing, lower), make(1, 'house_majority_leader', house.governing, lower), make(2, 'house_minority_leader', house.opposition, lower),
    make(3, 'senate_president', senate.governing, upper), make(4, 'senate_majority_leader', senate.governing, upper), make(5, 'senate_minority_leader', senate.opposition, upper),
  ];
  committeeIds.forEach((cm, k) => out.push(make(6 + k, 'committee_chair', k % 2 ? senate.governing : house.governing, k % 2 ? upper : lower, cm)));
  // Two moderate swing votes worth lobbying, one per chamber.
  out.push(make(12, 'swing_member', house.opposition, lower, null, true));
  out.push(make(13, 'swing_member', 'Independent', upper, null, true));
  return out;
}

/** Backbench blocs: chamber seats minus the named lawmakers who sit there. */
export function generateBackbench(seating: Seating, lawmakers: Lawmaker[], seed: string): BackbenchBloc[] {
  return legislatureParties.map(party => {
    const named = lawmakers.filter(l => l.chamber === seating.chamber && l.party === party).length;
    return { chamber: seating.chamber, party, seats: Math.max(0, seating.composition[party] - named), ideology: lean(party) * between(`${seed}|${seating.chamber}|${party}|bb`, 30, 60), discipline: party === 'Independent' ? 30 : between(`${seed}|${seating.chamber}|${party}|disc`, 60, 85) };
  });
}

export const isSwing = (l: Lawmaker) => l.role === 'swing_member';
