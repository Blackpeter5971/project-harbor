import { useState } from 'react';
import { ArrowRight, Briefcase, Check, ListFilter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { jobs, jobSectors, missingJobRequirements } from '@/lib/game/job-market';
import { employmentPay } from '@/lib/game/employment';
import { jobStatus } from '@/lib/game/gameplay';

export function JobListings({ career, onSelect }: { career: Career; onSelect: (id: string) => void }) {
  const [sector, setSector] = useState('all');
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const available = jobs.filter(j => (sector === 'all' || j.sector === sector) && (!eligibleOnly || missingJobRequirements(career, j).length === 0));
  return <section className="job-market">
    <div className="job-filters">
      <label className="bank-field">Industry<select aria-label="Industry" value={sector} onChange={e => setSector(e.target.value)}><option value="all">All industries</option>{jobSectors.map(s => <option key={s}>{s}</option>)}</select></label>
      <label className="job-eligible"><input type="checkbox" checked={eligibleOnly} onChange={e => setEligibleOnly(e.target.checked)} /><ListFilter /> Eligible now</label>
    </div>
    <p className="mini-note">{available.length} listings · applications cost 1 action · no application fee</p>
    {jobSectors.map(s => { const list = available.filter(j => j.sector === s); if (!list.length) return null; return <section key={s} aria-label={s} className="job-sector">
      <h3 className="section-label"><Briefcase /> {s}</h3>
      <div className="row-list">{list.map(j => { const missing = missingJobRequirements(career, j); const status = jobStatus(career, j.id); const pay = employmentPay({ ...career, job: { id: j.id, since: career.date } }); return <Button variant="gameChoice" className="game-row job-listing" key={j.id} onClick={() => onSelect(j.id)}>
        <div><b>{j.title}</b><p>${pay.quarterly.toLocaleString('en-US')}/turn · {j.minimumEducation} · {j.experienceMonths} months experience</p><p className={missing.length ? '' : 'text-success'}>{status === 'employed' ? 'Employed here' : status === 'offered' ? 'Offer received' : missing.length ? `Needs ${missing.join(', ')}` : <><Check className="inline size-3" /> Eligible now</>}</p></div><ArrowRight />
      </Button>; })}</div>
    </section>; })}
    {!available.length && <p className="mini-note">No matching listings.</p>}
  </section>;
}