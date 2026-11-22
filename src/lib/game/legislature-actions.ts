/** Pure, browser-safe player interactions with the legislature: lobbying key lawmakers and contesting leadership posts. */
import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import { docketQuarter } from './docket-schema';
import { ensureLegislature, playerParty } from './legislation';
export { playerParty };
import { COMMITTEE_NAMES, ROLE_NAMES, seeded, type ChamberId, type CommitteeId, type Lawmaker, type Legislature, type LegislatureParty, type Seating } from './legislature-schema';
import { activeOffice, type Result } from './support';

export type LobbyKind = 'whip' | 'compromise' | 'sponsor';
export const LOBBY_LABEL: Record<LobbyKind, string> = { whip: 'Whip Support', compromise: 'Offer Compromise', sponsor: 'Request Sponsorship' };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
const LEGISLATOR_CHAMBER: Record<string, ChamberId> = { council: 'council', stateLeg: 'stateLeg', house: 'house', senate: 'senate' };
const patch = (c: Career, L: Legislature, lawmakers: Lawmaker[], extra: Partial<Legislature> = {}): Career => ({ ...c, legislature: { ...L, lawmakers, ...extra } });

/** Odds (0–1) a lobbying attempt lands; compromise always succeeds at a reputational price. */
export function lobbyOdds(c: Career, l: Lawmaker, kind: LobbyKind): number {
  if (kind === 'compromise') return 1;
  const sameParty = l.party === playerParty(c) ? 0.1 : 0;
  const base = kind === 'whip' ? 0.35 : 0.2;
  return Math.max(0.05, Math.min(0.95, base + sameParty + c.skills.leadership / 300 + l.relationship / 250 - l.influence / 500));
}

export function lobbyBlock(c: Career, lawmakerId: string, kind: LobbyKind): string | null {
  const L = c.legislature;
  if (!activeOffice(c) || !L) return 'You need a seat in government to work the chamber.';
  const l = L.lawmakers.find(x => x.id === lawmakerId);
  if (!l) return 'That lawmaker is no longer in the chamber.';
  if (c.actions < ACTION_COST) return 'Not enough energy this turn.';
  if (L.interactions[`${l.id}|${kind}`] === docketQuarter(c.date)) return `Already tried this with ${l.name} this quarter.`;
  if (kind === 'sponsor') {
    if (l.relationship < 10) return `${l.name} needs a relationship of at least +10 to co-sponsor.`;
    if (!sponsorableBill(L)) return 'No pending bill needs a sponsor.';
  }
  return null;
}
const sponsorableBill = (L: Legislature) => L.bills.find(b => ['draft', 'introduced', 'in_committee', 'floor_debate', 'passed_house'].includes(b.status) && !b.sponsor.includes(' & '));

/** One lobbying attempt (1 action). Outcome is seeded by quarter+lawmaker+kind so reloading cannot reroll it. */
export function lobbyLawmaker(career: Career, lawmakerId: string, kind: LobbyKind): Result {
  const c = ensureLegislature(career), block = lobbyBlock(c, lawmakerId, kind);
  if (block) return { ok: false, message: block };
  const L = c.legislature!, q = docketQuarter(c.date), l = L.lawmakers.find(x => x.id === lawmakerId)!;
  const win = seeded(`${L.tenure}|${q}|${l.id}|${kind}`) < lobbyOdds(c, l, kind);
  let next: Lawmaker = l, bills = L.bills, msg: string, reputation = c.reputation;
  if (kind === 'whip') {
    next = win ? { ...l, loyalty: clamp(l.loyalty + 10, 0, 100), relationship: clamp(l.relationship + 5, -100, 100) } : { ...l, relationship: clamp(l.relationship - 5, -100, 100) };
    msg = win ? `${l.name} agreed to vote with you (+10 loyalty).` : `${l.name} refused to be whipped and resents the pressure.`;
  } else if (kind === 'compromise') {
    next = { ...l, relationship: clamp(l.relationship + 15, -100, 100), loyalty: clamp(l.loyalty + 5, 0, 100) };
    reputation = clamp(c.reputation - 2, 0, 100);
    msg = `You traded concessions with ${l.name} (+15 relationship). Your base calls it a sell-out (−2 reputation).`;
  } else {
    const bill = sponsorableBill(L)!;
    if (win) bills = L.bills.map(b => b.id === bill.id ? { ...b, sponsor: `${b.sponsor} & ${l.name}` } : b);
    next = { ...l, relationship: clamp(l.relationship + (win ? 3 : -3), -100, 100) };
    msg = win ? `${l.name} signed on to sponsor the ${bill.title}.` : `${l.name} declined to put their name on the ${bill.title}.`;
  }
  const out = patch(c, L, L.lawmakers.map(x => x.id === l.id ? next : x), { bills, interactions: { ...L.interactions, [`${l.id}|${kind}`]: q } });
  return { ok: true, career: { ...out, reputation, actions: c.actions - ACTION_COST, log: [msg, ...c.log].slice(0, 60) }, message: msg };
}

/* ---------- Leadership contests ---------- */
export type LeadershipPost = { key: string; title: string; chamber: ChamberId; role: Lawmaker['role']; committee: CommitteeId | null };

