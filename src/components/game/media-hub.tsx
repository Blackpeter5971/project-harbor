import { useState } from 'react';
import { Tv, Radio, Newspaper, Mic, Megaphone, MapPin, Users, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { monthLabel } from '@/lib/game/gameplay';
import { socialOf } from '@/lib/game/social-media';
import { outletsFor, friendliness, friendlinessLabel, type Channel, type Outlet } from '@/lib/game/media-outlets';
import { hubInvitations, invitationCounts, responseChoices, invitationBlock, answerInvitation, declineInvitation, FORMATS, type Invitation } from '@/lib/game/media-hub';
import { talkingPoints, doBroadcast, declineBroadcast, broadcastBlock, BROADCAST_COST, type TalkingPoint } from '@/lib/game/media';
import { SocialFeed } from './social-feed';
import { PoliticalRecords } from './politics-panels';
import tvImg from '@/assets/media-tv.jpg';
import radioImg from '@/assets/media-radio.jpg';
import paperImg from '@/assets/biz-newspaper.jpg';

export type MediaTab = Channel | 's';
type Res = { ok: true; career: Career; message: string } | { ok: false; message: string };
const HERO: Record<Channel, { img: string; alt: string; title: string; note: string }> = {
  tv: { img: tvImg, alt: 'A lit television news studio', title: 'Television', note: 'Interviews, televised debates and primetime talk shows.' },
  radio: { img: radioImg, alt: 'A radio studio microphone on air', title: 'Radio', note: 'Talk radio, rural broadcasts and public address slots.' },
  newspaper: { img: paperImg, alt: 'A printing press running the morning edition', title: 'Newspaper', note: 'Press releases, print interviews and editorial responses.' },
};
const ICON: Record<Channel, typeof Tv> = { tv: Tv, radio: Radio, newspaper: Newspaper };
const reachText = (o: Outlet) => `${o.reach >= 1e6 ? `${(o.reach / 1e6).toFixed(1).replace(/\.0$/, '')}M` : `${Math.round(o.reach / 1e3)}K`} ${o.unit}`;
const initials = (name: string) => name.replace(/^The\s+/, '').split(/\s+/).filter(w => /^[A-Z0-9]/.test(w)).map(w => w[0]).join('').slice(0, 3);

type Dialog = { kind: 'invite'; inv: Invitation } | { kind: 'live' };
type Outcome = { channel: Channel; good: boolean; text: string };

export function MediaHub({ career, tab, onTab, onUpdate, onNotice, socialEntry, hideTabs }: { hideTabs?: boolean; career: Career; tab: MediaTab; onTab: (t: MediaTab) => void; onUpdate: (c: Career) => void; onNotice: (m: string) => void; socialEntry: 'home' | 'messages' | 'notifications' }) {
  const counts = invitationCounts(career);
  const tabs: { id: MediaTab; label: string; count: number }[] = [
    { id: 'tv', label: 'Television', count: counts.tv }, { id: 'radio', label: 'Radio', count: counts.radio },
    { id: 'newspaper', label: 'Newspaper', count: counts.newspaper }, { id: 's', label: 'S', count: 0 },
  ];
  return <div className={`media-hub${tab === 's' ? ' is-s' : ''}`}>
    {!hideTabs && <div className="media-tabs" role="tablist" aria-label="Media channels">
      {tabs.map(t => { const Icon = t.id === 's' ? null : ICON[t.id]; return <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="media-tab" onClick={() => onTab(t.id)}>
        {Icon ? <Icon /> : <span className="s-logo s-logo-sm" aria-hidden>S</span>}<span>{t.label}</span>{t.count > 0 && <span className="media-tab-count" aria-label={`${t.count} invitation${t.count === 1 ? "" : "s"}`}>{t.count}</span>}
      </button>; })}
    </div>}
    {tab === 's' ? <SocialFeed career={career} onUpdate={onUpdate} onNotice={onNotice} initialTab={socialEntry} /> : <ChannelView key={tab} career={career} channel={tab} onUpdate={onUpdate} onNotice={onNotice} />}
  </div>;
}

function ChannelView({ career, channel, onUpdate, onNotice }: { career: Career; channel: Channel; onUpdate: (c: Career) => void; onNotice: (m: string) => void }) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [choice, setChoice] = useState<string>('bold');
  const [point, setPoint] = useState<TalkingPoint>('vision');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const hero = HERO[channel], s = socialOf(career);
  const invites = hubInvitations(career).filter(i => i.channel === channel);
  const live = s.broadcast && s.broadcast.kind === channel ? s.broadcast : null;
  const outlets = outletsFor(career).filter(o => o.channel === channel);
  const history = s.broadcastHistory.filter(h => h.kind === channel).slice(0, 4);
  const usedThisQuarter = s.hubUsed[channel] === career.date;
  const run = (r: Res, good?: boolean) => { onNotice(r.message); if (r.ok) { onUpdate(r.career); if (good !== undefined) setOutcome({ channel, good, text: r.message }); } return r.ok; };
  const close = () => { setDialog(null); setOutcome(null); };
  const answer = (inv: Invitation) => { const r = answerInvitation(career, inv.id, choice); if (r.ok) run(r, socialOf(r.career).broadcastHistory[0]?.good ?? true); else onNotice(r.message); };
  const goLive = (pay: 'action' | 'energy') => { const r = doBroadcast(career, point, pay); if (r.ok) run(r, socialOf(r.career).broadcastHistory[0]?.good ?? true); else onNotice(r.message); };

  return <div className="media-channel">
    <figure className="media-hero"><img src={hero.img} alt={hero.alt} width={1088} height={608} /><figcaption><span className="eyebrow">Media Hub</span><b>{hero.title}</b><small>{hero.note}</small></figcaption></figure>
    <p className="mini-note mt-2">{invites.length + (live ? 1 : 0) ? `${invites.length + (live ? 1 : 0)} open request${invites.length + (live ? 1 : 0) === 1 ? '' : 's'}. Each appearance needs 15% energy; one ${channel === 'tv' ? 'TV' : channel} appearance per quarter.` : 'No requests right now. Outlets call when something newsworthy happens: a passed bill, a public project, a campaign, an economic shift or a scandal.'}{usedThisQuarter ? ' You already appeared this quarter.' : ''}</p>

    {live && <button type="button" className="media-live" onClick={() => { setDialog({ kind: 'live' }); setOutcome(null); }}>
      <span className="media-live-dot" aria-hidden />{channel === 'tv' ? <Tv /> : <Radio />}<span><small>Live booking · {live.outlet}</small><b>{live.show} · {live.topic}</b></span>
    </button>}

    <h3 className="section-label mt-3">{channel === 'newspaper' ? 'Publications' : 'Stations'}</h3>
    <div className="media-grid">
      {outlets.map((o, i) => { const inv = invites.find(x => x.outlet.id === o.id); const isLive = live?.outlet === o.name; const f = friendliness(o.slant, career.character.party); const Icon = ICON[channel];
        return <article key={o.id} className={`media-card${inv || isLive ? ' has-invite' : ''}`} style={{ animationDelay: `${i * 70}ms` }}>
          <div className="media-card-head"><span className={`media-logo ${channel}`} aria-hidden><Icon /><b>{initials(o.name)}</b></span><div className="min-w-0"><b className="media-name">{o.name}</b><small>{o.tagline}</small></div></div>
          <dl className="media-facts"><div><dt><Users /> Reach</dt><dd>{reachText(o)}</dd></div><div><dt><MapPin /> Scope</dt><dd>{o.scope}</dd></div><div><dt>Slant</dt><dd>{o.slant}</dd></div><div><dt>Toward you</dt><dd className={f >= 1 ? 'amt-in' : f <= -1 ? 'amt-out' : ''}>{friendlinessLabel(f)}</dd></div></dl>
          {inv ? <div className="media-invite"><span className="eyebrow">{FORMATS[inv.format].label}</span><p>{inv.story.title}</p><div className="media-invite-actions"><Button size="sm" variant="game" onClick={() => { setDialog({ kind: 'invite', inv }); setChoice('bold'); setOutcome(null); }}>Respond</Button><Button size="sm" variant="gameQuiet" onClick={() => run(declineInvitation(career, inv.id))}>Decline</Button></div></div>
            : isLive ? <div className="media-invite"><span className="eyebrow">Live booking</span><p>{live!.show}</p><Button size="sm" variant="game" onClick={() => { setDialog({ kind: 'live' }); setOutcome(null); }}>Go on air</Button></div>
            : <p className="media-quiet">No request this quarter</p>}
        </article>; })}
    </div>

    {history.length > 0 && <><h3 className="section-label mt-3">Recent appearances</h3><div className="row-list">{history.map(h => <div key={h.id} className="game-row static"><div><b>{h.outlet} {h.good ? <span className="tag-ok">Went well</span> : <span className="tag-warn">Went badly</span>}</b><p>“{h.point}” · {h.outcome}</p></div><span className="row-cost">{monthLabel(h.date)}</span></div>)}</div></>}

    {channel === 'newspaper' && <><h3 className="section-label mt-3">Latest editions</h3><PoliticalRecords career={career} panel="news" onUpdate={onUpdate} onNotice={onNotice} /></>}

    {dialog && <div className="modal-backdrop" onClick={close}><section className="game-modal media-dialog" role="dialog" aria-modal="true" aria-labelledby="media-dialog-title" onClick={e => e.stopPropagation()}>
      <img className="media-dialog-img" src={hero.img} alt="" width={1088} height={608} />
      {outcome ? <div className={`media-result ${outcome.good ? 'good' : 'bad'}`}>
        <span className="media-result-icon">{outcome.good ? <Check /> : <X />}</span>
        <h2 id="media-dialog-title">{outcome.good ? 'Strong appearance' : 'Rough appearance'}</h2><p>{outcome.text}</p><p className="mini-note">Reactions are on your S feed.</p>
        <div className="modal-actions"><Button variant="game" onClick={close}>Done</Button></div>
      </div> : dialog.kind === 'invite' ? (() => { const inv = dialog.inv, block = invitationBlock(career, inv); return <>
        <span className="eyebrow">{channel === 'tv' ? <Tv className="inline size-3" /> : channel === 'radio' ? <Mic className="inline size-3" /> : <Megaphone className="inline size-3" />} {FORMATS[inv.format].label} · {inv.outlet.name}</span>
        <h2 id="media-dialog-title" className="media-dialog-title">{inv.story.title}</h2>
        <p className="media-question"><b>{channel === 'newspaper' ? 'Editor' : 'Host'}:</b> “{inv.question}”</p>
        <div className="media-choices" role="radiogroup" aria-label="Your response">{responseChoices(inv).map(o => <Button key={o.id} variant="gameChoice" role="radio" aria-checked={choice === o.id} className={`media-choice ${o.tone}`} onClick={() => setChoice(o.id)}><span><b>{o.label}</b><small>{o.hint}</small></span></Button>)}</div>
        {block && <p className="mini-note mt-2">{block}</p>}
        <div className="modal-actions"><Button variant="game" disabled={!!block} onClick={() => answer(inv)}>{channel === 'newspaper' ? 'Give statement' : 'Go on air'} · 15% energy</Button><Button variant="gameOutline" onClick={close}>Not now</Button></div>
      </>; })() : live ? <>
        <span className="eyebrow">● On air · {live.outlet}</span>
        <h2 id="media-dialog-title" className="media-dialog-title">{live.show}</h2>
        <p className="media-question"><b>Host:</b> “Tonight we’re talking about {live.topic}. Where do you stand?”</p>
        <div className="media-choices" role="radiogroup" aria-label="Talking point">{talkingPoints(live).map(t => <Button key={t.id} variant="gameChoice" role="radio" aria-checked={point === t.id} className="media-choice" onClick={() => setPoint(t.id)}><span><b>{t.label}</b><small>{t.hint}</small></span></Button>)}</div>
        <div className="modal-actions"><Button variant="game" disabled={!!broadcastBlock(career, 'action')} onClick={() => goLive('action')}>Go on air · 15% energy</Button><Button variant="gameOutline" disabled={!!broadcastBlock(career, 'energy')} onClick={() => goLive('energy')}>Use {BROADCAST_COST[live.kind].energy}% energy</Button><Button variant="gameQuiet" onClick={() => { if (run(declineBroadcast(career))) close(); }}>Decline request</Button></div>
      </> : <p className="mini-note">This booking has ended.</p>}
    </section></div>}
  </div>;
}
