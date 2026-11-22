import { ACTION_COST } from '@/lib/game/energy-costs';
import { useState } from 'react';
import { Check, Gavel, Play, Wallet, X } from 'lucide-react';
import { awardContract, tenderWinChance } from '@/lib/game/contracts';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import type { Result } from '@/lib/game/support';
import { treasuryFunds } from '@/lib/game/budget';
import { usd } from '@/lib/game/campaign';
import { projectCategories } from '@/lib/game/public-project-schema';
import { approveProject, canApproveProject, canResumeProject, manageProject, projectCatalog, projectFunds, projectInstallment, publicProjects } from '@/lib/game/public-projects';

export function PublicProjectPanel({ career, onResult }: { career: Career; onResult: (r: Result) => void }) {
  const catalog = projectCatalog(career), saved = publicProjects(career);
  if (!catalog.length) return null;
  return <>
    <h3 className="section-label mt-3">Public projects · {catalog[0]?.jurisdiction}</h3>
    <div className="mini-stats"><span><Wallet size={12} className="inline" /> Treasury <b>{usd(treasuryFunds(career))}</b></span><span>Available allocation <b>{usd(projectFunds(career))}</b></span></div>
    <div className="row-list">{catalog.map(proposal => {
      const project = saved.find(p => p.id === proposal.id) ?? proposal;
      const approved = project.status !== 'proposed';
      const disabled = approved || !canApproveProject(career) || career.actions < ACTION_COST || projectFunds(career) < project.totalCost;
      return <div className="game-row static" key={project.id}><div className="w-full">
        <b>{project.name}</b><p>{projectCategories.find(cat => cat.id === project.category)?.name}</p>
        <p>{usd(project.totalCost)} total · {project.durationTurns} quarters</p>
        <p>{project.status.replace('_', ' ')} · {Number(project.progress.toFixed(1))}% · {usd(project.fundingCommitted)} committed</p>
        <p>{usd(project.constructionSpent)} spent · {usd(projectInstallment(project))} per quarter{project.paymentMode === 'escrow' ? ' · prepaid escrow' : ''}</p>
        {project.contract && <p className={`contract-stamp ${project.contract.selfDealing ? 'text-destructive' : 'text-primary'}`}><Gavel size={12} className="inline" /> {project.contract.contractor} · {project.contract.method === 'direct' ? 'Direct executive award' : 'Open tender'}{project.contract.selfDealing ? ' · self-dealing' : project.contract.conflict ? ' · disclosed conflict, recused' : ''} · {usd(project.contract.paid)} paid</p>}
        {!project.contract && ['approved', 'in_progress'].includes(project.status) && canApproveProject(career) && <ContractAward career={career} project={project} onResult={onResult} />}
        {project.pauseReason && <p className="mini-note">{project.pauseReason}</p>}
        {project.startDate && <p>Start {project.startDate} · Expected {project.expectedCompletionDate}</p>}
        {project.completionDate && <p>Completed {project.completionDate}</p>}
        {!approved && <Button variant="gameOutline" size="sm" disabled={disabled} aria-label={`Approve ${project.name}`} onClick={() => onResult(approveProject(career, project.catalogId))}><Check />Approve & reserve · 15% energy</Button>}
        {project.status === 'paused' && <Button variant="gameOutline" size="sm" disabled={!canResumeProject(career, project)} aria-label={`Resume ${project.name}`} onClick={() => onResult(manageProject(career, project.id, 'resume'))}><Play />Resume · 15% energy</Button>}
        {['approved', 'in_progress', 'paused'].includes(project.status) && <Button variant="gameOutline" size="sm" disabled={!canApproveProject(career) || career.actions < ACTION_COST} aria-label={`Cancel ${project.name}`} onClick={() => onResult(manageProject(career, project.id, 'cancel'))}><X />Cancel · 15% energy</Button>}
        {!approved && !canApproveProject(career) && <p className="mini-note">Executive approval required.</p>}
        {!approved && canApproveProject(career) && projectFunds(career) < project.totalCost && <p className="mini-note">{treasuryFunds(career) < project.totalCost ? 'Insufficient treasury.' : 'Insufficient public allocation.'}</p>}
      </div></div>;
    })}</div>
  </>;
}
function ContractAward({ career, project, onResult }: { career: Career; project: ReturnType<typeof publicProjects>[number]; onResult: (r: Result) => void }) {
  const [biz, setBiz] = useState(career.businesses[0]?.id ?? '');
  const owned = career.businesses.find(b => b.id === biz) ?? null;
  const off = career.actions < ACTION_COST;
  return <div className="contract-award">
    <p className="mini-note">Contract open for bids.</p>
    {career.businesses.length > 0 && <label className="mini-note">Your bidder: <select aria-label="Your bidding company" value={biz} onChange={e => setBiz(e.target.value)}><option value="">None — stay out</option>{career.businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
    <Button variant="gameOutline" size="sm" disabled={off} aria-label={`Open tender for ${project.name}`} onClick={() => onResult(awardContract(career, project.id, 'open_tender', owned?.id ?? null))}><Gavel />Open tender{owned ? ` · ${Math.round(tenderWinChance(owned.reputation) * 100)}% win` : ''} · 15% energy</Button>
    {owned && <Button variant="gameOutline" size="sm" disabled={off} aria-label={`Direct award ${project.name} to ${owned.name}`} onClick={() => onResult(awardContract(career, project.id, 'direct', owned.id))}><Gavel />Direct award to {owned.name} · high exposure</Button>}
  </div>;
}
