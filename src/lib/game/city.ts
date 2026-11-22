import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import { outstandingProjectAllocation } from './public-project-schema';
import { currentBudget, revenueBase, treasuryFunds, spendTreasury } from './budget';
import { dutyApproval } from './approval';
import { rand, usd } from './campaign';
import { activeOffice, evaluateSupport, recordDecision, tenureKey, type Policy, type Result } from './support';

export function cityState(c: Career): NonNullable<Career['city']> {
  const year = Number(c.date.slice(0, 4));
  const state = c.city?.tenure === tenureKey(c) ? c.city : null;
  return state ? { ...state, year, spent: state.year === year ? state.spent : outstandingProjectAllocation(state.publicProjects) } : { publicProjects: [], tenure: tenureKey(c), priority: 'services', spent: 0, year, officials: [], projects: [], emergency: null, lastProcessed: '' };
}
export function cityFunds(c: Career) {
  const state = cityState(c), budget = currentBudget(c);
  // Projects and emergencies draw from adopted infrastructure/safety allocations, not personal savings.
  return Math.min(treasuryFunds(c), Math.max(0, Math.round(budget.spending.infrastructure + budget.spending.safety - state.spent)));
}
/** Phase 5: neighborhood projects 12% and emergencies 10% of annual revenue (were 8% and 6%). */
export const cityCost = (c: Career, kind: 'project' | 'appointment' | 'emergency') => Math.round(revenueBase(c) * (kind === 'project' ? 0.12 : kind === 'appointment' ? 0.01 : 0.1));
export const officials = [
  { role: 'City manager', name: 'Jordan Ellis', competence: 85, policy: 'services' as Policy },
  { role: 'Public works director', name: 'Sam Rivera', competence: 78, policy: 'environment' as Policy },
  { role: 'Emergency director', name: 'Casey Brooks', competence: 90, policy: 'safety' as Policy },
];

export function mayorAction(c: Career, action: 'priority' | 'appoint' | 'project' | 'emergency' | 'negotiate', value = 'services'): Result {
  if (!activeOffice(c) || c.office?.id !== 'mayor') return { ok: false, message: 'Only an active mayor can take this action.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  let state = cityState(c);
  if (action === 'negotiate') {
    const message = 'Council negotiations built relationships and leadership; no measure was passed.';
    return { ok: true, career: { ...c, actions: c.actions - ACTION_COST, relationships: c.relationships + 4, skills: { ...c.skills, leadership: Math.min(100, c.skills.leadership + 1) }, log: [message, ...c.log].slice(0, 12) }, message };
  }
  const candidate = officials.find(o => o.role === value);
  const policies: Policy[] = ['services', 'business', 'environment', 'safety'];
  if (action === 'priority' && !policies.includes(value as Policy)) return { ok: false, message: 'Choose a city priority.' };
  if (action === 'appoint' && (!candidate || state.officials.some(o => o.role === value))) return { ok: false, message: 'Choose an unfilled appointment.' };
  if (action === 'emergency' && (!state.emergency || state.emergency.resolved)) return { ok: false, message: 'There is no unresolved emergency.' };
  if (action === 'project' && state.projects.some(p => p.status === 'active')) return { ok: false, message: 'Finish the active project first.' };
  const cost = action === 'priority' ? 0 : action === 'emergency' ? state.emergency?.cost ?? 0 : cityCost(c, action === 'appoint' ? 'appointment' : 'project');
  if (cost > cityFunds(c)) return { ok: false, message: `Insufficient public funds: ${usd(cost)} required; ${usd(cityFunds(c))} available.` };
  const policy = action === 'priority' ? value as Policy : candidate?.policy ?? (action === 'emergency' ? 'safety' : state.priority);
  const title = action === 'priority' ? `Set ${value} priority` : action === 'appoint' ? `Appoint ${candidate?.name}` : action === 'project' ? 'Launch neighborhood renewal project' : `Respond to ${state.emergency?.title}`;
  const support = evaluateSupport(c, policy, `${action}|${c.governmentDecisions.length}`);
  let n = recordDecision({ ...c, actions: c.actions - ACTION_COST }, title, support);
  if (support.outcome === 'pass') {
    const payment = spendTreasury(n, cost, `${title}|${c.date}|${c.governmentDecisions.length}`, title);
    if (!payment.ok) return payment;
    n = payment.career;
    state = { ...state, spent: state.spent + cost };
    if (action === 'priority') state.priority = policy;
    if (action === 'appoint' && candidate) state.officials = [...state.officials, { role: candidate.role, name: candidate.name, competence: candidate.competence }];
    if (action === 'project') state.projects = [...state.projects, { id: `${c.date}|${state.projects.length}`, title: 'Neighborhood renewal', cost, progress: 0, status: 'active', lastProcessed: c.date }];
    if (action === 'emergency' && state.emergency) state.emergency = { ...state.emergency, resolved: true };
    n = dutyApproval(n, action === 'emergency' ? 3 : 1, `${title} approved; public cost ${usd(cost)}.`, [{ group: 'working', delta: 2 }, { group: 'business', delta: -1 }]);
    n = { ...n, newsQueue: [...n.newsQueue, { h: `${c.character.name}: ${title}`, sub: `${support.votes}/${support.seats} council votes · ${usd(cost)} public cost`, body: support.reasons.join(' '), tag: 'government', subject: c.character.name, portrait: c.character.portrait }] };
  } else n = dutyApproval(n, -0.5, `${title}: ${support.outcome}; no public money spent.`);
  n.city = state;
  return { ok: true, career: n, message: `${title}: ${support.outcome}. ${support.outcome === 'pass' ? `${usd(cost)} public funds committed.` : 'Negotiate with the council before trying again.'}` };
}

export function cityTurn(c: Career, end: string): Career {
  if (!activeOffice(c) || !['mayor', 'council'].includes(c.office?.id ?? '')) return c;
  let state = cityState(c);
  if (state.lastProcessed >= end) return c;
  let n = c;
  const competence = state.officials.reduce((s, o) => s + o.competence, 0) / Math.max(1, state.officials.length);
  state = { ...state, lastProcessed: end, projects: state.projects.map(p => {
    if (p.status === 'completed' || p.lastProcessed >= end) return p;
    const progress = Math.min(100, p.progress + 35 + Math.floor(competence / 10));
    if (progress === 100) {
      n = dutyApproval(n, 3, `${p.title} completed within its funded allocation.`, [{ group: 'working', delta: 4 }, { group: 'environment', delta: 2 }]);
      n = { ...n, log: [`${p.title} completed.`, ...n.log].slice(0, 12), newsQueue: [...n.newsQueue, { h: `${c.character.name} delivers ${p.title}`, sub: 'City project completed', body: `The ${usd(p.cost)} project is complete; residents gain renewed public infrastructure.`, tag: 'government' }] };
    }
    return { ...p, progress, status: progress === 100 ? 'completed' as const : 'active' as const, lastProcessed: end };
  }) };
  if (state.emergency && !state.emergency.resolved) n = dutyApproval(n, -2, `${state.emergency.title} remains unresolved; residents blame city leadership.`, [{ group: 'working', delta: -3 }, { group: 'seniors', delta: -3 }]);
  if ((!state.emergency || state.emergency.resolved) && rand(`${tenureKey(c)}|${end}|crisis`) < 0.3) {
    state.emergency = { id: end, title: 'Water main emergency', cost: cityCost(c, 'emergency'), resolved: false };
    n = { ...n, log: [`Water main emergency: ${usd(state.emergency.cost)} response needed.`, ...n.log].slice(0, 12) };
  }
  return { ...n, city: state };
}