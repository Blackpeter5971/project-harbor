import { ACTION_COST } from './energy-costs';
import type { Career, Party } from './career';
import { rand, usd } from './campaign';
import { shiftApproval } from './approval';
import type { Result } from './support';
import { networkSchema, type FigureState, type Network, type NetworkNote, type NetworkOffer } from './network-schema';

/* Phase 4 — Political Network. Pure, browser-safe. Thirty fictional figures with a static
   profile (catalog) and an evolving saved state (career.network). A quarter watermark makes
   turn drift/events apply once; per-figure turn markers stop double-click replays. */

export type Tier = 'leadership' | 'influential' | 'active';
export type Profile = { id: string; name: string; portrait: number; party: Party; tier: Tier; office: string; ideology: number; bio: string; ambition: number };
const P = (id: string, name: string, portrait: number, party: Party, tier: Tier, office: string, ideology: number, ambition: number, bio: string): Profile => ({ id, name, portrait, party, tier, office, ideology, ambition, bio });

/** Ideology: −2 progressive … +2 conservative. Ambition 0–100. */
export const FIGURES: Profile[] = [
  P('hale', 'Margaret Hale', 7, 'Democrat', 'leadership', 'Democratic National Chair', -1, 70, 'Relentless fundraiser who rewards loyalty and punishes defectors.'),
  P('crane', 'Walter Crane', 10, 'Republican', 'leadership', 'Republican National Chair', 1, 65, 'Old-school organizer with a long memory for slights.'),
  P('osei', 'Daniel Osei', 2, 'Democrat', 'leadership', 'Senate Majority Leader', -1, 80, 'Master vote-counter; trades favors like currency.'),
  P('whitfield', 'Harlan Whitfield', 6, 'Republican', 'leadership', 'Senate Minority Leader', 2, 75, 'Procedural hardliner who prizes party discipline.'),
  P('reyes', 'Lucia Reyes', 11, 'Democrat', 'leadership', 'House Floor Leader', -2, 85, 'Progressive firebrand eyeing the speakership.'),
  P('brandt', 'Gordon Brandt', 0, 'Republican', 'leadership', 'House Minority Whip', 1, 70, 'Affable whip who never forgets a missed vote.'),
  P('nakamura', 'Ellen Nakamura', 9, 'Independent', 'leadership', 'Independent Caucus Chair', 0, 55, 'Brokers deals between both parties.'),
  P('ashford', 'Theodore Ashford', 6, 'Republican', 'influential', 'Former President', 1, 30, 'Elder statesman whose endorsement still moves markets.'),
  P('lindqvist', 'Ruth Lindqvist', 3, 'Democrat', 'influential', 'Former President', -1, 25, 'Beloved former president who guards her legacy.'),
  P('moreau', 'Jacques Moreau', 10, 'Democrat', 'influential', 'Former Governor', -1, 50, 'Machine politician with deep union ties.'),
  P('baptiste', 'Celeste Baptiste', 4, 'Democrat', 'influential', 'Former Senator', -2, 40, 'Civil-rights veteran with moral authority.'),
  P('kowalski', 'Frank Kowalski', 1, 'Republican', 'influential', 'Former Governor', 2, 45, 'Blue-collar conservative with a loyal base.'),
  P('vance', 'Eleanor Vance', 3, 'Republican', 'influential', 'Former Senator', 1, 35, 'Foreign-policy hawk and sought-after advisor.'),
  P('okafor', 'Samuel Okafor', 1, 'Independent', 'influential', 'Former Secretary of State', 0, 40, 'Diplomat who stays above the partisan fray.'),
  P('delgado', 'Marisol Delgado', 5, 'Democrat', 'influential', 'Labor Federation President', -1, 60, 'Can turn out ten thousand volunteers overnight.'),
  P('sterling', 'Preston Sterling', 0, 'Republican', 'influential', 'Billionaire Donor', 1, 50, 'Bankrolls candidates who share his tax views.'),
  P('patel', 'Anjali Patel', 11, 'Democrat', 'active', 'U.S. Representative', -1, 75, 'Data-driven reformer climbing fast.'),
  P('morgan', 'Cole Morgan', 8, 'Republican', 'active', 'State Senator', 1, 80, 'Young, telegenic and openly ambitious.'),
  P('chen', 'Grace Chen', 9, 'Independent', 'active', 'City Council Member', 0, 60, 'Pragmatic problem-solver popular with moderates.'),
  P('ruiz', 'Mateo Ruiz', 8, 'Democrat', 'active', 'Mayor', -1, 70, 'Charismatic city executive with statewide dreams.'),
  P('blackwood', 'Victoria Blackwood', 3, 'Republican', 'active', 'Governor', 1, 85, 'Polished governor quietly building a national run.'),
  P('obi', 'Nnamdi Obi', 1, 'Democrat', 'active', 'State Attorney General', -1, 75, 'Tough prosecutor with an eye on higher office.'),
  P('fischer', 'Karl Fischer', 10, 'Republican', 'active', 'U.S. Senator', 2, 60, 'Fiscal hawk who rarely compromises.'),
  P('santos', 'Isabel Santos', 5, 'Democrat', 'active', 'State Representative', -2, 65, 'Grassroots organizer turned legislator.'),
  P('hayes', 'Bennett Hayes', 0, 'Republican', 'active', 'County Executive', 0, 55, 'Moderate dealmaker unpopular with hardliners.'),
  P('quinn', 'Fiona Quinn', 3, 'Independent', 'active', 'Talk-Radio Host & Activist', 0, 70, 'Populist voice with a huge audience.'),
  P('alvarez', 'Ricardo Alvarez', 8, 'Republican', 'active', 'Lieutenant Governor', 1, 80, 'Waiting impatiently for the top job.'),
  P('kim', 'Jason Kim', 2, 'Democrat', 'active', 'State Treasurer', 0, 55, 'Numbers man trusted by business and labor.'),
  P('harper', 'Naomi Harper', 7, 'Democrat', 'active', 'U.S. Senator', -1, 80, 'Rising star tipped as a future nominee.'),
  P('drummond', 'Silas Drummond', 6, 'Republican', 'active', 'State Party Chair', 2, 60, 'Enforcer of the party line at the state level.'),
];
export const profileOf = (id: string) => FIGURES.find(f => f.id === id)!;

