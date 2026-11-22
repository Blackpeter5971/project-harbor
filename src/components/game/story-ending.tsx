import { useEffect, useState } from 'react';
import { Heart, Images, Landmark, RotateCcw, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { consequentialDecisions, type SceneScript, type StageEnding, type StoryEnding, type StoryNarrative } from '@/lib/game/story-engine';
import type { StoryState } from '@/lib/game/story-mode';
import { BACKDROPS } from './story-backdrops';
import { StoryGallery } from './story-gallery';
import { STORY_PORTRAITS } from '@/lib/game/story-portraits';

/**
 * Ending card shown once a story scenario's final chapter closes. Animates
 * in like the story cards and out when the player continues.
 */
export function StoryEndingCard({ ending, narrative, onContinue }: {
  ending: StoryEnding;
  narrative: StoryNarrative;
  onContinue: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const portrait = STORY_PORTRAITS[narrative.characters[0]?.portrait ?? ''];

  function close() {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onContinue, 280);
  }

  return (
    <div className={`modal-backdrop story-backdrop ${leaving ? 'story-leaving' : ''}`}>
      <section className="game-modal story-card" role="dialog" aria-modal="true" aria-labelledby="story-ending-title">
        <div className="story-card-scene">
          {portrait && (
            <div className="story-portrait-wrap">
              <img src={portrait} alt="" className="story-portrait" width={768} height={960} loading="lazy" />
            </div>
          )}
          <div className="story-card-head">
            <span className="eyebrow story-eyebrow"><Trophy /> Story complete</span>
            <h2 id="story-ending-title">{ending.title}</h2>
            <p className="story-speaker"><b>{narrative.acts[narrative.acts.length - 1]?.title}</b><span> · Final act closed</span></p>
          </div>
        </div>
        <p className="story-dialogue">{ending.description}</p>
        <div className="story-choices">
          <Button variant="game" className="story-choice" onClick={close}>
            <span className="story-choice-label">Continue your career</span>
            <span className="story-choice-preview">The sandbox world keeps turning from here</span>
          </Button>
        </div>
      </section>
    </div>
  );
}

/** Full-screen final story assessment for scripted (stage) scenarios. */
export function StoryEndingScreen({ script, story, ending, onReplay, onExit }: {
  script: SceneScript; story: StoryState; ending: StageEnding; onReplay: () => void; onExit: () => void;
}) {
  const [gallery, setGallery] = useState(false);
  useEffect(() => { window.scrollTo(0, 0); }, [gallery]);
  const session = story.session!;
  const top = consequentialDecisions(session.history, 3);
  const icons = Object.fromEntries(script.meters.map(m => [m.id, m.icon]));
  if (gallery) return <StoryGallery scenarioId={story.scenarioId} onBack={() => setGallery(false)} />;
  return <main className="ending-screen screen-enter" aria-labelledby="ending-title">
    <div className="ending-paper"><span className="ending-paper-mast">The Capitol Ledger · Final Edition</span><h2 className="ending-headline">{ending.headline}</h2></div>
    <div className="ending-hero">
      <img src={BACKDROPS[ending.backdrop] ?? BACKDROPS['act4']} alt="" className="ending-backdrop" />
      <div className="ending-hero-text"><span className="eyebrow"><Trophy className="inline size-3" /> Ending {ending.number} of {script.endings?.length ?? 7}</span><h1 id="ending-title">{ending.title}</h1></div>
    </div>
    <p className="ending-narrative">{ending.narrative}</p>
    <div className="ending-cards">
      <section className="ending-card"><h3 className="section-label"><Heart className="inline size-3" /> Relationship status</h3><p>{ending.relationship}</p></section>
      <section className="ending-card"><h3 className="section-label"><Landmark className="inline size-3" /> Office & legacy</h3><p>{ending.legacy}</p></section>
      <section className="ending-card"><h3 className="section-label">Final scores</h3>
        <div className="ending-scores">{script.meters.map(m => { const v = session.meters[m.id] ?? m.value; return <div key={m.id} className="ending-score"><span>{m.icon} {m.label}</span><b>{v}</b><div className="stage-meter-bar"><span style={{ width: `${((v - m.min) / (m.max - m.min)) * 100}%` }} /></div></div>; })}</div>
      </section>
      <section className="ending-card"><h3 className="section-label">Most consequential decisions</h3>
        {top.length ? <ol className="ending-decisions">{top.map(h => <li key={h.sceneId}><b>{h.label}</b><span>{Object.entries(h.deltas).filter(([, d]) => d).map(([k, d]) => `${d > 0 ? '+' : ''}${d} ${icons[k] ?? k}`).join(' · ')}</span></li>)}</ol> : <p className="mini-note">No major decisions recorded.</p>}
      </section>
    </div>
    <div className="ending-actions">
      <Button variant="game" className="w-full" onClick={onReplay}><RotateCcw /> Replay Story (Free)</Button>
      <Button variant="gameOutline" className="w-full" onClick={() => setGallery(true)}><Images /> View Ending Gallery</Button>
      <Button variant="gameQuiet" className="w-full" onClick={onExit}>Return to story menu</Button>
    </div>
  </main>;
}
