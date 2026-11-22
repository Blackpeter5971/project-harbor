import { ACTION_COST } from '@/lib/game/energy-costs';
import { UsersRound, UserPlus, LockKeyhole, PartyPopper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { directorCatalog, staffRoster, recruitmentCandidates, campaignPayroll, directorHiringCost, directorBlocker, hasDirector, rivalVulnerabilities, staffRequest, usd, adQuarter, baseCosts, officeById, groups, endorsementCount, type StaffRequest } from '@/lib/game/campaign';
import { Portrait } from './portrait';

export function CampaignHeadquarters({ career, onRequest }: { career: Career; onRequest: (request: StaffRequest) => void }) {
  const camp = career.campaign;
  if (!camp) return null;
  const roster = staffRoster(camp);
  const salary = campaignPayroll(camp);
  const mine = camp.endorsements.filter(e => e.candidate === career.character.name);
  const count = endorsementCount(camp, career.character.name);
  return <div role="tabpanel" className="campaign-headquarters">
    <div className={`endorsement-bar ${count === 0 ? 'none' : count === 1 ? 'thin' : 'strong'}`} aria-label="Endorsement status">
      <b>Endorsements: {count}</b>
      {mine.map(e => <span key={e.group} className="tag-ok">{groups.find(g => g.id === e.group)?.name ?? e.group}</span>)}
      <p className="mini-note">{count === 0 ? 'No group backing — rallies, ads and town halls give only 25% of normal gains, and you face a 10% turnout deficit in the general.' : count === 1 ? 'Full campaign gains unlocked. One more endorsement removes the 10% general-election turnout deficit.' : 'Coalition secured — full gains and no turnout deficit.'}</p>
    </div>
    <div className="panel-row"><h3 className="section-label"><UsersRound /> Campaign Headquarters</h3><span className="mini-note">Directors {roster.length}/4</span></div>
    <div className="hq-payroll"><span>Next quarterly payroll</span><b>{usd(salary)}</b><span>Campaign cash {usd(camp.funds)}</span></div>
    {salary > camp.funds && <p className="mini-note ad-risk">Payroll shortfall: {usd(salary - camp.funds)}. Unpaid directors leave before new donations arrive.</p>}
    <h3 className="section-label">Director roster</h3>
    {roster.length === 0 && <p className="mini-note">No directors hired.</p>}
    <div className="hq-roster">{roster.map(d => <article className="hq-person" key={d.id}><Portrait index={d.portrait} /><div><span className="eyebrow">{directorCatalog.find(r => r.id === d.role)?.title}</span><h4>{d.name}</h4><p>Competence {d.competence} · Loyalty {d.loyalty}</p><p>{usd(d.salary)} / quarter{d.legacy ? ' · Retained from your previous team' : ''}</p><p className="hq-perk">{directorCatalog.find(r => r.id === d.role)?.perk}</p></div></article>)}</div>
    {(camp.legacyAides ?? Math.max(0, camp.staff - roster.length)) > 0 && <p className="mini-note">Legacy campaign aides retained: {camp.legacyAides ?? Math.max(0, camp.staff - roster.length)}.</p>}
    <h3 className="section-label mt-3">Recruitment</h3>
    <div className="hq-recruits">{recruitmentCandidates(career).filter(d => !roster.some(h => h.role === d.role)).map(d => {
      const rule = directorCatalog.find(r => r.id === d.role);
      const block = directorBlocker(career, d.role);
      return <article className="hq-person" key={d.id}><Portrait index={d.portrait} /><div><span className="eyebrow">{rule?.title}</span><h4>{d.name}</h4><p>Competence {d.competence} · Loyalty {d.loyalty}</p><p>{rule?.perk}</p><p>Recruit {usd(directorHiringCost(camp))} · Salary {usd(d.salary)} / quarter</p>{block && <p className="mini-note">{block}</p>}<Button variant="gameOutline" size="sm" disabled={!!block} onClick={() => onRequest(staffRequest(career, d.role))}>{block ? <LockKeyhole /> : <UserPlus />}Hire {rule?.title}</Button></div></article>;
    })}</div>
    {hasDirector(camp, 'finance') && <Button variant="gameOutline" className="w-full mt-3" disabled={career.actions < ACTION_COST || camp.funds < baseCosts[officeById(camp.office).id].event * 2 || camp.dinnerQuarter === adQuarter(career.date)} onClick={() => onRequest(staffRequest(career, 'dinner'))}><PartyPopper />High-dollar dinner · {usd(baseCosts[officeById(camp.office).id].event * 2)}</Button>}
    {rivalVulnerabilities(career).length > 0 && <><h3 className="section-label mt-3">Opposition research · Private briefing</h3>{rivalVulnerabilities(career).map(v => <div className="hq-briefing" key={v.rival}><b>{v.rival}</b><p>{v.detail}</p></div>)}</>}
  </div>;
}