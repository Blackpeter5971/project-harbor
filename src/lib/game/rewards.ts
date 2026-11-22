import type { z } from 'zod';
import { missionSchema, rewardsSchema } from './rewards-schema';
import type { Career } from './career';
import { achievements } from './achievements';
import { netWorthBreakdown } from './banking';
import { latestPoll } from './campaign';
import { grandCorruption } from './court';
import { MAX_ENERGY } from './energy-costs';

/**
 * Rewards: achievement bounties, biennial missions and vital coin decisions.
 * Pure. Coin amounts are returned so the caller credits/debits the device wallet;
 * claims are recorded on the career so nothing can be claimed twice.
 */
export type Mission = z.infer<typeof missionSchema>;
export type Rewards = z.infer<typeof rewardsSchema>;
export type RewardResult = { ok: true; career: Career; coins: number; message: string } | { ok: false; message: string };

export const rewardsOf = (c: Career): Rewards => rewardsSchema.parse(c.rewards ?? {});
const withRewards = (c: Career, r: Rewards): Career => ({ ...c, rewards: r });
const credit = (c: Career, label: string, amount: number): Career => amount ? ({ ...c, money: c.money + amount, ledger: [{ month: c.date, label, amount }, ...c.ledger] }) : c;
const fmt = (n: number) => `$${n.toLocaleString('en-US')}`;

/* ---------- Achievement bounties ---------- */
const TIER: Record<string, 1 | 2 | 3 | 4> = {
  'first-office': 1, homeowner: 1, podcaster: 1, married: 1, entrepreneur: 1, house: 2,
  legislator: 2, mayor: 2, silver: 2, survivor: 2, popular: 2, 'two-terms': 2, reputation: 2, connected: 2, millionaire: 2, influencer: 2, 'triple-win': 2, landslide: 2, veteran: 2,
  governor: 3, senate: 3, 'ten-million': 3, mogul: 3, crisis: 3, gold: 3, viral: 3,
  president: 4, billionaire: 4, 'lawmaker-20': 4, diamond: 4,
};
export const ACHIEVEMENT_BOUNTY = { 1: { coins: 10, cash: 5_000 }, 2: { coins: 25, cash: 25_000 }, 3: { coins: 50, cash: 100_000 }, 4: { coins: 100, cash: 500_000 } } as const;
export const bountyFor = (id: string) => ACHIEVEMENT_BOUNTY[TIER[id] ?? 1];

export function claimAchievement(c: Career, id: string): RewardResult {
  const a = achievements(c).find(x => x.id === id);
  if (!a) return { ok: false, message: 'Unknown achievement.' };
  if (!a.unlocked) return { ok: false, message: 'Achievement not unlocked yet.' };
  const r = rewardsOf(c);
  if (r.claimed.includes(id)) return { ok: false, message: 'Reward already claimed.' };
  const b = bountyFor(id);
  const n = credit(c, `Achievement reward · ${a.title}`, b.cash);
  return { ok: true, coins: b.coins, career: withRewards(n, { ...r, claimed: [...r.claimed, id] }), message: `${a.title}: +${b.coins} coins and ${fmt(b.cash)}.` };
}

/* ---------- Random, progression-matched missions ---------- */
export const MISSION_START_YEAR = 2026;
/** Mission window = one in-game year. A mission may or may not arrive each year. */
export const missionCycle = (c: Career) => Number(c.date.slice(0, 4)) - MISSION_START_YEAR;
/** Years a mission stays open once offered/accepted. */
export const MISSION_DURATION = 2;
/** Chance (out of 100) that a new mission arrives in a given year. */
export const MISSION_CHANCE = 45;

export function metricValue(c: Career, m: Mission['metric']): number {
  switch (m) {
    case 'reputation': return c.reputation;
    case 'relationships': return c.relationships;
    case 'experience': return c.experience;
    case 'money': return Math.round(netWorthBreakdown(c).total);
    case 'followers': return c.socialMedia?.followers ?? 0;
    case 'laws': return c.bills.filter(b => b.stage === 'passed').length;
    case 'wins': return c.elections.filter(e => e.won && e.stage !== 'primary').length;
  }
}

/** Progression stage 0 (civilian) … 3 (statewide/federal executive). */
export function progressionStage(c: Career): 0 | 1 | 2 | 3 {
  const id = c.office?.id;
  if (id === 'president' || id === 'governor' || id === 'senate') return 3;
  if (id === 'house' || id === 'mayor' || id === 'state') return 2;
  if (c.office || c.elections.length || c.reputation >= 40) return 1;
  return 0;
}

/** What the player is doing right now — missions are filtered by this. */
export type MissionSituation = 'citizen' | 'organizer' | 'campaigning' | 'official';
export function missionSituation(c: Career): MissionSituation {
  if (c.office) return 'official';
  if (c.campaign) return 'campaigning';
  if (c.position !== 'none' || c.elections.length || c.reputation >= 25) return 'organizer';
  return 'citizen';
}

