import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import { registerScandal, announceScandal } from './scandals';
import { dutyApproval } from './approval';
import { indicators, revenueBase, spendTreasury } from './budget';
import { rand, usd } from './campaign';
import { cityFunds, cityState } from './city';
import { federalFunds, federalState, isFederal } from './federal';
import { stateFunds, stateGovernment, isStateOffice } from './state-government';
import { activeOffice, submitMeasure, tenureKey, type Result } from './support';

export const officeFunds = (c: Career) => isFederal(c) ? federalFunds(c) : isStateOffice(c) ? stateFunds(c) : cityFunds(c);
export function commitOfficeFunds(c: Career, cost: number, key = `office-event|${c.date}|${c.pendingEvent ?? 'expense'}`): Career {
  if (!Number.isFinite(cost) || cost < 0 || cost > officeFunds(c)) return c;
  const payment = spendTreasury(c, cost, key, 'Public office response');
  if (!payment.ok) return c;
  c = payment.career;
  if (isFederal(c)) { const s = federalState(c); return { ...c, federalGovernment: { ...s, spent: s.spent + cost } }; }
  if (isStateOffice(c)) { const s = stateGovernment(c); return { ...c, stateGovernment: { ...s, spent: s.spent + cost } }; }
  const s = cityState(c); return { ...c, city: { ...s, spent: s.spent + cost } };
}
export function officeEventPool(c: Career): string[] {
  if (!activeOffice(c)) return [];
  const id = c.office?.id;
  const recent = c.scandals.some(s => s.tenure === tenureKey(c) && (Number(c.date.slice(0, 4)) - Number(s.date.slice(0, 4))) * 12 + Number(c.date.slice(5, 7)) - Number(s.date.slice(5, 7)) < 6);
  const conflict = c.businesses.some(b => b.ledger.some(t => t.label.includes('for owner'))) || c.campaign?.attack;
  const pool: string[] = conflict && !recent ? ['ethics'] : [];
  // Keep a currently saved ethics encounter available until it is resolved.
  if (c.pendingEvent === 'office:ethics' || c.eventEncounter?.id === 'office:ethics') pool.push('ethics');
  if (['mayor', 'council'].includes(id ?? '') && (indicators(c).services < 88 || c.city?.emergency && !c.city.emergency.resolved)) pool.push('sanitation');
  if (id === 'governor' || id === 'mayor' || id === 'president') pool.push('storm');
  if (['stateLeg', 'house', 'senate'].includes(id ?? '')) pool.push('district');
  if (indicators(c).employment < 88 || (c.approval?.overall ?? 40) < 50) pool.push('economy');
  return pool.map(kind => `office:${kind}`);
}
export function rollOfficeEvent(c: Career): string | null {
  if (!activeOffice(c)) return null;
  if (c.city?.emergency && !c.city.emergency.resolved) return 'office:sanitation';
  if (c.stateGovernment?.disaster && !c.stateGovernment.disaster.resolved && c.office?.id === 'governor') return 'office:storm';
  if (rand(`${tenureKey(c)}|${c.date}|office-event`) > 0.45) return null;
  const pool = officeEventPool(c);
  return pool[Math.floor(rand(`${tenureKey(c)}|${c.date}|office-kind`) * pool.length)] ?? null;
}
export type OfficeEvent = { id: string; tenure: string; cost: number; title: string; text: string; parties: string[]; choices: { id: string; label: string; hint: string; disabled?: boolean | undefined }[] };
export function getOfficeEvent(c: Career, id: string): OfficeEvent | null {
  if (!officeEventPool(c).includes(id)) return null;
  const kind = id.slice(7), executive = ['mayor', 'governor', 'president'].includes(c.office?.id ?? '');
  const cost = kind === 'storm' && c.stateGovernment?.disaster && !c.stateGovernment.disaster.resolved ? c.stateGovernment.disaster.cost : kind === 'sanitation' && c.city?.emergency && !c.city.emergency.resolved ? c.city.emergency.cost : Math.round(revenueBase(c) * (kind === 'ethics' ? 0.005 : 0.03));
  const title = ({ sanitation: 'Sanitation crisis', storm: 'Severe storm response', economy: 'Economic downturn', district: 'District infrastructure breakdown', ethics: 'Official conduct allegation' } as Record<string, string>)[kind] ?? 'Public concern';
  const text = kind === 'ethics' ? `An oversight complaint alleges improper procurement by your office in ${c.office?.jurisdiction}. No misconduct has been proven. Independent evidence review can clear or substantiate the allegation; your response cannot choose the finding.` : `${c.office?.jurisdiction} faces ${title.toLowerCase()}. ${executive ? 'Existing public appropriations can fund a response; no new taxes or laws may be imposed.' : 'Your legislative office can request funded legislation, not direct executive agencies or spend unilaterally.'}`;
  return { id, tenure: tenureKey(c), cost, title, text, parties: [c.character.name, c.office?.jurisdiction ?? c.character.state, kind === 'ethics' ? 'Independent oversight panel' : 'Affected residents'], choices: kind === 'ethics' ? [
    { id: 'disclose', label: 'Disclose records and cooperate', hint: '+1 approval, −2 relationships; allegation remains unproven.' },
    { id: 'review', label: `Independent evidence review · ${usd(cost)}`, hint: 'Public oversight cost; evidence may clear the allegation (+2 approval) or prove misconduct (−6). Relationships −1.', disabled: officeFunds(c) < cost },
    { id: 'deny', label: 'Deny and refuse cooperation', hint: '−2 approval, −1 relationships; denial does not prove innocence or guilt.' },
  ] : [
    { id: 'coordinate', label: executive ? 'Coordinate existing services' : 'Hold an oversight hearing', hint: '+1 approval, +2 relationships; no additional public spending.' },
    { id: 'fund', label: executive ? `Fund public response · ${usd(cost)}` : `Request relief legislation · ${usd(cost)}`, hint: executive ? '+3 approval; workers +4, business −2; public allocation only.' : '1 action; relief must pass legislative and executive stages. Relationships +1.', disabled: officeFunds(c) < cost || !executive && (c.actions < ACTION_COST || c.bills.some(b => b.tenure === tenureKey(c) && b.kind === 'services' && !['passed', 'rejected'].includes(b.stage))) },
    { id: 'delay', label: 'Defer intervention', hint: '−3 approval, −1 relationships; workers −4, seniors −3.' },
  ] };
}
export function prepareOfficeEvent(c: Career): Career {
  if (c.pendingEvent !== 'office:ethics' || c.scandals.some(s => s.id === `${tenureKey(c)}|${c.date}|ethics`)) return c;
  return registerScandal(c, { id: `${tenureKey(c)}|${c.date}|ethics`, title: 'Official conduct allegation', summary: 'An oversight complaint alleges improper procurement. No misconduct has been proven.', source: 'Whistleblower', severity: 'Minor', evidence: 0, trigger: 'office' });
}
export function resolveOfficeEvent(c: Career, event: NonNullable<ReturnType<typeof getOfficeEvent>>, choice: string): Result {
  if (!activeOffice(c) || event.tenure !== tenureKey(c) || !officeEventPool(c).includes(event.id)) return { ok: false, message: 'This event does not belong to your active office.' };
  if (c.eventHistory.some(e => e.tenure === event.tenure && e.id === event.id && e.date === c.date)) return { ok: false, message: 'This office event was already resolved.' };
  const option = event.choices.find(o => o.id === choice);
  if (!option || option.disabled) return { ok: false, message: 'Choose an available response within your public allocation.' };
  const cost = event.cost;
  const executive = ['mayor', 'governor', 'president'].includes(c.office?.id ?? '');
  if ((choice === 'review' || choice === 'fund') && (!Number.isFinite(cost) || cost < 0 || cost > officeFunds(c))) return { ok: false, message: 'Insufficient or invalid public funding for this response.' };
  let n = c, message = '';
  if (event.id === 'office:ethics') {
    const recordId = `${event.tenure}|${c.date}|ethics`;
    n = prepareOfficeEvent(c);
    let status: Career['scandals'][number]['status'] = 'alleged', finding: string | null = null;
    if (choice === 'review') {
      const paid = commitOfficeFunds(n, cost, `${event.id}|${c.date}|${choice}`);
      if (paid === n && cost > 0) return { ok: false, message: 'This public expense cannot be paid again.' };
      n = paid;
      const proven = rand(`${recordId}|evidence`) < 0.35;
      status = proven ? 'proven' : 'cleared'; finding = proven ? 'Independent review substantiated improper procurement.' : 'Independent review found no evidence supporting the complaint.';
      message = `${finding} ${usd(cost)} public oversight cost; relationships −1.`;
      n = dutyApproval(n, proven ? -6 : 2, message, [{ group: 'establishment', delta: proven ? -7 : 3 }, { group: 'religious', delta: proven ? -6 : 2 }]);
    } else {
      message = choice === 'disclose' ? 'Records disclosed: approval +1, relationships −2. Allegation remains unproven pending evidence.' : 'Cooperation refused: approval −2, relationships −1. Allegation remains unproven; refusal is not proof of misconduct.';
      n = dutyApproval(n, choice === 'disclose' ? 1 : -2, message);
    }
    n = { ...n, relationships: Math.max(0, n.relationships - (choice === 'disclose' ? 2 : 1)), scandals: n.scandals.map(s => s.id === recordId ? { ...s, status, finding, evidence: status === 'proven' ? 90 : 0, severity: status === 'proven' ? 'Severe' : 'Minor', phase: status === 'cleared' ? 'Managed' : status === 'proven' ? 'Exploded' : 'Active' } : s) };
    const updated = n.scandals.find(s => s.id === recordId);
    if (updated) n = announceScandal(n, updated);
  } else if (choice === 'fund') {
    if (executive) {
      const paid = commitOfficeFunds(n, cost, `${event.id}|${c.date}|${choice}`);
      if (paid === n && cost > 0) return { ok: false, message: 'This public expense cannot be paid again.' };
      n = paid;
      if (event.id === 'office:storm' && n.stateGovernment?.disaster) n = { ...n, stateGovernment: { ...n.stateGovernment, disaster: { ...n.stateGovernment.disaster, resolved: true } } };
      if (event.id === 'office:sanitation' && n.city?.emergency) n = { ...n, city: { ...n.city, emergency: { ...n.city.emergency, resolved: true } } };
      message = `${event.title}: ${usd(cost)} existing public funds committed; approval +3, workers +4, business −2.`;
      n = dutyApproval(n, 3, message, [{ group: 'working', delta: 4 }, { group: 'business', delta: -2 }]);
    } else {
      const proposed = submitMeasure(n, { title: `${event.title} relief`, kind: 'services', policy: 'services', cost });
      if (!proposed.ok) return proposed;
      n = { ...proposed.career, relationships: Math.min(100, proposed.career.relationships + 1) };
      message = `${proposed.message} Relationships +1; no money spent before enactment.`;
    }
  } else {
    const coordinate = choice === 'coordinate';
    message = `${event.title}: ${coordinate ? 'existing-service coordination or oversight improved trust; approval +1, relationships +2.' : 'intervention deferred; approval −3, relationships −1.'}`;
    n = dutyApproval(n, coordinate ? 1 : -3, message, [{ group: 'working', delta: coordinate ? 2 : -4 }, { group: 'seniors', delta: coordinate ? 1 : -3 }]);
    n = { ...n, relationships: Math.max(0, Math.min(100, n.relationships + (coordinate ? 2 : -1))) };
  }
  const historyEntry = { id: event.id, title: event.title, text: event.text, parties: event.parties, choices: event.choices, tenure: event.tenure, cost: event.cost, date: c.date, choice, consequences: message };
  n = { ...n, pendingEvent: null, eventEncounter: null, eventHistory: [...n.eventHistory, historyEntry], log: [message, ...n.log].slice(0, 12), newsQueue: [...n.newsQueue, { h: `${c.character.name}: ${event.title} response`, sub: message, body: message, tag: event.id === 'office:ethics' ? 'scandal' : 'government', subject: c.character.name, portrait: c.character.portrait }] };
  return { ok: true, career: n, message };
}