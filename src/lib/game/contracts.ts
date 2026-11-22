import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import type { PublicProject } from './public-project-schema';
import { canApproveProject, publicProjects } from './public-projects';
import { cityState } from './city';
import { stateGovernment } from './state-government';
import { federalState } from './federal';
import { rand, usd } from './campaign';
import { corruptionOf, record, riskOf } from './corruption';
import type { Result } from './support';

/**
 * Phase 5B — government contracts. Awarding never moves money by itself: quarterly
 * milestones in publicProjectsTurn debit the treasury and credit the contractor's business account.
 * Open tender (with recusal) is a fair, disclosed conflict; direct discretion to an owned firm is self-dealing.
 */
export type AwardMethod = 'open_tender' | 'direct';
export const SELF_DEALING_EVIDENCE = 25;
const RIVALS = ['Keystone Civil Works', 'Atlas Builders', 'Brightline Engineering', 'Union Paving Co.'];
const rival = (p: PublicProject) => RIVALS[Math.floor(rand(`${p.id}|rival`) * RIVALS.length)] ?? RIVALS[0]!;
export const contractable = (c: Career) => publicProjects(c).filter(p => ['approved', 'in_progress'].includes(p.status) && !p.contract);
/** Chance an owned firm wins a competitive tender, from its reputation. */
export const tenderWinChance = (reputation: number) => Math.min(0.75, 0.25 + reputation / 200);

function save(c: Career, project: PublicProject): Career {
  const map = (list?: PublicProject[]) => (list ?? []).map(p => p.id === project.id ? project : p);
  if (project.jurisdiction === 'city') { const s = cityState(c); return { ...c, city: { ...s, publicProjects: map(s.publicProjects) } }; }
  if (project.jurisdiction === 'state') { const s = stateGovernment(c); return { ...c, stateGovernment: { ...s, publicProjects: map(s.publicProjects) } }; }
  const s = federalState(c); return { ...c, federalGovernment: { ...s, publicProjects: map(s.publicProjects) } };
}

/** businessId null = no owned bidder. Once per project; costs 15% energy. */
export function awardContract(c: Career, projectId: string, method: AwardMethod, businessId: string | null): Result {
  if (!canApproveProject(c)) return { ok: false, message: 'Only an active mayor, governor or president awards public contracts.' };
  const p = contractable(c).find(x => x.id === projectId);
  if (!p) return { ok: false, message: 'This project has no open contract.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Awarding a contract costs 15% energy.' };
  const biz = businessId ? c.businesses.find(b => b.id === businessId) : null;
  if (businessId && !biz) return { ok: false, message: 'Choose one of your businesses.' };
  if (method === 'direct' && !biz) return { ok: false, message: 'Direct awards go to a named firm; pick your business or run a tender.' };
  let winner: { name: string; id: string | null } = { name: rival(p), id: null };
  if (biz && (method === 'direct' || rand(`${p.id}|tender|${biz.id}`) < tenderWinChance(biz.reputation))) winner = { name: biz.name, id: biz.id };
  const selfDealing = method === 'direct' && !!biz;
  const project: PublicProject = { ...p, contract: { contractor: winner.name, businessId: winner.id, method, selfDealing, conflict: !!biz, awarded: c.date, paid: 0, lastPaidEnd: '' } };
  let n = save({ ...c, actions: c.actions - ACTION_COST }, project);
  const message = selfDealing
    ? `${p.name} handed to ${biz!.name} by executive discretion. No tender, no oversight — the paper trail is thick.`
    : method === 'open_tender' && biz
      ? winner.id ? `${biz.name} won the open tender for ${p.name}. You recused yourself; the conflict is on file.` : `${winner.name} outbid ${biz.name} in the open tender for ${p.name}.`
      : `${winner.name} won the open tender for ${p.name}.`;
  if (selfDealing) {
    const evidence = SELF_DEALING_EVIDENCE + Math.min(10, corruptionOf(c).txns.length * 2);
    n = record(n, { id: `contract|${p.id}`, date: c.date, amount: p.totalCost, kind: 'self_dealing', source: biz!.name, destination: 'business', favor: `${p.name} (${usd(p.totalCost)})`, risk: riskOf(evidence), evidence }, {});
  }
  return { ok: true, message, career: { ...n, log: [message, ...n.log].slice(0, 12) } };
}
