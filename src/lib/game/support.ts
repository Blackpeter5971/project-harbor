import { ACTION_COST } from './energy-costs';
import { applyPolicyLoyalty } from './support-groups';
import type { Career } from './career';
import { rand } from './campaign';
import { ensureApproval } from './approval';

export type Bill = Career['bills'][number];
export type Policy = Bill['policy'];
export type Support = Career['governmentDecisions'][number]['support'];
export type Result = { ok: true; career: Career; message: string } | { ok: false; message: string };
export const tenureKey = (c: Career) => c.office ? `${c.office.id}|${c.office.jurisdiction}|${c.office.since}` : '';
export const activeOffice = (c: Career) => !!c.office && (!c.office.termEnd || c.date < c.office.termEnd);
const clamp = (v: number) => Math.max(0, Math.min(100, v));
export const policyNames: Record<Policy, string> = { services: 'Local services', business: 'Business & jobs', environment: 'Clean infrastructure', safety: 'Public safety' };

export function chamber(c: Career, chamberId = c.office?.id) {
  const seats = chamberId === 'house' || chamberId === 'president' ? 435 : chamberId === 'senate' ? 100 : chamberId === 'stateLeg' || chamberId === 'governor' ? 60 : 11;
  const party = c.office?.party ?? c.character.party;
  const share = party === 'Independent' ? 1 / seats : 0.35 + rand(`${c.character.state}|${c.office?.since}|${party}|seats`) * 0.3;
  const allies = Math.max(1, Math.round(seats * share));
  return { seats, allies, opposition: seats - allies, needed: Math.floor(seats / 2) + 1 };
}

/** One engine for bills, executive decisions, budgets and appointments. No unconditional successes. */
export function evaluateSupport(c: Career, policy: Policy, key: string, boost = 0, revision = 0, chamberId = c.office?.id): Support {
  const coalition = ['stateLeg', 'governor'].includes(c.office?.id ?? '') && c.stateGovernment?.tenure === tenureKey(c) ? c.stateGovernment.coalition : 0;
  boost += coalition;
  if (c.federalGovernment?.tenure === tenureKey(c) && ['house', 'senate', 'president'].includes(c.office?.id ?? '')) boost += c.federalGovernment.coalition;
  const a = ensureApproval(c).approval;
  const ch = chamber(c, chamberId);
  const party = c.office?.party ?? c.character.party;
  const fit = policy === 'business' ? (party === 'Republican' ? 12 : party === 'Democrat' ? -8 : 0)
    : policy === 'environment' || policy === 'services' ? (party === 'Democrat' ? 10 : party === 'Republican' ? -10 : 0) : 5;
  const publicOpinion = a?.overall ?? 40;
  const group = policy === 'business' ? 'business' : policy === 'environment' ? 'environment' : policy === 'safety' ? 'seniors' : 'working';
  const groupOpinion = a?.groups[group] ?? publicOpinion;
  const partyOpinion = party === 'Independent' ? (a?.independent ?? 40) : (a?.party ?? 40);
  const oppositionStrength = clamp(100 - publicOpinion + (100 - Math.min(100, c.relationships)) * 0.15);
  const allySupport = clamp(30 + partyOpinion * 0.35 + c.relationships * 0.16 + c.skills.leadership * 0.18 + fit + boost + revision * 4);
  const crossSupport = clamp(12 + publicOpinion * 0.2 + groupOpinion * 0.1 + c.relationships * 0.15 + c.skills.leadership * 0.18 - oppositionStrength * 0.18 + fit * 0.35 + boost + revision * 4);
  const volatility = (rand(`${tenureKey(c)}|${c.date}|${key}`) - 0.5) * 10;
  const score = clamp((allySupport * ch.allies + crossSupport * ch.opposition) / ch.seats + volatility);
  const votes = Math.round(ch.seats * score / 100);
  const outcome: Support['outcome'] = party !== 'Independent' && allySupport < 48 ? 'party opposition' : votes >= ch.needed ? 'pass' : score < 30 ? 'fail' : score < 39 ? 'delay' : score < 45 ? 'amend' : 'compromise';
  return { outcome, score: Math.round(score), votes, needed: ch.needed, seats: ch.seats, reasons: [
    `${party} coalition: ${ch.allies}/${ch.seats} seats; party support ${Math.round(partyOpinion)}%.`,
    `Relationships ${Math.round(c.relationships)} · leadership ${Math.round(c.skills.leadership)}.`,
    `Public approval ${Math.round(publicOpinion)}% · opposition strength ${Math.round(oppositionStrength)}%.`,
    `Policy fit ${fit > 0 ? '+' : ''}${fit}; ${group} voters ${Math.round(groupOpinion)}%; negotiated support +${boost}; revisions ${revision}.`,
    `${votes}/${ch.seats} projected votes; ${ch.needed} required.`
  ] };
}

export function recordDecision(c: Career, title: string, support: Support): Career {
  const message = `${title}: ${support.outcome} (${support.votes}/${support.seats}; ${support.needed} needed).`;
  return { ...c, governmentDecisions: [{ date: c.date, title, support }, ...c.governmentDecisions], log: [message, ...c.log].slice(0, 12) };
}

export function submitMeasure(c: Career, input: Pick<Bill, 'title' | 'kind' | 'policy' | 'cost'> & { budget?: Bill['budget'] }): Result {
  if (!activeOffice(c)) return { ok: false, message: 'You must hold an active public office.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  if (c.bills.some(b => b.tenure === tenureKey(c) && b.kind === input.kind && !['passed', 'rejected'].includes(b.stage))) return { ok: false, message: 'Resolve your pending measure of this type first.' };
  const id = `${tenureKey(c)}|${c.date}|${c.bills.length}`;
  const bill: Bill = { ...input, id, tenure: tenureKey(c), date: c.date, stage: 'proposed', revision: 0, boost: 0, attempts: 0, support: null, chamberVotes: [], budget: input.budget ?? null, history: [{ date: c.date, text: 'Proposed; no funds committed and no law enacted.' }] };
  const message = `${input.title} proposed. Committee consideration and a majority vote are required.`;
  return { ok: true, career: { ...applyPolicyLoyalty(c, input.policy, input.title), actions: c.actions - ACTION_COST, bills: [bill, ...c.bills], log: [message, ...c.log].slice(0, 12), newsQueue: [...c.newsQueue, { h: `${c.character.name} proposes ${input.title}`, sub: 'No vote yet — chamber review begins', body: `${message} ${c.office?.jurisdiction}.`, tag: 'government', subject: c.character.name, portrait: c.character.portrait }] }, message };
}