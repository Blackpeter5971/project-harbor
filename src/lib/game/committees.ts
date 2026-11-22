/** Six standing committees and deterministic vote projections. Browser-safe; imports only the legislature schema. */
import { CATEGORY_COMMITTEE, COMMITTEE_NAMES, committeeIds, type BillCategory, type ChamberId, type CommitteeId, type Lawmaker, type Legislature, type LegislativeBill, type LegislatureParty } from './legislature-schema';

export const COMMITTEE_JURISDICTION: Record<CommitteeId, BillCategory[]> = Object.fromEntries(committeeIds.map(id => [id, (Object.keys(CATEGORY_COMMITTEE) as BillCategory[]).filter(c => CATEGORY_COMMITTEE[c] === id)])) as Record<CommitteeId, BillCategory[]>;
export const CATEGORY_LABEL: Record<BillCategory, string> = { tax: 'Tax & revenue', health: 'Health care', defense: 'Defense & veterans', education: 'Education', justice: 'Justice & courts', infrastructure: 'Infrastructure' };
/** Typical bill cost ($M) per chamber; a bill at this cost loses ~8 points of support. */
export const COST_REF: Record<ChamberId, number> = { council: 20, stateLeg: 200, house: 2000, senate: 2000 };
export const costPenalty = (bill: LegislativeBill, chamber: ChamberId) => Math.min(0.12, (bill.cost / COST_REF[chamber]) * 0.08);
const COMMITTEE_SIZE: Record<ChamberId, number> = { council: 5, stateLeg: 11, house: 13, senate: 11 };

export type CommitteeAction = 'favorable' | 'amend' | 'hearing' | 'table';
export const COMMITTEE_ACTIONS: Record<CommitteeAction, { label: string; detail: string }> = {
  favorable: { label: 'Favorable Report', detail: 'Needs a committee majority; the bill reaches the floor next quarter.' },
  amend: { label: 'Request Amendments', detail: 'Moves the text toward the center and trims cost by 15% to win swing votes.' },
  hearing: { label: 'Hold Hearing', detail: 'Question officials: +10 oversight, +2 reputation; the governing chair resents it.' },
  table: { label: 'Table / Stall Bill', detail: 'Kills the bill if the committee would reject it; otherwise delays it two quarters.' },
};

export type Committee = { id: CommitteeId; name: string; chair: Lawmaker | null; chamber: ChamberId; size: number; seats: Record<LegislatureParty, number>; majority: number; jurisdiction: BillCategory[] };

/** Committee seats follow the chamber split (largest remainder), the governing party keeping any tie-break seat. */
export function committees(L: Legislature): Committee[] {
  return committeeIds.map(id => {
    const chair = L.lawmakers.find(l => l.committee === id) ?? null;
    const chamber = chair?.chamber ?? L.seating[0]!.chamber;
    const s = L.seating.find(x => x.chamber === chamber) ?? L.seating[0]!;
    const size = COMMITTEE_SIZE[chamber];
    const parties = Object.keys(s.composition) as LegislatureParty[];
    const raw = parties.map(p => ({ p, v: (s.composition[p] / s.seats) * size }));
    const seats = Object.fromEntries(raw.map(r => [r.p, Math.floor(r.v)])) as Record<LegislatureParty, number>;
    let left = size - Object.values(seats).reduce((t, n) => t + n, 0);
    for (const r of [...raw].sort((a, b) => (a.p === s.governing ? -1 : 0) - (b.p === s.governing ? -1 : 0) || (b.v % 1) - (a.v % 1))) { if (left-- <= 0) break; seats[r.p] += 1; }
    return { id, name: COMMITTEE_NAMES[id], chair, chamber, size, seats, majority: Math.floor(size / 2) + 1, jurisdiction: COMMITTEE_JURISDICTION[id] };
  });
}
export const committeeFor = (L: Legislature, bill: LegislativeBill) => committees(L).find(c => c.id === CATEGORY_COMMITTEE[bill.category])!;

/** Probability-like support (0–1) of a member for a bill: ideological distance plus party pull. */
export function memberSupport(bill: LegislativeBill, sponsorParty: LegislatureParty, party: LegislatureParty, ideology: number, discipline: number, relationship = 0, playerBill = true, penalty = 0): number {
  let v = 1 - Math.abs(ideology - bill.ideology) / 120;
  if (party === sponsorParty && party !== 'Independent') v += 0.25 * discipline / 100;
  else if (party !== 'Independent' && sponsorParty !== 'Independent') v -= 0.2 * discipline / 100;
  if (playerBill) v += relationship / 200;
  v -= penalty;
  return Math.max(0, Math.min(1, v));
}

