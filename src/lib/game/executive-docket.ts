import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import { initializeDocket, executiveOffice, docketQuarter, addQuarters, type DocketSlot } from './docket-schema';
import { legislativePool, legislativeIssue, issueEffect, describeEffect, decideIssue, ensureLegislature } from './legislation';
import { COST_REF } from './committees';
import { applyLegislativeFallout, describeLegislativeFallout } from './approval';
import { rand } from './campaign';
import { spendTreasury, legislativeBudgetVote } from './budget';
import { record } from './corruption';
import { registerScandal } from './scandals';
import { activeCase, legalOf } from './legal';
import { legalCaseSchema } from './legal-schema';
import { type Result, type Policy } from './support';
import { billAction } from './legislation';
import { approveProject, projectCatalog, publicProjects } from './public-projects';
import { mayorAction, cityState, officials } from './city';
import { governorAction, stateGovernment, stateOfficials } from './state-government';
import { federalAction, federalState, federalOfficials } from './federal';
import { applyActionApproval } from './approval';
import { isDetained } from './prison';
import { adoptTaxPolicy, projectTax, taxPolicies } from './fiscal-year';
import { usd } from './campaign';
import { noteAgendaDecision } from './government-finance';

/** Slot 1 references prefixed with this point at a Congress-passed legislature bill rather than a legacy measure. */
export const CONGRESS_REF = 'leg:';
export const congressBill = (c: Career, ref: string | null) => ref?.startsWith(CONGRESS_REF) ? c.legislature?.bills.find(b => b.id === ref.slice(CONGRESS_REF.length)) ?? null : null;
export type DocketRequest = { docketId: string; revision: number; slot: DocketSlot['slot']; choice: string };
export function ensureExecutiveDocket(c: Career): Career {
  let n = initializeDocket(c);
  const d = n.executiveDocket;
  if (!executiveOffice(n) || !d) return n;
  let [legislature, policy, routine] = d.items;
  let returned = d.returned;
  // A bill Congress sent to the President's desk takes slot 1 ahead of the rotating pool.
  if (n.office?.id === 'president') n = ensureLegislature(n);
  const desk = n.office?.id === 'president' ? n.legislature?.bills.find(b => b.status === 'awaiting_signature') : undefined;
  if (desk && legislature.kind === 'bill' && !legislature.reference && !legislature.issue && !legislature.resolved) legislature = { ...legislature, reference: `${CONGRESS_REF}${desk.id}`, title: `Congress passed: ${desk.title}` };
  if (legislature.kind === 'bill' && !legislature.reference && !legislature.issue) {
    const due = returned.find(r => r.due <= d.quarter);
    const queued = new Set(returned.map(r => r.issue));
    const offset = Math.floor(rand(d.tenure) * legislativePool.length), qi = Number(d.quarter.slice(0, 4)) * 4 + Number(d.quarter.slice(6));
    const rotated = Array.from({ length: legislativePool.length }, (_, k) => legislativePool[(offset + qi + k) % legislativePool.length]!).find(i => !queued.has(i.id)) ?? legislativePool[0]!;
    const chosen = due ? legislativeIssue(due.issue) ?? rotated : rotated, rev = due && legislativeIssue(due.issue) ? due.rev : 0;
    legislature = { ...legislature, issue: chosen.id, rev, title: rev ? `${chosen.revised} (Revision ${rev})` : chosen.title };
    if (due) returned = returned.filter(r => r !== due);
  }
  if (!policy.reference && !policy.resolved) {
    if (policy.kind === 'appointments') {
      const list = n.office?.id === 'mayor' ? officials : n.office?.id === 'governor' ? stateOfficials : federalOfficials;
      const filled = n.office?.id === 'mayor' ? cityState(n).officials : n.office?.id === 'governor' ? stateGovernment(n).officials : federalState(n).nominations.filter(x => x.status !== 'rejected');
      const open = list.filter(o => !filled.some(x => x.role === o.role));
      // Rotate: after a rejection, put forward a different unfilled post first.
      const candidate = open.find(o => !d.renominate.includes(o.role)) ?? open[0];
      if (candidate) policy = { ...policy, reference: candidate.role, title: `${d.renominate.length ? 'Re-nomination' : 'Nomination'}: ${candidate.name} as ${candidate.role}` };
      else if (d.inauguration) policy = { ...policy, title: 'Review inherited cabinet' };
      else {
        const project = projectCatalog(n).find(p => !publicProjects(n).some(x => x.id === p.id));
        policy = project ? { ...policy, kind: 'project', reference: project.catalogId, title: project.name } : { ...policy, kind: 'initiative', reference: null, title: 'Review ongoing public investment' };
      }
    } else {
      const emergency = n.office?.id === 'mayor' ? cityState(n).emergency : n.office?.id === 'governor' ? stateGovernment(n).disaster : null;
      if (emergency && !emergency.resolved) policy = { ...policy, kind: 'emergency', reference: emergency.id, title: emergency.title };
      else {
        const project = projectCatalog(n).find(p => !publicProjects(n).some(x => x.id === p.id));
        policy = project ? { ...policy, reference: project.catalogId, title: project.name } : { ...policy, kind: 'initiative', reference: null, title: 'Review ongoing public investment' };
      }
    }
  }
  return { ...n, executiveDocket: { ...d, returned, items: [legislature, policy, routine] } };
}
export function docketBlocker(c: Career): string | null {
  if (!executiveOffice(c) || isDetained(c)) return null;
  const d = initializeDocket(c).executiveDocket;
  const remaining = d?.items.filter(i => !i.resolved).length ?? 3;
  return remaining ? `Resolve ${remaining} government docket decision${remaining === 1 ? '' : 's'} before advancing the quarter.` : null;
}
export type DocketChoice = { id: string; label: string; actions: number; detail?: string };
/** Personal take from a steered contract (kickback) or a siphoned project (diverted public money). */
export const KICKBACK_SHARE = 0.05, SIPHON_SHARE = 0.2, STEER_SUSPICION = 15, SIPHON_SUSPICION = 40, STEER_SCANDAL_ODDS = 0.35;
export function docketChoices(c: Career, item: DocketSlot): DocketChoice[] {
  const pool = item.kind === 'bill' && !item.reference ? legislativeIssue(item.issue) : null;
  if (pool) return [
    { id: 'sign', label: 'Sign into Law', actions: 0, detail: describeEffect(issueEffect(pool, 'sign', item.rev)) },
    { id: 'veto', label: 'Veto', actions: 0, detail: describeEffect(issueEffect(pool, 'veto', item.rev)) },
    { id: 'return', label: 'Return to Legislature', actions: 0, detail: `Revised text comes back in ${addQuarters(c.executiveDocket?.quarter ?? docketQuarter(c.date), 2)}.` },
  ];
  if (item.kind === 'project' && item.reference) {
    const cost = projectCatalog(c).find(p => p.catalogId === item.reference)?.totalCost ?? 0;
    return [
      { id: 'clean', label: 'Award Cleanly (Competitive Bid)', actions: 1, detail: `Standard contract · ${usd(cost)} public cost.` },
      { id: 'steer', label: 'Steer to Connected Firm', actions: 1, detail: `+${usd(Math.round(cost * KICKBACK_SHARE))} kickback · suspicion +${STEER_SUSPICION} · scandal risk.` },
      { id: 'siphon', label: 'Siphon Project Funds', actions: 1, detail: `+${usd(Math.round(cost * SIPHON_SHARE))} to your bank · suspicion +${SIPHON_SUSPICION} · criminal investigation.` },
      { id: 'decline', label: 'Shelve project', actions: 0 },
    ];
  }
  if (item.kind === 'bill' && item.reference?.startsWith(CONGRESS_REF)) {
    const bill = congressBill(c, item.reference);
    if (bill?.status !== 'awaiting_signature') return [{ id: 'acknowledge', label: 'Record completed review', actions: 0 }];
    return [
      { id: 'sign', label: 'Sign into Law', actions: 0, detail: describeLegislativeFallout(bill, COST_REF.house, 'sign') },
      { id: 'veto', label: 'Veto', actions: 0, detail: describeLegislativeFallout(bill, COST_REF.house, 'veto') },
    ];
  }
  if (item.kind === 'agenda') return ['services', 'business', 'environment', 'safety'].map(id => ({ id, label: `${id[0]?.toUpperCase()}${id.slice(1)} agenda`, actions: 0 }));
  if (item.kind === 'bill') {
    const bill = c.bills.find(b => b.id === item.reference);
    if (bill && ['passed', 'rejected'].includes(bill.stage)) return [{ id: 'acknowledge', label: 'Record completed review', actions: 0 }];
    return bill?.stage === 'awaiting approval' ? [{ id: 'sign', label: 'Sign into Law', actions: 1 }, { id: 'veto', label: 'Veto', actions: 0 }, { id: 'return', label: 'Return to Legislature', actions: 0 }] : [{ id: 'return', label: 'Return to Legislature', actions: 0 }];
  }
  if (item.kind === 'budget') return taxPolicies.map(p => ({ id: p.id, label: `Propose ${p.label} · ${usd(projectTax(c, p.id).revenue)}/yr`, actions: 1, detail: p.id === 'balanced' ? 'Safe compromise; the legislature accepts it.' : 'Needs a chamber majority, or the balanced compromise is imposed.' }));
  if (item.kind === 'routine') return [{ id: 'meet', label: 'Meet Legislative Leaders', actions: 1 }, { id: 'press', label: 'Host Press Conference', actions: 1 }, { id: 'tour', label: 'Tour Regions', actions: 1 }, { id: 'defer', label: 'Defer routine · no gains', actions: 0 }];
  if (item.kind === 'initiative' || !item.reference) return [{ id: 'review', label: 'Review current administration', actions: 0 }];
  return [{ id: 'fund', label: item.kind === 'appointments' ? c.office?.id === 'president' ? 'Submit cabinet nomination' : 'Appoint cabinet official' : 'Fund priority', actions: 1 }, { id: 'decline', label: item.kind === 'appointments' ? 'Retain interim leadership' : 'Decline funding', actions: 0 }];
}
export function resolveDocket(c: Career, request: DocketRequest): Result {
  if (!executiveOffice(c)) return { ok: false, message: 'This docket belongs to an active executive office.' };
  if (c.report || c.newspaperPending || c.pendingEvent || c.eventEncounter || c.debate || isDetained(c)) return { ok: false, message: 'Finish the current encounter before governing.' };
  const n = ensureExecutiveDocket(c), d = n.executiveDocket;
  if (!d || d.id !== request.docketId || d.revision !== request.revision || d.quarter !== docketQuarter(c.date)) return { ok: false, message: 'This docket changed. Reopen the current decision.' };
  const item = d.items.find(i => i.slot === request.slot);
  if (!item || item.resolved) return { ok: false, message: 'This docket decision was already resolved.' };
  const choice = docketChoices(n, item).find(x => x.id === request.choice);
  if (!choice || n.actions < choice.actions * ACTION_COST) return { ok: false, message: 'Choose an available decision with enough actions.' };
  let result: Result = { ok: true, career: n, message: `${item.title}: ${choice.label}.` };
  let returned = d.returned, renominate = d.renominate;
  const pool = item.kind === 'bill' && !item.reference ? legislativeIssue(item.issue) : null;
  if (pool) {
    if (request.choice === 'return') {
      const due = addQuarters(d.quarter, 2);
      returned = [...returned.filter(r => r.issue !== pool.id), { issue: pool.id, rev: item.rev + 1, due }];
      result = { ok: true, career: n, message: `${item.title} returned to the legislature. Revised text is due in ${due}; no law enacted.` };
    } else {
      const signed = request.choice === 'sign', e = issueEffect(pool, signed ? 'sign' : 'veto', item.rev);
      result = { ok: true, career: decideIssue(n, pool, signed ? 'sign' : 'veto', item.rev), message: `${item.title} ${signed ? 'signed into law' : 'vetoed'}: ${describeEffect(e)}.` };
    }
  } else if (item.kind === 'project' && item.reference && ['clean', 'steer', 'siphon'].includes(request.choice)) {
    result = contractProject(n, item.reference, request.choice as 'clean' | 'steer' | 'siphon', d.id);
  } else if (item.kind === 'bill' && item.reference?.startsWith(CONGRESS_REF)) {
    const bill = congressBill(n, item.reference);
    if (bill?.status === 'awaiting_signature' && n.legislature) {
      const signed = request.choice === 'sign', action = `${signed ? 'Signed' : 'Vetoed'} by ${n.character.name}`;
      const withBill: Career = { ...n, legislature: { ...n.legislature, bills: n.legislature.bills.map(b => b.id === bill.id ? { ...b, status: signed ? 'enacted' as const : 'vetoed' as const, executiveAction: action } : b) } };
      result = { ok: true, career: applyLegislativeFallout(withBill, bill, COST_REF.house, signed ? 'sign' : 'veto', `${bill.title}: ${signed ? 'signed into law' : 'vetoed'}.`), message: `${bill.title} ${signed ? 'signed into law' : 'vetoed'}. ${describeLegislativeFallout(bill, COST_REF.house, signed ? 'sign' : 'veto')}` };
    }
  } else if (item.kind === 'bill' && item.reference) {
    if (request.choice === 'sign') result = billAction(n, item.reference, 'approve');
    if (request.choice === 'veto') result = billAction({ ...n, actions: Math.max(ACTION_COST, n.actions) }, item.reference, 'veto');
    if (request.choice === 'return') {
      const bill = n.bills.find(b => b.id === item.reference);
      if (!bill) return { ok: false, message: 'This measure is no longer available.' };
      result = billAction({ ...n, actions: Math.max(ACTION_COST, n.actions), bills: n.bills.map(b => b.id === bill.id && b.stage === 'awaiting approval' ? { ...b, stage: 'under consideration' } : b) }, bill.id, 'amend');
    }
    if (result.ok && ['veto', 'return'].includes(request.choice)) result = { ...result, career: { ...result.career, actions: n.actions } };
  } else if (item.kind === 'budget') {
    const vote = legislativeBudgetVote(n, request.choice, d.id);
    const adopted = adoptTaxPolicy(n, vote.adopted);
    result = !adopted.ok ? adopted : { ...adopted, message: vote.passed ? `Legislature approved the budget (${vote.support.votes}/${vote.support.seats}). ${adopted.message}` : `Legislature rejected your proposal (${vote.support.votes}/${vote.support.seats}, ${vote.support.needed} needed) and imposed the balanced compromise. ${adopted.message}` };
  } else if (item.kind === 'agenda') {
    const policy = request.choice as Policy;
    let next = n;
    if (n.office?.id === 'mayor') next = { ...n, city: { ...cityState(n), priority: policy } };
    if (n.office?.id === 'governor') next = { ...n, stateGovernment: { ...stateGovernment(n), priority: policy } };
    result = { ok: true, career: applyActionApproval(next, `${d.id}|agenda`, 1, 'routine', `Inaugural ${policy} agenda announced; no legislation or spending enacted.`), message: `Inaugural ${policy} agenda announced. Legislative approval is still required for new laws.` };
  } else if (request.choice === 'fund' && item.reference) {
    if (item.kind === 'project') result = approveProject(n, item.reference);
    if (item.kind === 'appointments') {
      const role = item.reference;
      result = n.office?.id === 'mayor' ? mayorAction(n, 'appoint', role) : n.office?.id === 'governor' ? governorAction(n, 'appoint', role) : federalAction(n, 'nominate', role);
      // Outside inauguration, the president's nominee goes straight to a Senate confirmation vote.
      if (result.ok && n.office?.id === 'president' && !d.inauguration) {
        const pending = federalState(result.career).nominations.find(x => x.role === role && x.status === 'nominated');
        if (pending) { const vote = federalAction({ ...result.career, actions: Math.max(ACTION_COST, result.career.actions) }, 'confirm', pending.id); if (vote.ok) result = { ...vote, career: { ...vote.career, actions: result.career.actions } }; }
      }
      if (result.ok) {
        const r = result.career;
        const rejected = n.office?.id === 'mayor' ? !cityState(r).officials.some(o => o.role === role) : n.office?.id === 'governor' ? !stateGovernment(r).officials.some(o => o.role === role) : federalState(r).nominations.some(x => x.role === role && x.status === 'rejected') && !federalState(r).nominations.some(x => x.role === role && x.status !== 'rejected');
        renominate = rejected ? [...renominate.filter(x => x !== role), role] : renominate.filter(x => x !== role);
        if (rejected) result = { ...result, message: `${result.message} The chamber rejected the nominee; a new nominee comes next cycle.` };
      }
    }
    if (item.kind === 'emergency') {
      const live = n.office?.id === 'mayor' ? cityState(n).emergency : stateGovernment(n).disaster;
      if (!live || live.id !== item.reference || live.resolved) return { ok: false, message: 'This emergency changed. Decline or review its current status.' };
      result = n.office?.id === 'mayor' ? mayorAction(n, 'emergency') : governorAction(n, 'disaster');
    }
  } else if (item.kind === 'routine' && request.choice !== 'defer') {
    if (request.choice === 'meet') {
      let next: Career = { ...n, actions: n.actions - ACTION_COST, relationships: Math.min(100, n.relationships + 2) };
      if (n.office?.id === 'governor') next = { ...next, stateGovernment: { ...stateGovernment(n), coalition: Math.min(24, stateGovernment(n).coalition + 4) } };
      if (n.office?.id === 'president') next = { ...next, federalGovernment: { ...federalState(n), coalition: Math.min(24, federalState(n).coalition + 4) } };
      result = { ok: true, career: next, message: 'Met legislative leaders: relationships +2; coalition strengthened. No law passed.' };
    } else {
      const title = request.choice === 'press' ? 'Hosted a press conference' : 'Toured regions';
      const next: Career = { ...n, actions: n.actions - ACTION_COST, skills: { ...n.skills, communication: Math.min(100, n.skills.communication + 0.5) } };
      result = { ok: true, career: applyActionApproval(next, `${d.id}|${request.choice}`, 0.5, 'routine', `${title}: heard public concerns and presented the administration's work.`), message: `${title}: communication +0.5; approval +0.5 (within existing bounds).` };
    }
  } else if (request.choice === 'decline' && item.kind !== 'appointments') result = { ok: true, career: applyActionApproval(n, `${d.id}|decline`, -1, 'routine', `${item.title}: public funding declined.`), message: `${item.title}: funding declined; no treasury money spent.` };
  if (!result.ok) return result;
  if (item.kind === 'project' && item.reference && ['clean', 'steer', 'siphon', 'decline'].includes(request.choice)) result = { ...result, career: noteAgendaDecision(result.career, item.reference, request.choice === 'decline' ? 'rejected' : 'approved') };
  const outcome = result.message;
  const items = d.items.map(i => i.slot === item.slot ? { ...i, resolved: true, choice: request.choice, outcome } : i) as typeof d.items;
  return { ok: true, message: outcome, career: { ...result.career, executiveDocket: { ...d, returned, renominate, revision: d.revision + 1, items }, log: [outcome, ...result.career.log].slice(0, 12), newsQueue: [...result.career.newsQueue, { h: `${c.office?.title}: ${item.title} · ${d.id}`, sub: choice.label, body: outcome, tag: 'government', subject: c.character.name }] } };
}

