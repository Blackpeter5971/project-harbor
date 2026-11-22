import { ACTION_COST } from './energy-costs';
import { captureLegacy } from './legacy';
import { ineffectiveRecord } from './legislative-record';
import { weakSpots, leadAttackChance, attackAdDamage, leakDamage, capDamage, RIVAL_DAMAGE_DECAY, REBUTTAL_KEEP } from './rival-pressure';
import { backingScore, backingFundraising, recordPledge } from './support-groups';
import { focusMultiplier } from './lifestyle';
import type { Career, Party } from './career';
import { ACTIONS_PER_MONTH } from './career';
import { monthLabel, rank, positionNames } from './gameplay';
import { archiveTerm, incumbentElection, nearTermEnd, termLimitReason, termKey } from './terms';
export { termYears, termEndDate } from './terms';
import { termEndDate } from './terms';
import { crisisRecord } from './crisis-record';
import { ballotRestriction } from './conviction';
import { directorRoles, staffRoster, staffAides, normalizeCampaignStaff, hasDirector, directorStrength, communicationsSeverity, type DirectorRole, type Director } from './campaign-staff-schema';
export { staffRoster, hasDirector } from './campaign-staff-schema';

/* Campaigns, elections, voter groups and newspaper. Pure functions over Career. */
export type OfficeId = 'council' | 'mayor' | 'stateLeg' | 'house' | 'governor' | 'senate' | 'president';
export type Campaign = NonNullable<Career['campaign']>;
export type Cand = Campaign['opponents'][number];
export type Story = Career['newsQueue'][number];
export type ElectionResult = Career['elections'][number];
type Res = { ok: true; career: Career; message: string } | { ok: false; message: string };
type Req = { label: string; met: boolean };

export function rand(seed: string) { let h = 2166136261; for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 2 ** 32; }
const rr = (seed: string, lo: number, hi: number) => lo + rand(seed) * (hi - lo);
const pick = <T,>(seed: string, a: readonly T[]) => a[Math.floor(rand(seed) * a.length)] ?? a[0]!;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const r1 = (n: number) => Math.round(n * 10) / 10;
export const usd = (n: number) => `${n < 0 ? '−' : ''}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
const ym = (d: string) => { const [y = 2026, m = 1] = d.split('-').map(Number); return { y, m }; };
const monthsBetween = (a: string, b: string) => { const A = ym(a), B = ym(b); return (B.y - A.y) * 12 + B.m - A.m; };
const log = (c: Career, msg: string): Career => ({ ...c, log: [msg, ...c.log].slice(0, 12) });

// ---------- Geography ----------
/** [electoral votes, partisan lean (positive = Democratic)] — simplified game values. */
export const stateData: Record<string, [number, number]> = {
  Alabama: [9, -15], Alaska: [3, -8], Arizona: [11, -2], Arkansas: [6, -16], California: [54, 13], Colorado: [10, 4], Connecticut: [7, 7], Delaware: [3, 7], Florida: [30, -5], Georgia: [16, -3], Hawaii: [4, 14], Idaho: [4, -18], Illinois: [19, 7], Indiana: [11, -11], Iowa: [6, -6], Kansas: [6, -10], Kentucky: [8, -16], Louisiana: [8, -12], Maine: [4, 2], Maryland: [10, 14], Massachusetts: [11, 15], Michigan: [15, 0], Minnesota: [10, 1], Mississippi: [6, -11], Missouri: [10, -10], Montana: [4, -11], Nebraska: [5, -13], Nevada: [6, -1], 'New Hampshire': [4, 1], 'New Jersey': [14, 6], 'New Mexico': [5, 3], 'New York': [28, 10], 'North Carolina': [16, -3], 'North Dakota': [3, -20], Ohio: [17, -6], Oklahoma: [7, -20], Oregon: [8, 6], Pennsylvania: [19, -2], 'Rhode Island': [4, 8], 'South Carolina': [9, -8], 'South Dakota': [3, -16], Tennessee: [11, -14], Texas: [40, -5], Utah: [6, -13], Vermont: [3, 16], Virginia: [13, 3], Washington: [12, 8], 'West Virginia': [4, -22], Wisconsin: [10, -2], Wyoming: [3, -25], 'District of Columbia': [3, 40],
};
const capitals: Record<string, string> = { Alabama: 'Montgomery', Alaska: 'Juneau', Arizona: 'Phoenix', Arkansas: 'Little Rock', California: 'Sacramento', Colorado: 'Denver', Connecticut: 'Hartford', Delaware: 'Dover', Florida: 'Tallahassee', Georgia: 'Atlanta', Hawaii: 'Honolulu', Idaho: 'Boise', Illinois: 'Springfield', Indiana: 'Indianapolis', Iowa: 'Des Moines', Kansas: 'Topeka', Kentucky: 'Frankfort', Louisiana: 'Baton Rouge', Maine: 'Augusta', Maryland: 'Annapolis', Massachusetts: 'Boston', Michigan: 'Lansing', Minnesota: 'Saint Paul', Mississippi: 'Jackson', Missouri: 'Jefferson City', Montana: 'Helena', Nebraska: 'Lincoln', Nevada: 'Carson City', 'New Hampshire': 'Concord', 'New Jersey': 'Trenton', 'New Mexico': 'Santa Fe', 'New York': 'Albany', 'North Carolina': 'Raleigh', 'North Dakota': 'Bismarck', Ohio: 'Columbus', Oklahoma: 'Oklahoma City', Oregon: 'Salem', Pennsylvania: 'Harrisburg', 'Rhode Island': 'Providence', 'South Carolina': 'Columbia', 'South Dakota': 'Pierre', Tennessee: 'Nashville', Texas: 'Austin', Utah: 'Salt Lake City', Vermont: 'Montpelier', Virginia: 'Richmond', Washington: 'Olympia', 'West Virginia': 'Charleston', Wisconsin: 'Madison', Wyoming: 'Cheyenne' };
export const homeCity = (c: Career) => capitals[c.character.state] ?? 'your city';
const lean = (c: Career) => stateData[c.character.state]?.[1] ?? 0;
const ord = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

// ---------- Offices ----------
export type Office = { id: OfficeId; title: string; level: 'local' | 'state' | 'federal'; scale: number; partisan: boolean; primaryMonth: number; cycle: (y: number) => boolean; turnout: (c: Career) => number; jurisdiction: (c: Career) => string; reqs: (c: Career) => Req[]; schedule: string };
const wins = (c: Career) => c.elections.filter(e => e.won && e.stage === 'general');
const heldAny = (c: Career) => !!c.office || wins(c).length > 0 || c.termHistory.length > 0;
const heldAbove = (c: Career) => c.termHistory.some(t => t.office.id !== 'council') || wins(c).some(e => e.office !== 'council') || (!!c.office && c.office.id !== 'council');
const ev = (c: Career) => stateData[c.character.state]?.[0] ?? 10;
export const offices: Office[] = [
  { id: 'council', title: 'City Council Member', level: 'local', scale: 1, partisan: false, primaryMonth: 11, cycle: y => y % 2 === 1, turnout: () => 32000, jurisdiction: c => `${homeCity(c)} City Council, Ward ${1 + Math.floor(rand(c.character.name + 'ward') * 8)}`, schedule: 'Nonpartisan, November of odd-numbered years', reqs: c => [{ label: '60 experience', met: c.experience >= 60 }, { label: '25 reputation', met: c.reputation >= 25 }, { label: '20 leadership', met: c.skills.leadership >= 20 }, { label: '$1,000 savings', met: c.money >= 1000 }] },
  { id: 'mayor', title: 'Mayor', level: 'local', scale: 4, partisan: false, primaryMonth: 11, cycle: y => y % 2 === 1, turnout: () => 160000, jurisdiction: c => `City of ${homeCity(c)}`, schedule: 'Nonpartisan, November of odd-numbered years', reqs: c => [{ label: '90 experience', met: c.experience >= 90 }, { label: '35 reputation', met: c.reputation >= 35 }, { label: '25 leadership', met: c.skills.leadership >= 25 }] },
  { id: 'stateLeg', title: 'State Legislator', level: 'state', scale: 2, partisan: true, primaryMonth: 6, cycle: y => y % 2 === 0, turnout: () => 55000, jurisdiction: c => `${c.character.state} House District ${10 + Math.floor(rand(c.character.name + 'hd') * 80)}`, schedule: 'June primary, November of even years', reqs: c => [{ label: '80 experience', met: c.experience >= 80 }, { label: '30 reputation', met: c.reputation >= 30 }] },
  { id: 'house', title: 'U.S. House Representative', level: 'federal', scale: 10, partisan: true, primaryMonth: 6, cycle: y => y % 2 === 0, turnout: () => 330000, jurisdiction: c => ev(c) <= 3 ? `${c.character.state} At-Large District` : `${c.character.state}'s ${ord(1 + Math.floor(rand(c.character.name + 'cd') * (ev(c) - 2)))} Congressional District`, schedule: 'June primary, November every 2 years', reqs: c => [{ label: 'Age 25+', met: c.age >= 25 }, { label: '120 experience', met: c.experience >= 120 }, { label: '45 reputation', met: c.reputation >= 45 }] },
  { id: 'governor', title: 'Governor', level: 'state', scale: 40, partisan: true, primaryMonth: 6, cycle: y => y % 4 === 2, turnout: c => ev(c) * 260000, jurisdiction: c => `State of ${c.character.state}`, schedule: 'June primary, November midterm years', reqs: c => [{ label: 'Age 30+', met: c.age >= 30 }, { label: '160 experience', met: c.experience >= 160 }, { label: '55 reputation', met: c.reputation >= 55 }, { label: 'Won an election', met: heldAny(c) }] },
  { id: 'senate', title: 'U.S. Senator', level: 'federal', scale: 45, partisan: true, primaryMonth: 6, cycle: y => y % 2 === 0, turnout: c => ev(c) * 260000, jurisdiction: c => `${c.character.state} (statewide)`, schedule: 'June primary, a seat is up every 2 years', reqs: c => [{ label: 'Age 30+', met: c.age >= 30 }, { label: '180 experience', met: c.experience >= 180 }, { label: '60 reputation', met: c.reputation >= 60 }, { label: 'Won an election', met: heldAny(c) }] },
  { id: 'president', title: 'President of the United States', level: 'federal', scale: 400, partisan: true, primaryMonth: 3, cycle: y => y % 4 === 0, turnout: () => 155000000, jurisdiction: () => 'United States · Electoral College', schedule: 'Primaries Jan–Mar, November every 4 years', reqs: c => [{ label: 'Age 35+', met: c.age >= 35 }, { label: '240 experience', met: c.experience >= 240 }, { label: '70 reputation', met: c.reputation >= 70 }, { label: 'Held office above city council', met: heldAbove(c) }] },
];
export const officeById = (id: string) => offices.find(o => o.id === id)!;
export const unit = (o: Office) => 400 * o.scale;
export const contributionRules = (o: Office) => o.level === 'federal'
  ? ['Individuals: up to $3,300 per election', 'PACs (incl. union & business PACs): up to $5,000', 'No direct corporate or union treasury money', 'Self-funding from personal savings: unlimited']
  : ['Individuals: up to $1,000 per election (simplified state cap)', 'Group PACs: up to $2,500', 'No direct corporate treasury money', 'Self-funding from personal savings: unlimited'];
const giftCap = (o: Office) => (o.level === 'federal' ? 3300 : 1000);

/** Next election this candidate can still file for. Party candidates must file before the primary. */
export function nextCycle(c: Career, o: Office, independent = c.character.party === 'Independent') {
  const incumbentDate = c.office?.id === o.id ? incumbentElection(c) : null;
  if (incumbentDate && c.date <= incumbentDate) {
    const primaryDate = o.partisan ? `${incumbentDate.slice(0, 4)}-${String(o.primaryMonth).padStart(2, '0')}-01` : null;
    return { electionDate: incumbentDate, primaryDate };
  }
  const { y } = ym(c.date);
  for (let yr = y; yr < y + 9; yr++) {
    if (!o.cycle(yr)) continue;
    const electionDate = `${yr}-11-01`;
    const primaryDate = o.partisan ? `${yr}-${String(o.primaryMonth).padStart(2, '0')}-01` : null;
    const deadline = o.partisan && !independent ? primaryDate! : electionDate;
    if (c.date <= deadline) return { electionDate, primaryDate };
  }
  return { electionDate: `${y + 4}-11-01`, primaryDate: null };
}
export function availableElections(c: Career) {
  if (c.dynasty?.retired || c.legacy?.death || c.campaign || ballotRestriction(c)) return [];
  return offices.filter(o => o.reqs(c).every(r => r.met) && !termLimitReason(c, o.id) && (c.office?.id !== o.id || nearTermEnd(c) && c.termPlan?.choice !== 'leave' && !!incumbentElection(c) && c.date <= (nextCycle(c, o).primaryDate && c.character.party !== 'Independent' ? nextCycle(c, o).primaryDate ?? '' : nextCycle(c, o).electionDate))).map(o => ({ office: o, ...nextCycle(c, o) }));
}
export const lockedHint = (c: Career) => { const o = offices.find(x => c.office?.id !== x.id && !x.reqs(c).every(r => r.met)); return o ? { office: o, reqs: o.reqs(c) } : null; };
export const ballotSignatures = (o: Office) => Math.round(15 * Math.sqrt(o.scale));

