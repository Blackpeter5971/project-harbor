import { useState } from 'react';
import { Crown, Handshake, Swords, Users, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { Career } from '@/lib/game/career';
import type { Result } from '@/lib/game/gameplay';
import { usd } from '@/lib/game/campaign';
import {
  answerAssist, answerOffer, assistOptions, band, filterFigures, figureOf, hostEvent, HOST_COST, ideologyLabel, networkAction, networkActions, networkOf, profileOf, type NetworkFilter,
} from '@/lib/game/network';
import { figurePortraitById } from './figure-portraits';
import reception from '@/assets/network-reception.jpg';
import assistArt from '@/assets/network-assist.jpg';

const TABS: { id: NetworkFilter; label: string; icon: typeof Users }[] = [
  { id: 'allies', label: 'Allies', icon: Handshake }, { id: 'rivals', label: 'Rivals', icon: Swords },
  { id: 'leadership', label: 'Party', icon: Crown }, { id: 'influential', label: 'Elders', icon: Landmark }, { id: 'all', label: 'All', icon: Users },
];

export function ScoreBadge({ score }: { score: number }) {
  const b = band(score);
  return <span className={`rel-badge rel-${b.tone}`}>{score > 0 ? '+' : ''}{score} · {b.label}</span>;
}

export function NetworkPanel({ career, onResult }: { career: Career; onResult?: ((r: Result) => void) | undefined }) {
  const [open, setOpen] = useState<string | null>(null);
  const net = networkOf(career), known = net.figures.filter(f => f.discovered), rev = career.network?.revision ?? 0;
  const send = (r: Result) => onResult?.(r);
  return <section className="network-panel" aria-label="Political Network">
    <div className="network-hero"><img src={reception} alt="" width={1024} height={768} /><div><span className="eyebrow">Political Network</span><b>{known.length} known contacts · {known.filter(f => f.score >= 50).length} allies · {known.filter(f => f.score <= -50).length} rivals</b><small className="mini-note block">Build your reputation to meet more powerful figures.</small></div></div>
    {net.offers.length > 0 && <div className="grid gap-2 mt-2" aria-label="Pending offers">{net.offers.map(o => { const p = profileOf(o.figureId); if (o.kind === 'assist') return <div key={o.id} className="assist-card" aria-label={`Request from ${p.name}`}>
      <img className="assist-art" src={assistArt} alt="" width={1152} height={576} loading="lazy" />
      <div className="assist-body"><div className="flex gap-2 items-center"><img src={figurePortraitById(p.id, p.portrait)} alt="" width={44} height={44} loading="lazy" /><div><span className="eyebrow">Assistance request · {'★'.repeat(o.stakes ?? 1)}</span><b className="block">{o.text}</b></div></div>
      <div className="grid gap-1 mt-2">{assistOptions(career, o).map(opt => <Button key={opt.id} size="sm" variant={opt.id === 'full' ? 'game' : 'gameOutline'} className="assist-choice h-auto justify-start text-left" disabled={!!opt.blocked} title={opt.blocked || undefined} onClick={() => send(answerAssist(career, o.id, opt.id))}><span><b className="block">{opt.label}</b><small>{opt.blocked || opt.detail}</small></span></Button>)}</div></div>
    </div>; return <div key={o.id} className="network-offer">
      <img src={figurePortraitById(p.id, p.portrait)} alt="" width={48} height={48} loading="lazy" />
      <small className="flex-1">{o.text}</small>
      <span className="flex gap-1"><Button size="sm" variant="game" onClick={() => send(answerOffer(career, o.id, true))}>Accept</Button><Button size="sm" variant="gameOutline" onClick={() => send(answerOffer(career, o.id, false))}>Decline</Button></span>
    </div>; })}</div>}
    <Button variant="gameOutline" className="w-full mt-2" onClick={() => send(hostEvent(career, rev))} disabled={net.hostTurn === career.date}>Host reception · {usd(HOST_COST)} · 15% energy</Button>
    <Tabs defaultValue="all" className="mt-2">
      <TabsList className="w-full grid grid-cols-5 h-auto">{TABS.map(t => <TabsTrigger key={t.id} value={t.id} className="flex-col gap-0 py-1 text-[11px]"><t.icon className="size-4" />{t.label}</TabsTrigger>)}</TabsList>
      {TABS.map(t => { const rows = filterFigures(career, t.id); return <TabsContent key={t.id} value={t.id}>
        {rows.length ? <ul className="network-list">{rows.map(({ st, p }) => <li key={st.id}><button type="button" className="network-row" onClick={() => setOpen(st.id)} aria-label={`${p.name} profile`}>
          <img src={figurePortraitById(p.id, p.portrait)} alt="" width={44} height={44} loading="lazy" />
          <span className="flex-1 min-w-0"><b className="block truncate">{p.name}{st.allied ? ' 🤝' : ''}</b><small className="mini-note block truncate">{st.office} · {st.party}</small></span>
          <ScoreBadge score={st.score} />
        </button></li>)}</ul> : <p className="mini-note mt-2">Nobody here yet.</p>}
      </TabsContent>; })}
    </Tabs>
    {open && <ProfileSheet career={career} id={open} onClose={() => setOpen(null)} onAct={a => send(networkAction(career, open, a, rev))} />}
  </section>;
}

function ProfileSheet({ career, id, onClose, onAct }: { career: Career; id: string; onClose: () => void; onAct: (a: Parameters<typeof networkAction>[2]) => void }) {
  const st = figureOf(career, id), p = profileOf(id);
  if (!st) return null;
  return <Sheet open onOpenChange={v => !v && onClose()}>
    <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto network-sheet">
      <SheetHeader className="text-left">
        <div className="flex gap-3 items-center"><img className="network-portrait" src={figurePortraitById(p.id, p.portrait)} alt={p.name} width={88} height={88} />
          <div><SheetTitle>{p.name}</SheetTitle><SheetDescription>{st.office} · {st.party}{st.party !== p.party ? ` (formerly ${p.party})` : ''}</SheetDescription><ScoreBadge score={st.score} /></div></div>
      </SheetHeader>
      <p className="mini-note mt-2">{p.bio}</p>
      <div className="mini-stats mt-2"><span>Ideology <b>{ideologyLabel(p.ideology)}</b></span><span>Reputation <b>{st.reputation}</b></span><span>Influence <b>{st.influence}</b></span><span>Ambition <b>{p.ambition}</b></span><span>Loyalty <b>{st.loyalty}</b></span><span>Party satisfaction <b>{st.satisfaction}</b></span></div>
      <div className="grid gap-2 mt-3">{networkActions(career, id).map(a => <Button key={a.id} variant="gameOutline" className="h-auto flex-col items-start py-2 text-left whitespace-normal" disabled={a.disabled} onClick={() => onAct(a.id)}>
        <span>{a.label}</span><small className="opacity-80">{a.disabled ? a.reason : a.hint}</small>
      </Button>)}</div>
    </SheetContent>
  </Sheet>;
}
