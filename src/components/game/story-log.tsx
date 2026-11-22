import { BookOpen, Heart, Users } from 'lucide-react';
import type { Career } from '@/lib/game/career';
import { chapterObjective, narrativeFor } from '@/lib/game/story-engine';
import { monthLabel } from '@/lib/game/gameplay';

/**
 * Story Decisions view (Story Mode only): current chapter objective, story
 * variables, relationship standings and the append-only decision log.
 * Separate from sandbox newspapers — pure read of career.story.
 */
export function StoryLogPanel({ career }: { career: Career }) {
  const story = career.story;
  if (!story) return <p className="mini-note">No story is active in this career.</p>;
  const narrative = narrativeFor(story.scenarioId);
  if (!narrative) return <p className="mini-note">Unknown scenario.</p>;

  const chapter = narrative.chapters[story.chapter - 1];
  const act = narrative.acts.find(a => a.n === story.act);
  const objective = chapterObjective(story);
  const log = [...story.decisionLog].reverse();

  return (
    <div className="story-log">
      <div className="story-log-head">
        <span className="eyebrow"><BookOpen /> {narrative.scenarioId.replace(/-/g, ' ')}</span>
        <h2 className="step-title">{chapter?.title ?? 'Story'}</h2>
        <p className="step-subtitle">
          Act {story.act}{act ? ` · ${act.title}` : ''} · Turn {story.turn} of {narrative.chapters[narrative.chapters.length - 1]!.turns[1] + 1}
        </p>
        {objective && <div className="notification story-objective"><BookOpen /><div><b>Chapter objective</b><p>{objective}</p></div></div>}
      </div>

      {Object.keys(story.variables).length > 0 && (
        <>
          <h3 className="section-label mt-3">Story threads</h3>
          <div className="story-vars">
            {Object.entries(story.variables).map(([k, v]) => (
              <div key={k} className="story-var">
                <div className="story-var-top"><span>{k}</span><b>{v}</b></div>
                <div className="story-var-bar"><span style={{ width: `${v}%` }} /></div>
              </div>
            ))}
          </div>
        </>
      )}

      {Object.keys(story.relationships).length > 0 && (
        <>
          <h3 className="section-label mt-3">Relationships</h3>
          <div className="row-list">
            {Object.entries(story.relationships).map(([id, v]) => {
              const who = narrative.characters.find(c => c.id === id);
              return (
                <div key={id} className="game-row static">
                  <div><b>{who?.name ?? id}</b><p>{who?.role ?? 'Story character'}</p></div>
                  <span className={`row-cost ${v >= 0 ? 'story-rel-pos' : 'story-rel-neg'}`}>
                    {v >= 0 ? <Heart /> : <Users />} {v > 0 ? `+${v}` : v}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <h3 className="section-label mt-3">Decisions</h3>
      {log.length === 0 && <p className="mini-note">No story decisions yet. Story cards appear after the quarterly report when a moment is due.</p>}
      <div className="row-list">
        {log.map((e, i) => (
          <div key={`${e.eventId}-${i}`} className="game-row static story-log-entry">
            <div>
              <b>{e.summary}</b>
              {e.shifts.length > 0 && <p>{e.shifts.join(' · ')}</p>}
            </div>
            <span className="row-cost">{monthLabel(e.date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
