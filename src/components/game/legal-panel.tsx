import { ACTION_COST } from '@/lib/game/energy-costs';
import { WatchAdOffer } from './ads';
import { Gavel, Lock, Scale, ShieldCheck } from 'lucide-react';
import type { Career } from '@/lib/game/career';
import type { Result } from '@/lib/game/support';
import { Button } from '@/components/ui/button';
import { activeCase, COUNSEL, CONTEST_COST, contestEvidence, DROP_BELOW, evidenceBasis, hireCounsel, INDICT_AT, legalOf, netCase, OPEN_AT, stageName } from '@/lib/game/legal';
import { convictionChance, dismissalChance, STRATEGIES, tierName, type Strategy } from '@/lib/game/court';
import { chooseTrialStrategy, payCourtDebt } from '@/lib/game/legal';
import courthouse from '@/assets/courthouse.jpg';

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const stages = ['inquiry', 'formal', 'grand_jury'] as const;

export function LegalBanner({ career, onOpen }: { career: Career; onOpen: () => void }) {
  const k = activeCase(career), jail = legalOf(career).prison;
  if (jail) return <button type="button" className="legal-banner" onClick={onOpen}><Lock className="size-4" /> Prison: <b>{jail.life ? 'life sentence' : `${jail.quarters} quarters · release ${jail.release.slice(0, 7)}`}</b></button>;
  if (!k) return null;
  return <button type="button" className="legal-banner" onClick={onOpen}><Scale className="size-4" /> Legal status: <b>{stageName[k.stage]}</b> · case {Math.round(k.strength)} vs defense {Math.round(k.defense)}</button>;
}

export function LegalPanel({ career, onResult }: { career: Career; onResult: (r: Result) => void }) {
  const k = activeCase(career), L = legalOf(career), past = L.cases.filter(x => x.closed), t = k?.trial;
  return <section className="corruption-panel" aria-label="Legal investigations">
    <figure className="corruption-hero"><img src={courthouse} alt="Courthouse steps at dusk with press cameras" width={1088} height={608} /><figcaption>Evidence decides, not headlines.</figcaption></figure>
    <WatchAdOffer label="Legal trouble? Watch an ad" />
    {L.prison && <div className="verdict-stamp prison"><Lock className="size-4" /> <b>In custody</b> · {L.prison.life ? 'Life sentence' : `${L.prison.quarters} quarters, release ${L.prison.release.slice(0, 7)}`}.</div>}
    {L.owed > 0 && <div className="trial-box"><p className="mini-note text-destructive">Unpaid court debt: {usd(L.owed)}. Paid automatically from your cash each quarter.</p>
      <Button variant="game" size="sm" disabled={career.money <= 0} onClick={() => onResult(payCourtDebt(career))}>Pay {usd(Math.min(L.owed, Math.max(0, career.money)))} now</Button></div>}
    {k && k.stage === 'indicted' && t && <div className="trial-box">
      <h3 className="section-label"><Gavel className="size-4" /> Trial · {tierName[t.tier]} · court date {t.courtDate.slice(0, 7)}</h3>
      <p className="mini-note">Charges: {t.charges.join('; ')}.</p>
      {t.strategy ? <p><b>Strategy filed:</b> {STRATEGIES[t.strategy].name}. The verdict comes on the court date.</p> :
        <div className="row-list">{(Object.keys(STRATEGIES) as Strategy[]).map(s => <Button key={s} variant="gameOutline" size="sm" className="h-auto whitespace-normal text-left" disabled={s === 'political' && career.actions < ACTION_COST} onClick={() => onResult(chooseTrialStrategy(career, s))}>
          <span><b>{STRATEGIES[s].name}</b> · {s === 'fight' ? `${Math.round(convictionChance(k) * 100)}% conviction risk` : s === 'political' ? `${Math.round(dismissalChance(career, k) * 100)}% chance · 15% energy` : 'certain conviction, ~half penalty'}<br /><small>{STRATEGIES[s].note}</small></span></Button>)}
          <p className="mini-note">No choice by the court date means you fight all charges.</p></div>}
    </div>}
    {!k ? <p className="mini-note">No open investigation. Prosecutors act once concrete evidence reaches {OPEN_AT}% (now {evidenceBasis(career)}%).</p> : <>
      <div className="legal-stages">{stages.map(s => <span key={s} className={s === k.stage ? 'on' : stages.indexOf(s) < stages.indexOf(k.stage as typeof stages[number]) ? 'done' : ''}>{stageName[s]}</span>)}</div>
      <p><b>{stageName[k.stage]}</b> · {k.role === 'official' ? 'Elected official' : k.role === 'candidate' ? 'Candidate' : 'Private citizen'} · opened {k.opened.slice(0, 7)}</p>
      <div className="exposure-track"><span style={{ width: `${netCase(k)}%` }} /></div>
      <p className="mini-note">Case strength {Math.round(k.strength)} − defense {Math.round(k.defense)} = {Math.round(netCase(k))}. Below {DROP_BELOW} an inquiry is dropped; a grand jury indicts at {INDICT_AT}+.{k.delays ? ` ${k.delays} quarter(s) of delay banked.` : ''}</p>
      <h3 className="section-label mt-3"><ShieldCheck className="inline size-4" /> Defense · personal funds</h3>
      <div className="row-list">{(Object.keys(COUNSEL) as (keyof typeof COUNSEL)[]).map(t => { const c = COUNSEL[t]; return <Button key={t} variant="gameOutline" size="sm" disabled={k.counsel === t || career.money < c.cost} onClick={() => onResult(hireCounsel(career, t))}>{c.name} · {c.cost ? usd(c.cost) : 'free'} · +{c.defense} defense{c.delay ? ` · ${c.delay}q delay` : ''}</Button>; })}
        <Button variant="gameOutline" size="sm" disabled={k.counsel === 'none' || k.contestTurn === career.date || career.money < CONTEST_COST} onClick={() => onResult(contestEvidence(career))}><Gavel />Contest evidence · {usd(CONTEST_COST)}</Button></div>
      <ul className="illicit-ledger">{k.history.map((h, i) => <li key={i}><div><small>{h.date.slice(0, 7)}</small> {h.text}</div></li>)}</ul>
    </>}
    {past.length > 0 && <><h3 className="section-label mt-3">Closed cases</h3><ul className="illicit-ledger">{past.map(x => <li key={x.id} className={x.trial?.verdict ? 'verdict-stamp' : ''}><div><b>{stageName[x.stage]}</b><small>{x.opened.slice(0, 7)} → {x.closed?.slice(0, 7)}</small>{x.trial?.verdict && <small>{x.trial.verdict.text}</small>}</div></li>)}</ul></>}
  </section>;
}