const OFFICE_LADDER = ['City Council Member', 'Mayor', 'State Representative', 'State Senator', 'County Executive', 'Lieutenant Governor', 'State Attorney General', 'State Treasurer', 'U.S. Representative', 'Governor', 'U.S. Senator'];
const PARTY_IDEOLOGY: Record<Party, number> = { Democrat: -1, Republican: 1, Independent: 0 };

export type Band = { label: string; tone: 'ally' | 'friend' | 'friendly' | 'neutral' | 'dislike' | 'rival' | 'enemy' };
export function band(score: number): Band {
  if (score >= 80) return { label: 'Trusted Ally', tone: 'ally' };
  if (score >= 50) return { label: 'Close Friend', tone: 'friend' };
  if (score >= 20) return { label: 'Friendly', tone: 'friendly' };
  if (score > -20) return { label: 'Neutral', tone: 'neutral' };
  if (score > -50) return { label: 'Dislike', tone: 'dislike' };
  if (score > -80) return { label: 'Political Rival', tone: 'rival' };
  return { label: 'Bitter Enemy', tone: 'enemy' };
}
export const IDEOLOGY = ['Progressive', 'Liberal', 'Centrist', 'Conservative', 'Hard-right'];
export const ideologyLabel = (n: number) => IDEOLOGY[Math.max(0, Math.min(4, n + 2))]!;

const clampScore = (n: number) => Math.max(-100, Math.min(100, Math.round(n))) || 0;
const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(n))) || 0;
const seedOf = (c: Career) => `${c.character.name}|${c.character.state}|${c.character.party}`;

/** Deterministic first-time seed for legacy and new careers alike. */
export function seedNetwork(c: Career): Network {
  const s = seedOf(c), me = c.character.party;
  const figures: FigureState[] = FIGURES.map(f => {
    const r = rand(`${s}|${f.id}`);
    const same = f.party === me, gap = Math.abs(f.ideology - PARTY_IDEOLOGY[me]);
    let score = (same ? 12 : -4) - gap * 5 + (r - 0.5) * 30 + Math.min(15, c.relationships / 8);
    // Every career starts with one natural rival and one friend to give the network texture.
    if (f.id === FIGURES[Math.floor(rand(`${s}|rival`) * FIGURES.length)]!.id) score = -58;
    if (f.id === FIGURES[Math.floor(rand(`${s}|friend`) * FIGURES.length)]!.id) score = 55;
    return {
      id: f.id, office: f.office, party: f.party, score: clampScore(score),
      loyalty: clamp100(40 + rand(`${s}|${f.id}|loy`) * 50), satisfaction: clamp100(45 + rand(`${s}|${f.id}|sat`) * 45),
      influence: clamp100((f.tier === 'leadership' ? 70 : f.tier === 'influential' ? 60 : 35) + rand(`${s}|${f.id}|inf`) * 25),
      reputation: clamp100(45 + rand(`${s}|${f.id}|rep`) * 45), allied: false, lastMet: '', lastSeen: '', endorsedBy: '', endorsedPlayer: '', funded: '', recruitYear: 0, persuadeTurn: '', allianceTurn: '',
    };
  });
  return withDiscovery(networkSchema.parse({ figures }), c);
}

