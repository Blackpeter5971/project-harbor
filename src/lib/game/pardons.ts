import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import type { Result } from './gameplay';
import { crimeOf } from './crime';
import { criminalRecord } from './criminal-record';
import { rand } from './campaign';

/** Executive clemency changes sentence/clearance flags, never erases a conviction or refunds penalties. */
export function pardonEligibility(c: Career, target: string) {
  const record = criminalRecord(c).find(r => r.id === target && !r.pardoned);
  const caseId = record?.source === 'civil' ? `civil|${target}` : target;
  const p = c.legal?.prison?.caseId === caseId ? c.legal.prison : null;
  const civil = c.crime?.records.find(r => r.id === target);
  const trial = c.legal?.cases.find(k => k.id === caseId);
  const authority = civil?.jurisdiction === 'federal' || trial?.trial?.tier === 'high_felony' ? 'President' as const : 'Governor' as const;
  const connections = Math.min(0.25, (c.contacts + c.relationships) / 200);
  const conduct = p ? Math.min(0.2, p.prisonRep / 500) : 0.1;
  const merit = Math.min(0.2, (p?.legalKnowledge ?? 0) / 500 + (trial?.defense ?? 0) / 500);
  const chance = Math.min(0.8, 0.15 + connections + conduct + merit);
  const repeated = crimeOf(c).petitions.some(x => x.target === target && x.date === c.date);
  const reason = !record ? 'No unpardoned conviction selected.' : c.legal?.executed ? 'This career has ended.' : c.crime?.arrest ? 'Resolve the pending arrest before petitioning.' : c.report || c.newspaperPending || c.pendingEvent || c.eventEncounter ? 'Finish the turn first.' : repeated ? 'Already petitioned for this conviction this quarter.' : c.actions < ACTION_COST ? 'No actions left this quarter.' : '';
  return { eligible: !reason, reason, authority, chance, caseId, p, record };
}

export type PardonRequest = { target: string; revision: number };
export function petitionPardon(c: Career, request: PardonRequest, roll?: number): Result {
  const k = crimeOf(c), e = pardonEligibility(c, request.target);
  if (request.revision !== k.revision) return { ok: false, message: 'This petition was already processed or is out of date.' };
  if (!e.eligible || !e.record) return { ok: false, message: e.reason };
  const granted = (roll ?? rand(`${c.character.name}|${request.target}|${c.date}|pardon`)) < e.chance;
  const message = granted ? `${e.authority} granted your pardon for ${e.record.charge}. ${e.p ? 'Your sentence is cleared; you return to civilian life. ' : ''}The conviction remains recorded as pardoned.` : `${e.authority} denied your pardon petition for ${e.record.charge}.`;
  let legal = c.legal;
  if (granted && legal) {
    const served = legal.served.map(s => s.caseId === e.caseId ? { ...s, pardoned: true } : s);
    if (e.p) served.push({ caseId: e.caseId, since: e.p.since, released: c.date, quarters: e.p.served, felony: e.record.severity === 'felony', pardoned: true });
    else if (e.record.source === 'court' && !served.some(s => s.caseId === e.caseId)) served.push({ caseId: e.caseId, since: e.record.date, released: c.date, quarters: 0, felony: e.record.severity === 'felony', pardoned: true });
    legal = { ...legal, prison: e.p ? null : legal.prison, served };
  }
  return { ok: true, message, career: { ...c, actions: c.actions - ACTION_COST, legal,
    crime: { ...k, revision: k.revision + 1, records: k.records.map(r => granted && r.id === request.target ? { ...r, pardoned: true, pardonDate: c.date } : r),
      petitions: [...k.petitions, { id: `pardon|${request.target}|${c.date}`, date: c.date, target: request.target, authority: e.authority, chance: e.chance, granted }] },
    newsQueue: granted ? [...c.newsQueue, { h: `${c.character.name} granted executive pardon`, sub: e.authority, body: message, tag: 'local', subject: c.character.name }] : c.newsQueue,
    log: [message, ...c.log].slice(0, 30) } };
}