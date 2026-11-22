import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import type { Result } from './gameplay';
import { prisonOf, isExecuted } from './prison';
import { rand } from './campaign';
import { addCalendarMonths } from './conviction';
import { socialOf } from './relationships';
import { assignBusinessManager, injectFunds } from './business';

export const prisonActivities = [
  { id: 'exercise', name: 'Exercise / Yard Time', detail: '+6 health · +8 energy' },
  { id: 'study', name: 'Library / Self-Study', detail: '+2 knowledge · +10 legal knowledge' },
  { id: 'respect', name: 'Prison Community / Build Respect', detail: '+10 prison reputation · lower yard risk' },
  { id: 'appeal', name: 'Consult Lawyer / File Appeal', detail: 'Evidence review · one-quarter reduction if granted' },
] as const;
export type PrisonActivity = typeof prisonActivities[number]['id'];
export const APPEAL_MAX_NET_EVIDENCE = 60;
export function appealEligibility(c: Career) {
  const p = prisonOf(c);
  const k = c.legal?.cases.find(x => x.id === p?.caseId);
  if (!p || !k?.trial?.verdict || k.trial.verdict.type !== 'prison') return { eligible: false, chance: 0, reason: 'No convicted case is available for review.' };
  if (p.life || p.death) return { eligible: false, chance: 0, reason: 'This sentence requires a separate court review; routine sentence-reduction appeals are unavailable.' };
  if (p.quarters - p.served <= 1) return { eligible: false, chance: 0, reason: 'Your final quarter is already underway.' };
  if (k.strength - k.defense > APPEAL_MAX_NET_EVIDENCE) return { eligible: false, chance: 0, reason: 'The remaining evidence is too strong for a sentence-reduction appeal.' };
  return { eligible: true, chance: Math.min(0.7, 0.2 + p.legalKnowledge / 200 + k.defense / 500), reason: '' };
}
export function prisonActionLock(c: Career, key: string, revision: number): string | null {
  const p = prisonOf(c);
  if (!p || isExecuted(c)) return 'Prison actions are available only during custody.';
  if (c.report || c.newspaperPending || c.pendingEvent || c.eventEncounter) return 'Finish the turn report and newspaper first.';
  if (revision !== p.actionRevision) return 'This prison request is out of date or already processed.';
  if (c.actions < ACTION_COST) return 'No actions left this quarter.';
  if (p.activityTurn === c.date && p.activityUses.includes(key)) return 'Already completed this quarter.';
  return null;
}
const clamp = (n: number) => Math.max(0, Math.min(100, n));
function complete(c: Career, key: string, message: string): Result {
  const p = prisonOf(c), legal = c.legal;
  if (!p || !legal) return { ok: false, message: 'No active prison sentence.' };
  return { ok: true, message, career: { ...c, actions: c.actions - ACTION_COST, legal: { ...legal, prison: { ...p, actionRevision: p.actionRevision + 1, activityTurn: c.date,
    activityUses: [...(p.activityTurn === c.date ? p.activityUses : []), key], updates: [{ date: c.date, kind: 'prison' as const, text: message }, ...p.updates].slice(0, 16) } }, log: [message, ...c.log].slice(0, 30) } };
}
export function doPrisonActivity(c: Career, id: PrisonActivity, revision: number): Result {
  const lock = prisonActionLock(c, id, revision);
  if (lock) return { ok: false, message: lock };
  const p = prisonOf(c), legal = c.legal;
  if (!p || !legal) return { ok: false, message: 'No active prison sentence.' };
  if (!prisonActivities.some(a => a.id === id)) return { ok: false, message: 'Unknown prison activity.' };
  let n = c, message = '';
  if (id === 'exercise') {
    n = { ...c, health: clamp(c.health + 6), life: c.life ? { ...c.life, energy: clamp(c.life.energy + 8) } : c.life };
    message = `Yard time: health +${n.health - c.health}, energy +${(n.life?.energy ?? 0) - (c.life?.energy ?? 0)}.`;
  } else if (id === 'study') {
    n = { ...c, skills: { ...c.skills, knowledge: clamp(c.skills.knowledge + 2) }, legal: { ...legal, prison: { ...p, legalKnowledge: clamp(p.legalKnowledge + 10) } } };
    message = `Library study: knowledge +${n.skills.knowledge - c.skills.knowledge}, legal knowledge +${Math.min(10, 100 - p.legalKnowledge)}.`;
  } else if (id === 'respect') {
    n = { ...c, legal: { ...legal, prison: { ...p, prisonRep: clamp(p.prisonRep + 10) } } };
    message = `You helped the prison community: prison reputation +${Math.min(10, 100 - p.prisonRep)}.`;
  } else {
    const eligibility = appealEligibility(c);
    if (!eligibility.eligible) return { ok: false, message: eligibility.reason };
    const granted = rand(`${p.caseId}|${c.date}|sentence-appeal`) < eligibility.chance;
    message = granted ? 'Appeal granted: your sentence was shortened by one quarter.' : 'The court reviewed your evidence and denied the sentence reduction.';
    const cases = legal.cases.map(k => k.id === p.caseId ? { ...k, history: [{ date: c.date, text: message }, ...k.history] } : k);
    n = { ...c, legal: { ...legal, cases, prison: { ...p, quarters: p.quarters - (granted ? 1 : 0), release: granted ? addCalendarMonths(p.release, -3) : p.release } } };
  }
  return complete(n, id, message);
}
/** Existing family and allies only: never create a contact from numeric political stats. */
export function prisonCorrespondents(c: Career) {
  const s = socialOf(c);
  return [...s.contacts, ...(s.partner && !s.contacts.some(p => p.id === s.partner?.id) ? [s.partner] : [])]
    .filter(p => p.status !== 'estranged' && (p.status === 'family' || p.affinity >= 40));
}
export function sendPrisonLetter(c: Career, personId: string, revision: number): Result {
  const lock = prisonActionLock(c, 'outside-contact', revision);
  if (lock) return { ok: false, message: lock };
  const person = prisonCorrespondents(c).find(p => p.id === personId), life = c.life;
  if (!person || !life) return { ok: false, message: 'That person is not an available member of your existing circle.' };
  const social = socialOf(c);
  const update = (p: typeof person) => p.id === personId ? { ...p, affinity: clamp(p.affinity + 3), lastInteraction: c.date, neglect: 0 } : p;
  const n = { ...c, life: { ...life, stress: clamp(life.stress - 5), social: { ...social, contacts: social.contacts.map(update), partner: social.partner ? { ...social.partner, ...update(social.partner) } : null } } };
  return complete(n, 'outside-contact', `${person.name} replied to your letter. Your bond strengthened; stress eased.`);
}
export function prisonManager(c: Career, businessId: string, personId: string, revision: number): Result {
  const key = `manager:${businessId}`, lock = prisonActionLock(c, key, revision);
  if (lock) return { ok: false, message: lock };
  const result = assignBusinessManager(c, businessId, personId);
  return result.ok ? complete(result.career, key, result.message) : result;
}
export function prisonBusinessFunding(c: Career, businessId: string, amount: number, revision: number): Result {
  const key = `funding:${businessId}`, lock = prisonActionLock(c, key, revision);
  if (lock) return { ok: false, message: lock };
  if (!Number.isFinite(amount)) return { ok: false, message: 'Enter a finite amount.' };
  const result = injectFunds(c, businessId, amount);
  return result.ok ? complete(result.career, key, result.message) : result;
}