export type VoteProjection = { chamber: ChamberId; yes: number; no: number; needed: number; seats: number; passes: boolean };

/* ---------- Roll call: key lawmakers individually, rank-and-file by party line + regional lean ---------- */
export const regions = ['Northeast', 'South', 'Midwest', 'West'] as const;
export type Region = typeof regions[number];
const REGION_SHARE: Record<Region, number> = { Northeast: 0.22, South: 0.36, Midwest: 0.22, West: 0.2 };
/** Ideological pull of each region's delegation (+ = right). */
export const REGION_LEAN: Record<Region, number> = { Northeast: -12, South: 14, Midwest: 4, West: -6 };
/** Home-state interest: regions back bills that send money their way. */
export const REGION_AFFINITY: Record<Region, Partial<Record<BillCategory, number>>> = {
  Northeast: { health: 0.06, education: 0.04 }, South: { defense: 0.08, justice: 0.03, tax: 0.02 },
  Midwest: { infrastructure: 0.07, tax: 0.02 }, West: { education: 0.05, infrastructure: 0.03 },
};
/** Regional delegations only exist in Congress; state and city chambers vote at-large. */
const hasRegions = (ch: ChamberId) => ch === 'house' || ch === 'senate';
export type Vote = 'yes' | 'no' | 'abstain';
export type LawmakerVote = { lawmaker: Lawmaker; vote: 'yes' | 'no'; support: number };
export type PartyTally = { party: LegislatureParty; yes: number; no: number; abstain: number; position: 'Yea' | 'Nay' | 'Split' };
export type RegionTally = { party: LegislatureParty; region: Region | 'At-large'; seats: number; yes: number };
export type RollCall = VoteProjection & {
  abstain: number; lawmakers: LawmakerVote[]; parties: PartyTally[]; regions: RegionTally[];
  /** The player's own vote (null = not a member of this chamber, or voting with the rank-and-file). */
  player: Vote | null; member: boolean;
  /** How the player's party leader in this chamber votes; null when the party has no leader here. */
  leader: LawmakerVote | null; rebel: boolean;
};

/** Seats per region by largest remainder so the regions always add up to the bloc. */
function splitSeats(n: number): Record<Region, number> {
  const raw = regions.map(r => ({ r, v: n * REGION_SHARE[r] }));
  const out = Object.fromEntries(raw.map(x => [x.r, Math.floor(x.v)])) as Record<Region, number>;
  let left = n - Object.values(out).reduce((a, b) => a + b, 0);
  for (const x of [...raw].sort((a, b) => (b.v % 1) - (a.v % 1))) { if (left-- <= 0) break; out[x.r] += 1; }
  return out;
}

const LEADER_ROLE = /speaker|leader|senate_president/;
/** The player's party leader in a chamber (speaker, majority or minority leader). */
export const partyLeader = (L: Legislature, chamber: ChamberId, party: LegislatureParty) => party === 'Independent' ? null : L.lawmakers.find(l => l.chamber === chamber && l.party === party && LEADER_ROLE.test(l.role)) ?? null;

/**
 * Deterministic roll call. With `playerVote` null the player's seat (if any) votes with the rank-and-file,
 * which is exactly the projection shown on cards; casting a vote replaces that one seat with the player's choice.
 */
