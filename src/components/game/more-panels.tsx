import { useEffect, useState } from 'react';
import { Lock, Trophy, Copy, Check, Shield, Coins, Target, X } from 'lucide-react';
import { useWallet } from './ads';
import { readWallet, spendCoins, writeWallet } from '@/lib/game/coins';
import { rewardsOf, claimAchievement, bountyFor, missionOffer, activeMission, missionProgress, acceptMission, declineMission, claimMission, missionCycle, missionExpiryYear, MISSION_START_YEAR, COIN_DECISIONS, coinDecisionAvailable, useCoinDecision, type RewardResult } from '@/lib/game/rewards';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { achievements } from '@/lib/game/achievements';

export const DISCORD_URL = 'https://discord.gg/Fn9XQkvfdu';
export function AboutPanel() {
  return <div className="more-about">
    <div className="studio"><Shield strokeWidth={1.4} /> Crosian Games</div>
    <h2 className="step-title">President: Rise to Power</h2>
    <p className="mini-note">Version 0.1 · Foundation</p>
    <p>Start as an ordinary citizen and climb from local politics to the presidency. Build a career, a family, a business and a public following, and live with the consequences of every decision.</p>
    <h3 className="section-label mt-3">Disclaimer</h3>
    <p className="mini-note">This is a work of fiction. Characters, parties, outlets and events are invented. Any resemblance to real people is coincidental.</p>
    <h3 className="section-label mt-3">Credits</h3>
    <p className="mini-note">Design and development by Crosian Games.</p>
    <h3 className="section-label mt-3">Community</h3>
    <Button variant="gameOutline" className="w-full" asChild><a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">Join us on Discord</a></Button>
  </div>;
}

const attrLabel = (k: string) => k[0]!.toUpperCase() + k.slice(1);
export function applyRewardResult(r: RewardResult, onUpdate: (c: Career) => void, onNotice: (m: string) => void) {
  if (r.ok) {
    if (r.coins) { const w = readWallet(); const next = r.coins > 0 ? { ...w, coins: w.coins + r.coins } : spendCoins(w, -r.coins); if (!next) { onNotice('Not enough coins.'); return; } writeWallet(next); }
    onUpdate(r.career);
  }
  onNotice(r.message);
}
export function MissionCard({ career, apply }: { career: Career; apply: (r: RewardResult) => void }) {
  const offer = missionOffer(career), active = activeMission(career);
  const nextYear = active ? missionExpiryYear(active) : MISSION_START_YEAR + missionCycle(career) + 1;
  if (active) { const p = missionProgress(career, active), ready = p >= active.target;
    return <div className={`ach-card is-on${ready ? ' urgent' : ''}`}><Target /><b>{active.title} · {active.difficulty}</b><small>{active.detail}</small>
      <div className="h-2 w-full overflow-hidden rounded bg-muted" role="progressbar" aria-label="Mission progress" aria-valuenow={p} aria-valuemax={active.target}><div className="h-full bg-primary" style={{ width: `${Math.round((p / active.target) * 100)}%` }} /></div>
      <small>{p.toLocaleString('en-US')} / {active.target.toLocaleString('en-US')} · Reward: {active.coins} coins · ${active.cash.toLocaleString('en-US')}{active.attribute ? ` · +${active.attribute.amount} ${attrLabel(active.attribute.key)}` : ''} · expires {nextYear}</small>
      <Button variant="game" size="sm" disabled={!ready} onClick={() => apply(claimMission(career))}>Claim reward</Button></div>; }
  if (offer) return <div className="ach-card is-on"><Target /><b>New mission: {offer.title} · {offer.difficulty}</b><small>{offer.detail} Reward: {offer.coins} coins · ${offer.cash.toLocaleString('en-US')}{offer.attribute ? ` · +${offer.attribute.amount} ${attrLabel(offer.attribute.key)}` : ''}</small>
    <div className="flex gap-2"><Button variant="game" size="sm" onClick={() => apply(acceptMission(career))}>Accept</Button><Button variant="gameOutline" size="sm" onClick={() => apply(declineMission(career))}>Leave it</Button></div></div>;
  return <p className="mini-note">No mission right now. New ones come along at random as your career grows.</p>;
}
/** Small dashboard icon that expands into the full mission card. Hidden when there is no mission. */
export function MissionChip({ career, apply }: { career: Career; apply: (r: RewardResult) => void }) {
  const [open, setOpen] = useState(false);
  const offer = missionOffer(career), active = activeMission(career);
  if (!offer && !active) return null;
  const ready = !!active && missionProgress(career, active) >= active.target;
  const label = ready ? 'Mission complete' : offer ? 'New mission' : `Mission ${Math.round((missionProgress(career, active!) / active!.target) * 100)}%`;
  if (!open) return <Button variant="gameOutline" size="sm" className="self-start" aria-expanded={false} onClick={() => setOpen(true)}><Target /> {label}{(ready || offer) && <span className="size-2 rounded-full bg-primary" aria-hidden />}</Button>;
  return <section className="dashboard-attention" aria-label="Mission"><div className="attention-heading flex items-center justify-between"><h3>Mission</h3><Button variant="ghost" size="sm" aria-expanded onClick={() => setOpen(false)} aria-label="Minimise mission"><X /></Button></div><MissionCard career={career} apply={apply} /></section>;
}

