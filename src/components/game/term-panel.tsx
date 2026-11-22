import { useState } from 'react';
import { Flag, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { chooseTermPlan, incumbentElection, monthsRemaining, nearTermEnd, termKey, termLimitReason } from '@/lib/game/terms';
import { availableElections, resignOffice } from '@/lib/game/campaign';
import { monthLabel, type Result } from '@/lib/game/gameplay';

export function TermPanel({ career, onResult, onCampaigns }: { career: Career; onResult: (r: Result) => void; onCampaigns: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const office = career.office;
  if (!office || !nearTermEnd(career)) return null;
  const limit = termLimitReason(career, office.id);
  const election = incumbentElection(career);
  const leaving = career.termPlan?.tenure === termKey(career) && career.termPlan.choice === 'leave';
  const canRun = availableElections({ ...career, termPlan: null }).some(e => e.office.id === office.id);
  return <section className="notifications" aria-label="Term choices">
    <h3 className="section-label">Your next term</h3>
    <p className="mini-note">{monthsRemaining(career)} months left · Election {election ? monthLabel(election) : '—'} · Term ends {monthLabel(office.termEnd)}</p>
    {limit && <p className="mini-note">{limit}</p>}
    {career.campaign ? <p className="mini-note">Your campaign is underway. Only a new election win grants another term.</p> : <>
      {leaving && <p className="mini-note">Departure at term end saved. Office pay stops then; your savings remain yours.</p>}
      {!canRun && !limit && <p className="mini-note">Filing is closed or campaign requirements are unmet. Your term will not renew automatically.</p>}
      <div className="detail-actions mt-2">
        <Button variant="game" disabled={!!limit || !canRun} onClick={() => { const r = chooseTermPlan(career, 'run'); onResult(r); if (r.ok || career.termPlan?.choice === 'run') onCampaigns(); }}><Flag />{leaving ? 'Reconsider re-election' : 'Run for re-election'}</Button>
        <Button variant="gameOutline" onClick={() => setConfirm(true)}><Flag />Pursue another office</Button>
        <Button variant="gameOutline" disabled={leaving} onClick={() => onResult(chooseTermPlan(career, 'leave'))}><LogOut />Leave at term end</Button>
      </div>
    </>}
    {confirm && <div className="modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="term-resign-title"><div className="modal-head"><h2 id="term-resign-title">Resign before pursuing another office?</h2></div><p>You will leave {office.title} now. Office pay stops, Government locks, and reputation falls by 2. Savings and career records remain intact.</p><div className="modal-actions"><Button variant="game" onClick={() => { const r = resignOffice(career); onResult(r); if (r.ok) { setConfirm(false); onCampaigns(); } }}>Confirm resignation</Button><Button variant="gameOutline" onClick={() => setConfirm(false)}>Keep office</Button></div></section></div>}
  </section>;
}