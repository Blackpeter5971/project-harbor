import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import { crimeSchema, type Arrest, type Crime, type CivilRecord } from './crime-schema';
import type { LegalCase } from './legal-schema';
import { legalSchema } from './legal-schema';
import { rand } from './campaign';
import { addCalendarMonths } from './conviction';
import { holdsOffice } from './approval';
import { isIncarcerated, PRISON_LOCK } from './prison';
import { jobs } from './job-market';
import { passesBackgroundCheck, unpardonedRecords } from './criminal-record';
import { prisonCorrespondents } from './prison-activities';

/**
 * Civilian street crime and fast-track justice. Pure, browser-safe.
 * Proceeds go to a separate street-cash stash (never personal, bank, campaign, business or the political
 * off-books reserve). Arrests open an intake that must be answered before time moves; arraignment sets one
 * of three custody states; a single deterministic verdict lands at arraignment (guilty plea) or the next
 * turn end. Custodial sentences reuse the existing legal case + Prison Mode records.
 */
export type CrimeId = Arrest['crimeId'];
export type Counsel = Arrest['counsel'];
export type Argument = NonNullable<Arrest['argument']>;
type Skill = keyof Career['skills'];
type Result = { ok: true; career: Career; message: string } | { ok: false; message: string };

export const CRIMES: Record<CrimeId, { name: string; blurb: string; min: number; max: number; risk: number; severity: CivilRecord['severity']; jurisdiction: CivilRecord['jurisdiction']; evidence: number; rep: number; heat: number; minRep: number; skill: Skill | null; charge: string; level: 1 | 2 | 3 | 4; fine: number }> = {
  petty_theft: { name: 'Petty Theft', blurb: 'Lift wallets and phones in a crowded market.', min: 300, max: 900, risk: 18, severity: 'misdemeanor', jurisdiction: 'state', evidence: 45, rep: 2, heat: 6, minRep: 0, skill: null, charge: 'Petty theft', level: 1, fine: 800 },
  street_fraud: { name: 'Street Fraud', blurb: 'Run a card-skimming con on distracted tourists.', min: 1500, max: 4000, risk: 28, severity: 'misdemeanor', jurisdiction: 'state', evidence: 55, rep: 4, heat: 10, minRep: 0, skill: 'communication', charge: 'Fraud by false pretenses', level: 2, fine: 2000 },
  burglary: { name: 'Burglary', blurb: 'Break into an empty suburban house after dark.', min: 4000, max: 12000, risk: 38, severity: 'felony', jurisdiction: 'state', evidence: 60, rep: 6, heat: 14, minRep: 5, skill: 'leadership', charge: 'Residential burglary', level: 3, fine: 3000 },
  smuggling: { name: 'Smuggling Run', blurb: 'Move untaxed cargo across the state line.', min: 10000, max: 30000, risk: 45, severity: 'felony', jurisdiction: 'federal', evidence: 70, rep: 8, heat: 18, minRep: 20, skill: 'knowledge', charge: 'Interstate smuggling', level: 4, fine: 8000 },
};
export const crimeIdList = Object.keys(CRIMES) as CrimeId[];
export const CIVIL_COUNSEL: Record<Counsel, { name: string; cost: number; defense: number }> = {
  none: { name: 'Represent yourself', cost: 0, defense: 0 },
  public: { name: 'Public defender', cost: 0, defense: 8 },
  private: { name: 'Private attorney', cost: 2_500, defense: 18 },
  firm: { name: 'Criminal defense firm', cost: 9_000, defense: 30 },
};
export const ARGUMENTS: Record<Argument, { name: string; note: string }> = {
  plead: { name: 'Plead guilty', note: 'Sentenced today at the arraignment with a lighter penalty. Certain conviction.' },
  contest: { name: 'Not guilty · challenge the evidence', note: 'Your counsel attacks the police case. Trial next turn.' },
  ties: { name: 'Not guilty · show community ties', note: 'Family, work and home lower your flight risk. Trial next turn.' },
};
export const SPEND_CAP = 5_000, SPEND_HEAT = 5, PREPARE_BONUS = 6;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
export const crimeOf = (c: Career): Crime => c.crime ?? crimeSchema.parse({});
export const activeArrest = (c: Career) => c.crime?.arrest ?? null;
export const custodyOf = (c: Career) => c.crime?.arrest?.custody ?? null;
const usesThisTurn = (k: Crime, date: string) => k.turn === date ? k.uses : [];