/* ---------- Gradual discovery ---------- */
const LOCAL_OFFICES = ['City Council Member', 'Mayor', 'County Executive', 'State Representative', 'State Party Chair', 'Talk-Radio Host & Activist', 'Labor Federation President'];
/** 1 = local, 2 = regional/state, 3 = national leadership. */
export function reachLevel(id: string): 1 | 2 | 3 {
  const p = profileOf(id);
  if (p.tier === 'leadership' || p.office === 'Former President' || p.office === 'Former Secretary of State') return 3;
  if (p.tier === 'active' && LOCAL_OFFICES.includes(p.office)) return 1;
  return 2;
}
/** Highest circle the player's reputation (0–200) opens. Elected office widens the reach by one. */
export function reachFor(c: Career): 1 | 2 | 3 {
  const bonus = c.office ? (['governor', 'senator', 'president'].includes(c.office.id) ? 2 : 1) : 0;
  const base = c.reputation >= 150 ? 3 : c.reputation >= 50 ? 2 : 1;
  return Math.min(3, base + bonus) as 1 | 2 | 3;
}
/** Marks a small initial circle on new or legacy networks; already-tracked networks are untouched. */
export function withDiscovery(net: Network, c: Career): Network {
  if (net.figures.every(f => f.discovered !== undefined)) return net;
  const legacy = net.figures.some(f => f.lastMet || f.allied || f.endorsedBy || f.endorsedPlayer || f.funded);
  const s = seedOf(c), me = c.character.party;
  const starters = new Set(FIGURES.filter(f => reachLevel(f.id) === 1)
    .map(f => ({ id: f.id, w: (f.party === me ? 1 : 0) + rand(`${s}|${f.id}|intro`) }))
    .sort((a, b) => b.w - a.w).slice(0, 3 + (rand(`${s}|introN`) < 0.5 ? 1 : 0)).map(x => x.id));
  return { ...net, figures: net.figures.map(f => f.discovered !== undefined ? f : { ...f, discovered: starters.has(f.id) || (legacy && !!(f.lastMet || f.allied || f.endorsedBy || f.endorsedPlayer || f.funded)), discoveredAt: c.date }) };
}
export const networkOf = (c: Career): Network => c.network ? withDiscovery(c.network, c) : seedNetwork(c);
export const ensureNetwork = (c: Career): Career => { const n = networkOf(c); return n === c.network ? c : { ...c, network: n }; };
export const knownFigures = (c: Career) => networkOf(c).figures.filter(f => f.discovered);
export const figureOf = (c: Career, id: string) => networkOf(c).figures.find(f => f.id === id);

export type NetworkFilter = 'allies' | 'rivals' | 'leadership' | 'influential' | 'all';
export function filterFigures(c: Career, filter: NetworkFilter) {
  const rows = knownFigures(c).map(st => ({ st, p: profileOf(st.id) })).sort((a, b) => b.st.score - a.st.score);
  if (filter === 'allies') return rows.filter(r => r.st.score >= 50);
  if (filter === 'rivals') return rows.filter(r => r.st.score <= -50).reverse();
  if (filter === 'leadership') return rows.filter(r => r.p.tier === 'leadership');
  if (filter === 'influential') return rows.filter(r => r.p.tier === 'influential');
  return rows;
}

/* ---------- Actions ---------- */
export type NetAction = 'meet' | 'platform' | 'endorse-them' | 'request-endorse' | 'request-funds' | 'alliance' | 'recruit';
export type ActionView = { id: NetAction; label: string; hint: string; disabled: boolean; reason: string };

const year = (c: Career) => Number(c.date.slice(0, 4));
const busy = (c: Career) => (c.report || c.newspaperPending || c.pendingEvent || c.eventEncounter) ? 'Finish the turn report first.' : '';
const ENERGY = 5;

function put(c: Career, net: Network, f: FigureState): Career {
  return { ...c, network: { ...net, revision: net.revision + 1, figures: net.figures.map(x => x.id === f.id ? f : x) } };
}
function spend(c: Career, actions: number, energy = ENERGY): Career {
  void energy;
  return { ...c, actions: c.actions - actions * ACTION_COST };
}
const log = (c: Career, msg: string): Career => ({ ...c, log: [msg, ...c.log].slice(0, 12) });

/** Chance (0–1) a figure switches to the player's party. */
export function recruitChance(c: Career, f: FigureState) {
  const p = profileOf(f.id), gap = Math.abs(p.ideology - PARTY_IDEOLOGY[c.character.party]);
  return Math.max(0, Math.min(0.85, f.score / 200 + (100 - f.loyalty) / 250 + (100 - f.satisfaction) / 250 - gap * 0.15 - (p.tier === 'influential' ? 0.1 : 0)));
}
export const allianceChance = (f: FigureState) => Math.max(0.1, Math.min(0.9, 0.3 + f.score / 150));

