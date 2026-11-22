import { ACTION_COST } from './energy-costs';
import { closeScandals } from './scandals';
import type { Career } from './career';
import type { LegalCase, Trial } from './legal-schema';
import { applyActionApproval, holdsOffice } from './approval';
import { shiftLoyalty } from './support-groups';
import { archiveTerm } from './terms';
import { socialMediaSchema, handleOf } from './social-media';
import { rand } from './campaign';

/**
 * Phase 6B — court proceedings. Pure, browser-safe. Called by legal.ts once a case is indicted:
 * schedule one court date 1–2 quarters out, let the player pick a strategy, then write exactly one
 * verdict. Fines and restitution come only from personal cash (shortfall becomes court debt);
 * illicit reserves are confiscated; campaign and government accounts are never touched.
 */
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
export const addMonths = (date: string, months: number) => {
  const [y = 0, m = 1] = date.split('-').map(Number), i = y * 12 + m - 1 + months;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`;
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const SUCCESSORS = ['Maria Okafor', 'James Whitfield', 'Lena Park', 'Samuel Ortiz'];
const SUCCESSOR_TITLE: Record<string, string> = { president: 'Vice President', governor: 'Lt. Governor', mayor: 'Deputy Mayor' };
export const STRATEGIES = {
  plea: { name: 'Plead guilty for leniency', note: 'Certain conviction, but roughly half the sentence and lighter fines.' },
  fight: { name: 'Fight all charges', note: 'Acquittal if the defense outweighs the evidence; full penalties if you lose.' },
  political: { name: 'Seek political dismissal', note: 'Lean on allies to make it go away. Costs 1 action and approval; a failed attempt angers the judge.' },
} as const;
export type Strategy = keyof typeof STRATEGIES;

const KIND_LABEL: Record<string, string> = { bribe: 'Bribery', dark_money: 'Campaign-finance violations', self_dealing: 'Procurement fraud (self-dealing)', laundering: 'Money laundering', influence: 'Influence peddling', embezzlement: 'Embezzlement of public funds', tax_evasion: 'Tax evasion and financial fraud' };

/** Every crime and proven misconduct not already tried feeds the charge sheet. */
export function chargeSheet(c: Career, strength: number, adjudicated: string): Pick<Trial, 'tier' | 'charges'> {
  const txns = (c.corruption?.txns ?? []).filter(t => t.date > adjudicated);
  const kinds = [...new Set(txns.map(t => t.kind))];
  const proven = c.scandals.filter(s => s.status === 'proven' && s.date > adjudicated);
  const charges = [...kinds.map(k => KIND_LABEL[k] ?? k), ...proven.slice(0, 3).map(s => `Misconduct: ${s.allegation.slice(0, 60)}`)];
  if (!charges.length) charges.push('Official misconduct');
  const senior = ['governor', 'president', 'senate', 'house'].includes(c.office?.id ?? '');
  const tier: Trial['tier'] = grandCorruption(c, adjudicated) || kinds.includes('embezzlement') || (senior && strength >= 80) ? 'high_felony'
    : kinds.some(k => ['bribe', 'self_dealing', 'laundering', 'influence'].includes(k)) || strength >= 60 ? 'felony' : 'minor';
  return { tier, charges };
}
/** Grand corruption of public funds from the executive docket: siphoned or steered project money. Courts allow no routine bailouts. */
export function grandCorruption(c: Career, adjudicated = ''): 'siphon' | 'steer' | null {
  const txns = (c.corruption?.txns ?? []).filter(t => t.date > adjudicated);
  return txns.some(t => t.id.startsWith('siphon|')) ? 'siphon' : txns.some(t => t.id.startsWith('steer|')) ? 'steer' : null;
}
/** Maximum statutory prison term (quarters) for steering public contracts. */
export const MAX_STATUTORY_QUARTERS = 80;
export const tierName: Record<Trial['tier'], string> = { minor: 'Misdemeanor', felony: 'Felony', high_felony: 'High felony' };

export function scheduleTrial(c: Career, k: LegalCase, end: string, adjudicated: string): Trial {
  const months = rand(`${k.id}|court`) < 0.5 ? 3 : 6;
  return { courtDate: addMonths(end, months), ...chargeSheet(c, k.strength, adjudicated), strategy: null, verdict: null };
}

const POLITICAL_PULL: Record<string, number> = { president: 0.45, governor: 0.35, senate: 0.3, house: 0.25, mayor: 0.2, stateLeg: 0.15, council: 0.1 };
export const dismissalChance = (c: Career, k: LegalCase) => {
  const t = k.trial; if (!t) return 0;
  const pull = holdsOffice(c) ? POLITICAL_PULL[c.office?.id ?? ''] ?? 0.1 : 0.05;
  return clamp(pull - Math.max(0, k.strength - k.defense) / 250 - (t.tier === 'high_felony' ? 0.1 : 0), 0.02, 0.5);
};
export const convictionChance = (k: LegalCase) => clamp((Math.max(0, k.strength - k.defense) - 5) / 55, 0.05, 0.95);

/** Pure penalty calculation from the pre-verdict state; never mutates. */
export function penalties(c: Career, k: LegalCase, tier: Trial['tier'], factor: number, adjudicated: string) {
  const net = Math.max(0, k.strength - k.defense), txns = (c.corruption?.txns ?? []).filter(t => t.date > adjudicated);
  const gains = txns.filter(t => t.kind !== 'dark_money').reduce((s, t) => s + t.amount, 0);
  const base = tier === 'minor' ? 5000 + k.strength * 200 : tier === 'felony' ? 20000 + k.strength * 600 : 100000 + k.strength * 2000;
  const quarters = tier === 'minor' ? 0 : tier === 'felony' ? Math.max(0, Math.round((net - 15) / 6)) : 12 + Math.round(net / 3);
  return {
    fine: Math.round(base * factor), restitution: tier === 'minor' ? 0 : Math.round(gains * Math.min(1, factor)),
    confiscated: tier === 'minor' ? 0 : c.corruption?.reserve ?? 0,
    sentence: Math.round(quarters * factor),
  };
}

export function chooseStrategy(c: Career, k: LegalCase | null, s: Strategy): { ok: true; career: Career; message: string } | { ok: false; message: string } {
  if (!k || k.stage !== 'indicted' || !k.trial || k.trial.verdict) return { ok: false, message: 'There is no trial awaiting a strategy.' };
  if (!STRATEGIES[s]) return { ok: false, message: 'Choose a trial strategy.' };
  if (k.trial.strategy) return { ok: false, message: 'Your trial strategy is already filed with the court.' };
  if (s === 'political' && grandCorruption(c, c.legal?.adjudicated ?? '')) return { ok: false, message: 'No political deal is possible for grand corruption of public funds.' };
  if (s === 'political' && c.actions < ACTION_COST) return { ok: false, message: 'Working the phones costs 15% energy.' };
  const next: LegalCase = { ...k, trial: { ...k.trial, strategy: s }, history: [{ date: c.date, text: `Defense strategy filed: ${STRATEGIES[s].name}.` }, ...k.history].slice(0, 20) };
  let n: Career = { ...c, actions: s === 'political' ? c.actions - ACTION_COST : c.actions, legal: { ...c.legal!, cases: c.legal!.cases.map(x => x.id === k.id ? next : x) } };
  if (s === 'political' && holdsOffice(n)) n = applyActionApproval(n, `trial-political-${k.id}`, -2, 'major', 'Accused of pressuring prosecutors');
  return { ok: true, career: n, message: `${STRATEGIES[s].name}: filed for the ${k.trial.courtDate.slice(0, 7)} court date.` };
}

export function removeFromOffice(c: Career, date: string): Career {
  if (!c.office) return c;
  return { ...archiveTerm(c, date, 'removed from office'), city: null, stateGovernment: null, federalGovernment: null, budget: null, approval: null, office: null, publicOffice: false,
    bills: c.bills.map(b => !['passed', 'rejected'].includes(b.stage) ? { ...b, stage: 'rejected' as const, history: [...b.history, { date, text: 'Withdrawn: sponsor removed from office.' }] } : b) };
}

/** Write the single verdict for a case whose court date has arrived. */
export function resolveTrial(c: Career, k: LegalCase, end: string, adjudicated: string): { career: Career; case: LegalCase; notices: string[] } {
  const t = k.trial!, strategy = t.strategy ?? 'fight', roll = rand(`${k.id}|verdict`), name = c.character.name;
  const officeTitle = c.office?.title;
  let outcome: 'acquitted' | 'dropped' | 'convicted', factor = 1;
  const grand = grandCorruption(c, adjudicated);
  if (grand) outcome = 'convicted'; // Paper trail of diverted public money: no acquittal, no plea discount.
  else if (strategy === 'plea') { outcome = 'convicted'; factor = 0.5; }
  else if (strategy === 'political') { if (roll < dismissalChance(c, k)) outcome = 'dropped'; else { outcome = 'convicted'; factor = 1.25; } }
  else outcome = roll < convictionChance(k) ? 'convicted' : 'acquitted';

  let n: Career = c, verdict: NonNullable<Trial['verdict']>;
  const L = c.legal!;
  if (outcome !== 'convicted') {
    const text = outcome === 'acquitted' ? `Jury acquitted ${name} on all counts.` : `Prosecutors dropped all charges against ${name}.`;
    verdict = { type: outcome, date: end, fine: 0, restitution: 0, confiscated: 0, sentence: 0, life: false, death: false, removed: false, text };
    n = { ...n, reputation: Math.min(100, n.reputation + 3) };
    if (holdsOffice(n)) n = applyActionApproval(n, `verdict-${k.id}`, outcome === 'acquitted' ? 3 : 1, 'major', text);
    n = shiftLoyalty(n, {}, text, 3);
  } else {
    const p = penalties(c, k, t.tier, factor, adjudicated);
    const stole = (c.corruption?.txns ?? []).some(x => x.kind === 'embezzlement' && x.date > adjudicated), net = Math.max(0, k.strength - k.defense);
    // Capital punishment only for a president convicted of stealing public money who refused to plead.
    // Siphoning federal funds is prosecuted as capital treason; siphoning elsewhere means life.
    const death = grand === 'siphon' ? c.office?.id === 'president' : t.tier === 'high_felony' && stole && c.office?.id === 'president' && strategy !== 'plea';
    const life = !death && (grand === 'siphon' || t.tier === 'high_felony' && stole && (c.office?.id === 'president' || (c.office?.id === 'governor' && strategy !== 'plea' && net >= 70)));
    if (grand === 'steer') p.sentence = Math.max(p.sentence, MAX_STATUTORY_QUARTERS);
    // Grand corruption forfeits every personal dollar on top of illicit reserves.
    if (grand) { p.restitution = Math.max(p.restitution, Math.max(0, c.money) - p.fine); p.confiscated = c.corruption?.reserve ?? 0; }
    const removed = holdsOffice(c) && (!!grand || t.tier === 'high_felony' || p.sentence > 0 || life || death);
    const due = p.fine + p.restitution, paid = Math.min(Math.max(0, c.money), due), owed = due - paid;
    const type = p.sentence > 0 || life || death ? 'prison' as const : t.tier === 'minor' && strategy === 'plea' ? 'censure' as const : 'fined' as const;
    const sentenceText = death ? 'sentenced to death' : life ? 'life imprisonment (prosecutors sought the death penalty)' : p.sentence ? `${p.sentence} quarters (${(p.sentence / 4).toFixed(1)} years) in prison` : type === 'censure' ? 'formal censure' : 'no prison time';
    const text = `${name} convicted of ${grand ? grand === 'siphon' && death ? 'capital treason and grand corruption' : 'grand corruption of public funds' : `${tierName[t.tier].toLowerCase()} charges`}${grand ? ' (no bail, all assets forfeited)' : ''}: fined ${usd(p.fine)}${p.restitution ? `, ${usd(p.restitution)} restitution` : ''}${p.confiscated ? `, ${usd(p.confiscated)} illicit funds seized` : ''}; ${sentenceText}.${removed ? ` Removed as ${officeTitle}.` : ''}`;
    verdict = { type, date: end, fine: p.fine, restitution: p.restitution, confiscated: p.confiscated, sentence: life || death ? 0 : p.sentence, life, death, removed, text };
    const restPaid = Math.min(paid, p.restitution), finePaid = paid - restPaid;
    n = { ...n, money: c.money - paid, ledger: [
      ...(finePaid ? [{ month: end, label: 'Court fine', amount: -finePaid }] : []),
      ...(restPaid ? [{ month: end, label: 'Court-ordered restitution', amount: -restPaid }] : []),
      ...c.ledger] };
    if (c.corruption) n = { ...n, corruption: { ...c.corruption, reserve: c.corruption.reserve - p.confiscated } };
    const hit = t.tier === 'minor' ? -3 : -5;
    if (holdsOffice(n)) n = applyActionApproval(n, `verdict-${k.id}`, hit, 'major', text);
    n = { ...n, reputation: Math.max(0, n.reputation - (t.tier === 'minor' ? 3 : t.tier === 'felony' ? 10 : 20)) };
    n = shiftLoyalty(n, {}, text, t.tier === 'minor' ? -3 : -8);
    let succession = '';
    if (removed && c.office) {
      const heirName = `${SUCCESSOR_TITLE[c.office.id] ?? 'Appointee'} ${SUCCESSORS[Math.floor(rand(`${k.id}|successor`) * SUCCESSORS.length)] ?? SUCCESSORS[0]}`;
      succession = `${heirName} was sworn in as ${c.office.title} of ${c.office.jurisdiction}.`;
      n = removeFromOffice(n, end);
      n = { ...n, newsQueue: [...n.newsQueue, { h: `${heirName} sworn in after ${name}'s removal`, sub: `${c.office.title} · ${c.office.jurisdiction}`, body: `${succession} The seat was declared vacant after the conviction. Pending bills sponsored by the former officeholder were withdrawn.`, tag: 'government', subject: heirName, priority: 1 }] };
    }
    const prison = type === 'prison' ? { caseId: k.id, since: end, quarters: life || death ? 0 : p.sentence, release: life || death ? '9999-01-01' : addMonths(end, p.sentence * 3), life,
      served: 0, crime: t.charges.join('; '), tier: tierName[t.tier], prisonRep: 10, death, executionDate: death ? addMonths(end, 6) : '', succession, lastTurn: end, legalKnowledge: 0, actionRevision: 0, activityTurn: '', activityUses: [],
      updates: [{ date: end, kind: 'prison' as const, text: death ? 'You were transferred to death row. Appeals have two quarters.' : 'You were processed into the state penitentiary.' }, ...(succession ? [{ date: end, kind: 'politics' as const, text: succession }] : [])] } : null;
    if (prison) n = { ...n, campaign: null, job: null };
    n = { ...n, legal: { ...L, owed: L.owed + owed, prison: prison ?? L.prison } };
  }
  // No double jeopardy: evidence up to today is adjudicated and the exposure trail resets.
  n = closeScandals(n, end, outcome === 'convicted' ? 'Adjudicated in court: conviction recorded.' : outcome === 'acquitted' ? 'Adjudicated in court: acquitted.' : 'Charges dismissed in court.');
  n = { ...n, legal: { ...(n.legal ?? L), adjudicated: end }, corruption: n.corruption ? { ...n.corruption, exposure: 0 } : n.corruption };

  const head = outcome === 'acquitted' ? `NOT GUILTY: ${name} acquitted` : outcome === 'dropped' ? `Charges against ${name} dropped` : verdict.death ? `${name} sentenced to death` : verdict.life ? `${name} sentenced to life in prison` : verdict.sentence ? `${name} sentenced to ${(verdict.sentence / 4).toFixed(1)} years` : `${name} found guilty, ${verdict.type === 'censure' ? 'censured' : 'fined'}`;
  const social = n.socialMedia ?? socialMediaSchema.parse({});
  n = { ...n,
    newsQueue: [...n.newsQueue, { h: head, sub: `${tierName[t.tier]} trial · ${t.charges.slice(0, 2).join(', ')}`, body: `${verdict.text} Strategy: ${STRATEGIES[strategy].name.toLowerCase()}.`, tag: 'scandal', subject: name, portrait: c.character.portrait, priority: 0 }],
    socialMedia: { ...social, reactionFeed: [
      { id: `verdict-${k.id}-tv`, date: end, about: 'Trial verdict', role: 'press' as const, author: 'Channel 7 Live', handle: '@ch7live', verified: true, text: `BREAKING from the courthouse: ${head}.`, likes: 120, reposts: 60, replies: 40, views: 5200 },
      { id: `verdict-${k.id}-press`, date: end, about: 'Trial verdict', role: 'press' as const, author: 'Capitol News Desk', handle: '@capitolnews', verified: true, text: verdict.text, likes: 60, reposts: 25, replies: 30, views: 3100 },
      ...(outcome !== 'convicted' || verdict.type !== 'prison' ? [{ id: `verdict-${k.id}-self`, date: end, about: 'Trial verdict', role: 'press' as const, author: name, handle: handleOf(c), verified: false, text: outcome === 'convicted' ? 'I accept the court\'s decision and will make this right.' : 'Justice was done today. Back to work.', likes: 50, reposts: 10, replies: 25, views: 1900 }] : []),
      ...social.reactionFeed.filter(p => !p.id.startsWith(`verdict-${k.id}-`))].slice(0, 30) },
    log: [verdict.text, ...n.log].slice(0, 30) };
  const closed: LegalCase = { ...k, stage: outcome === 'convicted' ? 'convicted' : 'acquitted', closed: end, stageSince: end, trial: { ...t, strategy, verdict }, history: [{ date: end, text: verdict.text }, ...k.history].slice(0, 20) };
  return { career: n, case: closed, notices: [`Court: ${verdict.text}`] };
}
