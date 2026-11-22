import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import { outstandingProjectAllocation } from './public-project-schema';
import { currentBudget, revenueBase, treasuryFunds, spendTreasury } from './budget';
import { dutyApproval } from './approval';
import { rand, usd } from './campaign';
import { activeOffice, evaluateSupport, policyNames, recordDecision, submitMeasure, tenureKey, type Policy, type Result } from './support';

export const isStateOffice = (c: Career) => ['stateLeg', 'governor'].includes(c.office?.id ?? '');
export function stateGovernment(c: Career): NonNullable<Career['stateGovernment']> {
  const year = Number(c.date.slice(0, 4));
  const s = c.stateGovernment?.tenure === tenureKey(c) ? c.stateGovernment : null;
  return s ? { ...s, year, spent: s.year === year ? s.spent : outstandingProjectAllocation(s.publicProjects) } : { publicProjects: [], tenure: tenureKey(c), year, spent: 0, priority: 'services', coalition: 0, officials: [], agencies: [], disaster: null, lastProcessed: '' };
}
export function stateFunds(c: Career) {
  const b = currentBudget(c);
  return Math.min(treasuryFunds(c), Math.max(0, Math.round(b.spending.infrastructure + b.spending.safety - stateGovernment(c).spent)));
}
export const stateCost = (c: Career, kind: 'bill' | 'appointment' | 'agency' | 'disaster') => Math.round(revenueBase(c) * ({ bill: 0.02, appointment: 0.01, agency: 0.08, disaster: 0.06 }[kind]));
export const stateOfficials = [
  { role: 'Health secretary', name: 'Morgan Chen', competence: 86, policy: 'services' as Policy },
  { role: 'Transportation secretary', name: 'Avery Patel', competence: 82, policy: 'environment' as Policy },
  { role: 'Emergency management director', name: 'Taylor Reed', competence: 92, policy: 'safety' as Policy },
];
const news = (c: Career, title: string, text: string): Career => ({ ...c, newsQueue: [...c.newsQueue, { h: `${c.character.name}: ${title}`, sub: c.office?.jurisdiction ?? c.character.state, body: text, tag: 'government', subject: c.character.name, portrait: c.character.portrait }] });

/** Executive-originated business enters the same persisted chamber stages as sponsored bills. */
export function stateMeasure(c: Career, kind: 'bill' | 'budget', policy: Policy = 'services'): Result {
  if (!activeOffice(c) || !isStateOffice(c) || (kind === 'bill' && c.office?.id !== 'governor')) return { ok: false, message: 'This state measure is not available to your office.' };
  if (kind === 'budget') {
    if (c.office?.id !== 'stateLeg') return { ok: false, message: 'Governors propose budgets through the public budget panel.' };
    const b = currentBudget(c);
    if (b.total > b.revenue) return { ok: false, message: 'The executive budget exceeds available state revenue.' };
    return submitMeasure(c, { title: 'Governor’s state budget', kind, policy: 'services', cost: 0, budget: { spending: b.spending, stance: b.stance } });
  }
  const cost = stateCost(c, 'bill');
  if (cost > stateFunds(c)) return { ok: false, message: 'Insufficient state allocation to review this funded bill.' };
  return submitMeasure(c, { title: `Legislature’s ${policyNames[policy]} bill`, kind, policy, cost });
}