export function crimeRisk(c: Career, id: CrimeId): number {
  const d = CRIMES[id], k = crimeOf(c), skill = d.skill ? c.skills[d.skill] : 0;
  return Math.round(clamp(d.risk + k.heat * 0.35 - k.streetRep * 0.15 - skill * 0.1, 5, 85));
}
export const expectedPayout = (c: Career, id: CrimeId) => Math.round((CRIMES[id].min + CRIMES[id].max) / 2 * (1 + crimeOf(c).streetRep / 200) / 10) * 10;

/** Shared gate for every street request: a rendered request carries the revision it saw. */
export function streetLock(c: Career, revision: number): string | null {
  if (holdsOffice(c) || c.campaign) return 'Officeholders and candidates cannot run street jobs. Political misconduct lives under Politics → Backroom.';
  if (isIncarcerated(c)) return PRISON_LOCK;
  if (c.report || c.newspaperPending || c.pendingEvent || c.eventEncounter || c.debate) return 'Finish the turn report and any pending event first.';
  if (activeArrest(c)) return 'You face a pending criminal case. Street work is off the table until it is resolved.';
  if (revision !== crimeOf(c).revision) return 'This request is out of date or already processed.';
  return null;
}
export function crimeLock(c: Career, id: CrimeId, revision: number): string | null {
  const lock = streetLock(c, revision);
  if (lock) return lock;
  const d = CRIMES[id], k = crimeOf(c);
  if (!d) return 'Unknown opportunity.';
  if (k.streetRep < d.minRep) return `Needs ${d.minRep} street reputation.`;
  if (usesThisTurn(k, c.date).includes(id)) return 'Already attempted this quarter.';
  if (c.actions < ACTION_COST) return 'Not enough energy this turn.';
  return null;
}

export function commitCrime(c: Career, id: CrimeId, revision: number, roll?: number): Result {
  const lock = crimeLock(c, id, revision);
  if (lock) return { ok: false, message: lock };
  const d = CRIMES[id], k = crimeOf(c), seed = `${c.character.name}|${c.date}|crime|${revision}|${id}`;
  const risk = crimeRisk(c, id), r = roll ?? rand(seed);
  const take = Math.round((d.min + (d.max - d.min) * rand(`${seed}|take`)) * (1 + k.streetRep / 200) / 10) * 10;
  const base: Crime = { ...k, revision: k.revision + 1, turn: c.date, uses: [...usesThisTurn(k, c.date), id], spent: k.turn === c.date ? k.spent : 0, heat: clamp(k.heat + d.heat) };
  const attemptId = `crime|${c.date}|${revision}`;
  if (r >= risk / 100) {
    const message = `${d.name} paid off: +${usd(take)} street cash, +${d.rep} street reputation.`;
    const crime: Crime = { ...base, stash: k.stash + take, streetRep: clamp(k.streetRep + d.rep), attempts: [{ id: attemptId, date: c.date, crimeId: id, outcome: 'success' as const, payout: take }, ...k.attempts].slice(0, 20) };
    return { ok: true, message, career: { ...c, actions: c.actions - ACTION_COST, crime, log: [message, ...c.log].slice(0, 30) } };
  }
  const arrest: Arrest = { id: `arrest|${c.date}|${revision}`, date: c.date, crimeId: id, charge: d.charge, loss: take, evidence: Math.round(clamp(d.evidence + k.heat / 4)), stage: 'intake', counsel: 'none', argument: null, defense: 0, flightRisk: 0, custody: null, bail: 0, bailPosted: false, trialDate: '', preparedTurn: '', contactTurn: '' };
  const message = `Police caught you mid-${d.name.toLowerCase()}. You are under arrest for ${d.charge.toLowerCase()}.`;
  const crime: Crime = { ...base, arrest, attempts: [{ id: attemptId, date: c.date, crimeId: id, outcome: 'arrested' as const, payout: 0 }, ...k.attempts].slice(0, 20) };
  return { ok: true, message, career: { ...c, actions: c.actions - ACTION_COST, crime, log: [message, ...c.log].slice(0, 30) } };
}

