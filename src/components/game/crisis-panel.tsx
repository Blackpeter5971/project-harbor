import { WatchAdOffer } from './ads';
import { useEffect, useRef, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { crisisResponses, officeCrises, respondToCrisis } from '@/lib/game/crisis-responses';
import { treasuryFunds } from '@/lib/game/budget';
import { usd } from '@/lib/game/campaign';
import type { Result } from '@/lib/game/support';
import { EventModal } from './event-modal';

import { ImpeachmentRiskMeter } from './impeachment-panel';
export function CrisisPanel({ career, onResult }: { career: Career; onResult: (r: Result) => void }) {
  const latest = useRef(career);
  useEffect(() => { latest.current = career; }, [career]);
  const [selection, setSelection] = useState<{ crisis: string; response: string } | null>(null);
  const crises = officeCrises(career).filter(p => p.status !== 'resolved');
  const selected = crises.find(p => p.id === selection?.crisis);
  const response = selected ? crisisResponses(career, selected.id).find(r => r.id === selection?.response) : undefined;
  if (!crises.length) return <ImpeachmentRiskMeter career={career} />;
  return <>
    <ImpeachmentRiskMeter career={career} />
    <h3 className="section-label mt-3">Crisis response</h3>
    <WatchAdOffer label="Crisis help: watch an ad" />
    <p className="mini-note">Government treasury · {usd(treasuryFunds(career))}</p>
    <div className="row-list">{crises.map(p => <div className="game-row static" key={p.id}><div className="w-full">
      <b><ShieldAlert className="inline h-4 w-4" /> {p.title}</b>
      <p>{p.description}</p><p>Severity {p.severity} · {p.durationRemaining} quarter{p.durationRemaining === 1 ? '' : 's'} remaining · {p.trajectory}</p>
      {p.selectedResponseId ? <p>Confirmed: {p.selectedResponseId === 'invest' ? 'High-investment intervention' : p.selectedResponseId === 'targeted' ? 'Targeted assistance' : p.selectedResponseId === 'delay' ? 'Fiscal restraint / delay' : 'Oversight / negotiations'}</p> : <div className="modal-actions min-w-0">{crisisResponses(career, p.id).map(r => <div className="min-w-0" key={r.id}>
        <Button variant="gameOutline" className="event-choice w-full h-auto min-h-14 whitespace-normal flex-col items-stretch text-left gap-1 px-3 py-2" disabled={r.disabled} onClick={() => setSelection({ crisis: p.id, response: r.id })}>
          <span>{r.label} · {usd(r.cost)}{r.actions ? ' · 15% energy' : ''}</span><small>{r.hint}</small>
        </Button>
        {r.unavailable && <p className="mini-note" role="status">{r.unavailable}</p>}
      </div>)}</div>}
    </div></div>)}</div>
    {selected && response && <EventModal event={{ id: `crisis-confirm:${selected.id}:${response.id}`, title: 'Confirm crisis response', text: `${selected.title}: ${response.label}. ${usd(response.cost)} from government treasury; ${usd(treasuryFunds(career))} available. ${response.hint}`, parties: [career.character.name, career.office?.jurisdiction ?? 'Public office'], choices: [
      { id: 'confirm', label: `Confirm · ${usd(response.cost)}`, hint: response.unavailable || 'Personal savings and campaign funds stay untouched.', disabled: response.disabled },
      { id: 'back', label: 'Back to responses', hint: 'No funds or actions spent.' },
    ] }} onChoose={choice => {
      if (choice === 'confirm') {
        const result = respondToCrisis(latest.current, selected.id, response.id);
        if (result.ok) latest.current = result.career;
        onResult(result);
      }
      setSelection(null);
    }} />}
  </>;
}