type Template = { metric: Mission['metric']; title: string; detail: (t: number) => string; delta: (c: Career) => number; attr: NonNullable<Mission['attribute']>['key']; when: MissionSituation[] };
const TEMPLATES: Template[] = [
  // Citizen
  { metric: 'money', title: 'Seed Money', detail: t => `Grow your savings by ${fmt(t)}.`, delta: () => 1, attr: 'experience', when: ['citizen'] },
  { metric: 'reputation', title: 'Community Footprint', detail: t => `Gain ${t} reputation in your community.`, delta: () => 1, attr: 'communication', when: ['citizen'] },
  { metric: 'relationships', title: 'Neighbourhood Ties', detail: t => `Gain ${t} relationships by meeting people.`, delta: () => 1, attr: 'reputation', when: ['citizen', 'organizer'] },
  { metric: 'experience', title: 'Learn the Ropes', detail: t => `Gain ${t} experience.`, delta: () => 1, attr: 'knowledge', when: ['citizen', 'organizer'] },
  // Organizer
  { metric: 'reputation', title: 'Party Standing', detail: t => `Gain ${t} reputation inside the party.`, delta: () => 1, attr: 'communication', when: ['organizer'] },
  { metric: 'relationships', title: 'Network Building', detail: t => `Gain ${t} relationships with local figures.`, delta: () => 1, attr: 'leadership', when: ['organizer'] },
  { metric: 'followers', title: 'Grow Your Audience', detail: t => `Gain ${t.toLocaleString('en-US')} followers on S.`, delta: c => Math.max(1, (c.socialMedia?.followers ?? 0) / 2_000), attr: 'reputation', when: ['organizer', 'campaigning', 'official'] },
  // Campaigning
  { metric: 'reputation', title: 'Voter Outreach', detail: t => `Gain ${t} reputation on the trail.`, delta: () => 1, attr: 'communication', when: ['campaigning'] },
  { metric: 'money', title: 'Campaign War Chest', detail: t => `Increase your net worth by ${fmt(t)}.`, delta: c => Math.max(1, Math.abs(netWorthBreakdown(c).total) / 20_000), attr: 'relationships', when: ['campaigning'] },
  { metric: 'wins', title: 'Win at the Ballot Box', detail: t => `Win ${t} general election${t > 1 ? 's' : ''}.`, delta: () => 1, attr: 'leadership', when: ['campaigning'] },
  // Elected official
  { metric: 'experience', title: 'Master the Brief', detail: t => `Gain ${t} experience studying policy.`, delta: () => 1, attr: 'knowledge', when: ['official'] },
  { metric: 'laws', title: 'Legislative Push', detail: t => `Pass ${t} more law${t > 1 ? 's' : ''} or measures.`, delta: () => 1, attr: 'leadership', when: ['official'] },
  { metric: 'relationships', title: 'Executive Initiative', detail: t => `Gain ${t} relationships leading coalitions.`, delta: () => 1, attr: 'leadership', when: ['official'] },
  { metric: 'reputation', title: 'Public Approval', detail: t => `Gain ${t} reputation while in office.`, delta: () => 1, attr: 'communication', when: ['official'] },
];
const BASE_TARGET: Record<Mission['metric'], number> = { reputation: 10, relationships: 10, experience: 10, money: 20_000, followers: 2_000, laws: 1, wins: 1 };
const CITIZEN_TARGET: Partial<Record<Mission['metric'], number>> = { reputation: 5, relationships: 5, experience: 5, money: 2_500 };
const DIFFICULTY: { id: Mission['difficulty']; mult: number; coins: number; cash: number; attr: number }[] = [
  { id: 'routine', mult: 1, coins: 5, cash: 2_500, attr: 5 },
  { id: 'challenging', mult: 2, coins: 25, cash: 25_000, attr: 10 },
  { id: 'high-stakes', mult: 3, coins: 60, cash: 100_000, attr: 20 },
  { id: 'historic', mult: 5, coins: 100, cash: 500_000, attr: 30 },
];
const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

/** Active mission still inside its window. */
export function activeMission(c: Career): Mission | null {
  const m = rewardsOf(c).mission, cycle = missionCycle(c);
  return m && m.status === 'active' && cycle >= m.cycle && cycle - m.cycle < MISSION_DURATION ? m : null;
}
export const missionExpiryYear = (m: Mission) => MISSION_START_YEAR + m.cycle + MISSION_DURATION;

