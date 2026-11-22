import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import type { Crisis } from './crisis-schema';
import { dutyApproval, type GroupDelta } from './approval';
import { revenueBase, treasuryFunds } from './budget';
import { officeFunds, commitOfficeFunds } from './office-events';
import { projectJurisdiction } from './public-projects';
import { tenureKey, type Result } from './support';
import { usd } from './campaign';
import { queueCrisisNews } from './crisis-news';

/** Phase 5: emergency spending per severity point, as a share of annual revenue (was 1%). */
export const EMERGENCY_COST_RATE = 0.025;
export type CrisisResponse = {
  id: string; label: string; cost: number; actions: number; capital: number;
  approval: number; groups: GroupDelta[]; duration: number;
  trajectory: Crisis['trajectory']; indicatorEffects: Crisis['indicatorEffects'];
  hint: string; disabled: boolean; unavailable: string;
};
export function officeCrises(c: Career): Crisis[] {
  const jurisdiction = projectJurisdiction(c);
  if (!jurisdiction) return [];
  return (c.crises ?? []).filter(p => p.jurisdiction === jurisdiction && (!p.tenure || p.tenure === tenureKey(c)) && p.turnCreated <= c.date);
}
export function crisisResponses(c: Career, id: string): CrisisResponse[] {
  const p = officeCrises(c).find(p => p.id === id);
  if (!p || p.status === 'resolved' || p.selectedResponseId !== null) return [];
  const executive = ['mayor', 'governor', 'president'].includes(c.office?.id ?? '');
  const cost = Math.round(revenueBase(c) * EMERGENCY_COST_RATE * p.severity);
  const indicator: keyof Crisis['indicatorEffects'] = ['utility_failure', 'project_failure', 'natural_disaster'].includes(p.type) ? 'infrastructure' : ['economic', 'worker_strike'].includes(p.type) ? 'employment' : 'services';
  const affected = indicator === 'infrastructure' ? 'suburban' : indicator === 'employment' ? 'labor' : 'seniors';
  const effects = (amount: number): Crisis['indicatorEffects'] => ({ services: 0, infrastructure: 0, employment: 0, [indicator]: amount });
  const raw = [
    { id: 'invest', label: 'High-investment intervention', cost, actions: 0, capital: 0, approval: 2, groups: [{ group: 'working', delta: 3 }, { group: affected, delta: 2 }, { group: 'business', delta: -2 }], duration: 1, trajectory: 'stabilizing' as const, indicatorEffects: effects(2), hint: `Approval +2; workers +3, ${affected} +2, business −2. ${indicator} +2; stabilizing · 1 quarter remaining.` },
    { id: 'targeted', label: 'Targeted assistance', cost: Math.round(cost * 0.4), actions: 0, capital: 0, approval: 0.5, groups: [{ group: 'working', delta: 1 }, { group: affected, delta: 1 }, { group: 'business', delta: -1 }], duration: 2, trajectory: 'contained' as const, indicatorEffects: effects(1), hint: `Approval +0.5; workers/${affected} +1, business −1. ${indicator} +1; contained · 2 quarters remaining.` },
    { id: 'delay', label: 'Fiscal restraint / delay', cost: 0, actions: 0, capital: 0, approval: -1.5, groups: [{ group: 'working', delta: -2 }, { group: affected, delta: -2 }, { group: 'business', delta: 1 }], duration: Math.min(8, p.durationRemaining + 1), trajectory: 'prolonged' as const, indicatorEffects: effects(0), hint: 'Approval −1.5; workers and affected residents −2, business +1. No service stabilization; crisis prolonged by 1 quarter.' },
    { id: 'negotiate', label: executive ? 'Oversight / negotiations' : 'Oversight hearing / negotiations', cost: 0, actions: 1, capital: 1, approval: 0.5, groups: [{ group: 'working', delta: 1 }, { group: 'business', delta: -0.5 }], duration: Math.max(2, p.durationRemaining), trajectory: 'negotiating' as const, indicatorEffects: effects(0), hint: '1 action and −1 political relationship. Approval +0.5; workers +1, business −0.5. Negotiations continue; no immediate indicator boost.' },
  ].filter(r => executive || r.cost === 0);
  return raw.map(r => {
    let unavailable = '';
    if (c.report || c.newspaperPending || c.pendingEvent || c.eventEncounter) unavailable = 'Finish the turn report and pending event first.';
    else if (r.cost > treasuryFunds(c)) unavailable = `${usd(r.cost)} required; ${usd(treasuryFunds(c))} available in government treasury.`;
    else if (r.cost > officeFunds(c)) unavailable = `${usd(r.cost)} required; ${usd(officeFunds(c))} available in public allocation.`;
    else if (c.actions < r.actions * ACTION_COST) unavailable = 'Not enough energy (15% needed).';
    else if (c.relationships < r.capital) unavailable = '1 political relationship required; none available.';
    return { ...r, disabled: !!unavailable, unavailable };
  });
}

/** Re-read live crisis/authority/funds before committing; selected response and
 * crisis-scoped treasury key prevent a retry or reload from paying/rewarding twice. */
export function respondToCrisis(c: Career, id: string, responseId: string): Result {
  const p = officeCrises(c).find(p => p.id === id);
  if (!p || p.status === 'resolved') return { ok: false, message: 'This crisis does not belong to your active office.' };
  if (p.selectedResponseId !== null) return { ok: false, message: 'A response to this crisis was already confirmed.' };
  const r = crisisResponses(c, id).find(r => r.id === responseId);
  if (!r || r.disabled) return { ok: false, message: r?.unavailable || 'Choose a response within your office authority.' };
  let n = c;
  if (r.cost) {
    n = commitOfficeFunds(c, r.cost, `crisis|${id}|response`);
    if (n === c) return { ok: false, message: 'This crisis expense cannot be paid or was already paid.' };
  }
  const message = `${p.title}: ${r.label} confirmed · ${usd(r.cost)} public cost. ${r.hint}`;
  n = dutyApproval(n, r.approval, message, r.groups);
  n = { ...n, actions: n.actions - r.actions * ACTION_COST, relationships: n.relationships - r.capital,
    crises: n.crises.map(item => item.id === id ? { ...item, tenure: tenureKey(c), selectedResponseId: r.id, durationRemaining: r.duration, trajectory: r.trajectory, indicatorEffects: r.indicatorEffects, responseDate: c.date } : item),
    log: [message, ...n.log].slice(0, 12) };
  if (r.id === 'invest' || r.id === 'delay') n = queueCrisisNews(n, id, 'response', c.date, message);
  return { ok: true, career: n, message };
}