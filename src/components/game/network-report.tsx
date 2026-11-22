import type { Career } from '@/lib/game/career';
import { freshNetworkNotes, profileOf } from '@/lib/game/network';
import { figurePortraitById } from './figure-portraits';

/** Animated portrait cards for this quarter's political-network developments. */
export function NetworkReportCards({ career }: { career: Career }) {
  const notes = freshNetworkNotes(career).filter(n => n.tone !== 'info' || n.text.includes('promotion') || n.text.includes('leaves'));
  if (!notes.length) return null;
  return <section className="grid gap-2 mb-2" aria-label="Political network developments">
    {notes.slice(0, 4).map((n, i) => { const p = profileOf(n.figureId); return <div key={`${n.figureId}-${i}`} className={`network-note note-${n.tone}`} style={{ animationDelay: `${i * 140}ms` }}>
      <img src={figurePortraitById(p.id, p.portrait)} alt="" width={48} height={48} />
      <small><b>{p.name}</b><br />{n.text}</small>
    </div>; })}
  </section>;
}