/** Street cash may be spent into personal funds, capped per quarter; conspicuous spending draws heat. */
export function spendStreetCash(c: Career, amount: number, revision: number): Result {
  const lock = streetLock(c, revision);
  if (lock) return { ok: false, message: lock };
  const k = crimeOf(c), spent = k.turn === c.date ? k.spent : 0;
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: 'Enter a positive amount.' };
  const value = Math.round(amount);
  if (value > k.stash) return { ok: false, message: `You only hold ${usd(k.stash)} in street cash.` };
  if (spent + value > SPEND_CAP) return { ok: false, message: `Spending more than ${usd(SPEND_CAP)} of street cash in one quarter draws attention (${usd(SPEND_CAP - spent)} left).` };
  const message = `Spent ${usd(value)} of street cash on personal expenses. Police heat +${SPEND_HEAT}.`;
  return { ok: true, message, career: { ...c, money: c.money + value, ledger: [{ month: c.date, label: 'Street cash spent (untraced)', amount: value }, ...c.ledger],
    crime: { ...k, stash: k.stash - value, spent: spent + value, turn: c.date, uses: usesThisTurn(k, c.date), heat: clamp(k.heat + SPEND_HEAT), revision: k.revision + 1 } } };
}

export function flightRisk(c: Career, a: Arrest, argument: Argument | null): number {
  const priors = unpardonedRecords(c).length, social = c.life?.social;
  const family = !!social?.partner || (social?.dependents.length ?? 0) > 0;
  return Math.round(clamp(20 + (c.job ? 0 : 15) + (c.housing?.status === 'owning' ? 0 : 5) + (family ? 0 : 10) + priors * 15
    + (CRIMES[a.crimeId].jurisdiction === 'federal' ? 20 : 0) + (crimeOf(c).stash > 10_000 ? 10 : 0) - (argument === 'ties' ? 20 : 0)));
}
/** Deterministic custody ruling from severity, flight risk and counsel. */
export function custodyRuling(c: Career, a: Arrest, counsel: Counsel, argument: Argument) {
  const level = CRIMES[a.crimeId].level, flight = flightRisk(c, a, argument);
  const score = level * 15 + flight * 0.6 - (counsel === 'firm' ? 6 : counsel === 'private' ? 3 : 0);
  const bail = Math.round((level * 1500 + flight * 40) / 100) * 100;
  const custody = score >= 70 ? 'remand' as const : score >= 45 ? 'police' as const : 'bail' as const;
  return { custody, bail: custody === 'bail' ? bail : 0, flight, score: Math.round(score) };
}
export const custodyName = { remand: 'Remanded in prison', police: 'Police custody', bail: 'Bail · awaiting trial at home' } as const;

