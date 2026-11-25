import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpenText, Images, CheckCircle2, Clock3, Coins, Layers, LockKeyhole, Play, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SCENARIO_COVERS } from '@/lib/game/story-art';
import { FREE_FLAGSHIP_ID, SCENARIOS, isScenarioUnlocked, readUnlockedScenarios, type ScenarioDefinition } from '@/lib/game/story-mode';
import { StoryGallery } from './story-gallery';
import { StoryPurchaseModal } from './story-purchase-modal';
import { useWallet } from './ads';
import { StatusBadge } from './mode-select';

/** Story Mode is still in development: list scenarios but block playing and buying until the next update. */
export const STORY_PLAY_ENABLED = true;

type CardState = 'playable' | 'coming' | 'premium' | 'completed';
const BADGE: Record<CardState, { label: string; tone: 'active' | 'locked' | 'completed' }> = {
  playable: { label: 'Play now', tone: 'active' },
  coming: { label: 'Coming soon', tone: 'locked' },
  premium: { label: 'Locked', tone: 'locked' },
  completed: { label: 'Completed', tone: 'completed' },
};

function ScenarioCard({ scenario, state, owned, onPlay, onPreview }: { scenario: ScenarioDefinition; state: CardState; owned: boolean; onPlay: () => void; onPreview: () => void }) {
  const cover = SCENARIO_COVERS[scenario.id];
  const locked = state === 'premium';
  const Wrap = locked ? 'button' : 'div';
  return <Wrap {...(locked ? { type: 'button' as const, onClick: onPreview, 'aria-label': `Preview ${scenario.title}` } : {})} className={`background-choice scenario-card ${state === 'coming' ? 'scenario-card-muted' : ''} ${locked ? 'scenario-card-locked' : ''}`}>
    {cover && <img className="scenario-cover" src={cover} alt="" width={1280} height={720} loading="lazy" />}
    <span className="choice-icon">{locked ? <LockKeyhole /> : state === 'completed' ? <CheckCircle2 /> : <BookOpenText />}</span>
    <span className="choice-details">
      <span className="choice-heading"><strong>{scenario.title}</strong><StatusBadge label={BADGE[state].label} tone={BADGE[state].tone} /></span>
      <span className="scenario-genre">{scenario.genre}</span>
      <p className="scenario-tagline">{scenario.tagline}</p>
      <span className="bg-stats">
        <span><Clock3 className="inline size-3" /> <b>{scenario.playtimeMinutes}</b> min</span>
        <span><Layers className="inline size-3" /> <b>{scenario.actsCount}</b> acts · <b>{scenario.endingsCount}</b> endings</span>
        <span className="scenario-price">{scenario.price === 0 ? 'FREE' : owned ? 'Owned' : <><Coins className="inline size-3" /> {scenario.price} Coins</>}</span>
      </span>
      {state === 'coming' && <span className="scenario-flag">{!STORY_PLAY_ENABLED ? 'Coming in the next update' : owned && scenario.price > 0 ? 'Unlocked — chapters arrive in a coming update' : 'Coming in a future chapter update'}</span>}
      {(state === 'playable' || state === 'completed') && <Button variant="game" className="w-full mt-2" onClick={onPlay}><Play /> {state === 'completed' ? 'Replay this story' : 'Begin this story'}</Button>}
      {locked && <span className="scenario-flag"><Sparkles className="inline size-3" /> Tap to preview & unlock</span>}
    </span>
  </Wrap>;
}

/** Story Mode marketplace. Coins only move through the purchase modal. */
export function StoryMenu({ completed, hasStorySave, onSelect, onContinue, onBack }: {
  completed: string[]; hasStorySave: boolean;
  onSelect: (scenarioId: string) => void; onContinue: () => void; onBack: () => void;
}) {
  const wallet = useWallet();
  const [unlocked, setUnlocked] = useState<string[]>([FREE_FLAGSHIP_ID]);
  const [preview, setPreview] = useState<ScenarioDefinition | null>(null);
  useEffect(() => { setUnlocked(readUnlockedScenarios()); }, []);
  const [gallery, setGallery] = useState(false);
  if (gallery) return <StoryGallery scenarioId={FREE_FLAGSHIP_ID} onBack={() => setGallery(false)} />;

  const owned = (s: ScenarioDefinition) => isScenarioUnlocked(s.id, unlocked);
  const stateOf = (s: ScenarioDefinition): CardState => {
    if (!STORY_PLAY_ENABLED) return 'coming';
    if (completed.includes(s.id)) return 'completed';
    if (!owned(s)) return 'premium';
    return s.status === 'active' ? 'playable' : 'coming';
  };
  const done = SCENARIOS.filter(s => completed.includes(s.id));
  const rest = SCENARIOS.filter(s => !completed.includes(s.id));
  const sections: { title: string; items: ScenarioDefinition[]; empty: string }[] = [
    { title: 'Free stories', items: rest.filter(s => s.price === 0), empty: 'All free stories finished.' },
    { title: 'Premium stories', items: rest.filter(s => s.price > 0 && !owned(s)), empty: 'You own every premium story.' },
    { title: 'Unlocked stories', items: rest.filter(s => s.price > 0 && owned(s)), empty: 'Stories you unlock with coins appear here.' },
    { title: 'Completed stories', items: done, empty: 'Finish a story to see it here.' },
  ];

  return <main className="creation screen-enter">
    <header className="screen-header"><Button variant="gameQuiet" size="icon" aria-label="Back" onClick={onBack}><ArrowLeft /></Button><div><span className="eyebrow">Story Mode</span><h1>Story Marketplace</h1></div><span className="coin-chip"><Coins aria-hidden /> <b aria-label={`${wallet.coins} coins`}>{wallet.coins}</b></span></header>
    <div className="screen-body">
      <p className="step-subtitle">Scripted scenarios with acts, choices and multiple endings.</p>
      {!STORY_PLAY_ENABLED && <p className="market-empty" role="status"><Sparkles className="inline size-3" /> Story Mode is coming in the next update. Here's a preview of the stories on the way.</p>}
      {STORY_PLAY_ENABLED && hasStorySave && <Button variant="gameOutline" className="w-full mb-3" onClick={onContinue}><Play /> Continue your story</Button>}
      {sections.map(sec => <section key={sec.title} className="market-section" aria-label={sec.title}>
        <h2 className="market-title">{sec.title} <span>{sec.items.length}</span></h2>
        {sec.items.length === 0 ? <p className="market-empty">{sec.empty}</p> : <div className="background-list">
          {sec.items.map(s => <ScenarioCard key={s.id} scenario={s} state={stateOf(s)} owned={owned(s)} onPlay={() => onSelect(s.id)} onPreview={() => setPreview(s)} />)}
        </div>}
      </section>)}
      <Button variant="gameOutline" className="w-full mt-3" onClick={() => setGallery(true)}><Images /> Ending Gallery</Button>
    </div>
    <footer className="screen-actions"><Button variant="gameQuiet" onClick={onBack}><ArrowLeft /> Back</Button><span /></footer>
    {preview && <StoryPurchaseModal scenario={preview} onClose={() => setPreview(null)} onUnlocked={() => { setUnlocked(readUnlockedScenarios()); setPreview(null); }} />}
  </main>;
}
