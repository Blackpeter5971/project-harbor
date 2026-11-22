import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import { outstandingProjectAllocation } from './public-project-schema';
import { currentBudget, revenueBase, treasuryFunds, spendTreasury } from './budget';
import { dutyApproval } from './approval';
import { usd } from './campaign';
import { activeOffice, evaluateSupport, recordDecision, submitMeasure, tenureKey, type Policy, type Result } from './support';

export const isFederal = (c: Career) => ['house', 'senate', 'president'].includes(c.office?.id ?? '');
export function federalState(c: Career): NonNullable<Career['federalGovernment']> {
  const year = Number(c.date.slice(0, 4));
  const s = c.federalGovernment?.tenure === tenureKey(c) ? c.federalGovernment : null;
  return s ? { ...s, year, spent: s.year === year ? s.spent : outstandingProjectAllocation(s.publicProjects) } : { publicProjects: [], tenure: tenureKey(c), year, spent: 0, coalition: 0, diplomacy: 40, nominations: [], orders: [] };
}
export const federalFunds = (c: Career) => Math.min(treasuryFunds(c), Math.max(0, Math.round(currentBudget(c).spending.infrastructure + currentBudget(c).spending.safety - federalState(c).spent)));
export const federalOfficials = [
  { role: 'Secretary of State', name: 'Alex Monroe', competence: 88, policy: 'safety' as Policy },
  { role: 'Treasury Secretary', name: 'Jamie Brooks', competence: 90, policy: 'business' as Policy },
  { role: 'Health Secretary', name: 'Robin Hayes', competence: 86, policy: 'services' as Policy },
];
export const executiveOrders = [
  { id: 'transparency', title: 'Agency transparency directive', authority: 'Existing executive-branch records and management authority; no new law or appropriation.', fraction: 0, policy: 'services' as Policy },
  { id: 'preparedness', title: 'Emergency preparedness directive', authority: 'Existing emergency-management authority within the adopted safety appropriation.', fraction: 0.01, policy: 'safety' as Policy },
  { id: 'newtax', title: 'Create a new tax by decree', authority: 'Unlawful: taxation requires legislation passed by Congress.', fraction: 0, policy: 'business' as Policy },
  { id: 'unfunded', title: 'Spend without an appropriation', authority: 'Unlawful: Congress must authorize and appropriate new spending.', fraction: 0.5, policy: 'services' as Policy },
] as const;
const publish = (c: Career, title: string, message: string): Career => ({ ...c, log: [message, ...c.log].slice(0, 12), newsQueue: [...c.newsQueue, { h: `${c.character.name}: ${title}`, sub: message, body: message, tag: 'government', subject: c.character.name, portrait: c.character.portrait }] });

export function federalMeasure(c: Career, kind: 'budget' | 'district' | 'bill', policy: Policy = 'services'): Result {
  if (!activeOffice(c) || !isFederal(c)) return { ok: false, message: 'Only a federal officeholder can bring congressional business forward.' };
  if (kind === 'budget') {
    if (c.office?.id === 'president') return { ok: false, message: 'Propose the presidential budget through the budget panel.' };
    const b = currentBudget(c);
    if (b.total > b.revenue) return { ok: false, message: 'The congressional spending plan exceeds available federal revenue.' };
    return submitMeasure(c, { title: 'Congressional budget negotiation', kind: 'budget', policy: 'services', cost: 0, budget: { spending: b.spending, stance: b.stance } });
  }
  if (kind === 'district' && c.office?.id !== 'house') return { ok: false, message: 'District funding requests are available to representatives.' };
  if (kind === 'bill' && c.office?.id !== 'president') return { ok: false, message: 'Legislators sponsor bills in the legislative panel.' };
  const cost = Math.round(revenueBase(c) * 0.02);
  if (cost > federalFunds(c)) return { ok: false, message: 'Insufficient public allocation for the requested funding.' };
  return submitMeasure(c, { title: kind === 'district' ? `${c.office?.jurisdiction} district infrastructure funding` : 'Congressional public services bill', kind: kind === 'district' ? 'services' : 'bill', policy, cost });
}