// ---------- Voter groups ----------
export const issues = ['economy', 'jobs', 'healthcare', 'education', 'environment', 'security', 'community', 'justice'] as const;
export type Issue = typeof issues[number];
export type Group = { id: string; name: string; lean: Party | null; influence: number; members: string; issues: Issue[]; impact: string; rival: string };
export const groups: Group[] = [
  { id: 'working', name: 'Working Class', lean: null, influence: 3, members: 'Hourly workers & families', issues: ['jobs', 'economy'], impact: 'Broad turnout lift in industrial towns', rival: 'business' },
  { id: 'suburban', name: 'Suburban Moderates', lean: null, influence: 3, members: 'Swing-voting homeowners', issues: ['education', 'economy'], impact: 'Decisive swing votes in close races', rival: 'youth' },
  { id: 'business', name: 'Business Leaders', lean: 'Republican', influence: 3, members: 'Chambers of commerce', issues: ['economy', 'jobs'], impact: 'Strongest fundraising networks', rival: 'labor' },
  { id: 'labor', name: 'Labor Unions', lean: 'Democrat', influence: 3, members: 'Union locals & members', issues: ['jobs', 'healthcare'], impact: 'Large volunteer ground game', rival: 'business' },
  { id: 'youth', name: 'Youth Activists', lean: 'Democrat', influence: 2, members: 'Campus & first-time voters', issues: ['education', 'environment'], impact: 'Online buzz and momentum', rival: 'religious' },
  { id: 'environment', name: 'Environmentalists', lean: 'Democrat', influence: 2, members: 'Conservation groups', issues: ['environment'], impact: 'Dedicated volunteers and small donors', rival: 'business' },
  { id: 'seniors', name: 'Seniors', lean: null, influence: 3, members: 'Retiree associations', issues: ['healthcare', 'economy'], impact: 'Most reliable voters on election day', rival: 'youth' },
  { id: 'religious', name: 'Religious Coalition', lean: 'Republican', influence: 2, members: 'Congregations & charities', issues: ['community', 'security'], impact: 'Organized church-network turnout', rival: 'youth' },
  { id: 'establishment', name: 'Party Establishment', lean: null, influence: 3, members: 'Party officials & donors', issues: ['community', 'justice'], impact: 'Primary advantage and big donors', rival: 'youth' },
];
const leanFit = (g: Group, p: Party) => (g.id === 'establishment' ? (p === 'Independent' ? -1 : 0.5) : !g.lean ? 0 : p === 'Independent' ? -0.5 : g.lean === p ? 1 : -1);
export const groupRel = (c: Career, id: string) => { const g = groups.find(x => x.id === id); if (!g) return c.groups[id] ?? 20; return c.groups[id] ?? 20 + leanFit(g, c.character.party) * 10; };
export const endorsedBy = (camp: Campaign | null, id: string) => camp?.endorsements.find(e => e.group === id)?.candidate ?? null;

// ---------- Candidates & scores ----------
const firstNames = ['Linda', 'Marcus', 'Elena', 'Robert', 'Priya', 'James', 'Teresa', 'Daniel', 'Grace', 'Victor', 'Hannah', 'Owen', 'Rosa', 'Curtis', 'Megan', 'Andre', 'Claire', 'Walter', 'Nadia', 'Frank'];
const lastNames = ['Whitaker', 'Delgado', 'Brennan', 'Okafor', 'Hollis', 'Nguyen', 'Castellano', 'Pryce', 'Lindqvist', 'Monroe', 'Abernathy', 'Kowalski', 'Ruiz', 'Sinclair', 'Haddad', 'Fairbanks', 'Morrow', 'Takahashi', 'Banks', 'Calloway'];
const bios = ['Small-business owner', 'Former county prosecutor', 'School board president', 'Retired Army colonel', 'Party fundraiser', 'Physician', 'Union organizer', 'Former TV news anchor', 'Farmer and county commissioner', 'Civil-rights attorney'];
const policies: Record<Party, string[]> = { Democrat: ['Expand healthcare access', 'Raise the minimum wage', 'Invest in clean energy', 'Fund public schools'], Republican: ['Cut taxes for families', 'Back law enforcement', 'Reduce regulations', 'Secure the border'], Independent: ['Clean up government', 'Fix local infrastructure', 'End partisan gridlock'] };
export const traitText = { money: 'Strong fundraiser · weak ground game', ground: 'Big volunteer network · thin war chest', media: 'Polished on TV · few endorsements' } as const;
const figure = (seed: string) => `${pick(seed + 'f', firstNames)} ${pick(seed + 'l', lastNames)}`;

function makeCand(seed: string, party: Party, o: Office, primary: boolean, incumbent: boolean): Cand {
  const quality = r1(rr(seed + 'q', 12, 28) + (o.level === 'federal' ? 3 : 0) + (incumbent ? 7 : 0));
  return { name: figure(seed), portrait: Math.floor(rand(seed + 'portrait') * 6), party, bio: incumbent ? `Incumbent ${o.title}` : pick(seed + 'b', bios), policy: pick(seed + 'p', policies[party]), trait: pick(seed + 't', ['money', 'ground', 'media'] as const), quality, funds: Math.round(unit(o) * rr(seed + 'm', 1.5, 5) * quality / 20), raised: 0, spent: 0, staff: incumbent ? 2 : 1, volunteers: Math.round(rr(seed + 'v', 5, 20) * Math.sqrt(o.scale)), support: 0, momentum: 0, primary, out: false };
}
export function genOpponents(c: Career, o: Office, electionDate: string): Cand[] {
  const s = `${c.character.name}|${o.id}|${electionDate}`;
  const p = c.character.party, out: Cand[] = [];
  if (!o.partisan) { for (let i = 0; i < 2; i++) out.push(makeCand(s + i, pick(s + 'pp' + i, ['Democrat', 'Republican', 'Independent'] as const), o, false, i === 0 && rand(s + 'inc') < 0.4)); }
  else {
    if (p !== 'Independent') {
      // Crowded intra-party primary: 8–10 candidates including the player.
      const n = 7 + Math.floor(rand(s + 'crowd') * 3);
      for (let i = 0; i < n; i++) { const x = makeCand(s + 'pr' + i, p, o, true, false); out.push({ ...x, bio: `${pick(s + 'fac' + i, FACTIONS[p])} wing · ${x.bio}` }); }
      const weak = c.office?.id === o.id && (c.approval?.overall ?? 100) < PRIMARY_CHALLENGE_APPROVAL;
      if (weak && out[0]) out[0] = { ...out[0], quality: r1(out[0].quality + 8), bio: `Insurgent challenger · ${out[0].bio}`, momentum: 4 };
    }
    const rivals: Party[] = p === 'Democrat' ? ['Republican'] : p === 'Republican' ? ['Democrat'] : ['Democrat', 'Republican'];
    rivals.forEach((rp, i) => out.push(makeCand(s + 'g' + i, rp, o, false, o.id !== 'president' && i === 0 && rand(s + 'inc') < 0.45)));
    if (p !== 'Independent' && o.scale >= 40 && rand(s + 'third') < 0.4) out.push(makeCand(s + 'third', 'Independent', o, false, false));
  }
  // avoid duplicate names
  const seen = new Set([c.character.name]);
  return out.map((x, i) => { let name = x.name, k = 0; while (seen.has(name)) name = figure(s + i + 'x' + ++k); seen.add(name); return { ...x, name }; });
}
type Entrant = { name: string; party: Party };
const active = (camp: Campaign) => camp.opponents.filter(o => !o.out && (camp.phase === 'primary' ? o.primary : !o.primary));
export const field = (c: Career, camp: Campaign): Entrant[] => [{ name: c.character.name, party: camp.party }, ...active(camp)];
const endorseScore = (camp: Campaign, name: string) => camp.endorsements.filter(e => e.candidate === name).reduce((s, e) => s + (groups.find(g => g.id === e.group)?.influence ?? 1) * 3, 0);
/** Compulsory endorsements: without a group endorsement, rallies/ads/town halls yield only a quarter of their gains. */
export const NO_ENDORSEMENT_FACTOR = 0.25;
export const ENDORSE_LOYALTY = 60;
export const ENDORSE_CAPITAL = 5;
export const INDEPENDENT_REPUTATION = 40;
export const PRIMARY_CHALLENGE_APPROVAL = 35;
export const endorsementCount = (camp: Campaign | null | undefined, name: string) => camp?.endorsements.filter(e => e.candidate === name).length ?? 0;
export const endorsementFactor = (camp: Campaign | null | undefined, name: string) => endorsementCount(camp, name) > 0 ? 1 : NO_ENDORSEMENT_FACTOR;
/** General-election turnout deficit: 0–1 endorsements cost 10% of baseline strength. */
export const endorsementTurnoutPenalty = (camp: Campaign | null | undefined, name: string) => camp?.phase === 'general' && endorsementCount(camp, name) <= 1 ? 0.1 : 0;
/** Independents are unaffiliated: ballot access needs signatures/influence (reputation) or heavy personal funding. */
export const independentFundingBar = (o: Office) => unit(o) * 25;
export function independentBallotAccess(c: Career, o: Office): string | null {
  if (c.character.party !== 'Independent' || !o.partisan) return null;
  if (c.reputation >= INDEPENDENT_REPUTATION || c.money >= independentFundingBar(o)) return null;
  return `Independent ballot access needs ${INDEPENDENT_REPUTATION} reputation (petition signatures) or ${usd(independentFundingBar(o))} in personal funds.`;
}
const FACTIONS: Record<Party, string[]> = { Democrat: ['Progressive', 'Moderate', 'Labor', 'Centrist', 'Green', 'Establishment'], Republican: ['Conservative', 'Libertarian', 'Populist', 'Moderate', 'Evangelical', 'Establishment'], Independent: ['Reform'] };
/** Shared by player and rivals: earned support persists, but each new gain gets harder. */
export const supportGain = (base: number, support: number) => r1(base / (1 + Math.max(0, support) / 25));
const SCORE_POWER = 1.05;
const scoreWeight = (score: number) => Math.max(0, Number.isFinite(score) ? score : 0) ** SCORE_POWER;
function partyBase(c: Career, camp: Campaign, p: Party) {
  const o = officeById(camp.office), L = lean(c) * (o.partisan ? 0.7 : 0.2);
  if (camp.phase === 'primary') return 0;
  return p === 'Democrat' ? 18 + L : p === 'Republican' ? 18 - L : o.partisan ? 6 : 14;
}
/** Fresh general-election starting support after a primary win: primary points never carry over.
 * Built from reputation, incumbency and the jurisdiction's lean toward the player's party (backing/demographics enter scores separately). */
export function generalBaselineSupport(c: Career, camp: Campaign) {
  const o = officeById(camp.office), L = lean(c) * (o.partisan ? 0.7 : 0.2);
  const alignment = camp.party === 'Democrat' ? L : camp.party === 'Republican' ? -L : 0;
  const incumbent = c.office?.id === camp.office ? 5 : 0;
  return r1(clamp(c.reputation * 0.15 + incumbent + alignment * 0.3, 0, 25));
}
export function scores(c: Career, camp: Campaign): Record<string, number> {
  const s: Record<string, number> = {};
  const pPrimary = camp.phase === 'primary' ? ({ none: 0, captain: 4, committee: 8 }[c.position] + Math.sqrt(c.relationships) + Math.sqrt(c.contacts) * 1.5) : 0;
  const alleg = (n: string) => (camp.allegation?.target === n ? (camp.allegation.status === 'proven' ? -8 : camp.allegation.status === 'alleged' ? -0.5 : 0) * (n === c.character.name ? communicationsSeverity(camp) : 1) : 0);
  const o = officeById(camp.office);
  s[c.character.name] = Math.max(1, 6 + c.reputation * 0.3 + c.experience * 0.03 + c.skills.communication * 0.1 + camp.support * 0.7 + Math.sqrt(camp.volunteers / Math.sqrt(o.scale)) * 1.4 * (1 + 0.25 * directorStrength(camp, 'field')) + Math.sqrt(camp.staff) * 2 + camp.momentum * 0.4 + endorseScore(camp, c.character.name) * 0.7 + partyBase(c, camp, camp.party) + pPrimary + alleg(c.character.name) + (camp.phase === 'general' ? crisisRecord(c).score : 0) + backingScore(c));
  for (const x of active(camp)) s[x.name] = Math.max(1, x.quality + x.support * 0.7 + Math.sqrt(x.volunteers / Math.sqrt(o.scale)) * 1.4 + Math.sqrt(x.staff) * 2 + x.momentum * 0.4 + endorseScore(camp, x.name) * 0.7 + partyBase(c, camp, x.party) + alleg(x.name));
  for (const name of Object.keys(s)) s[name] = Math.max(1, (s[name] ?? 1) + (camp.adScoreOffsets?.[name] ?? 0) + (name === c.character.name ? (camp.nameRecognition ?? 0) * 0.1 - (camp.independentAdPenalty ?? 0) - (camp.rivalPressure?.damage ?? 0) : 0));
  return s;
}
/** Integer shares (incl. Undecided) that always total exactly 100. */
export function toShares(sc: Record<string, number>, undecided: number) {
  const names = Object.keys(sc);
  undecided = names.length ? Math.round(clamp(Number.isFinite(undecided) ? undecided : 26)) : 100;
  const pow = names.map(n => scoreWeight(sc[n] ?? 0)), sum = pow.reduce((a, b) => a + b, 0);
  const raw = names.map((n, i) => ({ n, v: (sum ? (pow[i] ?? 0) / sum : 1 / names.length) * (100 - undecided) }));
  const out: Record<string, number> = {}; let used = undecided;
  raw.forEach(x => { out[x.n] = Math.floor(x.v); used += out[x.n] ?? 0; });
  [...raw].sort((a, b) => (b.v % 1) - (a.v % 1)).slice(0, 100 - used).forEach(x => { out[x.n] = (out[x.n] ?? 0) + 1; });
  out["Undecided"] = undecided;
  return out;
}
export function takePoll(c: Career, camp: Campaign, date: string) {
  const deadline = camp.phase === 'primary' ? camp.primaryDate ?? camp.electionDate : camp.electionDate;
  const duration = Math.max(1, monthsBetween(camp.startDate, deadline));
  const progress = clamp(monthsBetween(camp.startDate, date) / duration, 0, 1);
  return { date, shares: toShares(scores(c, camp), Math.round(26 - progress * 20)), ...(camp.phase === 'general' ? { crisisRecord: crisisRecord(c, date) } : {}) };
}
export const latestPoll = (camp: Campaign) => camp.polls[camp.polls.length - 1];
export const prevPoll = (camp: Campaign) => camp.polls[camp.polls.length - 2];
export function partyPopularity(c: Career) {
  const L = lean(c), d = (rand(c.date + 'pp') - 0.5) * 6;
  const dem = Math.round(45 + L * 0.5 + d), rep = Math.round(45 - L * 0.5 - d);
  return { Democrat: dem, Republican: rep, Independent: 100 - dem - rep };
}
export const favorability = (c: Career) => Math.round(clamp(30 + c.reputation * 0.5 + (c.campaign?.momentum ?? 0) * 1.5 - (c.campaign?.allegation?.target === c.character.name ? c.campaign.allegation.status === 'proven' ? 8 : c.campaign.allegation.status === 'alleged' ? 1 : 0 : 0), 5, 90));
export function groupSupport(c: Career, g: Group) {
  const camp = c.campaign, base = camp ? latestPoll(camp)?.shares[c.character.name] ?? 30 : 30;
  const e = endorsedBy(camp, g.id);
  return Math.round(clamp(base + (groupRel(c, g.id) - 30) * 0.4 + (e === c.character.name ? 12 : e ? -10 : 0) + leanFit(g, camp?.party ?? c.character.party) * 8, 2, 95));
}