/** The mission on offer this year, or null. Arrival is random (seeded, so it never rerolls) and matches the player's situation. */
export function missionOffer(c: Career): Mission | null {
  const r = rewardsOf(c), cycle = missionCycle(c);
  if (activeMission(c)) return null;
  if (r.declinedCycles.includes(cycle)) return null;
  if (r.mission && r.mission.cycle === cycle) return null;
  const seed = hash(`${c.character.name}|${cycle}`);
  if (seed % 100 >= MISSION_CHANCE) return null;
  const situation = missionSituation(c), stage = progressionStage(c);
  const pool = TEMPLATES.filter(t => t.when.includes(situation) && (t.metric !== 'laws' || !!c.office) && (t.metric !== 'followers' || (c.socialMedia?.followers ?? 0) > 0));
  if (!pool.length) return null;
  const t = pool[(seed >>> 7) % pool.length]!;
  const d = DIFFICULTY[situation === 'citizen' ? 0 : Math.min(3, stage + ((seed >>> 12) % 3 === 0 ? 1 : 0))]!;
  const base = situation === 'citizen' ? (CITIZEN_TARGET[t.metric] ?? BASE_TARGET[t.metric]) : BASE_TARGET[t.metric];
  const scale = t.metric === 'money' || t.metric === 'followers' ? Math.max(1, t.delta(c) / (base / (t.metric === 'money' ? 20_000 : 2_000))) : 1;
  const target = Math.max(1, Math.round(base * d.mult * scale));
  return { id: `m${cycle}-${t.metric}-${t.title.length}`, cycle, title: t.title, detail: t.detail(target), metric: t.metric, baseline: metricValue(c, t.metric), target, difficulty: d.id, coins: d.coins, cash: d.cash, attribute: { key: t.attr, amount: d.attr }, status: 'active' };
}
export const missionProgress = (c: Career, m: Mission) => Math.max(0, Math.min(m.target, metricValue(c, m.metric) - m.baseline));

export function acceptMission(c: Career): RewardResult {
  const o = missionOffer(c);
  if (!o) return { ok: false, message: 'No mission is on offer right now.' };
  return { ok: true, coins: 0, career: withRewards(c, { ...rewardsOf(c), mission: o }), message: `Mission accepted: ${o.title}.` };
}
export function declineMission(c: Career): RewardResult {
  const r = rewardsOf(c), cycle = missionCycle(c);
  if (!missionOffer(c)) return { ok: false, message: 'No mission is on offer right now.' };
  return { ok: true, coins: 0, career: withRewards(c, { ...r, declinedCycles: [...r.declinedCycles, cycle].slice(-20) }), message: 'Mission passed. Another may come along later.' };
}
export function claimMission(c: Career): RewardResult {
  const m = activeMission(c);
  if (!m) return { ok: false, message: 'No active mission.' };
  if (missionProgress(c, m) < m.target) return { ok: false, message: 'Mission not complete yet.' };
  const r = rewardsOf(c);
  let n = credit(c, `Mission reward · ${m.title}`, m.cash);
  if (m.attribute) {
    const k = m.attribute.key, amt = m.attribute.amount;
    n = k === 'leadership' || k === 'communication' || k === 'knowledge' ? { ...n, skills: { ...n.skills, [k]: n.skills[k] + amt } } : { ...n, [k]: n[k] + amt };
  }
  return { ok: true, coins: m.coins, career: withRewards(n, { ...r, mission: { ...m, status: 'completed' }, completedMissions: [...r.completedMissions, m.id] }), message: `Mission complete: +${m.coins} coins, ${fmt(m.cash)}${m.attribute ? `, +${m.attribute.amount} ${m.attribute.key}` : ''}.` };
}

/* ---------- Vital coin decisions ---------- */
export const COIN_DECISIONS = [
  { id: 'bailout', name: 'Emergency Debt Restructuring', coins: 30, category: 'Crisis', summary: 'Clears negative cash to $0 without selling anything.' },
  { id: 'crisis-firm', name: 'Elite Crisis PR Firm', coins: 35, category: 'Crisis', summary: 'During an open scandal: +10 reputation and +5 approval in office.' },
  { id: 'power-broker', name: 'Call in Favors', coins: 20, category: 'Growth', summary: '+15 relationships with party insiders.' },
  { id: 'legal-defense', name: 'Emergency Legal Defense', coins: 50, category: 'Legal', summary: 'A premier defense team gets your open case dismissed before trial.' },
  { id: 'election-recount', name: 'Emergency Election Recount', coins: 40, category: 'Campaign', summary: 'Expedited recount and voter-protection injunction: +5 support and +15 momentum.' },
  { id: 'oppo-leak', name: 'Opposition Research Dossier', coins: 35, category: 'Campaign', summary: 'Leak kompromat on the leading rival: −6 to their support, +3 momentum for you.' },
  { id: 'executive-coaching', name: 'Executive Blitz Coaching', coins: 25, category: 'Growth', summary: '+15 Leadership, +15 Communication, +15 Knowledge and +10 experience.' },
  { id: 'vitality-injection', name: 'Adrenaline & Vitality Injection', coins: 15, category: 'Vitality', summary: 'Refills energy to 100% and cuts stress by 25.' },
] as const;
export type CoinDecisionId = typeof COIN_DECISIONS[number]['id'];