export function federalAction(c: Career, action: 'deal' | 'nominate' | 'confirm' | 'block' | 'order' | 'diplomacy', value = ''): Result {
  if (!activeOffice(c) || !isFederal(c)) return { ok: false, message: 'You hold no active federal office.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  let s = federalState(c);
  if (action === 'deal') {
    if (s.coalition >= 24) return { ok: false, message: 'The bipartisan coalition is fully organized.' };
    const message = 'Bipartisan deal: negotiated support +4, relationships +2; Congress still must vote.';
    return { ok: true, message, career: { ...c, actions: c.actions - ACTION_COST, relationships: Math.min(100, c.relationships + 2), federalGovernment: { ...s, coalition: Math.min(24, s.coalition + 4) }, log: [message, ...c.log].slice(0, 12) } };
  }
  if (action === 'nominate') {
    if (!['president', 'senate'].includes(c.office?.id ?? '')) return { ok: false, message: 'Representatives cannot nominate or confirm executive officials.' };
    const candidate = federalOfficials.find(o => o.role === value);
    if (!candidate || s.nominations.some(o => o.role === value && o.status !== 'rejected')) return { ok: false, message: 'Choose an unfilled nomination.' };
    s = { ...s, nominations: [...s.nominations, { ...candidate, id: `${s.tenure}|${c.date}|${s.nominations.length}`, status: 'nominated', support: null }] };
    const message = c.office?.id === 'senate' ? `President submitted ${candidate.name}; Senate review opened. No confirmation yet.` : `${candidate.name} nominated as ${candidate.role}; Senate confirmation required.`;
    return { ok: true, message, career: publish({ ...c, actions: c.actions - ACTION_COST, federalGovernment: s }, 'Executive nomination submitted', message) };
  }
  if (action === 'confirm' || action === 'block') {
    if (!['president', 'senate'].includes(c.office?.id ?? '')) return { ok: false, message: 'Only Senate confirmation business is available here.' };
    const nominee = s.nominations.find(o => o.id === value && o.status === 'nominated');
    if (!nominee) return { ok: false, message: 'There is no pending nomination.' };
    if (action === 'block' && c.office?.id !== 'senate') return { ok: false, message: 'The President cannot cast a Senate blocking vote.' };
    const support = evaluateSupport(c, nominee.policy, `${value}|confirmation`, 0, 0, 'senate');
    const confirmed = action === 'confirm' && support.outcome === 'pass';
    const cost = confirmed ? Math.round(revenueBase(c) * 0.01) : 0;
    if (cost > federalFunds(c)) return { ok: false, message: 'The adopted public allocation cannot cover this appointment.' };
    const payment = spendTreasury(c, cost, `nomination|${value}`, `Confirmation: ${nominee.name}`);
    if (!payment.ok) return payment;
    s = { ...s, spent: s.spent + cost, nominations: s.nominations.map(o => o.id === value ? { ...o, status: confirmed ? 'confirmed' : 'rejected', support } : o) };
    const message = `${nominee.name}: ${confirmed ? 'Senate confirmed' : action === 'block' ? 'Senate blocked nomination' : `Senate ${support.outcome}; nomination rejected`}. ${support.votes}/100 projected votes, 51 required; public cost ${usd(cost)}.`;
    let n = recordDecision({ ...payment.career, actions: c.actions - ACTION_COST, federalGovernment: s }, `Confirmation: ${nominee.name}`, support);
    n = dutyApproval(n, confirmed ? 1 : -1, message, [{ group: 'establishment', delta: confirmed ? 2 : -2 }, { group: 'business', delta: confirmed ? -1 : 1 }]);
    return { ok: true, message, career: publish(n, 'Senate nomination decision', message) };
  }
  if (c.office?.id !== 'president') return { ok: false, message: 'This action belongs to the President, not Congress.' };
  if (action === 'order') {
    const order = executiveOrders.find(o => o.id === value);
    if (!order) return { ok: false, message: 'Choose an executive directive.' };
    if (order.id === 'newtax' || order.id === 'unfunded') return { ok: false, message: order.authority };
    if (s.orders.some(o => o.id === order.id)) return { ok: false, message: 'This directive is already in effect.' };
    const cost = Math.round(revenueBase(c) * order.fraction);
    const safety = currentBudget(c).spending.safety;
    if (cost > federalFunds(c) || cost > Math.max(0, safety - s.spent)) return { ok: false, message: 'Congress has not appropriated enough safety funding for this directive.' };
    const support = evaluateSupport(c, order.policy, `${order.id}|lawful-order`);
    let n = recordDecision({ ...c, actions: c.actions - ACTION_COST }, order.title, support);
    if (support.outcome === 'pass') {
      const payment = spendTreasury(n, cost, `directive|${order.id}`, order.title);
      if (!payment.ok) return payment;
      n = payment.career;
      s = { ...s, spent: s.spent + cost, orders: [...s.orders, { id: order.id, title: order.title, authority: order.authority, cost, date: c.date }] };
      n = { ...n, federalGovernment: s };
    }
    const message = `${order.title}: ${support.outcome}; ${order.authority} ${support.outcome === 'pass' ? `${usd(cost)} from existing appropriations.` : 'Directive not implemented.'}`;
    n = dutyApproval(n, support.outcome === 'pass' ? 1 : -0.5, message, [{ group: 'working', delta: support.outcome === 'pass' ? 1 : -1 }]);
    return { ok: true, message, career: publish(n, order.title, message) };
  }
  const support = evaluateSupport(c, 'safety', `foreign-meeting|${c.governmentDecisions.length}`);
  const success = support.outcome === 'pass';
  s = { ...s, diplomacy: Math.max(0, Math.min(100, s.diplomacy + (success ? 5 : -2))) };
  const message = success ? 'Foreign leaders agreed to nonbinding disaster coordination; diplomacy +5, relationships +2. No treaty, law or spending enacted.' : 'Foreign meeting stalled; diplomacy −2, relationships −1. No treaty or funding committed.';
  let n = recordDecision({ ...c, actions: c.actions - ACTION_COST, federalGovernment: s, relationships: Math.max(0, Math.min(100, c.relationships + (success ? 2 : -1))) }, 'Meet foreign leaders', support);
  n = dutyApproval(n, success ? 1 : -1, message, [{ group: 'suburban', delta: success ? 2 : -2 }]);
  return { ok: true, message, career: publish(n, 'Foreign leaders meeting', message) };
}