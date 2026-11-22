import civilWarCover from '@/assets/scenarios/civil-war-alternate-destiny.jpg';
import enemyCover from '@/assets/scenarios/enemy-across-the-aisle.jpg';
import underdogCover from '@/assets/scenarios/the-underdog.jpg';
import legacyCover from '@/assets/scenarios/the-legacy-burden.jpg';
import crisisCover from '@/assets/scenarios/crisis-leadership.jpg';
import redCarpetCover from '@/assets/scenarios/red-carpet-blue-blood.jpg';
import whistleCover from '@/assets/scenarios/the-whistleblower-shadow.jpg';
import darkHorseCover from '@/assets/scenarios/the-dark-horse-patriot.jpg';
import act1 from '@/assets/scenes/act-1-spark.jpg';
import act2 from '@/assets/scenes/act-2-secret.jpg';
import act3 from '@/assets/scenes/act-3-vow.jpg';
import act4 from '@/assets/scenes/act-4-reckoning.jpg';
import type { StoryEvent, StoryNarrative } from './story-engine';
import { chapterForTurn } from './story-engine';

export const SCENARIO_COVERS: Record<string, string> = {
  'enemy-across-the-aisle': enemyCover,
  'the-underdog': underdogCover,
  'the-legacy-burden': legacyCover,
  'crisis-leadership': crisisCover,
  'red-carpet-blue-blood': redCarpetCover,
  'the-whistleblower-shadow': whistleCover,
  'the-dark-horse-patriot': darkHorseCover,
  'civil-war-alternate-destiny': civilWarCover,
};

const ACT_SCENES: Record<string, Record<number, string>> = {
  'enemy-across-the-aisle': { 1: act1, 2: act2, 3: act3, 4: act4 },
};

/** Scene backdrop for an event, chosen by the act its trigger turn falls in. */
export function sceneForEvent(narrative: StoryNarrative, event: StoryEvent, currentTurn?: number): string | undefined {
  const scenes = ACT_SCENES[narrative.scenarioId];
  if (!scenes) return SCENARIO_COVERS[narrative.scenarioId];
  const turn = event.trigger.turn ?? event.trigger.turnRange?.[0] ?? currentTurn ?? 0;
  const act = chapterForTurn(narrative, turn)?.act ?? 1;
  return scenes[act] ?? SCENARIO_COVERS[narrative.scenarioId];
}
