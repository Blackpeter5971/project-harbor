import { Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { warRoom } from '@/lib/game/civil-war/war-room';

export function WarRoomSheet({ session }: { session: { flags: readonly string[] } }) {
  const w = warRoom(session.flags);
  return <Sheet><SheetTrigger asChild><Button variant="gameOutline" size="sm"><Swords /> War Room</Button></SheetTrigger>
    <SheetContent side="bottom" className="ledger-1860 max-h-[85vh] overflow-y-auto">
      <SheetHeader><SheetTitle className="ledger-title">The War Room</SheetTitle></SheetHeader>
      <p className="ledger-sub">Commanding general: <strong>{w.general}</strong></p>
      <div className="mt-3 space-y-2">{w.theaters.map(t => <div key={t.id} className="border-b pb-2">
        <div className="flex justify-between"><strong>{t.name}</strong><span>{t.status}</span></div>
        <p className="mini-note">{t.area}</p></div>)}</div>
      <p className="ledger-sub mt-3"><strong>Naval orders</strong></p>
      <ul className="list-disc pl-5">{w.navy.map(n => <li key={n}>{n}</li>)}</ul>
    </SheetContent></Sheet>;
}