/** Posts the player can contest from their current legislative seat (executives cannot). */
export function leadershipPosts(c: Career): LeadershipPost[] {
  const chamber = c.office ? LEGISLATOR_CHAMBER[c.office.id] : undefined;
  if (!chamber) return [];
  const top: LeadershipPost = chamber === 'council' ? { key: 'house_speaker', title: 'Council Chairman', chamber, role: 'house_speaker', committee: null }
    : chamber === 'senate' ? { key: 'senate_president', title: 'Senate President', chamber, role: 'senate_president', committee: null }
    : { key: 'house_speaker', title: chamber === 'stateLeg' ? 'Speaker of the Assembly' : 'House Speaker', chamber, role: 'house_speaker', committee: null };
  const chairs = (Object.keys(COMMITTEE_NAMES) as CommitteeId[]).map(cm => ({ key: `committee_chair:${cm}`, title: `${COMMITTEE_NAMES[cm]} Committee Chair`, chamber, role: 'committee_chair' as const, committee: cm }));
  return [top, ...chairs];
}

/** Leadership elections run in the first quarter of each year, or the first quarter of a new tenure. */
export function leadershipTurn(c: Career): boolean {
  if (!c.office) return false;
  const month = Number(c.date.slice(5, 7));
  const since = c.office.since, tenureMonths = (Number(c.date.slice(0, 4)) - Number(since.slice(0, 4))) * 12 + month - Number(since.slice(5, 7));
  return month <= 3 || tenureMonths < 3;
}

const incumbentFor = (L: Legislature, p: LeadershipPost) => L.lawmakers.find(l => p.committee ? l.committee === p.committee : l.role === p.role)
  ?? L.lawmakers.find(l => l.role === (p.role === 'senate_president' ? 'senate_president' : 'house_speaker'));
const seatingFor = (L: Legislature, chamber: ChamberId): Seating | undefined => L.seating.find(s => s.chamber === chamber) ?? L.seating[0];

/** Vote shares: party seats (up to 50), personal influence (up to 30) and ally relationships (±20) against the incumbent's. */
export function leadershipForecast(c: Career, p: LeadershipPost) {
  const L = c.legislature!, s = seatingFor(L, p.chamber)!, inc = incumbentFor(L, p);
  const share = (party: LegislatureParty) => s.composition[party] / s.seats;
  const influence = (c.reputation + c.skills.leadership + c.relationships) / 3;
  const allies = L.lawmakers.filter(l => l.chamber === p.chamber && l.id !== inc?.id);
  const allyScore = allies.length ? allies.reduce((t, l) => t + l.relationship * (l.influence / 100), 0) / allies.length : 0;
  const player = share(playerParty(c)) * 50 + influence * 0.3 + allyScore * 0.2;
  const rival = inc ? share(inc.party) * 50 + inc.influence * 0.3 + (inc.loyalty / 100) * 10 : 30;
  const odds = Math.max(0.03, Math.min(0.97, 0.5 + (player - rival) / 40));
  return { player: Math.round(player), rival: Math.round(rival), odds, incumbent: inc ?? null };
}

export function leadershipBlock(c: Career, key: string): string | null {
  const L = c.legislature, p = leadershipPosts(c).find(x => x.key === key);
  if (!activeOffice(c) || !L || !p) return 'Only sitting legislators can run for chamber leadership.';
  if (L.playerRoles.includes(key)) return `You already hold ${p.title}.`;
  if (!leadershipTurn(c)) return 'Leadership elections are held in the first quarter of the year.';
  if (L.leadershipBids[key] === c.date.slice(0, 4)) return `You already contested ${p.title} this year.`;
  if (c.actions < ACTION_COST) return 'Not enough energy this turn.';
  return null;
}

/** Contest a leadership post (1 action, one bid per post per year). Seeded outcome: reloads cannot reroll. */
export function contestLeadership(career: Career, key: string): Result {
  const c = ensureLegislature(career), block = leadershipBlock(c, key);
  if (block) return { ok: false, message: block };
  const L = c.legislature!, p = leadershipPosts(c).find(x => x.key === key)!, f = leadershipForecast(c, p), year = c.date.slice(0, 4);
  const win = seeded(`${L.tenure}|${year}|${key}|leadership`) < f.odds;
  const inc = f.incumbent;
  const lawmakers = L.lawmakers.map(l => l.id !== inc?.id ? l : { ...l, relationship: clamp(l.relationship - (win ? 30 : 10), -100, 100) });
  const msg = win ? `You won the vote for ${p.title}${inc ? `, unseating ${inc.name}` : ''}.` : `You lost the ${p.title} vote${inc ? ` to ${inc.name}` : ''}. They will remember the challenge.`;
  const out = patch(c, L, lawmakers, { playerRoles: win ? [...L.playerRoles, key] : L.playerRoles, leadershipBids: { ...L.leadershipBids, [key]: year } });
  return { ok: true, career: { ...out, actions: c.actions - ACTION_COST, reputation: clamp(c.reputation + (win ? 5 : -2), 0, 100), log: [msg, ...c.log].slice(0, 60) }, message: msg };
}

/** Display title for a lawmaker, noting posts the player has taken from them. */
export function lawmakerTitle(L: Legislature, l: Lawmaker): string {
  const key = l.committee ? `committee_chair:${l.committee}` : l.role;
  const base = l.committee ? `${COMMITTEE_NAMES[l.committee]} Committee Chair` : ROLE_NAMES[l.role];
  return L.playerRoles.includes(key) ? `Former ${base}` : base;
}
