import { ACTION_COST } from '@/lib/game/energy-costs';
import { useState } from 'react';
import { Droplets, Handshake, Siren, Vault } from 'lucide-react';
import type { Career } from '@/lib/game/career';
import type { Result } from '@/lib/game/gameplay';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { corruptionOf } from '@/lib/game/corruption';
import { embezzle, embezzleEvidence, embezzleLimit, embezzlePenalty, influenceOffer, isExecutive, launder, launderMethods, peddleInfluence, type LaunderMethod } from '@/lib/game/laundering';
import { treasuryFunds } from '@/lib/game/budget';

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function LaunderingSection({ career, onResult }: { career: Career; onResult: (r: Result) => void }) {
  const k = corruptionOf(career), offer = influenceOffer(career);
  const [method, setMethod] = useState<LaunderMethod>('shell');
  const [share, setShare] = useState(50);
  const amount = Math.round(k.reserve * share / 100), m = launderMethods[method];
  const done = k.launderTurn === career.date;
  return <>
    <h3 className="section-label mt-3"><Handshake className="size-4" /> Influence peddling</h3>
    {offer ? <div className="game-row static corruption-offer"><div className="w-full"><b>Beltline Strategies</b><p>Lobbyists want private meetings and a friendly call to regulators.</p>
      <div className="mini-stats"><span>Fees <b>{usd(offer.amount)}</b></span><span>Paper trail <b className="text-destructive">+{offer.evidence}%</b></span></div>
      <Button variant="game" size="sm" disabled={career.actions < ACTION_COST} onClick={() => onResult(peddleInfluence(career))}>Sell access · 15% energy</Button></div></div>
      : <p className="mini-note">{career.office ? 'Access already sold this quarter.' : 'Nobody pays for access without an office.'}</p>}

    <h3 className="section-label mt-3"><Droplets className="size-4" /> Launder the reserve</h3>
    {k.reserve <= 0 ? <p className="mini-note">Nothing in the off-books reserve to clean.</p> : done ? <p className="mini-note">Your fixer already moved money this quarter.</p> :
      <div className="game-row static corruption-offer launder-box"><div className="w-full">
        <div className="launder-methods">{(Object.keys(launderMethods) as LaunderMethod[]).map(id => <Button key={id} size="sm" variant={id === method ? 'game' : 'gameOutline'} disabled={id === 'business' && !career.businesses.length} onClick={() => setMethod(id)}>{launderMethods[id].name}</Button>)}</div>
        <p>{m.note}</p>
        <label className="mini-note">Amount: {usd(amount)} ({share}% of reserve)<input type="range" min={5} max={100} step={5} value={share} onChange={e => setShare(Number(e.target.value))} className="w-full" /></label>
        <div className="mini-stats"><span>Clean cash <b>{usd(amount - amount * m.fee)}</b></span><span>Fee <b>{usd(amount * m.fee)}</b></span><span>Trail <b className="text-destructive">+{m.evidence}%+</b></span></div>
        <Button variant="game" size="sm" disabled={amount <= 0} onClick={() => onResult(launder(career, amount, method))}>Move it to personal cash</Button>
      </div></div>}
  </>;
}

/** Executive-only treasury withdrawal, with a hard confirmation step. */
export function EmbezzleCard({ career, onResult }: { career: Career; onResult: (r: Result) => void }) {
  const [share, setShare] = useState(25);
  const [open, setOpen] = useState(false);
  if (!isExecutive(career)) return null;
  const cap = embezzleLimit(career), amount = Math.round(cap * share / 100);
  const done = corruptionOf(career).embezzleTurn === career.date;
  return <div className="game-row static embezzle-card"><div className="w-full">
    <b className="section-label text-destructive"><Vault className="size-4" /> Divert public funds</b>
    <p>Treasury holds {usd(treasuryFunds(career))}. You could quietly move up to {usd(cap)} to your personal account.</p>
    {done ? <p className="mini-note">You already made a withdrawal this quarter.</p> : <>
      <label className="mini-note">Amount: {usd(amount)}<input type="range" min={5} max={100} step={5} value={share} onChange={e => setShare(Number(e.target.value))} className="w-full" /></label>
      <p className="mini-note">Paper trail +{embezzleEvidence(career, amount)}% exposure · very likely to be found.</p>
      <Button variant="destructive" size="sm" disabled={amount <= 0} onClick={() => setOpen(true)}><Siren /> Withdraw to personal account</Button>
    </>}
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Steal {usd(amount)} of public money?</AlertDialogTitle>
          <AlertDialogDescription>This is a crime. Auditors track every treasury transfer and exposure will jump by {embezzleEvidence(career, amount)}%. If caught: <b>{embezzlePenalty(career)}</b> Your career, freedom — and possibly your life — are on the line.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Back out</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => onResult(embezzle(career, amount))}>I understand — take the money</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div></div>;
}
