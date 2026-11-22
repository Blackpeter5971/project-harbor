import { useState } from 'react';
import { Users, UserRoundCheck, UserPlus, UserMinus, BriefcaseBusiness } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import type { BusinessRequest } from '@/lib/game/business';
import { normalizeBusiness, type Business } from '@/lib/game/business-schema';
import { activeManager, professionalExecutives, staffingEconomics, trustedManagers, ownerUnavailable } from '@/lib/game/business-workforce';
import { quarterlySimulation } from '@/lib/game/business-engine';
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
export function BusinessWorkforcePanel({ career, business, onRequest }: { career: Career; business: Business; onRequest: (r: BusinessRequest) => boolean }) {
  const [count, setCount] = useState('1');
  const b = normalizeBusiness(business), staff = staffingEconomics(b), f = quarterlySimulation(b, career), gm = activeManager(career, b), managers = trustedManagers(career), n = Number(count), revision = career.businessRevision ?? 0;
  return <section aria-label="Company workforce">
    <div className="panel-row"><h3 className="section-label"><Users /> Operational staff</h3><b>{b.employees.length}</b></div>
    <div className="company-facts"><span>Quarterly staff payroll<b>{usd(f.staffPayroll)}</b></span><span>Production capacity<b>{f.capacity.toLocaleString('en-US')} units</b></span><span>Salary per employee<b>{usd(staff.quarterlySalary)} / quarter</b></span><span>Estimated demand<b>{f.demanded.toLocaleString('en-US')} units</b></span></div>
    <label className="bank-field">Staff count<input aria-label="Staff count" inputMode="numeric" type="number" min="1" max="1000" step="1" value={count} onChange={e => setCount(e.target.value)} /></label>
    <div className="bank-actions"><Button variant="gameOutline" disabled={!Number.isInteger(n) || n < 1 || n > 1000 || b.employees.length + n > 1000 || b.account < n * staff.quarterlySalary} onClick={() => onRequest({ type: 'hire-staff', id: b.id, count: n, revision })}><UserPlus /> Hire staff</Button><Button variant="gameOutline" disabled={!Number.isInteger(n) || n < 1 || n > b.employees.length} onClick={() => onRequest({ type: 'fire-staff', id: b.id, count: n, revision })}><UserMinus /> Fire staff</Button></div>
    <p className="mini-note">New quarterly payroll {usd(Number.isInteger(n) && n > 0 ? n * staff.quarterlySalary : 0)} · paid from company operating cash.</p>
    <h3 className="section-label mt-5"><UserRoundCheck /> General manager</h3>
    <div className="company-gm-status"><BriefcaseBusiness /><div><b>{gm?.name ?? 'Owner-managed'}</b><p>{gm ? `GM quality ${gm.quality}/100 · ${usd(gm.quarterlySalary)} / quarter` : ownerUnavailable(career) ? 'Owner unavailable · reduced operating capacity' : 'Owner available for operations'}</p><p>Efficiency {Math.round(f.efficiency * 100)}%{gm ? ' · no owner-absence penalty' : ''}</p></div></div>
    <label className="bank-field">Appoint general manager<select aria-label={`Manager for ${b.name}`} value={b.generalManager?.id ?? b.managerId ?? ''} onChange={e => onRequest({ type: 'manager', id: b.id, personId: e.target.value || null, revision })}>
      <option value="">Owner-managed</option>{gm && !managers.some(m => m.id === gm.id) && !professionalExecutives.some(m => m.id === gm.id) && <option value={gm.id}>{gm.name}</option>}
      {managers.length > 0 && <optgroup label="Trusted contacts & family">{managers.map(m => <option key={m.id} value={m.id}>{m.name} · quality {m.quality} · {usd(m.quarterlySalary)}/qtr</option>)}</optgroup>}
      <optgroup label="Hire professional executive">{professionalExecutives.map(m => <option key={m.id} value={m.id} disabled={b.account < m.recruitmentCost}>{m.name} · quality {m.quality} · {usd(m.recruitmentCost)} setup</option>)}</optgroup>
    </select></label>
    <p className="mini-note">An active GM maintains capacity during political office or custody. Executive recruitment and salaries use company funds.</p>
    {b.employees.length > 0 && <details className="biz-ledger mt-4"><summary>Employee payroll roster · {b.employees.length}</summary>{b.employees.map((e, i) => <div className="bank-record" key={e.id}><b>Operational staff {i + 1}</b><p className="mini-note">Hired {e.hired} · {usd(e.quarterlySalary)} / quarter</p></div>)}</details>}
  </section>;
}