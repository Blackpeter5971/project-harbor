import { useEffect, useState } from 'react';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sceneScriptFor } from '@/lib/game/story-engine';
import { readDiscoveredEndings, scenarioById, type AchievedEnding } from '@/lib/game/story-mode';
import { BACKDROPS } from './story-backdrops';

const fmt = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); };

/** Ending gallery: discovered endings show art and date; the rest are mystery cards with hints. */
export function StoryGallery({ scenarioId, onBack }: { scenarioId: string; onBack: () => void }) {
  const script = sceneScriptFor(scenarioId);
  const [found, setFound] = useState<AchievedEnding[]>([]);
  useEffect(() => { try { setFound(readDiscoveredEndings(localStorage, scenarioId)); } catch { /* storage optional */ } }, [scenarioId]);
  const endings = [...(script?.endings ?? [])].sort((a, b) => a.number - b.number);
  return <main className="creation screen-enter">
    <header className="screen-header"><Button variant="gameQuiet" size="icon" aria-label="Back" onClick={onBack}><ArrowLeft /></Button><div><span className="eyebrow">{scenarioById(scenarioId)?.title}</span><h1>Ending Gallery</h1></div><span className="gallery-count">{found.length}/{endings.length}</span></header>
    <div className="screen-body">
      <p className="step-subtitle">Replays are always free and never erase discovered endings.</p>
      <div className="gallery-grid">{endings.map(e => { const got = found.find(f => f.id === e.id); return got
        ? <article key={e.id} className="gallery-card"><img src={BACKDROPS[e.backdrop] ?? BACKDROPS['act4']} alt="" className="gallery-art" loading="lazy" /><div><span className="eyebrow">Ending {e.number}</span><b>{e.title}</b><span className="mini-note">Achieved {fmt(got.achievedAt)}</span></div></article>
        : <article key={e.id} className="gallery-card gallery-mystery" aria-label={`Undiscovered ending ${e.number}`}><div className="gallery-art gallery-art-mystery"><HelpCircle /></div><div><span className="eyebrow">Ending {e.number}</span><b>???</b><span className="mini-note">{e.hint}</span></div></article>; })}</div>
    </div>
  </main>;
}