// ---------- Player actions ----------
const story = (h: string, sub: string, body: string, tag: string): Story => ({ h, sub, body, tag });
function spend(camp: Campaign, label: string, amount: number, date: string): Campaign { return { ...camp, funds: camp.funds - amount, spent: camp.spent + amount, txns: [{ month: date, label, amount: -amount }, ...camp.txns].slice(0, 40) }; }
function receive(camp: Campaign, label: string, amount: number, date: string, donors = 0): Campaign { return { ...camp, funds: camp.funds + amount, raised: camp.raised + amount, donors: camp.donors + donors, txns: [{ month: date, label, amount }, ...camp.txns].slice(0, 40) }; }
const head = (camp: Campaign, h: string): Campaign => ({ ...camp, headlines: [h, ...camp.headlines].slice(0, 10) });
const queue = (c: Career, s: Story): Career => ({ ...c, newsQueue: [...c.newsQueue, s] });

/** Term length in years and seniority rank per office, for term dates and incompatible-office rules. */
export const officeRank: Record<string, number> = { council: 1, mayor: 2, stateLeg: 3, house: 4, governor: 5, senate: 6, president: 7 };
export function launchCampaign(c: Career, id: OfficeId, slogan: string, strategy: Campaign['strategy']): Res {
  if (c.dynasty?.retired || c.legacy?.death) return { ok: false, message: 'Active politics has ended for this career.' };
  const restriction = ballotRestriction(c);
  if (restriction) return { ok: false, message: restriction };
  if (c.campaign) return { ok: false, message: 'You are already running a campaign.' };
  if (c.appointments?.pledge) return { ok: false, message: 'You pledged to back another candidate; your own run is on hold until that election concludes.' };
  if (c.appointments?.current) return { ok: false, message: `Resign as ${c.appointments.current.title} before running for office.` };
  const o = officeById(id);
  const limit = termLimitReason(c, id);
  if (limit) return { ok: false, message: limit };
  if (c.office && c.office.id !== id) return { ok: false, message: `Confirm resignation as ${c.office.title} before pursuing another office.` };
  if (!availableElections(c).some(e => e.office.id === id)) return { ok: false, message: 'You are not eligible for this election.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Launching a campaign needs 15% energy. Advance the turn first.' };
  const access = independentBallotAccess(c, o);
  if (access) return { ok: false, message: access };
  const { electionDate, primaryDate } = nextCycle(c, o);
  const name = c.character.name, party = c.character.party;
  let camp: Campaign = { office: id, title: o.title, jurisdiction: o.jurisdiction(c), party, electionDate, primaryDate, startDate: c.date, phase: o.partisan && party !== 'Independent' ? 'primary' : 'general', slogan, strategy, manager: null, funds: 0, raised: 0, spent: 0, donors: 0, staff: 0, volunteers: Math.round(5 + c.contacts * 2), support: 0, momentum: 3, opponents: genOpponents(c, o, electionDate), polls: [], txns: [], endorsements: [], headlines: [], attack: null, allegation: null, turnActs: ['Campaign launch'], lastProcessedEnd: c.date };
  // Opening reserves were raised in an earlier race, not in this campaign.
  if (c.warChest > 0) camp = { ...camp, funds: c.warChest, txns: [{ month: c.date, label: 'Carried over from previous campaign', amount: c.warChest }] };
  let n: Career = { ...c, actions: c.actions - ACTION_COST, warChest: 0, experience: r1(c.experience + 1), termPlan: c.office ? { tenure: termKey(c), choice: 'run' } : null };
  const lines: string[] = [];
  if (c.job) {
    lines.push('You left your job to campaign full-time; regular salary has stopped.');
    n = queue(n, story(`${name} quits day job to run full-time`, `Leaves regular employment for the ${o.title} race`, `${name} has left regular employment to campaign full-time for ${o.title}. Personal savings stand at ${usd(c.money)}; campaign money is held in a separate account.`, 'player'));
  }
  n = { ...n, job: null, applications: n.applications.map(a => a.status === 'pending' || a.status === 'offered' ? { ...a, status: 'declined' as const, reason: 'Withdrawn to run for office' } : a) };
  camp = head(camp, `${name} launches bid for ${o.title}: "${slogan}"`);
  camp = { ...camp, polls: [takePoll(n, camp, c.date)] };
  n = queue({ ...n, campaign: camp }, story(`${name} launches campaign for ${o.title}`, `"${slogan}" · ${camp.jurisdiction}`, `${name} (${party}) formally entered the race for ${o.title} in ${camp.jurisdiction}. ${camp.phase === 'primary' ? `The ${party} primary is in ${monthLabel(primaryDate!)}` : `Election Day is in ${monthLabel(electionDate)}`}. Rivals include ${active(camp).map(x => `${x.name} (${x.party})`).join(', ')}.`, 'campaign'));
  const message = `Campaign launched for ${o.title}.${lines.length ? ' ' + lines[0] : ''}`;
  return { ok: true, career: log(n, message), message };
}

