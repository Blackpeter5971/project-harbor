import { ACTION_COST } from '@/lib/game/energy-costs';
import { useState } from 'react';
import { BadgeCheck, Home, Clapperboard, UserRound, Play, ThumbsUp, Eye } from 'lucide-react';
import type { Career } from '@/lib/game/career';
import {
  channelOf, createChannel, uploadVideo, uploadBlock, projectVideo, tubeFormats, trendingVideos, isMonetized, isTubeVerified, tier,
  estimatedQuarterEarnings, MONETIZE_SUBS, MONETIZE_HOURS, VERIFY_SUBS, MAX_UPLOADS_PER_QUARTER, type TubeFormat,
} from '@/lib/game/tube';
import type { TubeVideo } from '@/lib/game/tube-schema';
import capitol from '@/assets/capitol.jpg';
import infrastructure from '@/assets/docket-infrastructure.jpg';
import debate from '@/assets/debate-town-hall.jpg';
import radio from '@/assets/media-radio.jpg';
import backroom from '@/assets/backroom-deal.jpg';
import press from '@/assets/docket-press-conference.jpg';
import journalist from '@/assets/debate-journalist.jpg';

const THUMBS: Record<string, string> = { capitol, infrastructure, debate, radio, backroom, press, ballroom: journalist, warroom: press };
const thumbFor = (k: string) => THUMBS[k] ?? capitol;
const fmtN = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`;
const ago = (from: string, now: string) => {
  const m = (Number(now.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(now.slice(5, 7)) - Number(from.slice(5, 7));
  return m <= 0 ? 'this month' : m < 12 ? `${m} month${m > 1 ? 's' : ''} ago` : `${Math.floor(m / 12)} year${m >= 24 ? 's' : ''} ago`;
};
const formatOf = (id: string) => tubeFormats.find(f => f.id === id);

type Tab = 'home' | 'studio' | 'channel';
type Props = { career: Career; onUpdate: (c: Career) => void; onNotice: (m: string) => void };

export function TubeApp({ career, onUpdate, onNotice }: Props) {
  const ch = channelOf(career);
  const [tab, setTab] = useState<Tab>('home');
  const [name, setName] = useState('');
  const [watching, setWatching] = useState<string | null>(null);
  const [format, setFormat] = useState<TubeFormat>('geo');
  const [title, setTitle] = useState('');

  if (!ch) return <div className="tube-app"><div className="tube-create">
    <span className="app-icon app-tube"><Play /></span>
    <h2>Start your Crosstube channel</h2>
    <p>Build a public following with videos and podcasts. Monetization unlocks at {fmtN(MONETIZE_SUBS)} subscribers and {fmtN(MONETIZE_HOURS)} watch hours; the verified badge at {fmtN(VERIFY_SUBS)}.</p>
    <input className="tube-input" value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder={`${career.character.name} Talks`} aria-label="Channel name" />
    <button type="button" className="tube-btn" onClick={() => { const r = createChannel(career, name); onNotice(r.message); if (r.ok) onUpdate(r.career); }}>Create channel</button>
  </div></div>;

  const verified = isTubeVerified(ch), t = tier(ch), block = uploadBlock(career);
  const video = watching ? ch.videos.find(v => v.id === watching) : null;
  const Check = () => verified ? <BadgeCheck className="tube-check" aria-label="Verified" /> : null;

  const upload = () => { const r = uploadVideo(career, format, title); onNotice(r.message); if (r.ok) { onUpdate(r.career); setTitle(''); const v = channelOf(r.career)!.videos[0]; if (v) setWatching(v.id); } };

  const body = video ? <Watch v={video} chName={ch.name} subs={ch.subscribers} Check={Check} now={career.date} onBack={() => setWatching(null)} />
    : tab === 'home' ? <div className="tube-feed">
      {[...ch.videos.slice(0, 3).map(v => ({ id: v.id, title: v.title, channel: ch.name, verified, views: v.views, thumb: formatOf(v.format)?.thumb ?? 'capitol', minutes: formatOf(v.format)?.minutes ?? 10, date: v.date, own: true })),
        ...trendingVideos(career).map(v => ({ ...v, own: false }))].map(v =>
        <button key={v.id} type="button" className="tube-card" onClick={() => v.own && setWatching(v.id)} disabled={!v.own}>
          <span className="tube-thumb"><img src={thumbFor(v.thumb)} alt="" loading="lazy" /><i>{v.minutes}:00</i></span>
          <span className="tube-meta"><b>{v.title}</b><small>{v.channel}{v.verified && <BadgeCheck className="tube-check" />} · {fmtN(v.views)} views · {ago(v.date, career.date)}</small></span>
        </button>)}
    </div>
    : tab === 'studio' ? <div className="tube-studio">
      <h3>Upload / Record Video</h3>
      <div className="tube-formats">{tubeFormats.map(f => <button key={f.id} type="button" className={`tube-format${format === f.id ? ' is-on' : ''}`} onClick={() => setFormat(f.id)}>
        <img src={thumbFor(f.thumb)} alt="" /><span>{f.label}</span></button>)}</div>
      <input className="tube-input" value={title} maxLength={90} onChange={e => setTitle(e.target.value)} placeholder="Title (optional — we'll suggest one)" aria-label="Video title" />
      {(() => { const p = projectVideo(career, format); return <p className="tube-proj">Projected: ~{fmtN(p.views)} views · +{fmtN(p.subsGained)} subs · {fmtN(p.watchHours)} watch hrs</p>; })()}
      <p className="mini-note">Costs {ACTION_COST}% energy. {ch.quarter && ch.quarterUploads ? `${ch.quarterUploads}/${MAX_UPLOADS_PER_QUARTER}` : `0/${MAX_UPLOADS_PER_QUARTER}`} uploads this quarter.</p>
      <button type="button" className="tube-btn" disabled={!!block} onClick={upload}>{block ?? 'Record & publish'}</button>
    </div>
    : <div className="tube-feed">
      {!ch.videos.length && <p className="mini-note">No uploads yet. Head to the Studio.</p>}
      {ch.videos.map(v => <button key={v.id} type="button" className="tube-card" onClick={() => setWatching(v.id)}>
        <span className="tube-thumb"><img src={thumbFor(formatOf(v.format)?.thumb ?? 'capitol')} alt="" loading="lazy" /></span>
        <span className="tube-meta"><b>{v.title}</b><small>{fmtN(v.views)} views · +{fmtN(v.subsGained)} subs · {ago(v.date, career.date)}</small></span>
      </button>)}
    </div>;

  return <div className="tube-app">
    <header className="tube-banner">
      <div className="tube-avatar">{ch.name.slice(0, 1).toUpperCase()}</div>
      <div><h2>{ch.name}<Check />{t && <span className={`tube-tier tube-${t}`}>{t === 'gold' ? 'Gold' : 'Silver'}</span>}</h2>
        <p>{fmtN(ch.subscribers)} subscribers · {fmtN(ch.totalViews)} views</p></div>
    </header>
    <div className="tube-stats">
      <span><b>{fmtN(ch.watchHours)}</b>watch hrs</span>
      <span><b>${estimatedQuarterEarnings(ch).toLocaleString('en-US')}</b>est. / quarter</span>
      <span><b>${ch.earnings.toLocaleString('en-US')}</b>earned</span>
      <span><b>{isMonetized(ch) ? 'On' : 'Off'}</b>ads</span>
    </div>
    {!isMonetized(ch) && <p className="tube-goal">Monetization: {fmtN(ch.subscribers)}/{fmtN(MONETIZE_SUBS)} subs · {fmtN(ch.watchHours)}/{fmtN(MONETIZE_HOURS)} hrs</p>}
    <div className="tube-body">{body}</div>
    <nav className="tube-nav">
      {([['home', Home, 'Home'], ['studio', Clapperboard, 'Studio'], ['channel', UserRound, 'You']] as const).map(([id, I, l]) =>
        <button key={id} type="button" className={tab === id && !video ? 'is-on' : ''} onClick={() => { setWatching(null); setTab(id); }}><I />{l}</button>)}
    </nav>
  </div>;
}

function Watch({ v, chName, subs, Check, now, onBack }: { v: TubeVideo; chName: string; subs: number; Check: () => React.ReactNode; now: string; onBack: () => void }) {
  const f = formatOf(v.format);
  return <div className="tube-watch">
    <span className="tube-thumb tube-player"><img src={thumbFor(f?.thumb ?? 'capitol')} alt="" /><Play className="tube-play" /></span>
    <h3>{v.title}</h3>
    <p className="tube-sub"><Eye /> {v.views.toLocaleString('en-US')} views · {ago(v.date, now)} · <ThumbsUp /> {fmtN(v.likes)}</p>
    <p className="tube-sub"><b>{chName}</b><Check /> · {fmtN(subs)} subscribers · {f?.label}</p>
    <h4>Comments</h4>
    {v.comments.map((c, i) => <div key={i} className="tube-comment"><b>@{c.author}</b><p>{c.text}</p><small><ThumbsUp /> {fmtN(c.likes)}</small></div>)}
    <button type="button" className="tube-link" onClick={onBack}>Back</button>
  </div>;
}
