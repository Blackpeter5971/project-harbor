import { ACTION_COST } from '@/lib/game/energy-costs';
import { useState } from 'react';
import { Mic, Headphones, Trophy, Radio as RadioIcon, Quote } from 'lucide-react';
import type { Career } from '@/lib/game/career';
import {
  showOf, createShow, recordEpisode, episodeBlock, projectEpisode, podcastFormats, chartRank, isSponsored, estimatedSponsorPay,
  SPONSOR_LISTENERS, MAX_EPISODES_PER_QUARTER, quarterOf, type PodcastFormat,
} from '@/lib/game/podcasts';

const fmtN = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`;
const labelOf = (id: string) => podcastFormats.find(f => f.id === id)?.label ?? id;

type Props = { career: Career; onUpdate: (c: Career) => void; onNotice: (m: string) => void };

export function PodcastsApp({ career, onUpdate, onNotice }: Props) {
  const show = showOf(career);
  const [name, setName] = useState('');
  const [format, setFormat] = useState<PodcastFormat>('monologue');
  const [title, setTitle] = useState('');

  if (!show) return <div className="tube-app"><div className="tube-create">
    <span className="app-icon app-pod"><Mic /></span>
    <h2>Launch your podcast</h2>
    <p>Host your own political show. Sponsors start paying once you reach {fmtN(SPONSOR_LISTENERS)} listeners.</p>
    <input className="tube-input" value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder={`The ${career.character.name} Hour`} aria-label="Show name" />
    <button type="button" className="tube-btn" onClick={() => { const r = createShow(career, name); onNotice(r.message); if (r.ok) onUpdate(r.career); }}>Start show</button>
  </div></div>;

  const block = episodeBlock(career), p = projectEpisode(career, format);
  const used = show.quarter === quarterOf(career.date) ? show.quarterEpisodes : 0;
  const record = () => { const r = recordEpisode(career, format, title); onNotice(r.message); if (r.ok) { onUpdate(r.career); setTitle(''); } };

  return <div className="tube-app">
    <header className="tube-banner">
      <div className="tube-avatar"><Mic /></div>
      <div><h2>{show.name}</h2><p>Hosted by {career.character.name} · {show.episodes.length} episodes</p></div>
    </header>
    <div className="tube-stats">
      <span><b>{fmtN(show.listeners)}</b>listeners</span>
      <span><b>#{chartRank(show)}</b>News & Politics</span>
      <span><b>${estimatedSponsorPay(show).toLocaleString('en-US')}</b>est. / quarter</span>
      <span><b>${show.earnings.toLocaleString('en-US')}</b>earned</span>
    </div>
    {!isSponsored(show) && <p className="tube-goal">Sponsorships: {fmtN(show.listeners)}/{fmtN(SPONSOR_LISTENERS)} listeners</p>}
    <div className="tube-body"><div className="tube-studio">
      <h3><RadioIcon /> Record New Episode</h3>
      <div className="pod-formats">{podcastFormats.map(f => <button key={f.id} type="button" className={`tube-format${format === f.id ? ' is-on' : ''}`} onClick={() => setFormat(f.id)} aria-pressed={format === f.id}>
        <span><b>{f.label}</b><small>{f.effect}</small></span></button>)}</div>
      <input className="tube-input" value={title} maxLength={90} onChange={e => setTitle(e.target.value)} placeholder="Episode title (optional)" aria-label="Episode title" />
      <p className="tube-proj">Projected: ~{fmtN(p.downloads)} downloads · +{fmtN(p.listenersGained)} listeners</p>
      <p className="mini-note">Costs {ACTION_COST}% energy. {used}/{MAX_EPISODES_PER_QUARTER} episodes this quarter.</p>
      <button type="button" className="tube-btn" disabled={!!block} onClick={record}>{block ?? 'Record & publish'}</button>

      <h3><Headphones /> Episodes</h3>
      {!show.episodes.length && <p className="mini-note">No episodes yet. Record your first one above.</p>}
      {show.episodes.map(e => <article key={e.id} className="pod-episode">
        <b>{e.title}</b>
        <small>{e.date.slice(0, 7)} · <span className="pod-badge">{labelOf(e.format)}</span> · {fmtN(e.downloads)} downloads{e.sponsorPay > 0 && <> · <Trophy /> ${e.sponsorPay.toLocaleString('en-US')} sponsors</>}</small>
        {e.quotes.map((q, i) => <p key={i} className="pod-quote"><Quote /> “{q.text}” <i>— @{q.author}</i></p>)}
      </article>)}
    </div></div>
  </div>;
}