const openCase = (c: Career) => c.legal?.cases.find(k => !k.closed) ?? null;
/** Player's poll share minus the best rival's (latest poll); null when there is no poll or rival. */
export function pollMargin(c: Career): number | null {
  const camp = c.campaign; if (!camp) return null;
  const shares = latestPoll(camp)?.shares ?? {}, me = shares[c.character.name] ?? 0;
  const rivals = activeRivals(c); if (!rivals.length) return null;
  return me - Math.max(...rivals.map(r => shares[r.name] ?? 0));
}
const activeRivals = (c: Career) => (c.campaign?.opponents ?? []).filter(o => !o.out && (c.campaign!.phase === 'primary' ? o.primary : !o.primary));

export function coinDecisionAvailable(c: Career, id: CoinDecisionId): string | null {
  if (id === 'bailout') return c.money < 0 ? null : 'Only when your cash is negative.';
  if (id === 'crisis-firm') return c.scandals.some(s => s.status === 'alleged' && s.subject === c.character.name) ? null : 'Only during an open scandal about you.';
  if (id === 'legal-defense') {
    if (!openCase(c)) return 'Only when under legal investigation.';
    if (c.legal?.prison) return 'Not available once you are in custody.';
    if (grandCorruption(c, c.legal?.adjudicated ?? '')) return 'No defense team can bury a documented theft of public funds.';
    return null;
  }
  if (id === 'election-recount') {
    if (!c.campaign) return 'Requires an active campaign.';
    const m = pollMargin(c);
    return m === null ? 'Needs a poll against a rival first.' : m <= 5 ? null : 'Only when trailing or within 5 points.';
  }
  if (id === 'oppo-leak') return c.campaign && activeRivals(c).length ? null : 'Requires an active campaign with rivals.';
  if (id === 'vitality-injection') return c.actions < MAX_ENERGY ? null : 'Your energy is already full.';
  return null;
}
/** coins = negative amount to debit from the wallet. */
export function useCoinDecision(c: Career, id: CoinDecisionId, walletCoins: number): RewardResult {
  const d = COIN_DECISIONS.find(x => x.id === id);
  if (!d) return { ok: false, message: 'Unknown decision.' };
  const block = coinDecisionAvailable(c, id);
  if (block) return { ok: false, message: block };
  if (walletCoins < d.coins) return { ok: false, message: `Needs ${d.coins} coins.` };
  let n = c;
  if (id === 'bailout') n = credit(c, 'Emergency debt restructuring', -c.money);
  if (id === 'crisis-firm') n = { ...c, reputation: c.reputation + 10, approval: c.approval ? { ...c.approval, overall: Math.min(100, c.approval.overall + 5) } : c.approval };
  if (id === 'power-broker') n = { ...c, relationships: c.relationships + 15 };
  if (id === 'legal-defense') {
    const L = c.legal!;
    n = { ...c, legal: { ...L, adjudicated: c.date > L.adjudicated ? c.date : L.adjudicated, cases: L.cases.map(k => k.closed ? k : { ...k, stage: 'dismissed' as const, closed: c.date, trial: null, history: [{ date: c.date, text: 'Premier defense team won a dismissal before trial.' }, ...k.history].slice(0, 20) }) },
      corruption: c.corruption ? { ...c.corruption, exposure: Math.max(0, c.corruption.exposure - 30) } : c.corruption };
  }
  if (id === 'election-recount') n = { ...c, campaign: { ...c.campaign!, support: c.campaign!.support + 5, momentum: c.campaign!.momentum + 15 } };
  if (id === 'oppo-leak') {
    const camp = c.campaign!, shares = latestPoll(camp)?.shares ?? {};
    const lead = [...activeRivals(c)].sort((a, b) => (shares[b.name] ?? b.support) - (shares[a.name] ?? a.support))[0]!;
    n = { ...c, campaign: { ...camp, momentum: camp.momentum + 3, opponents: camp.opponents.map(o => o.name === lead.name ? { ...o, support: o.support - 6 } : o) } };
  }
  if (id === 'executive-coaching') n = { ...c, experience: c.experience + 10, skills: { ...c.skills, leadership: c.skills.leadership + 15, communication: c.skills.communication + 15, knowledge: c.skills.knowledge + 15 } };
  if (id === 'vitality-injection') n = { ...c, actions: MAX_ENERGY, life: c.life ? { ...c.life, stress: Math.max(0, c.life.stress - 25) } : c.life };
  return { ok: true, coins: -d.coins, career: n, message: `${d.name}: done (−${d.coins} coins).` };
}