export type CampAct = 'fundraise' | 'event' | 'volunteers' | 'staff' | 'rally' | 'ads' | 'respond' | 'poll';
export type PricedAct = Exclude<CampAct, 'fundraise' | 'respond'>;
/** Target base prices per office, in campaign funds — the single source for action pricing. */
export const baseCosts: Record<OfficeId, Record<PricedAct, number>> = {
  council: { event: 2000, volunteers: 500, staff: 3000, rally: 2500, ads: 5000, poll: 1000 },
  mayor: { event: 10000, volunteers: 2500, staff: 15000, rally: 12000, ads: 25000, poll: 5000 },
  stateLeg: { event: 5000, volunteers: 1500, staff: 7500, rally: 6000, ads: 12500, poll: 2500 },
  house: { event: 25000, volunteers: 7500, staff: 37500, rally: 30000, ads: 62500, poll: 12500 },
  governor: { event: 100000, volunteers: 25000, staff: 150000, rally: 120000, ads: 250000, poll: 50000 },
  senate: { event: 125000, volunteers: 30000, staff: 187500, rally: 150000, ads: 312500, poll: 62500 },
  president: { event: 1000000, volunteers: 250000, staff: 1500000, rally: 1200000, ads: 2500000, poll: 500000 },
};
export const actCost = (camp: Campaign, a: CampAct) => (a === 'fundraise' || a === 'respond' ? 0 : baseCosts[officeById(camp.office).id][a]);
/** Fundraising calls per campaign turn; usage is tracked in turnActs, which resets each turn. */
export const CALLS_PER_TURN = 1;
export const callsUsed = (camp: Campaign) => camp.turnActs.filter(t => t === actLabel.fundraise).length;
/** Office-specific ceiling on a single fundraising-call payout. */
export const callCeiling = (camp: Campaign) => baseCosts[officeById(camp.office).id].event * 2;
/** Aggregate small-dollar gifts per three-month period; active fundraising stays separate. */
export const passiveCeiling = (camp: Campaign) => unit(officeById(camp.office)) * 10;
export const maxStaff = (camp: Campaign) => Math.round(2 + 3 * Math.sqrt(officeById(camp.office).scale));
export function campaignAction(c: Career, a: CampAct): Res {
  if (a === 'ads') return purchaseCampaignAd(c, adRequest(c, 'positive', 'standard', 'all'));
  if (a === 'staff') {
    const role = directorRoles.find(role => directorBlocker(c, role) === null);
    return role ? campaignStaffAction(c, staffRequest(c, role)) : { ok: false, message: 'No recruitable director. Review Campaign Headquarters.' };
  }
  if (c.debate) return { ok: false, message: 'Finish your debate first.' };
  const camp0 = c.campaign;
  if (!camp0) return { ok: false, message: 'No active campaign.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  const cost = Math.round(actCost(camp0, a));
  if (camp0.funds < cost) return { ok: false, message: `Campaign funds too low: needs ${usd(cost)}.` };
  if (a === 'fundraise' && callsUsed(camp0) >= CALLS_PER_TURN) return { ok: false, message: 'You have already made your fundraising calls this turn — donors need a break. Advance the turn to call again.' };
  const o = officeById(camp0.office), u = unit(o), seed = `${c.character.name}${c.date}${c.actions}${a}${camp0.funds}`;
  const name = c.character.name, sk = c.skills;
  let camp: Campaign = { ...camp0 }, msg = '', st: Story | null = null;
  const endorse = camp.endorsements.filter(e => e.candidate === name).length;
  switch (a) {
    case 'poll': {
      camp = spend(camp, 'Commissioned campaign poll', cost, c.date);
      const poll = takePoll(c, camp, c.date);
      camp = { ...camp, polls: [...camp.polls, poll].slice(-6) };
      msg = `Poll commissioned: ${name} ${poll.shares[name] ?? 0}% · ${poll.shares['Undecided'] ?? 0}% undecided.`;
      break;
    }
    case 'fundraise': {
      const ceiling = callCeiling(camp0) * (hasDirector(camp0, 'finance') ? 1.25 : 1);
      const raw = u * (1.1 + c.contacts * 0.05 + c.reputation * 0.02 + endorse * 0.15 + camp.staff * 0.08) * rr(seed, 0.75, 1.25);
      const diminish = 1 / (1 + camp0.raised / (callCeiling(camp0) * 20));
      const amt = Math.min(Math.round(raw * diminish * (hasDirector(camp0, 'finance') ? 1.25 : 1)), ceiling);
      const donors = Math.max(1, Math.round(amt / Math.min(giftCap(o), 60 + 40 * Math.sqrt(o.scale))));
      camp = receive(camp, `Call-time donations (${donors} donors)`, amt, c.date, donors); msg = `Raised ${usd(amt)} from ${donors} donors.`; break;
    }
    case 'event': {
      const flop = rand(seed + 'f') < 0.2;
      const amt = flop ? Math.round(u * 0.3) : Math.round(u * (2 + c.contacts * 0.06 + c.reputation * 0.03 + endorse * 0.2) * rr(seed, 0.8, 1.3));
      const donors = Math.max(1, Math.round(amt / Math.min(giftCap(o), 150 + 60 * Math.sqrt(o.scale))));
      camp = spend(camp, 'Fundraising event costs', cost, c.date); camp = receive(camp, `Fundraising dinner (${donors} donors)`, amt, c.date, donors);
      msg = flop ? `The fundraiser flopped: raised only ${usd(amt)} against ${usd(cost)} costs.` : `Fundraising dinner raised ${usd(amt)} (costs ${usd(cost)}).`;
      if (flop) camp = head(camp, `Thin crowd at ${name} fundraiser`); break;
    }
    case 'volunteers': {
      const v = Math.round((8 + sk.leadership * 0.4) * Math.sqrt(o.scale) * rr(seed, 0.8, 1.2) * (camp.strategy === 'grassroots' ? 1.35 : 1) * (1 + 0.25 * directorStrength(camp, 'field')));
      camp = spend(camp, 'Volunteer training & materials', cost, c.date); camp = { ...camp, volunteers: camp.volunteers + v }; msg = `${v} new volunteers joined (${usd(cost)} materials).`; break;
    }
    case 'rally': {
      const gaffe = rand(seed + 'g') < (sk.communication < 15 ? 0.25 : 0.1);
      camp = spend(camp, 'Rally: venue, travel & security', cost, c.date);
      if (gaffe) { camp = { ...camp, momentum: camp.momentum - r1(3 * communicationsSeverity(camp)) }; camp = head(camp, `${name} stumbles at rally; remarks draw criticism`); msg = 'Rally gaffe: your off-script remark is all over the news. Momentum fell.'; st = story(`${name} gaffe overshadows rally`, 'Campaign scrambles to clarify remarks', `A rally meant to energise supporters of ${name} was overshadowed by an off-script comment that critics seized on. The campaign says the remark was taken out of context.`, 'campaign'); }
      else { const g = supportGain((2 + sk.communication * 0.08 + Math.sqrt(camp.volunteers / Math.sqrt(o.scale)) * 0.2 * (1 + 0.25 * directorStrength(camp, 'field'))) * focusMultiplier(c) * endorsementFactor(camp, name), camp.support); camp = { ...camp, support: camp.support + g, momentum: camp.momentum + 2 + (camp.strategy === 'grassroots' ? r1(directorStrength(camp, 'field')) : 0) }; camp = head(camp, `Crowds turn out for ${name} rally`); msg = `Strong rally: +${g} support, momentum up.${endorsementCount(camp, name) ? '' : ' (No group endorsement — only 25% of the usual gain.)'}`; }
      break;
    }
    case 'respond': {
      if (camp.attack) { camp = { ...camp, momentum: camp.momentum + 3, ...(camp.rivalPressure ? { rivalPressure: { ...camp.rivalPressure, damage: r1(camp.rivalPressure.damage * REBUTTAL_KEEP) } } : {}) }; msg = `You rebutted ${camp.attack}'s attack. Momentum recovered${camp.rivalPressure?.damage ? ' and some of the damage faded' : ''}.`; camp = head(camp, `${name} hits back at ${camp.attack}`); st = story(`${name} answers ${camp.attack}'s attacks`, 'Rebuttal reframes the race', `${name} responded point by point to criticism from ${camp.attack}, accusing the rival of distorting the record.`, 'opponent'); camp = { ...camp, attack: null }; }
      else {
        const lp = latestPoll(camp)?.shares ?? {}; const target = [...active(camp)].sort((x, y) => (lp[y.name] ?? 0) - (lp[x.name] ?? 0))[0];
        if (!target) return { ok: false, message: 'No opponent to contrast with.' };
        const backfire = rand(seed + 'b') < 0.3;
        camp = { ...camp, opponents: camp.opponents.map(x => x.name === target.name ? { ...x, support: x.support - (backfire ? 0.5 : 2.5) } : x), momentum: camp.momentum + (backfire ? -2 : 0.5) };
        msg = backfire ? `Your attack on ${target.name} backfired with voters.` : `You drew a sharp contrast with ${target.name}; their support slipped.`;
        camp = head(camp, backfire ? `${name}'s attack on ${target.name} called "negative"` : `${name} targets ${target.name}'s record`);
      }
      break;
    }
  }
  camp = { ...camp, turnActs: [...camp.turnActs, actLabel[a]] };
  let n: Career = { ...c, actions: c.actions - ACTION_COST, experience: r1(c.experience + 0.5), campaign: camp };
  if (st) n = queue(n, st);
  return { ok: true, career: log(n, msg), message: msg };
}
export const actLabel: Record<CampAct, string> = { fundraise: 'Fundraising calls', event: 'Fundraising event', volunteers: 'Organise volunteers', staff: 'Hire staff', rally: 'Hold rally', ads: 'Advertising', respond: 'Respond to opponents', poll: 'Commission a poll' };

// ---------- Campaign Headquarters ----------
export const directorCatalog: { id: DirectorRole; title: string; perk: string; minScale: number; salaryFactor: number }[] = [
  { id: 'field', title: 'Field Director', perk: 'Up to +25% volunteer efficiency and door-to-door vote strength; extra Grassroots rally momentum.', minScale: 1, salaryFactor: 1 },
  { id: 'communications', title: 'Communications Director', perk: 'Up to 30% softer gaffes/scandal fallout and 25% higher interview/debate gains.', minScale: 1, salaryFactor: 1.2 },
  { id: 'research', title: 'Opposition Researcher', perk: '+35% Attack Ad effectiveness; exclusive rival policy vulnerabilities.', minScale: 2, salaryFactor: 1.3 },
  { id: 'finance', title: 'Finance Chair', perk: '+25% donor call yields; unlock high-dollar fundraising dinners.', minScale: 2, salaryFactor: 1.2 },
];
export type StaffRequest = { role: DirectorRole | 'dinner'; revision: number; turn: string; campaignKey: string };
export const staffRequest = (c: Career, role: StaffRequest['role']): StaffRequest => ({ role, revision: c.campaign?.staffRevision ?? 0, turn: c.date, campaignKey: c.campaign ? `${c.campaign.office}|${c.campaign.startDate}|${c.campaign.electionDate}` : '' });
export function recruitmentCandidates(c: Career): Director[] {
  const camp = c.campaign;
  if (!camp) return [];
  const o = officeById(camp.office);
  return directorCatalog.map((r, i) => {
    const seed = `${c.character.name}|${camp.office}|${camp.startDate}|${r.id}`;
    return { id: seed, role: r.id, name: figure(seed), portrait: i, competence: Math.round(rr(seed + 'competence', 55, 95)), loyalty: Math.round(rr(seed + 'loyalty', 55, 90)), salary: Math.round(unit(o) * r.salaryFactor), hired: c.date };
  });
}
export const directorHiringCost = (camp: Campaign) => baseCosts[officeById(camp.office).id].staff;
export const campaignPayroll = (camp: Campaign) => staffRoster(camp).reduce((sum, d) => sum + d.salary, 0) + staffAides(camp) * unit(officeById(camp.office)) * 0.5;
export function directorBlocker(c: Career, role: DirectorRole): string | null {
  const camp = c.campaign;
  if (!camp) return 'No active campaign.';
  const rule = directorCatalog.find(r => r.id === role);
  if (!rule) return 'Unknown director role.';
  if (c.legal?.prison || c.crime?.arrest || c.debate || camp.townHall?.status === 'live' || c.report || c.newspaperPending || c.pendingEvent || c.eventEncounter) return 'Finish your current encounter first.';
  if (hasDirector(camp, role)) return 'Role filled.';
  if (officeById(camp.office).scale < rule.minScale) return 'Available for State Legislature / Mayor and higher races.';
  if (c.actions < ACTION_COST) return 'Not enough energy this turn.';
  const candidate = recruitmentCandidates(c).find(d => d.role === role);
  if (!candidate || camp.funds < directorHiringCost(camp) + campaignPayroll(camp) + candidate.salary) return 'Campaign funds must cover recruitment and a full quarter of team payroll.';
  return null;
}
export function campaignStaffAction(c: Career, req: StaffRequest): Res {
  const camp0 = c.campaign;
  if (!camp0 || req.revision !== (camp0.staffRevision ?? 0) || req.turn !== c.date || req.campaignKey !== `${camp0.office}|${camp0.startDate}|${camp0.electionDate}`) return { ok: false, message: 'This staff request is outdated.' };
  if (req.role === 'dinner') return highDollarDinner(c);
  const blocker = directorBlocker(c, req.role);
  if (blocker) return { ok: false, message: blocker };
  const director = recruitmentCandidates(c).find(d => d.role === req.role);
  if (!director) return { ok: false, message: 'Unknown candidate.' };
  const normalized = normalizeCampaignStaff(camp0);
  const directors = [...staffRoster(normalized), director];
  const camp = spend({ ...normalized, directors, staff: directors.length + staffAides(normalized), staffRevision: (camp0.staffRevision ?? 0) + 1 }, `Recruitment: ${directorCatalog.find(r => r.id === req.role)?.title}`, directorHiringCost(camp0), c.date);
  const message = `${director.name} hired. Quarterly salary ${usd(director.salary)} from campaign funds.`;
  return { ok: true, career: log({ ...c, actions: c.actions - ACTION_COST, campaign: camp }, message), message };
}
export function highDollarDinner(c: Career): Res {
  const camp = c.campaign;
  if (!camp || !hasDirector(camp, 'finance')) return { ok: false, message: 'Hire a Finance Chair to host a high-dollar dinner.' };
  if (c.legal?.prison || c.crime?.arrest || c.debate || camp.townHall?.status === 'live' || c.report || c.newspaperPending || c.pendingEvent || c.eventEncounter) return { ok: false, message: 'Finish your current encounter first.' };
  if (camp.dinnerQuarter === adQuarter(c.date) || c.actions < ACTION_COST) return { ok: false, message: 'High-dollar dinner unavailable this turn.' };
  const cost = baseCosts[officeById(camp.office).id].event * 2;
  if (camp.funds < cost) return { ok: false, message: `Dinner needs ${usd(cost)} in campaign funds.` };
  const donors = Math.round((20 + c.contacts + camp.staff * 3) * (0.75 + directorStrength(camp, 'finance') * 0.5));
  const amount = donors * giftCap(officeById(camp.office));
  let next = spend(camp, 'High-dollar dinner costs', cost, c.date);
  next = receive(next, `High-dollar dinner (${donors} capped gifts)`, amount, c.date, donors);
  const message = `High-dollar dinner raised ${usd(amount)} from ${donors} donors; cost ${usd(cost)}.`;
  return { ok: true, career: log({ ...c, actions: c.actions - ACTION_COST, campaign: { ...next, dinnerQuarter: adQuarter(c.date), staffRevision: (camp.staffRevision ?? 0) + 1, turnActs: [...camp.turnActs, 'High-dollar dinner'] } }, message), message };
}
export function rivalVulnerabilities(c: Career): { rival: string; detail: string }[] {
  const camp = c.campaign;
  if (!camp || !hasDirector(camp, 'research')) return [];
  return active(camp).map(r => ({ rival: r.name, detail: r.trait === 'money' ? `Fundraising-heavy operation; challenge how “${r.policy}” benefits ordinary voters.` : r.trait === 'ground' ? `Thin media operation; press for public cost estimates for “${r.policy}”.` : `Polished media image but limited ground reach; test delivery details of “${r.policy}”.` }));
}
/** Salaries settle before donations, once per quarter; unpaid directors leave without borrowing. */
export function settleDirectorPayroll(camp0: Campaign, start: string, end: string): { campaign: Campaign; lines: string[] } {
  if (monthsBetween(start, end) !== 3 || start < camp0.startDate || (camp0.staffPayrollEnd && start < camp0.staffPayrollEnd)) return { campaign: camp0, lines: [] };
  let camp = normalizeCampaignStaff(camp0);
  const keep: Director[] = [], lines: string[] = [];
  if (staffRoster(camp).every(d => d.legacy)) {
    const wage = unit(officeById(camp.office)) * 0.5;
    const retained = Math.min(camp.staff, Math.max(0, Math.floor(camp.funds / wage)));
    if (retained) camp = spend(camp, `Staff payroll (${retained})`, retained * wage, start);
    if (retained < camp.staff) lines.push(`Unpaid: ${camp.staff - retained} staffer(s) quit.`);
    const directors = staffRoster(camp).slice(0, retained);
    return { campaign: { ...camp, directors, legacyAides: Math.max(0, retained - directors.length), staff: retained, staffPayrollEnd: end, staffRevision: (camp.staffRevision ?? 0) + 1, momentum: camp.momentum - (lines.length ? 1 : 0) }, lines };
  }
  for (const d of staffRoster(camp)) {
    if (camp.funds >= d.salary) { camp = spend(camp, `Director payroll: ${d.name}`, d.salary, start); keep.push({ ...d, loyalty: Math.min(100, d.loyalty + 1) }); }
    else lines.push(`${d.name} left: campaign could not pay ${usd(d.salary)} salary.`);
  }
  const aideSalary = unit(officeById(camp.office)) * 0.5;
  const aides = Math.min(staffAides(camp), Math.max(0, Math.floor(camp.funds / aideSalary)));
  if (aides) camp = spend(camp, `Legacy aide payroll (${aides})`, aides * aideSalary, start);
  if (aides < staffAides(camp)) lines.push(`${staffAides(camp) - aides} unpaid legacy aides left.`);
  camp = { ...camp, directors: keep, legacyAides: aides, staff: keep.length + aides, manager: keep[0]?.name ?? null, staffPayrollEnd: end, staffRevision: (camp.staffRevision ?? 0) + 1 };
  if (lines.length) camp = { ...camp, momentum: camp.momentum - 1 };
  return { campaign: camp, lines };
}

// ---------- Ad Studio (browser-safe, deterministic and campaign-ledger only) ----------
export const adTypes = [
  { id: 'positive', label: 'Positive Vision Ad', description: 'A hopeful message. Steady support and wider name recognition.', multiplier: 0.5 },
  { id: 'contrast', label: 'Issue Contrast Ad', description: 'Compare policy plans and convert a specific voter audience.', multiplier: 1 },
  { id: 'attack', label: 'Hard-Hitting Attack Ad', description: 'Challenge a rival’s record. Independents may reject dirty politics.', multiplier: 2 },
] as const;
export const adBudgets = [
  { id: 'local', label: 'Focused', multiplier: 0.6, reach: 0.75, drop: 2 },
  { id: 'standard', label: 'Standard', multiplier: 1, reach: 1, drop: 3 },
  { id: 'saturation', label: 'Saturation', multiplier: 1.5, reach: 1.25, drop: 5 },
] as const;
export type AdKind = typeof adTypes[number]['id'];
export type AdBudget = typeof adBudgets[number]['id'];
export type AdRequest = { kind: AdKind; budget: AdBudget; audience: string; rival: string | null; revision: number; turn: string; campaignKey: string };
export const adQuarter = (date: string) => `${date.slice(0, 4)}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`;
const adCampaignKey = (camp: Campaign) => `${camp.office}|${camp.startDate}|${camp.electionDate}`;
export const adRivals = (camp: Campaign) => active(camp);
export function adRequest(c: Career, kind: AdKind, budget: AdBudget, audience: string, rival: string | null = null): AdRequest {
  return { kind, budget, audience, rival, revision: c.campaign?.adRevision ?? 0, turn: c.date, campaignKey: c.campaign ? adCampaignKey(c.campaign) : '' };
}
/** No separate integrity statistic exists: reputation minus proven-record damage is the integrity proxy. */
export function adTrust(c: Career) {
  const approval = clamp(c.approval?.overall ?? favorability(c));
  const integrity = clamp(c.reputation - c.scandals.filter(s => s.status === 'proven').length * 10);
  return { approval, integrity, backlashRisk: r1(clamp(0.65 - (approval + integrity) * 0.003, 0.05, 0.65)) };
}
export function adPreview(c: Career, kind: AdKind, budget: AdBudget, audience: string) {
  const camp = c.campaign;
  const creative = adTypes.find(a => a.id === kind), tier = adBudgets.find(b => b.id === budget);
  if (!camp || !creative || !tier) return null;
  const relation = groupRel(c, audience);
  const conversion = r1(Math.min(100 - relation, 8 * tier.reach / (1 + Math.max(0, relation) / 100)));
  return { cost: Math.round(baseCosts[officeById(camp.office).id].ads * creative.multiplier * tier.multiplier),
    support: kind === 'attack' ? 0 : supportGain((kind === 'positive' ? 4 : 6) * tier.reach * (camp.strategy === 'media' ? 1.4 : 1) * endorsementFactor(camp, c.character.name), camp.support),
    recognition: kind === 'positive' ? r1(Math.min(100 - (camp.nameRecognition ?? 0), 4 * tier.reach)) : 0,
    conversion: kind === 'contrast' ? Math.max(0, conversion) : 0,
    rivalDrop: kind === 'attack' ? tier.drop * (hasDirector(camp, 'research') ? 1.35 : 1) : 0,
    backlashRisk: kind === 'attack' ? adTrust(c).backlashRisk : 0,
    responseRisk: kind === 'contrast' ? 0.12 : 0,
    independentLoss: kind === 'attack' ? tier.drop : 0 };
}
export function adBlocker(c: Career): string | null {
  if (!c.campaign) return 'No active campaign.';
  if (c.legal?.prison || c.crime?.arrest) return 'Campaign advertising is unavailable in custody.';
  if (c.debate || c.campaign.townHall?.status === 'live') return 'Finish your live voter encounter first.';
  if (c.report || c.newspaperPending || c.pendingEvent || c.eventEncounter) return 'Finish the current turn first.';
  if (c.campaign.lastAdQuarter === adQuarter(c.date)) return 'An ad campaign has already aired this turn.';
  if (c.actions < ACTION_COST) return 'Not enough energy this turn.';
  return null;
}
export function purchaseCampaignAd(c: Career, request: AdRequest): Res {
  const camp0 = c.campaign;
  if (!camp0) return { ok: false, message: 'No active campaign.' };
  if (request.revision !== (camp0.adRevision ?? 0) || request.turn !== c.date || request.campaignKey !== adCampaignKey(camp0)) return { ok: false, message: 'This ad request is outdated. Review the current campaign.' };
  const blocker = adBlocker(c);
  if (blocker) return { ok: false, message: blocker };
  const preview = adPreview(c, request.kind, request.budget, request.audience);
  const creative = adTypes.find(a => a.id === request.kind);
  if (!preview || !creative || (request.kind === 'contrast' ? !groups.some(g => g.id === request.audience) : request.audience !== (request.kind === 'positive' ? 'all' : 'independent'))) return { ok: false, message: 'Choose a valid ad type, budget and audience.' };
  const rival = active(camp0).find(x => x.name === request.rival);
  if (request.kind !== 'positive' && !rival) return { ok: false, message: 'Choose an active rival.' };
  if (!Number.isFinite(camp0.funds) || camp0.funds < preview.cost) return { ok: false, message: `Campaign funds too low: needs ${usd(preview.cost)}.` };
  const seed = `${adCampaignKey(camp0)}|${c.character.name}|${adQuarter(c.date)}`;
  const backlash = request.kind === 'attack' && rand(seed + '|backlash') < preview.backlashRisk;
  const responseCost = baseCosts[officeById(camp0.office).id].ads * 0.5;
  const response = request.kind === 'contrast' && !!rival && rival.funds >= responseCost && rand(seed + '|response') < preview.responseRisk;
  let camp: Campaign = spend({ ...camp0, adRevision: (camp0.adRevision ?? 0) + 1, lastAdQuarter: adQuarter(c.date), support: camp0.support + preview.support,
    nameRecognition: clamp((camp0.nameRecognition ?? 0) + preview.recognition), independentAdPenalty: Math.min(12, (camp0.independentAdPenalty ?? 0) + (backlash ? preview.independentLoss : 0)),
    turnActs: [...camp0.turnActs, creative.label] }, creative.label, preview.cost, c.date);
  let n: Career = { ...c, campaign: camp, actions: c.actions - ACTION_COST, experience: r1(c.experience + 0.5) };
  if (request.kind === 'contrast') n = { ...n, groups: { ...c.groups, [request.audience]: r1(clamp(groupRel(c, request.audience) + preview.conversion)) } };
  if (backlash && n.approval) n = { ...n, approval: { ...n.approval, independent: Math.max(5, n.approval.independent - preview.independentLoss), history: [{ date: c.date, change: -preview.independentLoss, reason: 'Independent voters reject negative campaign advertising.' }, ...n.approval.history].slice(0, 20) } };
  if (response && rival) camp = { ...camp, attack: rival.name, momentum: camp.momentum - 1, opponents: camp.opponents.map(x => x.name === rival.name ? { ...x, funds: x.funds - responseCost, spent: x.spent + responseCost } : x) };
  let rivalDrop = 0;
  if (request.kind === 'attack' && rival) {
    // Invert the same score-weighted polling engine, rather than overlaying a fake poll.
    const before = takePoll(c, camp0, c.date).shares[rival.name] ?? 0;
    const baseline = takePoll(n, camp, c.date).shares[rival.name] ?? 0;
    const floorCamp = { ...camp, adScoreOffsets: { ...camp.adScoreOffsets, [rival.name]: (camp.adScoreOffsets?.[rival.name] ?? 0) - 1000000 } };
    const floor = takePoll(n, floorCamp, c.date).shares[rival.name] ?? 0;
    const desired = Math.max(floor, before - Math.round(preview.rivalDrop));
    let lo = -1000000, hi = 1000000;
    for (let i = 0; i < 64; i++) {
      const mid = (lo + hi) / 2;
      const probe = { ...camp, adScoreOffsets: { ...camp.adScoreOffsets, [rival.name]: (camp.adScoreOffsets?.[rival.name] ?? 0) + mid } };
      if ((takePoll(n, probe, c.date).shares[rival.name] ?? 0) <= desired) lo = mid; else hi = mid;
    }
    if (baseline !== desired) camp = { ...camp, adScoreOffsets: { ...camp.adScoreOffsets, [rival.name]: (camp.adScoreOffsets?.[rival.name] ?? 0) + lo } };
    rivalDrop = before - (takePoll(n, camp, c.date).shares[rival.name] ?? 0);
  }
  const outcome = backlash ? ` Backlash: Independent backing fell by ${preview.independentLoss} points.` : response ? ` ${rival?.name} funded a counter-ad; momentum fell by 1.` : ' No backlash or counter-ad.';
  const message = `${creative.label} aired for ${usd(preview.cost)}: ${request.kind === 'attack' ? `${rival?.name} down ${rivalDrop} polling points` : `+${preview.support} support${request.kind === 'contrast' ? `; target favorability +${preview.conversion}` : `; name recognition +${preview.recognition}`}`}.${outcome}`;
  camp = head({ ...camp, lastAd: { date: c.date, kind: request.kind, budget: request.budget, audience: request.audience, rival: rival?.name ?? null, cost: preview.cost, support: preview.support, rivalDrop, backlash, response, message } }, message);
  const poll = takePoll(n, camp, c.date);
  camp = { ...camp, polls: [...camp.polls, poll].slice(-6) };
  n = queue({ ...n, campaign: camp }, story(`${c.character.name} airs ${creative.label.toLowerCase()}`, backlash ? 'Independent voters push back' : response ? 'Rival funds a counter-ad' : 'Campaign advertising reshapes the race', message, 'campaign'));
  return { ok: true, career: log(n, message), message };
}

export function policyMessage(c: Career, issue: Issue): Res {
  const camp = c.campaign;
  if (!camp) return { ok: false, message: 'No active campaign.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  const g = supportGain((1.5 + c.skills.knowledge * 0.08) * (camp.strategy === 'policy' ? 1.6 : 1), camp.support);
  const touched = groups.filter(x => x.issues.includes(issue));
  const rel = { ...c.groups }; touched.forEach(x => { rel[x.id] = clamp(groupRel(c, x.id) + 6); });
  const nc: Campaign = head({ ...camp, support: camp.support + g, momentum: camp.momentum + 1, turnActs: [...camp.turnActs, `Policy: ${issue}`] }, `${c.character.name} unveils ${issue} plan`);
  const msg = `Policy speech on ${issue}: +${g} support; ${touched.map(x => x.name).join(', ')} took notice.`;
  const n = queue({ ...c, actions: c.actions - ACTION_COST, experience: r1(c.experience + 0.5), groups: rel, campaign: nc }, story(`${c.character.name} unveils ${issue} agenda`, `Plan aimed at ${touched.map(x => x.name.toLowerCase()).join(' and ')}`, `In a policy address, ${c.character.name} laid out a detailed ${issue} platform for the ${camp.title} race. Groups focused on ${issue} said they would study the proposals.`, 'campaign'));
  return { ok: true, career: log(n, msg), message: msg };
}
export function selfFund(c: Career, customAmount?: number): Res {
  const camp = c.campaign;
  if (!camp) return { ok: false, message: 'No active campaign.' };
  if (c.money <= 0) return { ok: false, message: 'You have no personal savings to contribute.' };
  const amt = customAmount !== undefined ? customAmount : Math.min(c.money, unit(officeById(camp.office)));
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, message: 'Contribution amount must be a finite number greater than zero.' };
  if (amt > c.money) return { ok: false, message: `Cannot transfer ${usd(amt)}: exceeds available personal balance of ${usd(c.money)}.` };
  const n: Career = { ...c, money: c.money - amt, ledger: [{ month: c.date, label: 'Contribution to own campaign', amount: -amt }, ...c.ledger], campaign: receive(camp, 'Candidate self-funding', amt, c.date) };
  const msg = `Contributed ${usd(amt)} from personal savings into campaign account. Personal balance: ${usd(n.money)} · Campaign funds: ${usd(camp.funds + amt)}.`;
  return { ok: true, career: log(n, msg), message: msg };
}
export function setStrategy(c: Career, s: Campaign['strategy']): Res {
  if (!c.campaign) return { ok: false, message: 'No active campaign.' };
  return { ok: true, career: { ...c, campaign: { ...c.campaign, strategy: s } }, message: `Strategy set to ${s}.` };
}
export function contactGroup(c: Career, id: string): Res {
  const g = groups.find(x => x.id === id);
  if (!g) return { ok: false, message: 'Unknown group.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  const camp = c.campaign, name = c.character.name, party = camp?.party ?? c.character.party;
  const rel = clamp(groupRel(c, id) + 8 + c.skills.communication * 0.15 + leanFit(g, party) * 4 + (camp?.strategy === 'policy' ? 3 : 0));
  let n: Career = { ...c, actions: c.actions - ACTION_COST, experience: r1(c.experience + 0.5), groups: { ...c.groups, [id]: r1(rel) } };
  let msg = `You met with ${g.name}. Relationship ${Math.round(rel)}/100.`;
  if (camp) {
    let nc: Campaign = { ...camp, turnActs: [...camp.turnActs, `Met ${g.name}`] };
    const taken = endorsedBy(camp, id);
    const chance = (rel - 45) / 40 + leanFit(g, party) * 0.15;
    if (taken) msg += ` They already endorsed ${taken === name ? 'you' : taken}.`;
    else if (rand(`${name}${c.date}${c.actions}${id}`) < chance) {
      nc = head({ ...nc, endorsements: [...nc.endorsements, { group: id, candidate: name }], volunteers: nc.volunteers + Math.round(g.influence * 5 * Math.sqrt(officeById(camp.office).scale)), momentum: nc.momentum + g.influence }, `${g.name} endorse ${name}`);
      n = queue(n, story(`${g.name} endorse ${name}`, `Backing comes with volunteers for the ${camp.title} race`, `${g.name} formally endorsed ${name} for ${camp.title}, citing ${g.issues.join(' and ')}. Members will knock doors and mobilise voters; any money goes through their PAC under contribution limits.`, 'groups'));
      msg = `${g.name} endorsed you! Volunteers and momentum gained.`;
    } else msg += ' No endorsement yet — keep building the relationship.';
    n = { ...n, campaign: nc };
  }
  return { ok: true, career: log(n, msg), message: msg };
}

export const groupCosts = { court: 'Free · 15% energy', concede: '1 action · 1 reputation', seek: '1 action · $' } as const;
export const seekCost = (c: Career) => c.campaign ? Math.round(unit(officeById(c.campaign.office)) * 0.5) : 0;
export function courtGroup(c: Career, id: string): Res {
  const g = groups.find(x => x.id === id);
  if (!g) return { ok: false, message: 'Unknown group.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  const party = c.campaign?.party ?? c.character.party;
  const rel = r1(clamp(groupRel(c, id) + 5 + c.skills.communication * 0.1 + leanFit(g, party) * 2));
  let n: Career = { ...c, actions: c.actions - ACTION_COST, experience: r1(c.experience + 0.3), contacts: r1(c.contacts + 0.2), groups: { ...c.groups, [id]: rel } };
  if (n.campaign) n = { ...n, campaign: { ...n.campaign, turnActs: [...n.campaign.turnActs, `Met ${g.name}`] } };
  const msg = `You met ${g.name} leaders. Favorability ${Math.round(rel)}/100.`;
  return { ok: true, career: log(n, msg), message: msg };
}
export function concedeToGroup(c: Career, id: string): Res {
  const g = groups.find(x => x.id === id);
  if (!g) return { ok: false, message: 'Unknown group.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  if (c.reputation < 1) return { ok: false, message: 'You need at least 1 reputation to make a policy pledge.' };
  const rv = groups.find(x => x.id === g.rival)!;
  const rel = r1(clamp(groupRel(c, id) + 12)), rr2 = r1(clamp(groupRel(c, rv.id) - 6));
  const issue = g.issues[0];
  let n: Career = recordPledge({ ...c, actions: c.actions - ACTION_COST, reputation: r1(c.reputation - 1), groups: { ...c.groups, [id]: rel, [rv.id]: rr2 } }, id);
  n = queue(n, story(`${c.character.name} pledges action on ${issue}`, `Concession courts ${g.name}; ${rv.name} uneasy`, `${c.character.name} offered ${g.name} a policy concession on ${issue}. Leaders welcomed the commitment, while voices among ${rv.name} criticized it as pandering.`, 'groups'));
  const msg = `Policy concession: ${g.name} ${Math.round(rel)}/100, ${rv.name} fell to ${Math.round(rr2)}/100.`;
  return { ok: true, career: log(n, msg), message: msg };
}
export function seekEndorsement(c: Career, id: string): Res {
  const g = groups.find(x => x.id === id), camp = c.campaign, name = c.character.name;
  if (!g) return { ok: false, message: 'Unknown group.' };
  if (!camp) return { ok: false, message: 'Endorsements require an active campaign.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  const taken = endorsedBy(camp, id);
  if (taken) return { ok: false, message: `${g.name} already endorsed ${taken === name ? 'you' : taken}.` };
  const cost = seekCost(c);
  if (camp.funds < cost) return { ok: false, message: `You need ${usd(cost)} in campaign funds to court their endorsement.` };
  const rel = groupRel(c, id), party = camp.party;
  let nc: Campaign = spend({ ...camp, turnActs: [...camp.turnActs, `Sought ${g.name}`] }, `Endorsement outreach: ${g.name}`, cost, c.date);
  let n: Career = { ...c, actions: c.actions - ACTION_COST };
  const chance = (rel - 50) / 30 + leanFit(g, party) * 0.15;
  let msg: string;
  if (rel >= ENDORSE_LOYALTY || (rel >= 50 && rand(`${name}${c.date}${c.actions}${id}seek`) < chance)) {
    nc = head({ ...nc, endorsements: [...nc.endorsements, { group: id, candidate: name }], volunteers: nc.volunteers + Math.round(g.influence * 5 * Math.sqrt(officeById(camp.office).scale)), momentum: nc.momentum + g.influence }, `${g.name} endorse ${name}`);
    n = queue(n, story(`${g.name} endorse ${name}`, `Backing boosts the ${camp.title} race`, `${g.name} formally endorsed ${name} for ${camp.title}, citing ${g.issues.join(' and ')}. The group brings ${g.impact.toLowerCase()}.`, 'groups'));
    msg = `${g.name} endorsed you! Permanent poll and fundraising boost for this campaign.`;
  } else {
    n = { ...n, groups: { ...c.groups, [id]: r1(clamp(rel - 2)) } };
    msg = rel < 50 ? `${g.name} declined — favorability must reach 50 first.` : `${g.name} isn't ready to endorse yet. Keep building the relationship.`;
  }
  n = { ...n, campaign: nc };
  return { ok: true, career: log(n, msg), message: msg };
}

// ---------- Electoral College ----------
export type StateCall = { state: string; name: string; party: Party; ev: number; margin: number };
const partyLean = (party: string, L: number) => party === 'Democrat' ? 1 + L / 60 : party === 'Republican' ? 1 - L / 60 : 1;
/** Battlegrounds: states whose baseline lean is within 5 points. */
export const swingStates = Object.entries(stateData).filter(([, [, L]]) => Math.abs(L) <= 5).map(([s]) => s);
export const STATE_SWING_CAP = 8;

/* Two-party structural resistance: Democratic and Republican loyalists hold their
   states against any Independent. Only exceptional funding, battleground appeal and
   debate wins (player only) can narrow it, and the partisan states resist even that. */
export const INDEPENDENT_EC_BASE = 0.8;
export const INDEPENDENT_LOYALTY_PER_POINT = 0.014;
/** Total raised for the full Independent funding breakthrough (presidential: $24M). */
export const independentFundingTarget = (o: Office) => unit(o) * 150;
export function independentBreakthrough(c: Career, camp: Campaign) {
  const funding = Math.min(1, Math.max(0, camp.raised) / independentFundingTarget(officeById(camp.office)));
  const id = `${camp.office}|${camp.startDate}|${camp.electionDate}`;
  const d = [...(c.debateHistory ?? []), ...(c.debate ? [c.debate] : [])].find(x => x.id === id && x.status === 'completed');
  const debate = !d ? 0 : d.score >= 6 ? 1 : d.score >= 2 ? 0.5 : 0;
  return { funding: r1(funding * 100) / 100, debate };
}
/** Electoral multiplier for an Independent in one state (party nominees use partyLean). */
export function independentStateFactor(c: Career, camp: Campaign, state: string, L: number, isPlayer: boolean) {
  const loyalty = INDEPENDENT_EC_BASE - Math.abs(L) * INDEPENDENT_LOYALTY_PER_POINT;
  if (!isPlayer) return Math.max(0.2, loyalty);
  const b = independentBreakthrough(c, camp);
  const swing = swingStates.includes(state) ? Math.min(1, (camp.stateSwing?.[state] ?? 0) / STATE_SWING_CAP) : 0;
  const breakthrough = (b.funding * 0.08 + b.debate * 0.07 + swing * 0.08) * Math.max(0, 1 - Math.abs(L) / 40);
  return Math.max(0.2, loyalty + breakthrough);
}
const stateFactor = (c: Career, camp: Campaign, party: string, state: string, L: number, isPlayer: boolean) =>
  party === 'Independent' ? independentStateFactor(c, camp, state, L, isPlayer) : partyLean(party, L);
export const isPresidentialGeneral = (camp: Campaign | null | undefined): camp is Campaign => !!camp && camp.office === 'president' && camp.phase === 'general';
export type StateTilt = 'Safe' | 'Lean' | 'Tossup';
export const tiltOf = (margin: number): StateTilt => Math.abs(margin) >= 8 ? 'Safe' : Math.abs(margin) >= 3 ? 'Lean' : 'Tossup';
/** Deterministic projection (no noise) of each state: player's margin vs the strongest rival. */
export function stateProjections(c: Career, camp: Campaign) {
  const sc = scores(c, camp), me = c.character.name, f = field(c, camp);
  const myParty = f.find(x => x.name === me)?.party ?? camp.party;
  const rows = Object.entries(stateData).map(([state, [ev, L]]) => {
    const mine = (sc[me] ?? 0) * stateFactor(c, camp, myParty, state, L, true) * (1 + (camp.stateSwing?.[state] ?? 0) / 100);
    const rivals = f.filter(x => x.name !== me).map(x => ({ x, v: (sc[x.name] ?? 0) * stateFactor(c, camp, x.party, state, L, false) })).sort((a, b) => b.v - a.v);
    const top = rivals[0], rv = top?.v ?? 0;
    const margin = r1(((mine - rv) / (mine + rv || 1)) * 100);
    return { state, ev, margin, tilt: tiltOf(margin), leader: margin >= 0 ? me : top?.x.name ?? me, leaderParty: margin >= 0 ? myParty : top?.x.party ?? myParty, swing: camp.stateSwing?.[state] ?? 0 };
  });
  const myEv = rows.filter(r => r.margin >= 0).reduce((a, r) => a + r.ev, 0);
  return { rows, myEv, rivalEv: 538 - myEv };
}
export const targetCost = (camp: Campaign, kind: 'rally' | 'ad') => Math.round(actCost(camp, 'rally') * (kind === 'ad' ? 2 : 1));
/** Targeted rally or ad buy in one battleground; shifts only that state's margin. */
export function targetState(c: Career, state: string, kind: 'rally' | 'ad'): Res {
  const camp = c.campaign;
  if (!isPresidentialGeneral(camp)) return { ok: false, message: 'State targeting is only available in a presidential general election.' };
  if (!swingStates.includes(state)) return { ok: false, message: `${state} is not a battleground state.` };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  const cost = targetCost(camp, kind);
  if (camp.funds < cost) return { ok: false, message: `Campaign funds too low: needs ${usd(cost)}.` };
  const cur = camp.stateSwing?.[state] ?? 0;
  if (cur >= STATE_SWING_CAP) return { ok: false, message: `${state} is saturated — voters there have heard enough from you.` };
  const gain = Math.min(STATE_SWING_CAP - cur, kind === 'ad' ? 2.5 : 1.5);
  const label = `${kind === 'ad' ? 'Ad buy' : 'Rally'} in ${state}`;
  const next = { ...spend(camp, label, cost, c.date), stateSwing: { ...camp.stateSwing, [state]: r1(cur + gain) }, turnActs: [...camp.turnActs, label] };
  const msg = `${label}: +${r1(gain)} points in ${state} (${stateData[state]![0]} EV).`;
  return { ok: true, career: log({ ...c, actions: c.actions - ACTION_COST, campaign: head(next, `${c.character.name} campaigns in ${state}`) }, msg), message: msg };
}

// ---------- Turn processing ----------
function resolveRace(c: Career, camp: Campaign, stage: 'primary' | 'general', seed: string) {
  const o = officeById(camp.office), sc = scores(c, camp), lp = latestPoll(camp)?.shares ?? {};
  const noisy: Record<string, number> = {};
  for (const [k, v] of Object.entries(sc)) noisy[k] = v * (1 + (rand(seed + k) - 0.5) * 0.3);
  if (stage !== 'primary' && noisy[c.character.name] !== undefined) noisy[c.character.name] = noisy[c.character.name]! * (1 - endorsementTurnoutPenalty({ ...camp, phase: 'general' }, c.character.name));
  const turnout = Math.round(o.turnout(c) * (stage === 'primary' ? 0.3 : 1) * rr(seed + 'to', 0.9, 1.1));
  const f = field(c, camp);
  const tot = Object.values(noisy).reduce((a, b) => a + scoreWeight(b), 0);
  const rows = f.map(x => ({ name: x.name, party: x.party, votes: Math.round(turnout * scoreWeight(noisy[x.name] ?? 0) / tot), pct: 0, poll: lp[x.name] ?? 0 }));
  const vt = rows.reduce((a, b) => a + b.votes, 0);
  rows.forEach(r => { r.pct = r1((r.votes / vt) * 100); });
  rows.sort((a, b) => b.votes - a.votes);
  let ec: { name: string; ev: number }[] | null = null, statesWon: string[] = [], stateCalls: StateCall[] = [], winner = rows[0]!.name;
  if (o.id === 'president' && stage === 'general') {
    const tally: Record<string, number> = {};
    f.forEach(x => { tally[x.name] = 0; });
    for (const [st, [votes, L]] of Object.entries(stateData)) {
      const vals = f.map(x => ({ x, v: noisy[x.name]! * stateFactor(c, camp, x.party, st, L, x.name === c.character.name) * (x.name === c.character.name ? 1 + (camp.stateSwing?.[st] ?? 0) / 100 : 1) * (1 + (rand(seed + st + x.name) - 0.5) * 0.12) })).sort((a, b) => b.v - a.v);
      const best = vals[0]!.x.name, second = vals[1]?.v ?? 0;
      tally[best]! += votes; if (best === c.character.name) statesWon.push(st);
      stateCalls.push({ state: st, name: best, party: vals[0]!.x.party, ev: votes, margin: r1(((vals[0]!.v - second) / (vals[0]!.v + second || 1)) * 100) });
    }
    ec = Object.entries(tally).map(([name, e]) => ({ name, ev: e })).sort((a, b) => b.ev - a.ev);
    winner = ec[0]!.name; // a 270 majority normally decides; without one the House picks the leader here
  }
  return { rows, ec, statesWon, stateCalls, winner };
}

function opponentsAct(c: Career, camp: Campaign, seed: string, stories: Story[], lines: string[]): Campaign {
  const o = officeById(camp.office), u = unit(o), lp = latestPoll(camp)?.shares ?? {}, me = c.character.name;
  let nc = { ...camp, opponents: [...camp.opponents] };
  nc.opponents = nc.opponents.map(x => {
    if (x.out || (nc.phase === 'primary' ? !x.primary : x.primary)) return x;
    const s = seed + x.name; let y = { ...x };
    const raise = Math.round(baseCosts[o.id].event * 3 * (y.trait === 'money' ? 1.7 : y.trait === 'ground' ? 0.8 : 1) * (y.quality / 20) * rr(s + 'r', 0.85, 1.15));
    y.funds += raise; y.raised += raise;
    y.volunteers += Math.round((y.trait === 'ground' ? 16 : 7) * Math.sqrt(o.scale) * rr(s + 'v', 0.6, 1.3));
    y.staff = Math.min(y.staff, Math.max(0, Math.floor(y.funds / (u * 0.5))));
    const pay = Math.round(y.staff * u * 0.5); y.funds -= pay; y.spent += pay;
    y.momentum = r1(y.momentum * 0.5);
    const plan: PricedAct[] = y.trait === 'ground' ? ['rally', 'staff', 'ads'] : y.trait === 'media' ? ['ads', 'rally', 'staff'] : ['staff', 'ads', 'rally'];
    const purchased: string[] = [];
    for (const action of plan) {
      const cost = actCost(nc, action);
      if (y.funds < cost || (action === 'staff' && y.staff >= maxStaff(nc))) continue;
      y.funds -= cost; y.spent += cost;
      if (action === 'staff') { y.staff += 1; purchased.push('hired staff'); }
      if (action === 'ads') { y.support += supportGain(4 * (y.trait === 'media' ? 1.4 : 1), y.support); y.momentum += 1; purchased.push('bought advertising'); }
      if (action === 'rally') { y.support += supportGain(2.5 * (y.trait === 'ground' ? 1.4 : 1), y.support); y.momentum += 2; purchased.push('held a rally'); }
    }
    if (purchased.length) lines.push(`${y.name} ${purchased.join(', ')}.`);
    y.support = r1(y.support); y.momentum = r1(y.momentum);
    y.funds = Math.max(0, Math.round(y.funds));
    return y;
  });
  // endorsements
  for (const x of active(nc)) {
    if (rand(seed + x.name + 'e') > (x.trait === 'media' ? 0.2 : 0.4)) continue;
    const g = groups.filter(gg => !endorsedBy(nc, gg.id) && leanFit(gg, x.party) >= 0).sort((a, b) => rand(seed + a.id) - rand(seed + b.id))[0];
    if (!g || rand(seed + x.name + g.id) < (groupRel(c, g.id) - 40) / 60) continue; // strong ties to the player can block a rival
    nc = head({ ...nc, endorsements: [...nc.endorsements, { group: g.id, candidate: x.name }] }, `${g.name} back ${x.name}`);
    stories.push(story(`${g.name} endorse ${x.name}`, `Boost for ${x.party} contender in ${nc.title} race`, `${x.name}, a ${x.bio.toLowerCase()}, won the backing of ${g.name}, who praised the pledge to "${x.policy.toLowerCase()}".`, 'groups'));
    lines.push(`${g.name} endorsed ${x.name}.`);
  }
  // attacks on a leading player
  const mine = lp[me] ?? 0;
  const neglected = nc.phase === 'general' ? crisisRecord(c).neglected : [];
  // Phase 5: rivals answer a frontrunner with negative ads and opposition research.
  const spots = weakSpots(c);
  const prior = nc.rivalPressure ?? { damage: 0, leaked: [], lastLeak: null };
  let pressure = { ...prior, damage: capDamage(prior.damage * RIVAL_DAMAGE_DECAY) };
  const challenger = [...active(nc)].sort((a, b) => (lp[b.name] ?? 0) - (lp[a.name] ?? 0))[0];
  const lead = challenger && latestPoll(nc) ? mine - (lp[challenger.name] ?? 0) : 0;
  if (challenger && lead > 0 && rand(seed + challenger.name + 'lead') < leadAttackChance(lead, spots.length)) {
    const x = challenger, target = spots[0], hit = attackAdDamage(lead);
    pressure = { ...pressure, damage: capDamage(pressure.damage + hit) };
    nc = head({ ...nc, attack: x.name, momentum: nc.momentum - 3 }, `${x.name} launches attack ads against ${me}`);
    stories.push(story(`${x.name} unloads negative ads on frontrunner ${me}`, target ? `Ads hammer ${target.label.toLowerCase()}` : `Trailing ${lp[x.name] ?? 0}% to ${mine}%`, `Down ${lead} points, ${x.name}'s campaign flooded the airwaves with attack ads ${target ? `over ${target.charge}` : `questioning whether ${me} is ready for ${nc.title}`}.`, 'opponent'));
    lines.push(`${x.name} ran attack ads against you${target ? ` over ${target.label.toLowerCase()}` : ''} (−${hit} score). Respond from Campaign HQ.`);
    const leak = spots.find(s => !pressure.leaked.includes(s.key));
    if (leak) {
      const dmg = leakDamage(leak);
      pressure = { damage: capDamage(pressure.damage + dmg), leaked: [...pressure.leaked, leak.key].slice(-12), lastLeak: { date: nc.lastProcessedEnd || c.date, rival: x.name, spot: leak.id, charge: leak.charge } };
      stories.push(story(`Opposition research: ${x.name}'s campaign leaks file on ${me}`, `Dossier details ${leak.label.toLowerCase()}`, `Reporters received an opposition-research file from ${x.name}'s team detailing ${leak.charge}. ${me}'s campaign called it a desperate smear.`, 'scandal'));
      lines.push(`${x.name} leaked opposition research on ${leak.label.toLowerCase()} (−${dmg} score).`);
    }
  }
  nc = { ...nc, rivalPressure: pressure };
  for (const x of active(nc)) {
    const doNothing = ineffectiveRecord(c);
    if (nc.attack || !neglected.length && !doNothing && mine < (lp[x.name] ?? 0) || rand(seed + x.name + 'atk') > (neglected.length || doNothing ? 0.55 : 0.4)) continue;
    nc = head({ ...nc, attack: x.name, momentum: nc.momentum - 3 }, `${x.name} launches attack ads against ${me}`);
    // Crisis-specific record stays in campaign/report state; no new crisis article in 5C.
    if (doNothing && !neglected.length) stories.push(story(`${x.name} slams ${me}'s do-nothing record`, 'Ads note zero bills passed', `${x.name} released ads pointing out that ${me} passed no legislation in their last legislative term.`, 'opponent'));
    else if (!neglected.length) stories.push(story(`${x.name} goes on the attack against ${me}`, 'Ads question experience and record', `Trailing in the latest simulated poll (${lp[x.name] ?? 0}% to ${mine}%), ${x.name} released ads questioning ${me}'s readiness for ${nc.title}.`, 'opponent'));
    lines.push(`${x.name} attacked you${neglected.length ? ` over ${neglected[0]}` : ''}. Respond from Campaign HQ.`);
  }
  return nc;
}

export function campaignTurn(c0: Career, start: string, end: string): { career: Career; lines: string[]; stories: Story[] } {
  let c = c0; const camp0 = c.campaign;
  const lines: string[] = [], stories: Story[] = [];
  if (!camp0) return { career: c, lines, stories };
  // A finance watermark survives trimmed/replaced polls and rejects overlapping retries.
  // Poll dates remain a compatibility backstop for careers saved before this marker existed.
  const processedEnd = camp0.lastProcessedEnd || latestPoll(camp0)?.date || camp0.startDate;
  if (monthsBetween(start, end) !== 3 || start < camp0.startDate || start < processedEnd || (latestPoll(camp0)?.date ?? '') >= end) return { career: c, lines, stories };
  const o = officeById(camp0.office), u = unit(o), me = c.character.name, seed = `${me}|${camp0.office}|${start}`;
  let camp: Campaign = { ...camp0, attack: null, lastProcessedEnd: end };
  const payroll = settleDirectorPayroll(camp, start, end);
  camp = payroll.campaign; lines.push(...payroll.lines);
  // small-dollar donations & group volunteers
  const potentialDonors = Math.max(0, Math.round((camp.volunteers / Math.sqrt(o.scale)) * 0.6 + c.reputation * 2 + c.contacts * 0.5 + camp.momentum * 4));
  const gift = Math.min(giftCap(o), 30 + 25 * Math.sqrt(o.scale));
  const small = Math.min(passiveCeiling(camp), Math.round(potentialDonors * gift * rr(seed + 'sd', 0.7, 1.2) * backingFundraising(c)));
  const donors = small > 0 ? Math.min(potentialDonors, Math.max(1, Math.round(small / gift))) : 0;
  if (small > 0) camp = receive(camp, `Small-dollar donations (${donors} donors)`, small, start, donors);
  // opponents act
  camp = opponentsAct(c, camp, seed, stories, lines);
  // allegations
  if (camp.allegation?.status === 'alleged') {
    const t = camp.allegation.target, isMe = t === me;
    const proven = isMe ? c.scandals.some(s => s.status === 'proven' && s.subject === me && s.date >= camp.startDate) : rand(seed + 'inv') < 0.3;
    camp = { ...camp, allegation: { ...camp.allegation, status: proven ? 'proven' : 'cleared' } };
    if (isMe) { camp = { ...camp, momentum: camp.momentum + (proven ? -r1(4 * communicationsSeverity(camp)) : 3) }; if (proven) c = { ...c, reputation: clamp(c.reputation - r1(4 * communicationsSeverity(camp))) }; }
    else camp = { ...camp, opponents: camp.opponents.map(x => x.name === t ? { ...x, momentum: x.momentum + (proven ? -4 : 2), support: x.support - (proven ? 5 : 0) } : x) };
    const allegationText = camp.allegation?.text ?? "";
    stories.push(story(proven ? `Investigation finds wrongdoing by ${t}` : `${t} cleared of ${allegationText}`, proven ? 'Findings confirm earlier allegations' : 'Review finds no evidence of wrongdoing', proven ? `An independent review concluded that allegations of ${allegationText} against ${t} were substantiated. ${t} faces fines and growing calls to withdraw.` : `Investigators found no evidence to support allegations of ${allegationText} against ${t}. The allegations had been unproven throughout.`, 'scandal'));
    lines.push(proven ? `Investigation: allegations against ${t} were proven.` : `Investigation: ${t} was cleared.`);
  } else if (!camp.allegation && camp.attack && !c.scandals.some(s => monthsBetween(s.date, end) < 6) && rand(seed + 'al') < 0.14) {
    const cands = field(c, camp), t = rand(seed + 'who') < 0.35 ? me : pick(seed + 'tw', cands.slice(1).map(x => x.name).concat(me));
    const text = pick(seed + 'txt', ['improper use of campaign funds', 'undisclosed business ties', 'misleading résumé claims', 'an unreported donation']);
    camp = { ...camp, allegation: { target: t, text, status: 'alleged', date: start } };
    if (t === me) camp = { ...camp, momentum: camp.momentum - 0.5 };
    stories.push(story(`Allegations of ${text} raised against ${t}`, 'Claims unproven; review under way', `A complaint accuses ${t} of ${text}. ${t} denies wrongdoing. The allegations have not been proven and an independent review is expected within months.`, 'scandal'));
    lines.push(`Allegation raised against ${t === me ? 'you' : t} (unproven).`);
  }
  camp = { ...camp, momentum: r1(camp.momentum * 0.6), turnActs: [] };
  const prev = latestPoll(camp);
  const poll = takePoll(c, camp, end);
  camp = { ...camp, polls: [...camp.polls, poll].slice(-6) };
  const myP = poll.shares[me] ?? 0, d = myP - (prev?.shares[me] ?? myP);
  const leader = Object.entries(poll.shares).filter(([k]) => k !== 'Undecided').sort((a, b) => b[1] - a[1])[0]!;
  lines.push(`Poll: ${me} ${myP}% (${d >= 0 ? '+' : ''}${d}) · funds ${usd(camp.funds)}.`);
  stories.push(story(leader[0] === me ? `${me} leads ${camp.title} race at ${myP}%` : `${leader[0]} leads; ${me} at ${myP}%`, `Simulated poll · ${d >= 0 ? 'up' : 'down'} ${Math.abs(d)} · ${poll.shares["Undecided"]}% undecided`, `The latest simulated survey of the ${camp.title} race: ${Object.entries(poll.shares).map(([k, v]) => `${k} ${v}%`).join(', ')}. ${me}'s campaign has raised ${usd(camp.raised)} and has ${usd(camp.funds)} on hand; rivals: ${active(camp).map(x => `${x.name} ${usd(x.raised)} raised`).join(', ')}.`, 'polls'));
  if (camp.raised > 0 && small > u * 3) stories.push(story(`${me} posts strong fundraising quarter`, `${usd(camp.raised)} raised so far`, `${me} reported ${usd(small)} in small-dollar gifts this quarter from ${donors} donors.`, 'finance'));
  c = { ...c, campaign: camp };
  // primary / ballot access
  const pd = camp.primaryDate;
  if (pd && pd >= start && pd < end) {
    if (camp.phase === 'primary') {
      const r = resolveRace(c, camp, 'primary', seed + 'prim');
      const won = r.winner === me;
      const result: ElectionResult = { office: camp.office, title: camp.title, jurisdiction: camp.jurisdiction, date: pd, stage: 'primary', won, rows: r.rows, ec: null, statesWon: [], raised: camp.raised, spent: camp.spent, effects: won ? ['Advances to the general election', '+3 reputation', '+5 experience'] : ['Campaign ends', '+5 experience', '−1 reputation'] };
      stories.push(story(won ? `${me} wins ${camp.party} primary for ${camp.title}` : `${r.winner} defeats ${me} in ${camp.party} primary`, `${r.rows[0]!.pct}% of the primary vote`, `Primary results: ${r.rows.map(x => `${x.name} ${x.pct}% (${x.votes.toLocaleString('en-US')} votes)`).join(', ')}.`, 'election'));
      lines.push(won ? `You won the ${camp.party} primary with ${r.rows.find(x => x.name === me)!.pct}%!` : `You lost the primary to ${r.winner}.`);
      c = { ...c, elections: [result, ...c.elections], reputation: clamp(c.reputation + (won ? 3 : -1)), experience: r1(c.experience + 5) };
      if (won) { camp = { ...camp, phase: 'general', support: generalBaselineSupport(c, camp), opponents: camp.opponents.map(x => x.primary ? { ...x, out: true } : x), momentum: camp.momentum + 3 }; camp = { ...camp, polls: [...camp.polls, takePoll(c, camp, end)].slice(-6) }; c = { ...c, campaign: camp }; }
      else return { career: { ...c, campaign: null, warChest: Math.max(0, camp.funds) }, lines, stories };
    } else if (camp.party === 'Independent' || !o.partisan) {
      const need = ballotSignatures(o);
      if (camp.volunteers < need) {
        lines.push(`Ballot access failed: needed ${need} volunteers to gather signatures.`);
        stories.push(story(`${me} fails to qualify for ${camp.title} ballot`, 'Too few petition signatures', `${me}'s independent bid ended after the campaign fell short of the signatures required for ballot access.`, 'election'));
        const result: ElectionResult = { office: camp.office, title: camp.title, jurisdiction: camp.jurisdiction, date: pd, stage: 'ballot', won: false, rows: [], ec: null, statesWon: [], raised: camp.raised, spent: camp.spent, effects: ['Not on the ballot', '−1 reputation'] };
        return { career: { ...c, campaign: null, warChest: Math.max(0, camp.funds), reputation: clamp(c.reputation - 1), elections: [result, ...c.elections] }, lines, stories };
      }
      lines.push('Your petition qualified you for the ballot.');
    }
  }
  // general election
  if (camp.electionDate >= start && camp.electionDate < end) {
    const r = resolveRace(c, camp, 'general', seed + 'gen');
    const won = r.winner === me, mine = r.rows.find(x => x.name === me)!;
    const margin = r1(mine.pct - (won ? r.rows[1]?.pct ?? 0 : r.rows[0]!.pct));
    const effects = won ? [`Elected ${camp.title}`, '+6 reputation', '+20 experience', '+2 contacts', 'Government section unlocked'] : [Math.abs(margin) < 5 ? 'Narrow loss: −1 reputation' : '−3 reputation', '+10 experience', c.office ? 'Incumbent serves only until the existing term ends; personal savings preserved' : 'Unemployed — apply via More → Jobs'];
    const result: ElectionResult = { crisisRecord: crisisRecord(c, end), office: camp.office, title: camp.title, jurisdiction: camp.jurisdiction, date: camp.electionDate, stage: 'general', won, rows: r.rows, ec: r.ec, statesWon: r.statesWon, ...(r.stateCalls.length ? { stateCalls: r.stateCalls } : {}), raised: camp.raised, spent: camp.spent, effects };
    const ecTxt = r.ec ? ` Electoral College: ${r.ec.map(x => `${x.name} ${x.ev}`).join(', ')}.` : '';
    stories.push(story(won ? `${me} elected ${camp.title}` : `${r.winner} defeats ${me} for ${camp.title}`, `${mine.pct}% for ${me} · polls had ${mine.poll}%`, `Final results in ${camp.jurisdiction}: ${r.rows.map(x => `${x.name} (${x.party}) ${x.votes.toLocaleString('en-US')} votes, ${x.pct}%`).join('; ')}.${ecTxt} ${me}'s campaign raised ${usd(camp.raised)} and spent ${usd(camp.spent)}.`, 'election'));
    lines.push(won ? `ELECTION: You won ${camp.title} with ${mine.pct}%!` : `ELECTION: You lost to ${r.winner} (${mine.pct}%).`);
    c = { ...c, campaign: null, warChest: Math.max(0, camp.funds), elections: [result, ...c.elections], experience: r1(c.experience + (won ? 20 : 10)), reputation: clamp(c.reputation + (won ? 6 : Math.abs(margin) < 5 ? -1 : -3)), contacts: r1(c.contacts + (won ? 2 : 0)) };
    if (won) {
      c = captureLegacy(c);
      c = archiveTerm(c, end, c.office?.id === camp.office ? 're-elected' : 'changed office');
      const g = { ...c.groups }; camp.endorsements.filter(e => e.candidate === me).forEach(e => { g[e.group] = clamp(groupRel(c, e.group) + 5); });
      c = { ...c, city: null, stateGovernment: null, federalGovernment: null, budget: null, approval: null, bills: c.bills.map(b => !['passed', 'rejected'].includes(b.stage) ? { ...b, stage: 'rejected', history: [...b.history, { date: end, text: 'Withdrawn: moved to a new office.' }] } : b), groups: g, publicOffice: true, office: { id: camp.office, title: camp.title, jurisdiction: camp.jurisdiction, since: end, party: camp.party, elected: camp.electionDate, termEnd: termEndDate(end, camp.office as OfficeId), margin: Math.abs(margin) } };
      if (c.office) c = { ...c, termHistory: [...c.termHistory, { office: c.office, ended: null, reason: null, government: null }] };
      stories.push({ h: `${me} takes office as ${camp.title} · ${monthLabel(end)}`, sub: camp.jurisdiction, body: `A new elected term starts ${monthLabel(end)} and ends ${monthLabel(c.office?.termEnd ?? end)}. Office salary is separate from campaign funds.`, tag: 'government', subject: me });
    }
    return { career: c, lines, stories };
  }
  return { career: c, lines, stories };
}

// ---------- Newspaper ----------
export const paperName = (c: Career) => `The ${c.character.state} Courier`;
function worldStories(c: Career, start: string): Story[] {
  const st = c.character.state, s = `${st}|${start}`, gov = figure(st + 'gov'), sen = figure(st + 'sen'), pres = figure('potus' + start.slice(0, 4)), mayor = figure(st + 'mayor');
  const city = homeCity(c), pct = Math.round(rr(s + 'ap', 38, 56)), jobsN = Math.round(rr(s + 'jb', 40, 260));
  const pool: Story[] = [
    story(`Governor ${gov} signs state budget`, `Spending plan passes ${c.character.state} legislature`, `Governor ${gov} signed a budget that boosts road repairs and school funding, after weeks of negotiation with legislators.`, 'world'),
    story(`President ${pres}'s approval at ${pct}%`, 'Simulated national survey', `A simulated national survey puts President ${pres}'s approval at ${pct}%, with voters most concerned about prices and jobs.`, 'world'),
    story(`Sen. ${sen} breaks with party on spending bill`, 'Vote angers colleagues', `U.S. Senator ${sen} of ${st} voted against party leadership on a major spending bill, calling it "bad for ${st} families".`, 'world'),
    story(`Allegations against Mayor ${mayor} of ${city}`, 'Mayor denies claims; no charges filed', `A watchdog group alleges Mayor ${mayor} steered contracts to a donor. The mayor denies the claim and no wrongdoing has been proven.`, 'scandal'),
    story(`${city} factory adds ${jobsN} jobs`, 'Local economy shows strength', `A manufacturer announced ${jobsN} new jobs in ${city}, a boost local officials credited to recent tax incentives.`, 'world'),
    story(`Storm damage strains ${st} towns`, 'Officials request federal aid', `Severe storms caused flooding across ${st}. Governor ${gov} requested federal disaster assistance.`, 'world'),
    story(`Congress deadlocked over budget`, 'Shutdown fears grow in Washington', `Negotiations in Congress stalled again as leaders traded blame. Analysts warn of a possible shutdown.`, 'world'),
    story(`${city} council debates housing plan`, 'Residents pack City Hall', `Hundreds attended a hearing on a plan to build more affordable housing in ${city}. A vote is expected next quarter.`, 'world'),
  ];
  return [...pool].sort((a, b) => rand(s + a.h) - rand(s + b.h)).slice(0, 3);
}
function playerStories(c: Career, before: Career): Story[] {
  const out: Story[] = [], n = c.character.name;
  if (!c.campaign && c.reputation >= 10 && c.reputation - before.reputation >= 1) out.push(story(`${n} raises profile in ${homeCity(c)} politics`, `${c.character.party === 'Independent' ? 'Independent' : c.character.party} activist gains notice`, `${n}, ${c.age}, has become a familiar face at local political events, with growing standing among ${c.character.party === 'Independent' ? 'community groups' : `${c.character.party} activists`}.`, 'player'));
  return out;
}
const priority: Record<string, number> = { government: 2, election: 1, campaign: 2, groups: 3, finance: 3, scandal: 4, opponent: 4, polls: 5, player: 5, party: 5, world: 6 };
function turnDeltaStories(c: Career, before: Career): Story[] {
  const camp = c.campaign, previous = before.campaign, me = c.character.name;
  const out: Story[] = [];
  for (const result of c.elections.filter(e => !before.elections.some(old => old.date === e.date && old.office === e.office && old.stage === e.stage))) {
    const electoralWinner = result.ec ? [...result.ec].sort((a, b) => b.ev - a.ev)[0]?.name : undefined;
    const winner = electoralWinner ? result.rows.find(r => r.name === electoralWinner) : [...result.rows].sort((a, b) => b.votes - a.votes)[0];
    const headline = result.stage === 'ballot' ? `${me} falls short of ballot access` : result.won ? `${me} wins ${result.stage === 'primary' ? 'primary for ' : ''}${result.title}` : `${winner?.name ?? 'Rival'} defeats ${me} in ${result.title} race`;
    out.push({ ...story(headline, `${result.jurisdiction} · ${result.stage === 'primary' ? 'Primary results' : 'Election results'}`, `Results recorded on ${monthLabel(result.date)}: ${result.rows.map(r => `${r.name} (${r.party}), ${r.votes.toLocaleString('en-US')} votes (${r.pct}%)`).join('; ') || 'The campaign did not qualify for the ballot'}. ${result.ec ? `Electoral College: ${result.ec.map(r => `${r.name}, ${r.ev} electoral votes`).join('; ')}. ` : ''}${me}'s campaign raised ${usd(result.raised)} and spent ${usd(result.spent)}. ${result.effects.join('. ')}.`, 'election'), subject: result.won || result.stage === 'ballot' ? me : winner?.name, priority: 1 });
  }
  if (rank[c.position] > rank[before.position]) out.push({ ...story(`${me} named ${positionNames[c.position].toLowerCase()}`, `${c.character.party} promotion recognised`, `${me} was elevated to ${positionNames[c.position].toLowerCase()} in the ${c.character.party}, a step party watchers say signals rising influence.`, 'party'), subject: me, priority: 2 });
  if (camp && previous?.office === camp.office) {
    const current = latestPoll(camp), prior = latestPoll(previous);
    const change = (current?.shares[me] ?? 0) - (prior?.shares[me] ?? 0);
    const passed = camp.opponents.find(o => !o.out && (prior?.shares[o.name] ?? 0) >= (prior?.shares[me] ?? 0) && (current?.shares[me] ?? 0) > (current?.shares[o.name] ?? 0));
    if (current && prior && (Math.abs(change) >= 5 || passed)) out.push({ ...story(passed ? `${me} overtakes ${passed.name} in new poll` : `${me}'s support ${change >= 0 ? 'surges' : 'falls'} ${r1(Math.abs(change))} points`, `${camp.title} · ${current.shares[me]}% support in simulated survey`, `The latest simulated poll places ${me} at ${current.shares[me]}%, compared with ${prior.shares[me]}% last quarter. ${Object.entries(current.shares).map(([name, share]) => `${name}: ${share}%`).join('; ')}. These game estimates are not election results; undecided voters and the final vote can change the outcome.`, 'polls'), subject: me, priority: 2 });
  }
  return out;
}
function attachSubject(s: Story, c: Career, before: Career): Story {
  const people = [{ name: c.character.name, portrait: c.character.portrait, role: c.campaign ? `Candidate for ${c.campaign.title}` : c.office?.title ?? `${c.character.party} political participant` }, ...(c.campaign?.opponents ?? before.campaign?.opponents ?? []).map(o => ({ name: o.name, portrait: o.portrait, role: o.bio }))];
  const person = people.find(p => p.name === s.subject) ?? people.filter(p => s.h.includes(p.name)).sort((a, b) => s.h.indexOf(a.name) - s.h.indexOf(b.name))[0];
  return person ? { ...s, subject: person.name, portrait: person.portrait, caption: `${person.name} · ${person.role}. File portrait.` } : s;
}
/** Tags that make a turn newsworthy on their own: genuine player events, not routine time passage. */
const NEWSWORTHY = new Set(['election', 'campaign', 'groups', 'scandal', 'party', 'player', 'government']);
export function publishEdition(c: Career, before: Career, start: string, published: string, extra: Story[]): Career {
  if (c.news.some(e => e.id === start || e.date === published)) return c;
  const historic = new Set([...c.printedHeadlines, ...c.news.flatMap(e => e.stories.map(s => s.h))]);
  const delta = turnDeltaStories(c, before).filter(s => !historic.has(s.h));
  const freshQueue = c.newsQueue.filter(s => !historic.has(s.h));
  const freshExtra = extra.filter(s => !historic.has(s.h));
  const player = playerStories(c, before).filter(s => !historic.has(s.h));
  // Publish only when a reportable player event occurred: election result, campaign launch,
  // poll swing ≥5% or overtake (delta), endorsement, party promotion, or scandal outcome.
  const newsworthy = [...delta, ...freshQueue, ...freshExtra, ...player].some(s => NEWSWORTHY.has(s.tag));
  if (!newsworthy) return { ...c, newsQueue: [] };
  const seen = new Set<string>();
  const candidates = [...delta, ...freshQueue, ...freshExtra, ...player]
    .filter(s => { if (seen.has(s.h) || (delta.some(d => d.tag === s.tag) && !delta.includes(s) && (s.tag === 'election' || s.tag === 'polls'))) return false; seen.add(s.h); return true; })
    .sort((a, b) => (a.priority ?? priority[a.tag] ?? 6) - (b.priority ?? priority[b.tag] ?? 6));
  const stories = candidates.slice(0, 4);
  stories.push(...candidates.filter(s => ['government', 'scandal'].includes(s.tag) && !stories.includes(s)));
  stories.push(...worldStories(c, start).filter(s => !historic.has(s.h)).slice(0, Math.max(0, 4 - stories.length)));
  return { ...c, newsQueue: [], printedHeadlines: [...new Set([...historic, ...stories.map(s => s.h)])], news: [{ id: start, date: published, paper: paperName(c), stories: stories.map(s => attachSubject(s, c, before)) }, ...c.news].slice(0, 12) };
}
/** Resign the held public office: clears the office, locks Government again, costs reputation, and makes news. */
export function resignOffice(c: Career): Res {
  if (!c.office) return { ok: false, message: 'You hold no public office.' };
  const o = c.office;
  let n: Career = { ...archiveTerm(c, c.date, 'resigned'), city: null, stateGovernment: null, federalGovernment: null, budget: null, approval: null, bills: c.bills.map(b => !['passed', 'rejected'].includes(b.stage) ? { ...b, stage: 'rejected', history: [...b.history, { date: c.date, text: 'Withdrawn: resigned from office.' }] } : b), office: null, publicOffice: false, reputation: clamp(c.reputation - 2) };
  n = queue(n, story(`${c.character.name} resigns as ${o.title}`, `Leaves ${o.jurisdiction} post before the term ends`, `${c.character.name} resigned as ${o.title} of ${o.jurisdiction}, giving up the seat won in ${monthLabel(o.elected || o.since)}. A successor process will follow under local rules.`, 'player'));
  const msg = `You resigned as ${o.title} of ${o.jurisdiction}. Government access is locked until you hold office again.`;
  return { ok: true, career: log(n, msg), message: msg };
}
export const latestHeadlines = (c: Career, n = 2) => c.news[0]?.stories.slice(0, n) ?? [];
export const ACTIONS = ACTIONS_PER_MONTH;

/** Spend political capital (reputation) to lock in an endorsement from a group at 40+ favorability. */
export function endorseWithCapital(c: Career, id: string): Res {
  const g = groups.find(x => x.id === id), camp = c.campaign, name = c.character.name;
  if (!g) return { ok: false, message: 'Unknown group.' };
  if (!camp) return { ok: false, message: 'Endorsements require an active campaign.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  const taken = endorsedBy(camp, id);
  if (taken) return { ok: false, message: `${g.name} already endorsed ${taken === name ? 'you' : taken}.` };
  if (groupRel(c, id) < 40) return { ok: false, message: `${g.name} needs at least 40 favorability before a deal.` };
  if (c.reputation < ENDORSE_CAPITAL) return { ok: false, message: `You need ${ENDORSE_CAPITAL} reputation to spend as political capital.` };
  const nc = head({ ...camp, turnActs: [...camp.turnActs, `Deal with ${g.name}`], endorsements: [...camp.endorsements, { group: id, candidate: name }], volunteers: camp.volunteers + Math.round(g.influence * 5 * Math.sqrt(officeById(camp.office).scale)), momentum: camp.momentum + g.influence }, `${g.name} endorse ${name}`);
  let n: Career = { ...c, actions: c.actions - ACTION_COST, reputation: r1(c.reputation - ENDORSE_CAPITAL), campaign: nc };
  n = queue(n, story(`${g.name} endorse ${name} after private talks`, `Political capital spent to secure backing`, `${g.name} endorsed ${name} for ${camp.title} following closed-door negotiations.`, 'groups'));
  const msg = `${g.name} endorsed you (−${ENDORSE_CAPITAL} reputation spent as political capital).`;
  return { ok: true, career: log(n, msg), message: msg };
}
