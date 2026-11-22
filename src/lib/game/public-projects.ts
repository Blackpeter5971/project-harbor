import { ACTION_COST } from './energy-costs';
import { applyProjectLoyalty } from './support-groups';
import type { Career } from './career';
import { projectBenefit, projectCategories, type PublicProject, type ProjectJurisdiction } from './public-project-schema';
import { applyActionApproval, holdsOffice } from './approval';
import { activeOffice, tenureKey, type Result } from './support';
import { ensureTreasury, spendTreasury, treasuryFunds } from './budget';
import { cityState, cityFunds } from './city';
import { stateGovernment, stateFunds } from './state-government';
import { federalState, federalFunds } from './federal';
import { usd } from './campaign';
import { changeBusinessCash } from './business-schema';

export function projectJurisdiction(c: Career): ProjectJurisdiction | null {
  if (!activeOffice(c) || !c.office || c.date < c.office.since) return null;
  if (['mayor', 'council'].includes(c.office.id)) return 'city';
  if (['governor', 'stateLeg'].includes(c.office.id)) return 'state';
  if (['president', 'house', 'senate'].includes(c.office.id)) return 'federal';
  return null;
}
export const canApproveProject = (c: Career) => !!projectJurisdiction(c) && ['mayor', 'governor', 'president'].includes(c.office?.id ?? '');
export function publicProjects(c: Career): PublicProject[] {
  const jurisdiction = projectJurisdiction(c);
  const records = jurisdiction === 'city' ? c.city?.publicProjects : jurisdiction === 'state' ? c.stateGovernment?.publicProjects : jurisdiction === 'federal' ? c.federalGovernment?.publicProjects : [];
  return (records ?? []).filter(p => p.tenure === tenureKey(c));
}
/** Phase 5: real-world capital costs for new public works. Saved projects keep their recorded price. */
export const CAPITAL_COST_MULTIPLIER = 1.6;
export function projectCatalog(c: Career): PublicProject[] {
  const jurisdiction = projectJurisdiction(c);
  if (!jurisdiction) return [];
  const scale = { city: 1, state: 10, federal: 100 }[jurisdiction];
  return projectCategories.map(cat => ({
    id: `${tenureKey(c)}|project|${cat.id}`, catalogId: cat.id, tenure: tenureKey(c),
    name: cat.project, category: cat.id, jurisdiction,
    totalCost: Math.round(cat.cityCost * scale * CAPITAL_COST_MULTIPLIER), fundingCommitted: 0,
    durationTurns: Math.min(8, cat.turns + (jurisdiction === 'state' ? 2 : jurisdiction === 'federal' ? 4 : 0)),
    progress: 0, status: 'proposed', startDate: null, expectedCompletionDate: null,
    paymentMode: 'staged', constructionSpent: 0, lastProcessedEnd: '', pauseReason: null,
    completionDate: null, benefitsApplied: false, cancelledDate: null, contract: null,
  }));
}
export function projectFunds(c: Career): number {
  const jurisdiction = projectJurisdiction(c);
  return jurisdiction === 'city' ? cityFunds(c) : jurisdiction === 'state' ? stateFunds(c) : jurisdiction === 'federal' ? federalFunds(c) : 0;
}
/** Reserve appropriations in full; cash is disbursed only for quarterly construction. */
export function approveProject(c: Career, catalogId: string): Result {
  if (!canApproveProject(c)) return { ok: false, message: 'Only an active mayor, governor or president can commit project funds within existing public allocations.' };
  const project = projectCatalog(c).find(p => p.catalogId === catalogId);
  if (!project) return { ok: false, message: 'Choose an eligible public project.' };
  if (publicProjects(c).some(p => p.id === project.id)) return { ok: false, message: 'This project has already been approved.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  if (treasuryFunds(c) < project.totalCost) return { ok: false, message: `Insufficient government treasury: ${usd(project.totalCost)} required; ${usd(treasuryFunds(c))} available.` };
  if (projectFunds(c) < project.totalCost) return { ok: false, message: 'Existing public allocations do not cover this project.' };
  const months = project.durationTurns * 3;
  const [year = 0, month = 1] = c.date.split('-').map(Number);
  const finish = year * 12 + month - 1 + months;
  const approved: PublicProject = { ...project, status: 'approved', fundingCommitted: project.totalCost, startDate: c.date, lastProcessedEnd: c.date, expectedCompletionDate: `${Math.floor(finish / 12)}-${String(finish % 12 + 1).padStart(2, '0')}-01` };
  let n = ensureTreasury(c);
  if (project.jurisdiction === 'city') { const s = cityState(n); n = { ...n, city: { ...s, spent: s.spent + project.totalCost, publicProjects: [...(s.publicProjects ?? []), approved] } }; }
  if (project.jurisdiction === 'state') { const s = stateGovernment(n); n = { ...n, stateGovernment: { ...s, spent: s.spent + project.totalCost, publicProjects: [...(s.publicProjects ?? []), approved] } }; }
  if (project.jurisdiction === 'federal') { const s = federalState(n); n = { ...n, federalGovernment: { ...s, spent: s.spent + project.totalCost, publicProjects: [...(s.publicProjects ?? []), approved] } }; }
  const message = `${project.name} approved: ${usd(project.totalCost)} allocation reserved; construction paid quarterly from government treasury.`;
  return { ok: true, message, career: { ...applyProjectLoyalty(n, project.category, project.name), actions: c.actions - ACTION_COST, log: [message, ...n.log].slice(0, 12) } };
}

const monthIndex = (date: string) => {
  const [year = 0, month = 0] = date.split('-').map(Number);
  return /^\d{4}-\d{2}-01$/.test(date) && month >= 1 && month <= 12 ? year * 12 + month - 1 : NaN;
};
const addMonths = (date: string, months: number) => {
  const index = monthIndex(date) + months;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}-01`;
};
const remaining = (p: PublicProject) => Math.max(0, p.totalCost - (p.constructionSpent ?? 0));
export const projectInstallment = (p: PublicProject) => Math.min(remaining(p), Math.ceil(p.totalCost / p.durationTurns));
const escrowed = (p: PublicProject) => (p.paymentMode ?? 'escrow') === 'escrow';
export const canResumeProject = (c: Career, p: PublicProject) => canApproveProject(c) && p.status === 'paused' && c.actions >= ACTION_COST && (escrowed(p) || treasuryFunds(c) >= projectInstallment(p));

function updateProject(c: Career, project: PublicProject, release = 0): Career {
  if (project.jurisdiction === 'city') { const s = cityState(c); return { ...c, city: { ...s, spent: Math.max(0, s.spent - release), publicProjects: (s.publicProjects ?? []).map(p => p.id === project.id ? project : p) } }; }
  if (project.jurisdiction === 'state') { const s = stateGovernment(c); return { ...c, stateGovernment: { ...s, spent: Math.max(0, s.spent - release), publicProjects: (s.publicProjects ?? []).map(p => p.id === project.id ? project : p) } }; }
  const s = federalState(c); return { ...c, federalGovernment: { ...s, spent: Math.max(0, s.spent - release), publicProjects: (s.publicProjects ?? []).map(p => p.id === project.id ? project : p) } };
}

/** Skip this interval without paying or progressing; the existing watermark locks the delay. */
export function delayPublicProjects(c: Career, start: string, end: string): Career {
  let n = c;
  if (projectJurisdiction(c) === 'city' && c.city?.tenure === tenureKey(c)) n = { ...n, city: { ...c.city, projects: c.city.projects.map(p => p.status === 'active' && p.lastProcessed < end ? { ...p, lastProcessed: end } : p) } };
  for (const p of publicProjects(c)) {
    if (!['approved', 'in_progress'].includes(p.status) || !p.startDate || p.startDate > start || start < p.lastProcessedEnd) continue;
    n = updateProject(n, { ...p, lastProcessedEnd: end, expectedCompletionDate: p.expectedCompletionDate ? addMonths(p.expectedCompletionDate, 3) : null });
  }
  return n;
}

/** Contractor share of a paid milestone: the full installment is business revenue, minus 85% build costs.
 * Moves money only from the already-debited treasury payment into one business account; idempotent per end. */
export const CONTRACT_COST_RATIO = 0.85;
function payContractor(c: Career, p: PublicProject, due: number, end: string): { career: Career; contract: PublicProject['contract'] } {
  const k = p.contract ?? null;
  if (!k || !k.businessId || due <= 0 || k.lastPaidEnd >= end) return { career: c, contract: k };
  const contract = { ...k, paid: k.paid + due, lastPaidEnd: end };
  const biz = c.businesses.find(b => b.id === k.businessId);
  if (!biz) return { career: c, contract };
  const costs = Math.round(due * CONTRACT_COST_RATIO);
  return { contract, career: { ...c, businesses: c.businesses.map(b => b.id !== biz.id ? b : { ...changeBusinessCash(b, due - costs), ledger: [{ month: end, label: `Contract milestone · ${p.name}`, amount: due }, { month: end, label: `Construction costs · ${p.name}`, amount: -costs }, ...b.ledger].slice(0, 40) }) } };
}

/** Uses the same exact quarterly interval as treasury settlement, before office expiry.
 * Legacy escrow is consumed once; completion effects are persisted with the transition. */
export function publicProjectsTurn(c: Career, start: string, end: string): Career {
  if (start !== c.date || monthIndex(end) - monthIndex(start) !== 3 || !projectJurisdiction(c)) return c;
  if (c.office?.termEnd && end > c.office.termEnd) return c;
  let n = c;
  for (const p of publicProjects(c)) {
    if (!['approved', 'in_progress'].includes(p.status) || !p.startDate || start < p.startDate || start < (p.lastProcessedEnd || p.startDate)) continue;
    const due = projectInstallment(p);
    let project: PublicProject = { ...p, lastProcessedEnd: end };
    if (!escrowed(p) && due > 0) {
      const payment = spendTreasury(n, due, `${p.id}|construction|${end}`, `${p.name} — quarterly construction`);
      if (!payment.ok) {
        // A paid transaction is never charged or progressed again, even if a malformed snapshot lost its watermark.
        const key = `${tenureKey(n)}|expense|${p.id}|construction|${end}`;
        if (n.treasury?.transactions.some(t => t.key === key)) continue;
        project = { ...project, status: 'paused', pauseReason: 'Halted due to treasury deficit', expectedCompletionDate: addMonths(end, Math.ceil((100 - p.progress) * p.durationTurns / 100) * 3) };
        n = updateProject(n, project);
        continue;
      }
      n = payment.career;
      const paid = payContractor(n, p, due, end);
      n = paid.career; project = { ...project, contract: paid.contract };
    }
    const progress = Math.min(100, Math.round((p.progress + 100 / p.durationTurns) * 1_000_000) / 1_000_000);
    const complete = progress >= 99.999999 || (p.constructionSpent ?? 0) + due >= p.totalCost;
    project = { ...project, contract: project.contract ?? null, progress: complete ? 100 : progress, constructionSpent: Math.min(p.totalCost, (p.constructionSpent ?? 0) + due), status: complete ? 'completed' : 'in_progress', pauseReason: null };
    if (complete) project = { ...project, completionDate: end, benefitsApplied: true };
    n = updateProject(n, project);
    if (complete && !p.benefitsApplied) {
      const benefit = projectBenefit(project);
      // Bound the combined completion gain as well as dampening concurrent completions.
      const awarded = n.approval?.history.filter(h => h.date === start && h.reason.startsWith('Public project completed:')).reduce((sum, h) => sum + Math.max(0, h.change), 0) ?? 0;
      if (holdsOffice(n)) n = applyActionApproval(n, 'project-completion', Math.max(0, Math.min(benefit.approval, 3 - awarded)), 'major', `Public project completed: ${project.name} — improved ${benefit.infrastructure ? 'infrastructure' : 'public services'} in ${project.jurisdiction}.`);
      n = { ...n, newsQueue: [...n.newsQueue, {
        h: `${project.name} completed · ${n.office?.jurisdiction ?? project.jurisdiction} · ${end}`,
        sub: `${n.office?.jurisdiction ?? project.jurisdiction} · ${end}`,
        body: `${project.name} opened on ${end} after ${usd(project.constructionSpent)} in public construction spending. The completed ${project.jurisdiction} project improves ${benefit.infrastructure ? 'infrastructure' : 'public services'} and employment.`,
        tag: 'government', subject: n.character.name, portrait: n.character.portrait,
      }] };
    }
  }
  return n;
}

export function manageProject(c: Career, id: string, action: 'resume' | 'cancel'): Result {
  if (!canApproveProject(c)) return { ok: false, message: 'Only an active mayor, governor or president can manage project funding.' };
  const p = publicProjects(c).find(project => project.id === id);
  if (!p || !['approved', 'in_progress', 'paused'].includes(p.status)) return { ok: false, message: 'This project cannot be managed.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  if (!['resume', 'cancel'].includes(action)) return { ok: false, message: 'Choose a project management action.' };
  let n = ensureTreasury(c);
  let project: PublicProject;
  let release = 0;
  if (action === 'resume') {
    if (!canResumeProject(c, p)) return { ok: false, message: `Resume requires a paused project and ${usd(projectInstallment(p))} in government treasury for the next installment.` };
    const expected = addMonths(c.date, Math.ceil((100 - p.progress) * p.durationTurns / 100) * 3);
    project = { ...p, status: 'in_progress', pauseReason: null, lastProcessedEnd: c.date > p.lastProcessedEnd ? c.date : p.lastProcessedEnd, expectedCompletionDate: expected };
  } else {
    release = Math.max(0, p.fundingCommitted - (p.constructionSpent ?? 0));
    // Only legacy escrow actually removed cash at approval. Release its unspent public cash explicitly.
    const treasury = n.treasury;
    const original = treasury?.transactions.find(t => t.key === `${tenureKey(c)}|expense|${p.id}`);
    const refund = escrowed(p) && original ? Math.min(release, Math.max(0, -original.amount - (p.constructionSpent ?? 0))) : 0;
    const key = `${tenureKey(c)}|project-release|${p.id}`;
    if (refund && treasury && !treasury.transactions.some(t => t.key === key)) n = { ...n, treasury: { ...treasury, balance: treasury.balance + refund, transactions: [...treasury.transactions, { key, tenure: treasury.tenure, date: c.date, label: `${p.name} — unspent escrow released`, amount: refund }] } };
    project = { ...p, status: 'cancelled', fundingCommitted: p.constructionSpent ?? 0, pauseReason: null, expectedCompletionDate: null, cancelledDate: c.date };
  }
  n = updateProject(n, project, release);
  const message = action === 'resume' ? `${p.name} resumed; quarterly payments restart next turn.` : `${p.name} cancelled; ${usd(p.constructionSpent ?? 0)} construction spending forfeited and ${usd(release)} unspent allocation released.`;
  return { ok: true, career: { ...n, actions: c.actions - ACTION_COST, log: [message, ...n.log].slice(0, 12) }, message };
}

/** Report facts from saved transitions; report/newspaper continuation never recalculates effects. */
export function projectReportLines(c: Career, start: string, end: string): string[] {
  return publicProjects(c).flatMap(p => {
    if (p.status === 'completed' && p.completionDate === end) return [`Public project completed: ${p.name}. ${projectBenefit(p).infrastructure ? 'Infrastructure' : 'Public services'} and employment improved; ${usd(p.constructionSpent)} construction spending.`];
    if (p.status === 'cancelled' && p.cancelledDate && p.cancelledDate >= start && p.cancelledDate < end) return [`Public project cancelled: ${p.name}. ${usd(p.constructionSpent)} spent construction funds forfeited; no further payments.`];
    if (p.status === 'paused' && p.pauseReason) return [`Public project stalled: ${p.name}. ${p.pauseReason}; progress remains ${Number(p.progress.toFixed(1))}%.`];
    return [];
  });
}