/** Coalitions improve support but never alter seats or enact legislation; committees work a pending bill. */
export function stateLegislativeAction(c: Career, action: 'coalition' | 'committee', billId?: string): Result {
  if (!activeOffice(c) || !isStateOffice(c) || action === 'committee' && c.office?.id !== 'stateLeg') return { ok: false, message: 'That legislative action is not available to your office.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  const s = stateGovernment(c);
  if (action === 'coalition') {
    if (s.coalition >= 24) return { ok: false, message: 'Your state coalition is already fully organized.' };
    const message = 'State coalition organized: negotiated support +4, relationships +2; no bill passed.';
    return { ok: true, message, career: { ...c, actions: c.actions - ACTION_COST, relationships: Math.min(100, c.relationships + 2), stateGovernment: { ...s, coalition: Math.min(24, s.coalition + 4) }, log: [message, ...c.log].slice(0, 12) } };
  }
  const b = c.bills.find(b => b.tenure === tenureKey(c) && b.stage === 'under consideration' && (!billId || b.id === billId));
  if (!b) return { ok: false, message: 'Open consideration of a state bill or budget before holding committee hearings.' };
  if (b.boost >= 24) return { ok: false, message: 'This measure has completed its committee support work.' };
  const message = 'Committee hearing completed: measure support +4, knowledge +2; a chamber vote is still required.';
  return { ok: true, message, career: { ...c, actions: c.actions - ACTION_COST, skills: { ...c.skills, knowledge: Math.min(100, c.skills.knowledge + 2) }, bills: c.bills.map(x => x.id === b.id ? { ...x, boost: Math.min(24, x.boost + 4), history: [...x.history, { date: c.date, text: message }] } : x), log: [message, ...c.log].slice(0, 12) } };
}

export function governorAction(c: Career, action: 'priority' | 'appoint' | 'agency' | 'disaster', value = 'services'): Result {
  if (!activeOffice(c) || c.office?.id !== 'governor') return { ok: false, message: 'Only an active governor can take this action.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  let s = stateGovernment(c);
  const candidate = stateOfficials.find(o => o.role === value);
  if (action === 'priority' && (!(value in policyNames) || value === s.priority)) return { ok: false, message: 'Choose a different statewide priority.' };
  if (action === 'appoint' && (!candidate || s.officials.some(o => o.role === value))) return { ok: false, message: 'Choose an unfilled state appointment.' };
  if (action === 'agency' && s.agencies.some(a => a.status === 'active')) return { ok: false, message: 'Complete the active agency program first.' };
  if (action === 'disaster' && (!s.disaster || s.disaster.resolved)) return { ok: false, message: 'There is no unresolved state disaster.' };
  const cost = action === 'priority' ? 0 : action === 'disaster' ? s.disaster?.cost ?? 0 : stateCost(c, action === 'appoint' ? 'appointment' : 'agency');
  if (cost > stateFunds(c)) return { ok: false, message: `Insufficient state funds: ${usd(cost)} required; ${usd(stateFunds(c))} available.` };
  const policy = action === 'priority' ? value as Policy : action === 'disaster' ? 'safety' : candidate?.policy ?? s.priority;
  const title = action === 'priority' ? `Set statewide ${policyNames[policy]} priority` : action === 'appoint' ? `Confirm ${candidate?.name} as ${candidate?.role}` : action === 'agency' ? `${policyNames[s.priority]} agency program` : `Respond to ${s.disaster?.title}`;
  const support = evaluateSupport(c, policy, `${action}|${c.governmentDecisions.length}`);
  let n = recordDecision({ ...c, actions: c.actions - ACTION_COST }, title, support);
  if (support.outcome === 'pass') {
    const payment = spendTreasury(n, cost, `${title}|${c.date}|${c.governmentDecisions.length}`, title);
    if (!payment.ok) return payment;
    n = payment.career;
    s = { ...s, spent: s.spent + cost };
    if (action === 'priority') s.priority = policy;
    if (action === 'appoint' && candidate) s.officials = [...s.officials, { role: candidate.role, name: candidate.name, competence: candidate.competence }];
    if (action === 'agency') s.agencies = [...s.agencies, { id: `${c.date}|${s.agencies.length}`, title, cost, progress: 0, status: 'active', lastProcessed: c.date }];
    if (action === 'disaster' && s.disaster) s.disaster = { ...s.disaster, resolved: true };
    n = dutyApproval(n, action === 'disaster' ? 3 : 1, `${title}: legislature approved ${usd(cost)} in public commitments.`, [{ group: 'working', delta: 2 }, { group: 'business', delta: -1 }]);
  } else n = dutyApproval(n, -0.5, `${title}: ${support.outcome}; no state funds spent.`);
  const message = `${title}: ${support.outcome}; ${support.votes}/${support.seats} votes. ${support.outcome === 'pass' ? `${usd(cost)} public funds committed.` : 'Build a coalition and negotiate before trying again.'}`;
  n = news({ ...n, stateGovernment: s }, title, `${message} ${support.reasons.join(' ')}`);
  return { ok: true, message, career: { ...n, log: [message, ...n.log].slice(0, 12) } };
}

export function stateTurn(c: Career, end: string): Career {
  if (!activeOffice(c) || !isStateOffice(c) || c.office?.termEnd && end >= c.office.termEnd) return c;
  let s = stateGovernment(c);
  if (s.lastProcessed >= end) return c;
  let n = c;
  const competence = s.officials.reduce((sum, o) => sum + o.competence, 0) / Math.max(1, s.officials.length);
  s = { ...s, lastProcessed: end, agencies: s.agencies.map(a => {
    if (a.status === 'completed' || a.lastProcessed >= end) return a;
    const progress = Math.min(100, a.progress + 30 + Math.floor(competence / 10));
    if (progress === 100) {
      n = dutyApproval(n, 3, `${a.title} completed within its funded state allocation.`, [{ group: 'working', delta: 4 }, { group: 'environment', delta: 2 }]);
      n = news(n, `${a.title} completed`, `${usd(a.cost)} state investment delivered; services and employment improve.`);
      n = { ...n, log: [`${a.title} completed.`, ...n.log].slice(0, 12) };
    }
    return { ...a, progress, status: progress === 100 ? 'completed' as const : 'active' as const, lastProcessed: end };
  }) };
  if (s.disaster && !s.disaster.resolved) {
    const message = `${s.disaster.title} remains unresolved; statewide services suffer.`;
    n = dutyApproval(n, -2, message, [{ group: 'working', delta: -3 }, { group: 'seniors', delta: -3 }]);
    n = { ...n, log: [message, ...n.log].slice(0, 12) };
  }
  if ((!s.disaster || s.disaster.resolved) && rand(`${tenureKey(c)}|${end}|state-disaster`) < 0.3) {
    s.disaster = { id: end, title: 'Statewide flood disaster', cost: stateCost(c, 'disaster'), resolved: false };
    n = news(n, s.disaster.title, `${usd(s.disaster.cost)} in public emergency funding is needed; delay harms residents.`);
    n = { ...n, log: [`${s.disaster.title}: ${usd(s.disaster.cost)} response required.`, ...n.log].slice(0, 12) };
  }
  return { ...n, stateGovernment: s };
}