import { Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { nationalLedger, type LedgerSession } from '@/lib/game/civil-war/national-ledger';
import { CIVIL_WAR_SCRIPT } from '@/lib/game/civil-war/civil-war-script';

const label = (id: string) => CIVIL_WAR_SCRIPT.meters.find(m => m.id === id)?.label ?? id;
const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function NationalLedgerSheet({ session }: { session: LedgerSession }) {
  const l = nationalLedger(session);
  return <Sheet><SheetTrigger asChild><Button variant="gameOutline" size="sm"><Landmark /> National Ledger</Button></SheetTrigger>
    <SheetContent side="bottom" className="ledger-1860 max-h-[80vh] overflow-y-auto">
      <SheetHeader><SheetTitle className="ledger-title">The National Ledger</SheetTitle></SheetHeader>
      <p className="ledger-sub">{l.government} · Anno 1860</p>
      <div className="ledger-grid">{l.rows.map(r => <div key={r.id} className="ledger-card">
        <span className="ledger-icon" aria-hidden>{r.icon}</span>
        <b>{r.label}</b>
        <strong>{r.value}</strong>
        <small className={`ledger-standing is-${r.standing.toLowerCase()}`}>{r.standing}{r.change ? ` · ${sign(r.change)}` : ''}</small>
        <div className="stage-meter-bar"><span style={{ width: `${r.value}%` }} /></div>
      </div>)}</div>
      <h3 className="ledger-section">Entries</h3>
      {l.entries.length ? <ol className="ledger-entries">{l.entries.map((e, i) => <li key={i}><b>{e.label}</b>{e.changes.length ? <span>{e.changes.map(([k, d]) => `${label(k)} ${sign(d)}`).join(' · ')}</span> : null}</li>)}</ol>
        : <p className="mini-note">No entries yet. Your decisions will be recorded here.</p>}
    </SheetContent></Sheet>;
}