export function rollCall(L: Legislature, bill: LegislativeBill, chamber: ChamberId, playerParty: LegislatureParty, playerChamber: ChamberId | null = null, playerVote: Vote | null = null): RollCall {
  const s = L.seating.find(x => x.chamber === chamber) ?? L.seating[0]!;
  const sponsor = bill.party ?? playerParty, mine = bill.party === null, pen = costPenalty(bill, s.chamber);
  const member = playerChamber === s.chamber, vote = member ? playerVote : null;
  const lawmakers: LawmakerVote[] = L.lawmakers.filter(x => x.chamber === s.chamber).map(l => {
    const support = memberSupport(bill, sponsor, l.party, l.ideology, l.loyalty, l.relationship, mine, pen);
    return { lawmaker: l, support, vote: support >= 0.5 ? 'yes' : 'no' };
  });
  const regionRows: RegionTally[] = [];
  for (const b of L.backbench.filter(x => x.chamber === s.chamber)) {
    const seats = Math.max(0, b.seats - (vote && b.party === playerParty ? 1 : 0));
    if (!hasRegions(s.chamber)) { regionRows.push({ party: b.party, region: 'At-large', seats, yes: Math.round(seats * memberSupport(bill, sponsor, b.party, b.ideology, b.discipline, 0, mine, pen)) }); continue; }
    const split = splitSeats(seats);
    for (const r of regions) {
      const ideology = Math.max(-100, Math.min(100, b.ideology + REGION_LEAN[r]));
      const p = Math.max(0, Math.min(1, memberSupport(bill, sponsor, b.party, ideology, b.discipline, 0, mine, pen) + (REGION_AFFINITY[r][bill.category] ?? 0)));
      regionRows.push({ party: b.party, region: r, seats: split[r], yes: Math.round(split[r] * p) });
    }
  }
  const parties: PartyTally[] = (Object.keys(s.composition) as LegislatureParty[]).map(party => {
    const rows = regionRows.filter(r => r.party === party), named = lawmakers.filter(l => l.lawmaker.party === party);
    let yes = rows.reduce((t, r) => t + r.yes, 0) + named.filter(l => l.vote === 'yes').length;
    let no = rows.reduce((t, r) => t + r.seats - r.yes, 0) + named.filter(l => l.vote === 'no').length, abstain = 0;
    if (vote && party === playerParty) { if (vote === 'yes') yes++; else if (vote === 'no') no++; else abstain++; }
    const total = yes + no || 1;
    return { party, yes, no, abstain, position: yes / total >= 0.67 ? 'Yea' : no / total >= 0.67 ? 'Nay' : 'Split' };
  });
  const yes = Math.min(s.seats, parties.reduce((t, p) => t + p.yes, 0)), abstain = parties.reduce((t, p) => t + p.abstain, 0);
  const no = Math.max(0, s.seats - yes - abstain);
  const lead = member ? partyLeader(L, s.chamber, playerParty) : null;
  const leader = lead ? lawmakers.find(l => l.lawmaker.id === lead.id) ?? null : null;
  return { chamber: s.chamber, yes, no, abstain, needed: s.majorityThreshold, seats: s.seats, passes: yes >= s.majorityThreshold,
    lawmakers, parties, regions: regionRows, player: vote, member, leader, rebel: !!(leader && vote && vote !== leader.vote) };
}

/** Deterministic floor projection for one chamber. The roll call uses the same numbers, so what the card shows is what happens
    (a player who casts their own vote can move it by exactly one seat). */
export function projectVote(L: Legislature, bill: LegislativeBill, chamber: ChamberId, playerParty: LegislatureParty): VoteProjection {
  const r = rollCall(L, bill, chamber, playerParty);
  return { chamber: r.chamber, yes: r.yes, no: r.no, needed: r.needed, seats: r.seats, passes: r.passes };
}

/** Committee projection: each party's seats vote like that party's backbench, the chair votes personally. */
export function projectCommittee(L: Legislature, bill: LegislativeBill, playerParty: LegislatureParty) {
  const cm = committeeFor(L, bill), sponsor = bill.party ?? playerParty, mine = bill.party === null, pen = costPenalty(bill, cm.chamber);
  let yes = 0;
  for (const p of Object.keys(cm.seats) as LegislatureParty[]) {
    let n = cm.seats[p];
    if (cm.chair?.party === p) { n -= 1; if (memberSupport(bill, sponsor, p, cm.chair.ideology, cm.chair.loyalty, cm.chair.relationship, mine, pen) >= 0.5) yes += 1; }
    const bloc = L.backbench.find(b => b.chamber === cm.chamber && b.party === p);
    yes += Math.round(Math.max(0, n) * memberSupport(bill, sponsor, p, bloc?.ideology ?? 0, bloc?.discipline ?? 50, 0, mine, pen));
  }
  return { committee: cm, yes, no: cm.size - yes, needed: cm.majority, passes: yes >= cm.majority };
}

/** The swing lawmaker most worth courting on a bill and how they currently lean. */
export function swingStance(L: Legislature, bill: LegislativeBill, chamber: ChamberId, playerParty: LegislatureParty) {
  const pool = L.lawmakers.filter(l => l.chamber === chamber);
  const sponsor = bill.party ?? playerParty, mine = bill.party === null, pen = costPenalty(bill, chamber);
  const ranked = pool.map(l => ({ l, v: memberSupport(bill, sponsor, l.party, l.ideology, l.loyalty, l.relationship, mine, pen) })).sort((a, b) => Math.abs(a.v - 0.5) - Math.abs(b.v - 0.5));
  const pick = ranked.find(r => r.l.role === 'swing_member') ?? ranked[0];
  if (!pick) return null;
  return { lawmaker: pick.l, support: pick.v, stance: pick.v >= 0.6 ? 'Leaning yes' : pick.v >= 0.5 ? 'Soft yes' : pick.v >= 0.4 ? 'Undecided' : 'Leaning no' };
}