/** The intake + arraignment: hire counsel, enter a plea/argument, and receive custody (or an immediate sentence). */
export function arraign(c: Career, counsel: Counsel, argument: Argument, revision: number): Result {
  const k = crimeOf(c), a = k.arrest;
  if (!a || a.stage !== 'intake') return { ok: false, message: 'There is no arrest awaiting arraignment.' };
  if (revision !== k.revision) return { ok: false, message: 'This request is out of date or already processed.' };
  const t = CIVIL_COUNSEL[counsel];
  if (!t || !ARGUMENTS[argument]) return { ok: false, message: 'Choose counsel and a plea.' };
  if (c.money < t.cost) return { ok: false, message: `${t.name} needs a ${usd(t.cost)} retainer from personal funds.` };
  let n: Career = t.cost ? { ...c, money: c.money - t.cost, ledger: [{ month: c.date, label: `Legal counsel · ${t.name}`, amount: -t.cost }, ...c.ledger] } : c;
  const defense = clamp(t.defense + (argument === 'contest' ? (counsel === 'none' ? 3 : 8) : 0));
  const arraigned: Arrest = { ...a, stage: 'arraigned', counsel, argument, defense };
  if (argument === 'plead') {
    const r = resolveCase({ ...n, crime: { ...k, arrest: arraigned, revision: k.revision + 1 } }, arraigned, c.date, true);
    return { ok: true, career: r.career, message: r.notices[0] ?? 'Sentenced at arraignment.' };
  }
  const ruling = custodyRuling(n, a, counsel, argument);
  let custody = ruling.custody, bailPosted = false, note = '';
  if (custody === 'bail') {
    if (n.money >= ruling.bail) { bailPosted = true; n = { ...n, money: n.money - ruling.bail, ledger: [{ month: c.date, label: 'Bail posted (refundable)', amount: -ruling.bail }, ...n.ledger] }; }
    else { custody = 'police'; note = ` You could not post ${usd(ruling.bail)} bail.`; }
  }
  const trialDate = addCalendarMonths(c.date, 3);
  const final: Arrest = { ...arraigned, flightRisk: ruling.flight, custody, bail: ruling.bail, bailPosted, trialDate };
  const message = custody === 'remand' ? `Arraignment: remanded in prison without bail (flight risk ${ruling.flight}). Trial at the end of this turn.`
    : custody === 'police' ? `Arraignment: held in police custody until trial at the end of this turn.${note}`
    : `Arraignment: released on ${usd(ruling.bail)} bail. You are free at home until trial at the end of this turn.`;
  return { ok: true, message, career: { ...n, crime: { ...k, arrest: final, revision: k.revision + 1 }, log: [message, ...n.log].slice(0, 30) } };
}

