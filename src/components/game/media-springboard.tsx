import { useEffect, useState } from 'react';
import { ArrowLeft, Search, Signal, Wifi, BatteryFull, Tv, Radio, Newspaper, Mail, Youtube, BookOpen, Heart, Mic } from 'lucide-react';
import type { Career } from '@/lib/game/career';
import { invitationCounts } from '@/lib/game/media-hub';
import { MediaHub, type MediaTab } from './media-hub';
import { TubeApp } from './tube-app';
import { EmailApp } from './email-app';
import { MagazinesApp } from './magazines-app';
import { DatingApp } from './dating-app';
import { PodcastsApp } from './podcasts-app';
import type { HeartBeatRequest } from '@/lib/game/heartbeat';
import { unreadMail, unseenMagazines } from '@/lib/game/dispatch';

type AppId = 's' | 'tube' | 'mail' | 'tv' | 'radio' | 'newspaper' | 'magazines' | 'heartbeat' | 'podcasts';
type App = { id: AppId; label: string; icon: typeof Tv | null; tone: string; hub?: MediaTab };

const APPS: App[] = [
  { id: 's', label: 'S', icon: null, tone: 'app-s', hub: 's' },
  { id: 'tube', label: 'Crosstube', icon: Youtube, tone: 'app-tube' },
  { id: 'mail', label: 'Mail', icon: Mail, tone: 'app-mail' },
  { id: 'tv', label: 'TV', icon: Tv, tone: 'app-tv', hub: 'tv' },
  { id: 'radio', label: 'Radio', icon: Radio, tone: 'app-radio', hub: 'radio' },
  { id: 'newspaper', label: 'Times', icon: Newspaper, tone: 'app-paper', hub: 'newspaper' },
  { id: 'magazines', label: 'Magazines', icon: BookOpen, tone: 'app-mag' },
  { id: 'heartbeat', label: 'HeartBeat', icon: Heart, tone: 'app-heart' },
  { id: 'podcasts', label: 'Podcasts', icon: Mic, tone: 'app-pod' },
];

type Props = { career: Career; tab: MediaTab; onTab: (t: MediaTab) => void; onUpdate: (c: Career) => void; onNotice: (m: string) => void; socialEntry: 'home' | 'messages' | 'notifications'; initialApp?: MediaTab | null; onHeartBeatRequest?: ((request: HeartBeatRequest) => void) | undefined };

export function MediaSpringboard({ career, tab, onTab, onUpdate, onNotice, socialEntry, initialApp, onHeartBeatRequest }: Props) {
  const [open, setOpen] = useState<AppId | null>(initialApp ?? null);
  const [query, setQuery] = useState('');
  const [clock, setClock] = useState('');
  useEffect(() => { const t = () => setClock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })); t(); const i = setInterval(t, 30000); return () => clearInterval(i); }, []);
  const counts = invitationCounts(career);
  const badge: Partial<Record<AppId, number>> = { tv: counts.tv, radio: counts.radio, newspaper: counts.newspaper, mail: unreadMail(career), magazines: unseenMagazines(career) };
  const app = APPS.find(a => a.id === open);
  const launch = (a: App) => { if (a.hub) onTab(a.hub); setOpen(a.id); };
  const shown = APPS.filter(a => a.label.toLowerCase().includes(query.trim().toLowerCase()));

  const status = <div className="phone-status"><span>Crossia Telecom</span><b>{clock}</b><span className="phone-status-icons"><Signal /><Wifi /><BatteryFull /></span></div>;

  if (app) return <div className="phone-shell">
    {status}
    <div className="phone-appbar"><button type="button" onClick={() => setOpen(null)} aria-label="Back to home screen"><ArrowLeft /> Home</button><b>{app.label}</b><span /></div>
    <div className="phone-app">
      {app.hub ? <MediaHub career={career} tab={tab} onTab={onTab} onUpdate={onUpdate} onNotice={onNotice} socialEntry={socialEntry} hideTabs />
        : app.id === 'mail' ? <EmailApp career={career} onUpdate={onUpdate} onNotice={onNotice} />
        : app.id === 'magazines' ? <MagazinesApp career={career} onUpdate={onUpdate} onNotice={onNotice} />
        : app.id === 'tube' ? <TubeApp career={career} onUpdate={onUpdate} onNotice={onNotice} />
        : app.id === 'podcasts' ? <PodcastsApp career={career} onUpdate={onUpdate} onNotice={onNotice} />
        : app.id === 'heartbeat' ? <DatingApp career={career} onRequest={onHeartBeatRequest} />
        : <div className="phone-soon"><span className={`app-icon ${app.tone}`}>{app.icon && <app.icon />}</span><h2>{app.label}</h2><p>This app is being installed. It arrives in an upcoming update.</p></div>}
    </div>
  </div>;

  return <div className="phone-shell phone-home">
    {status}
    <label className="phone-search"><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search apps or news..." aria-label="Search apps" /></label>
    <div className="phone-grid">
      {shown.map((a, i) => { const n = badge[a.id] ?? 0; return <button key={a.id} type="button" className="phone-app-btn" style={{ animationDelay: `${i * 40}ms` }} onClick={() => launch(a)} aria-label={`Open ${a.label}`}>
        <span className={`app-icon ${a.tone}`}>{a.icon ? <a.icon /> : <b className="app-s-mark">S</b>}{n > 0 && <i className="app-badge">{n}</i>}</span>
        <span className="app-label">{a.label}</span>
      </button>; })}
      {!shown.length && <p className="mini-note">No apps match.</p>}
    </div>
  </div>;
}