export function networkActions(c: Career, id: string): ActionView[] {
  const f = figureOf(c, id); if (!f) return [];
  const p = profileOf(id), camp = c.campaign, block = busy(c), noAct = c.actions < ACTION_COST ? 'Not enough energy this turn.' : '';
  const tired = '';
  const row = (id: NetAction, label: string, hint: string, reason: string): ActionView => ({ id, label, hint, reason: block || reason, disabled: !!(block || reason) });
  return [
    row('meet', 'Arrange private meeting', 'Builds rapport · 15% energy · −5 energy', f.lastMet === c.date ? 'Already met this turn.' : noAct || tired),
    row('platform', f.score < 20 ? 'Resolve disagreements' : 'Discuss party platform', 'Bridges ideological gaps · 15% energy', f.persuadeTurn === c.date ? 'Already discussed this turn.' : noAct || tired),
    row('endorse-them', `Endorse ${p.name.split(' ')[0]}`, 'Public support · +score, small reputation risk across the aisle · 15% energy', f.endorsedPlayer === String(year(c)) ? 'Already endorsed this year.' : noAct),
    row('request-endorse', 'Request campaign endorsement', 'Needs Close Friend (+50) and an active campaign', !camp ? 'No active campaign.' : f.endorsedBy === camp.startDate ? 'Already endorsing you.' : f.score < 50 ? 'Needs Close Friend (+50).' : noAct),
    row('request-funds', 'Request campaign funding', `Legal max-out donation (~${usd(fundAmount(f))}) · needs +60`, !camp ? 'No active campaign.' : f.funded === camp.startDate ? 'Already donated to this campaign.' : f.score < 60 ? 'Needs +60 relationship.' : noAct),
    row('alliance', f.allied ? 'Alliance in place' : 'Negotiate tactical alliance', `~${Math.round(allianceChance(f) * 100)}% success · needs Friendly (+20)`, f.allied ? 'Already allied.' : f.allianceTurn === c.date ? 'Already negotiated this turn.' : f.score < 20 ? 'Needs Friendly (+20).' : noAct || tired),
    row('recruit', 'Persuade to switch parties', `~${Math.round(recruitChance(c, f) * 100)}% · loyalty ${f.loyalty} · party satisfaction ${f.satisfaction}`, f.party === c.character.party ? 'Already in your party.' : f.recruitYear === year(c) ? 'One attempt per year.' : noAct),
  ];
}
export const fundAmount = (f: FigureState) => Math.round(1000 + f.influence * 60);

export function networkAction(c0: Career, id: string, action: NetAction, revision?: number): Result {
  const c = ensureNetwork(c0), net = networkOf(c);
  if (revision !== undefined && revision !== (c0.network?.revision ?? 0)) return { ok: false, message: 'That request is out of date.' };
  if (!figureOf(c, id)?.discovered) return { ok: false, message: 'You have not met this politician yet.' };
  const view = networkActions(c, id).find(a => a.id === action);
  if (!view || view.disabled) return { ok: false, message: view?.reason || 'That action is not available.' };
  const f = figureOf(c, id)!, p = profileOf(id), first = p.name.split(' ')[0];
  const r = rand(`${seedOf(c)}|${id}|${action}|${c.date}|${net.revision}`);
  let n: Career, nf: FigureState = f, msg = '';
  switch (action) {
    case 'meet': {
      const gain = Math.round(4 + r * 8 + (c.skills.communication / 25));
      nf = { ...f, score: clampScore(f.score + gain), lastMet: c.date, lastSeen: c.date };
      n = spend(c, 1); msg = `Private meeting with ${p.name}: relationship +${gain}.`; break;
    }
    case 'platform': {
      const gap = Math.abs(p.ideology - PARTY_IDEOLOGY[c.character.party]);
      const ok = r < 0.75 - gap * 0.15 + c.skills.knowledge / 400;
      const d = ok ? 6 + (f.party === c.character.party ? 4 : 0) : -4;
      nf = { ...f, score: clampScore(f.score + d), persuadeTurn: c.date, lastSeen: c.date, satisfaction: f.party === c.character.party ? clamp100(f.satisfaction + (ok ? 4 : -2)) : f.satisfaction };
      n = spend(c, 1); msg = ok ? `You found common ground with ${p.name}: relationship +${d}.` : `The platform talk with ${p.name} went badly: relationship ${d}.`; break;
    }
    case 'endorse-them': {
      const across = f.party !== c.character.party && c.character.party !== 'Independent';
      nf = { ...f, score: clampScore(f.score + 10), endorsedPlayer: String(year(c)), reputation: clamp100(f.reputation + 2) };
      n = spend(c, 1, 0); if (across) n = { ...n, reputation: Math.max(0, n.reputation - 2) };
      msg = `You publicly endorsed ${p.name}: relationship +10${across ? '; some in your party grumble (reputation −2)' : ''}.`;
      n = { ...n, newsQueue: [...n.newsQueue, { h: `${c.character.name} endorses ${p.name}`, sub: p.office, body: msg, tag: 'politics', subject: c.character.name }] }; break;
    }
    case 'request-endorse': {
      const camp = c.campaign!;
      nf = { ...f, endorsedBy: camp.startDate, score: clampScore(f.score - 2) };
      n = spend(c, 1, 0);
      n = { ...n, campaign: { ...camp, endorsements: [...camp.endorsements, { group: `net:${id}`, candidate: c.character.name }], support: Math.min(100, camp.support + Math.round(f.influence / 25)), headlines: [`${p.name} endorses ${c.character.name}`, ...camp.headlines].slice(0, 12) } };
      msg = `${p.name} endorsed your campaign: support +${Math.round(f.influence / 25)}.`;
      n = { ...n, newsQueue: [...n.newsQueue, { h: `${p.name} backs ${c.character.name}`, sub: p.office, body: msg, tag: 'campaign', subject: c.character.name }] }; break;
    }
    case 'request-funds': {
      const camp = c.campaign!, amt = fundAmount(f);
      nf = { ...f, funded: camp.startDate, score: clampScore(f.score - 3) };
      n = spend(c, 1, 0);
      n = { ...n, campaign: { ...camp, funds: camp.funds + amt, raised: camp.raised + amt, donors: camp.donors + 1, txns: [...camp.txns, { month: c.date.slice(0, 7), label: `Donation · ${p.name}`, amount: amt }] } };
      msg = `${first} maxed out to your campaign: +${usd(amt)} campaign funds.`; break;
    }
    case 'alliance': {
      const ok = r < allianceChance(f);
      nf = ok ? { ...f, allied: true, score: clampScore(f.score + 5), allianceTurn: c.date } : { ...f, score: clampScore(f.score - 3), allianceTurn: c.date };
      n = spend(c, 1); msg = ok ? `Tactical alliance sealed with ${p.name}.` : `${p.name} declined an alliance for now.`; break;
    }
    case 'recruit': {
      const ok = r < recruitChance(c, f);
      nf = ok ? { ...f, party: c.character.party, score: clampScore(f.score + 15), loyalty: 55, satisfaction: 70, recruitYear: year(c) } : { ...f, score: clampScore(f.score - 8), recruitYear: year(c) };
      n = spend(c, 1, 0);
      msg = ok ? `${p.name} switched to the ${c.character.party} Party at your urging!` : `${p.name} rejected your recruitment pitch: relationship −8.`;
      if (ok) n = { ...n, reputation: Math.min(100, n.reputation + 3), newsQueue: [...n.newsQueue, { h: `${p.name} defects to the ${c.character.party}s`, sub: p.office, body: `${c.character.name} is credited with the switch.`, tag: 'politics', subject: p.name }] };
      break;
    }
  }
  n = put(n, networkOf(n.network ? n : c), nf);
  return { ok: true, career: log(n, msg), message: msg };
}

