import { ACTION_COST } from '@/lib/game/energy-costs';
import { Briefcase, Eye, FileWarning, Landmark } from 'lucide-react';
import type { Career } from '@/lib/game/career';
import type { Result } from '@/lib/game/gameplay';
import { Button } from '@/components/ui/button';
import { acceptBribe, acceptDarkMoney, bribeOffer, corruptionOf, darkMoneyOffer, declineBribe, declineDarkMoney, exposureLabel, leakChance } from '@/lib/game/corruption';
import { LaunderingSection } from './laundering-panel';
import backroom from '@/assets/backroom-deal.jpg';

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function CorruptionPanel({ career, onResult }: { career: Career; onResult: (r: Result) => void }) {
  const k = corruptionOf(career), bribe = bribeOffer(career), dark = darkMoneyOffer(career);
  const once = (fn: () => Result) => (e: React.MouseEvent) => { if (e.detail > 1) return; onResult(fn()); };
  return <section className="corruption-panel" aria-label="Backroom deals">
    <figure className="corruption-hero"><img src={backroom} alt="Briefcase of cash sliding across a dim backroom table" width={1088} height={608} /><figcaption>Every deal leaves a trail.</figcaption></figure>
    <div className="exposure-meter" aria-label={`Exposure risk ${Math.round(k.exposure)}%`}>
      <div className="panel-row"><span className="section-label"><Eye className="size-4" /> Exposure risk</span><b className={k.exposure >= 45 ? 'text-destructive' : 'text-primary'}>{Math.round(k.exposure)}% · {exposureLabel(k.exposure)}</b></div>
      <div className="exposure-track"><span style={{ width: `${k.exposure}%` }} /></div>
      <p className="mini-note">Leak chance next quarter: {Math.round(leakChance(k.exposure) * 100)}%. A legal audit opens at 70%.</p>
    </div>
    <div className="mini-stats"><span>Off-books reserve <b>{usd(k.reserve)}</b></span><span>Clean personal cash <b>{usd(career.money)}</b></span></div>

    <h3 className="section-label mt-3"><Briefcase className="size-4" /> Backroom offer</h3>
    {bribe ? <div className="game-row static corruption-offer"><div className="w-full"><b>{bribe.source}</b><p>Wants you to {bribe.favor.toLowerCase()}.</p>
      <div className="mini-stats"><span>Cash <b>{usd(bribe.amount)}</b></span><span>Paper trail <b className="text-destructive">+{bribe.evidence}% · {bribe.risk}</b></span></div>
      <div className="corruption-actions"><Button variant="game" size="sm" disabled={career.actions < ACTION_COST} onClick={once(() => acceptBribe(career))}>Take it · 15% energy</Button><Button variant="gameOutline" size="sm" onClick={once(() => declineBribe(career))}>Decline</Button></div></div></div>
      : <p className="mini-note">{career.office ? 'No one is knocking this turn.' : 'Nobody bribes someone without power. Hold office first.'}</p>}

    <h3 className="section-label mt-3"><Landmark className="size-4" /> Dark money</h3>
    {dark ? <div className="game-row static corruption-offer"><div className="w-full"><b>{dark.source}</b><p>Offers an undisclosed contribution straight into your campaign.</p>
      <div className="mini-stats"><span>Campaign cash <b>{usd(dark.amount)}</b></span><span>Paper trail <b className="text-destructive">+{dark.evidence}% · {dark.risk}</b></span></div>
      <div className="corruption-actions"><Button variant="game" size="sm" onClick={once(() => acceptDarkMoney(career))}>Accept</Button><Button variant="gameOutline" size="sm" onClick={once(() => declineDarkMoney(career))}>Refuse</Button></div></div></div>
      : <p className="mini-note">{career.campaign ? 'No undisclosed donors this turn.' : 'Dark money flows only during a campaign.'}</p>}

    <LaunderingSection career={career} onResult={onResult} />

    <h3 className="section-label mt-3"><FileWarning className="size-4" /> Illicit ledger</h3>
    {!k.txns.length ? <p className="mini-note">Clean record. No illicit transactions.</p> : <ul className="illicit-ledger">{k.txns.map(t => <li key={t.id}><div><b>{t.kind === 'bribe' ? 'Bribe' : t.kind === 'self_dealing' ? 'Self-dealing contract' : t.kind === 'laundering' ? 'Laundered' : t.kind === 'influence' ? 'Influence peddling' : t.kind === 'embezzlement' ? 'Embezzlement' : 'Dark money'} · {t.source}</b><small>{t.date.slice(0, 7)} · {t.destination === 'campaign' ? 'Campaign (undisclosed)' : t.destination === 'business' ? 'Your company' : t.destination === 'personal' ? 'Personal account' : 'Off-books reserve'} · {t.risk} risk</small></div><span>{usd(t.amount)}</span></li>)}</ul>}
  </section>;
}