export function AchievementsPanel({ career, onUpdate, onNotice }: { career: Career; onUpdate: (c: Career) => void; onNotice: (m: string) => void }) {
  const wallet = useWallet();
  const list = achievements(career), done = list.filter(a => a.unlocked).length;
  const claimed = rewardsOf(career).claimed;
  const apply = (r: RewardResult) => applyRewardResult(r, onUpdate, onNotice);
  return <>
    <p className="step-subtitle"><Coins className="inline size-4" /> {wallet.coins} coins</p>
    <h3 className="section-label">Mission</h3>
    <MissionCard career={career} apply={apply} />
    <h3 className="section-label mt-3">Vital decisions</h3>
    <div className="more-list">{COIN_DECISIONS.map(d => { const block = coinDecisionAvailable(career, d.id); return <div key={d.id} className="ach-card"><b><span className="mini-note">[{d.category}]</span> {d.name} · {d.coins} coins</b><small>{block ? `Locked: ${block}` : `Available · ${d.summary}`}</small>{block && <small>{d.summary}</small>}
      <Button variant="game" size="sm" disabled={!!block || wallet.coins < d.coins} onClick={() => apply(useCoinDecision(career, d.id, readWallet().coins))}>Use {d.coins} coins</Button></div>; })}</div>
    <h3 className="section-label mt-3">Achievements · {done} of {list.length}</h3>
    <div className="ach-grid">{list.map(a => { const b = bountyFor(a.id), got = claimed.includes(a.id); return <div key={a.id} className={`ach-card${a.unlocked ? ' is-on' : ''}`}>
      {a.unlocked ? <Trophy /> : <Lock />}<b>{a.title}</b><small>{a.detail}</small><small>{b.coins} coins · ${b.cash.toLocaleString('en-US')}</small>
      {a.unlocked && (got ? <small>Claimed</small> : <Button variant="game" size="sm" onClick={() => apply(claimAchievement(career, a.id))}>Claim</Button>)}</div>; })}</div>
  </>;
}

const CATS = ['Gameplay', 'Visual', 'Economy', 'Translation'] as const;
export function BugReportPanel({ career, onNotice }: { career: Career; onNotice: (m: string) => void }) {
  const [cat, setCat] = useState<typeof CATS[number]>('Gameplay');
  const [notes, setNotes] = useState('');
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const report = JSON.stringify({ category: cat, notes: notes.trim(), date: career.date, agent: navigator.userAgent, save: career });
    try { await navigator.clipboard.writeText(report); setCopied(true); onNotice('Bug report copied. Paste it into our Discord bug channel.'); }
    catch { onNotice('Could not copy. Describe the bug directly on Discord.'); }
    window.open(DISCORD_URL, '_blank', 'noopener');
  };
  return <div className="more-bug">
    <p className="step-subtitle">Tell us what went wrong. We copy your notes and save details so we can reproduce it.</p>
    <div className="bug-cats">{CATS.map(c => <Button key={c} variant={cat === c ? 'game' : 'gameOutline'} size="sm" onClick={() => setCat(c)} aria-pressed={cat === c}>{c}</Button>)}</div>
    <textarea className="tube-input bug-notes" rows={5} maxLength={1000} value={notes} onChange={e => { setNotes(e.target.value); setCopied(false); }} placeholder="What happened, and what did you expect?" aria-label="Bug notes" />
    <Button variant="game" className="w-full" onClick={copy} disabled={!notes.trim()}>{copied ? <><Check /> Copied</> : <><Copy /> Copy report & open Discord</>}</Button>
    <Button variant="gameOutline" className="w-full mt-2" asChild><a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">Join our Discord community</a></Button>
  </div>;
}

export const LANGUAGE_KEY = 'president-language';
export const LANGUAGES = [{ id: 'en', flag: '🇺🇸', label: 'English' }, { id: 'es', flag: '🇪🇸', label: 'Español' }, { id: 'fr', flag: '🇫🇷', label: 'Français' }] as const;
export function LanguagePanel({ onNotice }: { onNotice: (m: string) => void }) {
  const [lang, setLang] = useState('en');
  useEffect(() => { setLang(localStorage.getItem(LANGUAGE_KEY) ?? 'en'); }, []);
  const pick = (id: string, label: string) => { localStorage.setItem(LANGUAGE_KEY, id); setLang(id); onNotice(`Language set to ${label}.`); };
  return <div className="more-list">
    {LANGUAGES.map(l => <Button key={l.id} variant="gameChoice" onClick={() => pick(l.id, l.label)} aria-pressed={lang === l.id}><span aria-hidden>{l.flag}</span> {l.label} {lang === l.id ? <Check /> : <span />}</Button>)}
    <p className="mini-note">Full Spanish and French text arrives with the translation update.</p>
  </div>;
}