/** Slot 2 contracting: clean bid, steered contract (kickback) or outright siphoning of public money. */
export function contractProject(c: Career, catalogId: string, mode: 'clean' | 'steer' | 'siphon', docketId: string): Result {
  const project = projectCatalog(c).find(p => p.catalogId === catalogId);
  const built = approveProject(c, catalogId);
  if (!built.ok || mode === 'clean' || !project) return built;
  let n = built.career;
  const name = project.name;
  const credit = (x: Career, amount: number, label: string): Career => ({ ...x, money: x.money + amount, ledger: [{ month: x.date, label, amount }, ...x.ledger] });
  if (mode === 'steer') {
    const amount = Math.round(project.totalCost * KICKBACK_SHARE);
    n = credit(n, amount, `Consulting fee · ${name} contractor`);
    n = record(n, { id: `steer|${docketId}`, date: c.date, amount, kind: 'self_dealing', source: `${name} contractor`, destination: 'personal', favor: `Steered ${name} contract`, risk: 'Medium', evidence: STEER_SUSPICION }, {});
    const exposed = rand(`${docketId}|steer|${catalogId}`) < STEER_SCANDAL_ODDS;
    if (exposed) n = registerScandal(n, { id: `steer|${docketId}`, title: `${name} contract questions`, summary: `Reporters found the ${name} contract went to a firm with ties to ${c.character.name}.`, source: 'Investigative Reporter', severity: 'Moderate', evidence: 30, trigger: 'corruption' });
    return { ok: true, career: n, message: `${name} steered to a connected firm: ${usd(amount)} kickback to your bank, suspicion +${STEER_SUSPICION}.${exposed ? ' Reporters are already asking questions.' : ''}` };
  }
  const amount = Math.round(project.totalCost * SIPHON_SHARE);
  const paid = spendTreasury(n, amount, `siphon|${docketId}`, `${name} · unexplained disbursement`);
  if (!paid.ok) return { ok: false, message: 'Not enough public money left to divert from this project.' };
  n = credit(paid.career, amount, `Diverted funds · ${name}`);
  n = record(n, { id: `siphon|${docketId}`, date: c.date, amount, kind: 'embezzlement', source: `${name} public funds`, destination: 'personal', favor: `Siphoned ${name}`, risk: 'High', evidence: SIPHON_SUSPICION }, {});
  n = registerScandal(n, { id: `siphon|${docketId}`, title: `Missing millions: ${name}`, summary: `Auditors traced ${usd(amount)} of ${name} money to accounts linked to ${c.character.name}.`, source: 'Legal Audit', severity: 'Severe', evidence: 60, trigger: 'corruption' });
  if (!activeCase(n)) {
    const k = legalCaseSchema.parse({ id: `case|siphon|${docketId}`, opened: c.date, stage: 'formal', strength: Math.min(100, n.corruption?.exposure ?? SIPHON_SUSPICION), role: 'official', stageSince: c.date, history: [{ date: c.date, text: `Special prosecutor appointed over diverted ${name} funds.` }] });
    n = { ...n, legal: { ...legalOf(n), cases: [k, ...legalOf(n).cases].slice(0, 10) } };
  }
  return { ok: true, career: n, message: `${usd(amount)} of ${name} funds diverted to your bank. Suspicion +${SIPHON_SUSPICION}; a special prosecutor has opened a criminal investigation.` };
}