export const HOST_COST = 5000;
/** Host a reception: small boost with every non-enemy figure; once per turn. */
export function hostEvent(c0: Career, revision?: number): Result {
  const c = ensureNetwork(c0), net = networkOf(c);
  if (revision !== undefined && revision !== (c0.network?.revision ?? 0)) return { ok: false, message: 'That request is out of date.' };
  const b = busy(c); if (b) return { ok: false, message: b };
  if (net.hostTurn === c.date) return { ok: false, message: 'You already hosted an event this turn.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  if (c.money < HOST_COST) return { ok: false, message: `Hosting costs ${usd(HOST_COST)} in personal cash.` };
  const figures = net.figures.map(f => f.discovered && f.score > -50 ? { ...f, score: clampScore(f.score + 3), lastSeen: c.date } : f);
  let n = spend(c, 1, 10);
  n = { ...n, money: n.money - HOST_COST, ledger: [...n.ledger, { month: c.date.slice(0, 7), label: 'Hosted political reception', amount: -HOST_COST }], network: { ...net, figures, hostTurn: c.date, revision: net.revision + 1 } };
  const msg = `You hosted a reception: +3 with ${figures.filter(f => f.lastSeen === c.date).length} associates (−${usd(HOST_COST)}).`;
  return { ok: true, career: log(n, msg), message: msg };
}

/* ---------- Offers ---------- */
export function answerOffer(c0: Career, offerId: string, accept: boolean): Result {
  const c = ensureNetwork(c0), net = networkOf(c), o = net.offers.find(x => x.id === offerId);
  if (!o) return { ok: false, message: 'That offer has expired.' };
  const f = figureOf(c, o.figureId)!, p = profileOf(o.figureId);
  let nf = f, n: Career = c, msg = '';
  if (o.kind === 'truce' || o.kind === 'alliance') {
    nf = accept ? { ...f, score: Math.max(f.score, 0) + (o.kind === 'alliance' ? 25 : 0), allied: o.kind === 'alliance' } : { ...f, score: clampScore(f.score - 5) };
    msg = accept ? `${o.kind === 'truce' ? 'Truce' : 'Alliance'} agreed with ${p.name}.` : `You rebuffed ${p.name}.`;
  } else if (o.kind === 'endorse') {
    if (accept && c.campaign) {
      n = { ...c, campaign: { ...c.campaign, endorsements: [...c.campaign.endorsements, { group: `net:${f.id}`, candidate: c.character.name }], support: Math.min(100, c.campaign.support + Math.round(f.influence / 25)) } };
      nf = { ...f, endorsedBy: c.campaign.startDate };
      msg = `You accepted ${p.name}'s endorsement.`;
    } else { nf = { ...f, score: clampScore(f.score - 4) }; msg = `You declined ${p.name}'s endorsement.`; }
  } else if (o.kind === 'support') {
    const bond = f.score >= 50 || f.allied;
    if (accept) { nf = { ...f, score: clampScore(f.score + (bond ? 14 : 5)), loyalty: clamp100(f.loyalty + (bond ? 8 : 12)) }; msg = `You publicly backed ${p.name}'s race — they owe you one.`; }
    else { nf = { ...f, score: clampScore(f.score - (bond ? 5 : 0)) }; msg = bond ? `You declined to back your friend ${p.name} (−5).` : `You stayed out of ${p.name}'s race.`; }
  } else {
    if (accept) { nf = { ...f, score: clampScore(f.score + 15), loyalty: clamp100(f.loyalty + 10) }; n = shiftApproval(c, -1, `Critics call ${p.name}'s appointment cronyism.`); msg = `You appointed ${p.name}'s pick: relationship +15, approval −1.`; }
    else { nf = { ...f, score: clampScore(f.score - (f.allied ? 15 : 10)) }; msg = f.allied ? `You turned down your ally ${p.name} — a broken promise (−15).` : `You declined ${p.name}'s appointment request (−10).`; }
  }
  n = { ...n, network: { ...net, offers: net.offers.filter(x => x.id !== offerId), figures: net.figures.map(x => x.id === nf.id ? nf : x), revision: net.revision + 1 } };
  return { ok: true, career: log(n, msg), message: msg };
}

/* ---------- Assistance requests ---------- */
export const ASSIST_TOPICS = ['whipping votes for a stalled bill', 'raising money for a tight re-election', 'defending them against a hostile press story', 'rallying volunteers for a district event', 'brokering peace with a union leader'];
export type AssistChoice = 'full' | 'limited' | 'refuse' | 'bargain';
/** 1-3: bigger asks come with closer ties, higher office and stronger party standing. */
export function assistStakes(c: Career, f: FigureState): 1 | 2 | 3 {
  const standing = c.character.party === 'Independent' ? 40 : (c.supportGroups?.partyStanding ?? 50);
  const pts = (f.score >= 50 || f.allied ? 1 : 0) + (c.office ? 1 : 0) + (standing >= 65 ? 1 : 0);
  return Math.max(1, Math.min(3, pts)) as 1 | 2 | 3;
}
export function assistOptions(c: Career, o: NetworkOffer) {
  const k = o.stakes ?? 1, cost = (k >= 2 ? 2 : 1) * ACTION_COST;
  return [
    { id: 'full' as const, label: 'Offer full support', detail: `Relationship +${8 + 6 * k} · loyalty up · ${cost}% energy · approval −1`, blocked: c.actions < cost ? `Needs ${cost}% energy.` : '' },
    { id: 'limited' as const, label: 'Offer limited help', detail: `Relationship +${3 + 2 * k} · no cost`, blocked: '' },
    { id: 'refuse' as const, label: 'Refuse politely', detail: k >= 2 ? `Relationship −${2 * k}` : 'No change', blocked: '' },
    { id: 'bargain' as const, label: 'Ask for something in return', detail: `They owe you a favor · loyalty +${4 * k} · relationship −2`, blocked: '' },
  ];
}
export function answerAssist(c0: Career, offerId: string, choice: AssistChoice): Result {
  const c = ensureNetwork(c0), net = networkOf(c), o = net.offers.find(x => x.id === offerId && x.kind === 'assist');
  if (!o) return { ok: false, message: 'That request has expired.' };
  const f = figureOf(c, o.figureId);
  if (!f?.discovered) return { ok: false, message: 'You have not met this politician yet.' };
  const opt = assistOptions(c, o).find(x => x.id === choice)!;
  if (opt.blocked) return { ok: false, message: opt.blocked };
  const k = o.stakes ?? 1, p = profileOf(f.id), seen = { lastSeen: c.date };
  let nf: FigureState = f, n: Career = c, msg = '';
  if (choice === 'full') { const cost = (k >= 2 ? 2 : 1) * ACTION_COST; nf = { ...f, ...seen, score: clampScore(f.score + 8 + 6 * k), loyalty: clamp100(f.loyalty + 6) }; n = shiftApproval({ ...c, actions: c.actions - cost }, -1, `Voters question time spent on ${p.name}'s problems.`); msg = `You went all in for ${p.name}: relationship +${8 + 6 * k}.`; }
  else if (choice === 'limited') { nf = { ...f, ...seen, score: clampScore(f.score + 3 + 2 * k) }; msg = `You lent ${p.name} a hand: relationship +${3 + 2 * k}.`; }
  else if (choice === 'refuse') { nf = { ...f, score: clampScore(f.score - (k >= 2 ? 2 * k : 0)) }; msg = k >= 2 ? `You politely declined ${p.name} (−${2 * k}).` : `You politely declined ${p.name}. They understand.`; }
  else { nf = { ...f, ...seen, score: clampScore(f.score - 2), loyalty: clamp100(f.loyalty + 4 * k) }; msg = `${p.name} agreed to owe you a favor in return (loyalty +${4 * k}).`; }
  n = { ...n, network: { ...net, offers: net.offers.filter(x => x.id !== offerId), figures: net.figures.map(x => x.id === nf.id ? nf : x), revision: net.revision + 1 } };
  return { ok: true, career: log(n, msg), message: msg };
}

/* ---------- Quarterly turn ---------- */
export function networkTurn(c0: Career, end: string): { career: Career; notices: string[] } {
  const c = ensureNetwork(c0), net = networkOf(c);
  if (net.lastEnd >= end) return { career: c0, notices: [] };
  const s = `${seedOf(c)}|${end}`, notices: string[] = [], notes: NetworkNote[] = [], news: Career['newsQueue'] = [];
  let offers = net.offers.filter(o => o.date >= c.date.slice(0, 7)); // offers expire after one turn
  let approvalHit = 0;
  const figures = net.figures.map(f => {
    let x = { ...f };
    // Drift: allies neglected for two turns cool off; grudges soften slowly.
    if (x.score > 30 && x.lastSeen && x.lastSeen < monthsBack(c.date, 6)) x.score = clampScore(x.score - 3);
    if (x.score < -30) x.score = clampScore(x.score + 1);
    x.satisfaction = clamp100(x.satisfaction + (rand(`${s}|${x.id}|sat`) - 0.5) * 8);
    x.loyalty = clamp100(x.loyalty + (rand(`${s}|${x.id}|loy`) - 0.5) * 6);
    // Ambition: active politicians climb the ladder over time.
    const p = profileOf(x.id);
    if (p.tier === 'active' && rand(`${s}|${x.id}|climb`) < p.ambition / 1400) {
      const i = OFFICE_LADDER.indexOf(x.office), next = OFFICE_LADDER[Math.min(OFFICE_LADDER.length - 1, Math.max(0, i) + 1)]!;
      if (next !== x.office) { x.office = next; x.influence = clamp100(x.influence + 6); if (x.discovered) notes.push({ end, figureId: x.id, text: `${p.name} wins promotion to ${next}.`, tone: 'info' }); }
    }
    // Party switch from deep dissatisfaction (rare, independent of player).
    if (x.discovered && x.satisfaction < 15 && x.loyalty < 35 && rand(`${s}|${x.id}|defect`) < 0.3) {
      const to: Party = x.party === 'Independent' ? (p.ideology <= 0 ? 'Democrat' : 'Republican') : 'Independent';
      notes.push({ end, figureId: x.id, text: `${p.name} leaves the ${x.party} Party to sit as ${to === 'Independent' ? 'an Independent' : `a ${to}`}.`, tone: 'info' });
      x.party = to; x.satisfaction = 60;
    }
    return x;
  });
  const by = (id: string) => figures.find(f => f.id === id)!;
  const pick = <T extends FigureState,>(arr0: T[], key: string) => { const arr = arr0.filter(x => x.discovered); return arr.length ? arr[Math.floor(rand(`${s}|${key}`) * arr.length)]! : null; };
  let events = 0;
  // 1. Former ally turns rival by contesting your seat.
  if (c.campaign && rand(`${s}|contest`) < 0.18) {
    const f = pick(figures.filter(x => x.score >= 20 && profileOf(x.id).tier === 'active' && x.party === c.campaign!.party), 'contest');
    if (f) { const p = profileOf(f.id); f.score = clampScore(f.score - 60); f.allied = false; events++;
      notes.push({ end, figureId: f.id, text: `${p.name} enters your race for ${c.campaign.title} — friend turned rival.`, tone: 'bad' });
      news.push({ h: `${p.name} challenges ${c.character.name}`, sub: c.campaign.title, body: `Once allies, the two now compete for the same seat.`, tag: 'campaign', subject: p.name }); }
  }
  // 2. Betrayal by a low-loyalty ally.
  if (events < 2 && rand(`${s}|betray`) < 0.12) {
    const f = pick(figures.filter(x => x.allied && x.loyalty < 50), 'betray');
    if (f) { const p = profileOf(f.id); f.score = clampScore(f.score - 40); f.allied = false; approvalHit -= 1; events++;
      notes.push({ end, figureId: f.id, text: `${p.name} broke your alliance and briefed reporters against you.`, tone: 'bad' });
      news.push({ h: `${p.name} turns on ${c.character.name}`, sub: 'Alliance collapses', body: `A former ally goes public with criticism.`, tag: 'politics', subject: p.name }); }
  }
  const offer = (f: FigureState, kind: NetworkOffer['kind'], text: string) => { offers = [...offers.filter(o => o.figureId !== f.id), { id: `${end}|${f.id}|${kind}`, figureId: f.id, kind, date: end.slice(0, 7), text }]; events++; notes.push({ end, figureId: f.id, text, tone: kind === 'appointment' ? 'info' : 'good' }); };
  // 3. Rival proposes a truce or an alliance against a third party.
  if (events < 2 && rand(`${s}|truce`) < 0.25) {
    const f = pick(figures.filter(x => x.score <= -50), 'truce');
    const foe = pick(figures.filter(x => x.score <= -50 && f && x.id !== f.id), 'foe');
    if (f) { const p = profileOf(f.id); foe ? offer(f, 'alliance', `${p.name} proposes an alliance against ${profileOf(foe.id).name}.`) : offer(f, 'truce', `${p.name} proposes a mutual truce.`); }
  }
  // 4. Endorsement offer from a friend during a campaign.
  if (events < 2 && c.campaign && rand(`${s}|endorse`) < 0.35) {
    const f = pick(figures.filter(x => x.score >= 50 && x.endorsedBy !== c.campaign!.startDate), 'endorse');
    if (f) offer(f, 'endorse', `${profileOf(f.id).name} offers to endorse your campaign.`);
  }
  // 5. Appointment request while you hold an executive office.
  if (events < 2 && c.office && ['mayor', 'governor', 'president'].includes(c.office.id) && rand(`${s}|appt`) < 0.3) {
    const f = pick(figures.filter(x => x.score >= 20), 'appt');
    if (f) offer(f, 'appointment', `${profileOf(f.id).name} asks you to appoint a close associate to a senior post.`);
  }
  // 6. Candidates ask for your backing when you are not running yourself.
  if (events < 2 && !c.campaign && rand(`${s}|support`) < 0.35) {
    const heavy = (!!c.office && ['mayor', 'governor', 'senator', 'president'].includes(c.office.id)) || c.reputation >= 80;
    const f = pick(figures.filter(x => profileOf(x.id).tier === 'active' && (x.score >= 50 || x.allied || (c.reputation >= 55 && x.score >= 0) || (heavy && x.score >= -20))), 'support');
    if (f) { const p = profileOf(f.id), why = f.score >= 50 || f.allied ? 'as a friend' : heavy ? 'seeking a heavyweight\'s blessing' : 'citing your reputation';
      offer(f, 'support', `${p.name} asks for your public support in their race (${why}).`); }
  }
  // 7. Assistance requests from known contacts only; stakes scale with trust, office and party standing.
  if (events < 2 && rand(`${s}|assist`) < 0.4) {
    const f = pick(figures.filter(x => x.score >= -20 && !offers.some(o => o.figureId === x.id)), 'assist');
    if (f) { const stakes = assistStakes(c, f), topic = ASSIST_TOPICS[Math.floor(rand(`${s}|assistTopic`) * ASSIST_TOPICS.length)]!;
      offers = [...offers, { id: `${end}|${f.id}|assist`, figureId: f.id, kind: 'assist', date: end.slice(0, 7), text: `${profileOf(f.id).name} asks for your help ${topic}.`, topic, stakes }]; events++;
      notes.push({ end, figureId: f.id, text: `${profileOf(f.id).name} asks for your help ${topic}.`, tone: 'info' }); }
  }
  // 8. Introductions: one new contact most quarters, gated by reputation reach.
  const reach = reachFor(c), pool = figures.filter(x => !x.discovered && reachLevel(x.id) <= reach);
  if (pool.length && rand(`${s}|intro`) < 0.65) {
    const known = figures.filter(x => x.discovered && x.score >= 30);
    const f = pool[Math.floor(rand(`${s}|introPick`) * pool.length)]!, p = profileOf(f.id);
    const host = known.length ? profileOf(known[Math.floor(rand(`${s}|introHost`) * known.length)]!.id).name : '';
    const venues = reachLevel(f.id) === 1 ? ['at a local party gathering', 'at a neighborhood campaign rally', 'at a county fundraiser'] : reachLevel(f.id) === 2 ? ['at a state committee hearing', 'at a regional party convention', 'on the statehouse steps'] : ['at a national party summit', 'at a Washington policy dinner', 'backstage at a televised forum'];
    const where = host ? `through ${host}` : venues[Math.floor(rand(`${s}|venue`) * venues.length)]!;
    f.discovered = true; f.discoveredAt = c.date;
    notes.push({ end, figureId: f.id, text: `You met ${p.name} (${f.office}) ${where}.`, tone: 'info' });
  }
  // Shared votes: same-party figures warm when your approval is strong, rivals cool.
  const appr = c.approval?.overall ?? 50;
  if (c.office) for (const f of figures) if (f.party === c.character.party) f.score = clampScore(f.score + (appr >= 55 ? 1 : appr < 35 ? -1 : 0));
  void by;
  for (const nt of notes) notices.push(`🤝 ${nt.text}`);
  let n: Career = { ...c, network: { ...net, figures, offers, lastEnd: end, notes: [...notes, ...net.notes].slice(0, 30) }, newsQueue: [...c.newsQueue, ...news] };
  if (approvalHit && c.approval) n = shiftApproval(n, approvalHit, 'A former ally turned on you.');
  return { career: n, notices };
}
function monthsBack(date: string, m: number) { const d = new Date(`${date}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - m); return d.toISOString().slice(0, 10); }
/** Network notes produced by the most recent quarter. */
export const freshNetworkNotes = (c: Career) => { const n = c.network; return n?.lastEnd ? n.notes.filter(x => x.end === n.lastEnd) : []; };