/** One counsel session per quarter in any custody state — a limited civilian action. */
export function prepareDefense(c: Career, revision: number): Result {
  const k = crimeOf(c), a = k.arrest;
  if (!a || a.stage !== 'arraigned') return { ok: false, message: 'There is no case awaiting trial.' };
  if (revision !== k.revision) return { ok: false, message: 'This request is out of date or already processed.' };
  if (a.counsel === 'none') return { ok: false, message: 'You have no lawyer to prepare with.' };
  if (a.preparedTurn === c.date) return { ok: false, message: 'Your lawyer already prepared with you this quarter.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  const message = `Defense prepared with your ${CIVIL_COUNSEL[a.counsel].name.toLowerCase()}: defense +${PREPARE_BONUS}.`;
  return { ok: true, message, career: { ...c, actions: c.actions - ACTION_COST, crime: { ...k, revision: k.revision + 1, arrest: { ...a, defense: clamp(a.defense + PREPARE_BONUS), preparedTurn: c.date } } } };
}

export const civilConvictionChance = (a: Arrest) => Math.max(0.08, Math.min(0.92, (a.evidence - a.defense - 10) / 60 + 0.2));
const legalCounsel: Record<Counsel, LegalCase['counsel']> = { none: 'none', public: 'public', private: 'firm', firm: 'elite' };

/** Writes the single verdict. `plea` sentences at the arraignment; otherwise the turn-end trial decides. */
export function resolveCase(c: Career, a: Arrest, date: string, plea: boolean): { career: Career; notices: string[] } {
  const d = CRIMES[a.crimeId], k = crimeOf(c), name = c.character.name;
  if (k.arrest?.id !== a.id || k.arrest.stage !== 'arraigned') return { career: c, notices: [] };
  const convicted = plea || rand(`${a.id}|verdict`) < civilConvictionChance(a);
  let n: Career = c;
  if (a.bailPosted) n = { ...n, money: n.money + a.bail, ledger: [{ month: date, label: 'Bail refunded', amount: a.bail }, ...n.ledger] };
  const custodyLabel = plea ? 'Arraignment plea' : a.custody ? custodyName[a.custody] : 'Arraignment';
  if (!convicted) {
    const dismissed = a.evidence - a.defense < 20;
    const result = dismissed ? 'Charges dismissed' : 'Acquitted';
    const text = `${result}: the ${d.charge.toLowerCase()} case against ${name} ended without a conviction.`;
    n = { ...n, crime: { ...k, arrest: null, cases: [{ id: a.id, date, charge: d.charge, custody: custodyLabel, result }, ...k.cases].slice(0, 10) }, log: [text, ...n.log].slice(0, 30) };
    return { career: n, notices: [`Court: ${text}`] };
  }
  const priors = unpardonedRecords(c).length, net = a.evidence - a.defense, felony = d.severity === 'felony';
  let sentence = felony ? (d.level === 3 ? 2 + priors : 4 + 2 * priors) : (priors > 0 || net >= 45 ? 1 : 0);
  if (plea) sentence = felony ? Math.max(1, Math.floor(sentence / 2)) : 0;
  const fine = Math.round(d.fine * (plea ? 0.7 : 1)), restitution = a.crimeId === 'smuggling' ? 0 : a.loss;
  const due = fine + restitution, paid = Math.min(Math.max(0, n.money), due), owed = due - paid, seized = k.stash;
  const custodial = sentence > 0, credit = custodial && a.custody === 'remand' && !plea ? 1 : 0;
  const legal = n.legal ?? legalSchema.parse({});
  const sentenceText = custodial ? `${sentence} quarter${sentence === 1 ? '' : 's'} in custody${credit ? ' (one quarter credited for time on remand)' : ''}` : 'no custody';
  const text = `${name} convicted of ${d.charge.toLowerCase()} (${d.severity}): fined ${usd(fine)}${restitution ? `, ${usd(restitution)} restitution` : ''}${seized ? `, ${usd(seized)} street cash seized` : ''}; ${sentenceText}.`;
  const record: CivilRecord = { id: a.id, date, crimeId: a.crimeId, charge: d.charge, severity: d.severity, jurisdiction: d.jurisdiction, outcome: custodial ? 'prison' : 'fined', sentence, fine, restitution, pardoned: false, pardonDate: '' };
  const restPaid = Math.min(paid, restitution), finePaid = paid - restPaid;
  n = { ...n, money: n.money - paid, reputation: Math.max(0, n.reputation - (felony ? 5 : 2)), ledger: [
    ...(finePaid ? [{ month: date, label: 'Court fine', amount: -finePaid }] : []),
    ...(restPaid ? [{ month: date, label: 'Court-ordered restitution', amount: -restPaid }] : []), ...n.ledger] };
  const notices = [`Court: ${text}`];
  let nextLegal = { ...legal, owed: legal.owed + owed };
  if (custodial) {
    const caseId = `civil|${a.id}`, tier = felony ? 'felony' as const : 'minor' as const, left = sentence - credit;
    const legalCase: LegalCase = { id: caseId, opened: a.date, stage: 'convicted', strength: a.evidence, counsel: legalCounsel[a.counsel], defense: a.defense, role: 'citizen', stageSince: date, delays: 0, contestTurn: '', closed: date,
      history: [{ date, text }, { date: a.date, text: `Arrested for ${d.charge.toLowerCase()}; ${custodyLabel.toLowerCase()}.` }],
      trial: { courtDate: date, tier, charges: [d.charge], strategy: plea ? 'plea' : 'fight', verdict: { type: 'prison', date, fine, restitution, confiscated: seized, sentence, life: false, death: false, removed: false, text } } };
    nextLegal = { ...nextLegal, cases: [legalCase, ...nextLegal.cases].slice(0, 10) };
    if (left <= 0) {
      nextLegal = { ...nextLegal, served: [...nextLegal.served, { caseId, since: a.date, released: date, quarters: sentence, felony, pardoned: false }] };
      notices.push('Released with time served on remand.');
    } else {
      nextLegal = { ...nextLegal, prison: { caseId, since: date, quarters: sentence, release: addCalendarMonths(date, left * 3), life: false, served: credit, crime: d.charge, tier: felony ? 'Felony' : 'Misdemeanor', prisonRep: 10, death: false, executionDate: '', succession: '', legalKnowledge: 0, actionRevision: 0, activityTurn: '', activityUses: [], lastTurn: date,
        updates: [{ date, kind: 'prison' as const, text: `You were processed into the state penitentiary for ${d.charge.toLowerCase()}. ${left} quarter${left === 1 ? '' : 's'} to serve.` }] } };
      notices.push(`Prison: ${left} quarter${left === 1 ? '' : 's'} left to serve.`);
    }
  }
  const job = n.job ? jobs.find(j => j.id === n.job?.id) : undefined;
  const fired = !!n.job && (custodial && !!nextLegal.prison || (job && !passesBackgroundCheck({ ...n, crime: { ...k, records: [record, ...k.records] } }, job.sector, job.tier)));
  if (fired) notices.push(custodial && nextLegal.prison ? 'Employment: your employer ended your job after the custodial sentence.' : `Employment: ${job?.title ?? 'your employer'} dismissed you after the conviction failed its background check.`);
  n = { ...n, job: fired ? null : n.job, legal: nextLegal,
    crime: { ...k, stash: 0, arrest: null, records: [record, ...k.records], cases: [{ id: a.id, date, charge: d.charge, custody: custodyLabel, result: custodial ? `Convicted · ${sentence} quarter${sentence === 1 ? '' : 's'}` : 'Convicted · fine + restitution' }, ...k.cases].slice(0, 10) },
    newsQueue: [...n.newsQueue, { h: `${name} ${custodial ? `jailed for ${d.charge.toLowerCase()}` : `fined for ${d.charge.toLowerCase()}`}`, sub: `Fast-track ${d.jurisdiction === 'federal' ? 'federal' : 'county'} court`, body: text, tag: 'local', subject: name, priority: 2 }],
    log: [text, ...n.log].slice(0, 30) };
  return { career: n, notices };
}

/** Once per quarter end: heat cools and a scheduled civilian trial returns its verdict. */
export function crimeTurn(c: Career, end: string): { career: Career; notices: string[] } {
  const k = c.crime;
  if (!k || k.lastTurn >= end) return { career: c, notices: [] };
  let n: Career = { ...c, crime: { ...k, lastTurn: end, heat: clamp(k.heat - 10) } };
  const a = k.arrest;
  if (a && a.stage === 'arraigned' && a.trialDate && a.trialDate <= end) return resolveCase(n, a, end, false);
  return { career: n, notices: [] };
}

export type CrimeRequest =
  | { type: 'commit'; id: CrimeId; revision: number }
  | { type: 'spend'; amount: number; revision: number }
  | { type: 'arraign'; counsel: Counsel; argument: Argument; revision: number }
  | { type: 'prepare'; revision: number }
  | { type: 'contact'; personId: string; revision: number };
export function crimeAction(c: Career, r: CrimeRequest): Result {
  if (r.type === 'commit') return commitCrime(c, r.id, r.revision);
  if (r.type === 'spend') return spendStreetCash(c, r.amount, r.revision);
  if (r.type === 'arraign') return arraign(c, r.counsel, r.argument, r.revision);
  if (r.type === 'prepare') return prepareDefense(c, r.revision);
  if (r.type === 'contact') {
    const k = crimeOf(c), a = k.arrest, person = prisonCorrespondents(c).find(p => p.id === r.personId);
    if (!a || a.stage !== 'arraigned' || !person || r.revision !== k.revision || a.contactTurn === c.date || c.actions < ACTION_COST) return { ok: false, message: 'A custody letter is unavailable or already sent this quarter.' };
    return { ok: true, message: `${person.name} received your letter. Stress eased.`, career: { ...c, actions: c.actions - ACTION_COST, life: c.life ? { ...c.life, stress: clamp(c.life.stress - 5) } : c.life, crime: { ...k, revision: k.revision + 1, arrest: { ...a, contactTurn: c.date } } } };
  }
  return { ok: false, message: 'Unknown request.' };
}
