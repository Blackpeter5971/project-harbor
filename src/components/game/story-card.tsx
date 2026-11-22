import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StoryEvent, StoryNarrative } from '@/lib/game/story-engine';
import { STORY_PORTRAITS } from '@/lib/game/story-portraits';
import { sceneForEvent } from '@/lib/game/story-art';
import { applyOverride, loadOverrides, type StoryOverrides } from '@/lib/game/story-overrides';

/**
 * Interactive story card shown after the quarterly report when a story event
 * is queued. Animates in on mount and out on choice before the choice applies.
 */
export function StoryCard({ event: original, narrative, onChoose }: {
  event: StoryEvent;
  narrative: StoryNarrative;
  onChoose: (eventId: string, choiceId: string) => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const [overrides, setOverrides] = useState<StoryOverrides>({});
  useEffect(() => { setOverrides(loadOverrides()); }, []);
  const event = applyOverride(original, narrative.scenarioId, overrides);
  const scene = sceneForEvent(narrative, original);
  const character = narrative.characters.find(c => c.id === event.characterId);
  const portrait = character ? STORY_PORTRAITS[character.portrait] : undefined;

  function pick(choiceId: string) {
    if (leaving) return;
    setLeaving(true);
    // Let the exit animation play before the choice is applied.
    setTimeout(() => onChoose(event.id, choiceId), 280);
  }

  return (
    <div className={`modal-backdrop story-backdrop ${leaving ? 'story-leaving' : ''}`}>
      <section className="game-modal story-card" role="dialog" aria-modal="true" aria-labelledby="story-card-title">
        {scene && <img className="story-scene-image" src={scene} alt="" width={1280} height={720} />}
        <div className="story-card-scene">
          {portrait && (
            <div className="story-portrait-wrap">
              <img src={portrait} alt={character!.name} className="story-portrait" width={768} height={960} />
            </div>
          )}
          <div className="story-card-head">
            <span className="eyebrow story-eyebrow"><Sparkles /> Story moment</span>
            <h2 id="story-card-title">{event.title}</h2>
            <p className="story-speaker">
              <b>{event.speaker}</b>
              {character && <span> · {character.role}</span>}
            </p>
          </div>
        </div>
        <p className="story-dialogue">{event.dialogue}</p>
        <div className="story-choices">
          {event.choices.map((c, i) => (
            <Button
              key={c.id}
              variant="gameChoice"
              className="story-choice"
              style={{ animationDelay: `${120 + i * 90}ms` }}
              onClick={() => pick(c.id)}
            >
              <span className="story-choice-label">{c.label}</span>
              <span className="story-choice-preview">{c.preview}</span>
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}
