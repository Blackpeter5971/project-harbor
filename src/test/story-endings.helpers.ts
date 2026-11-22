import { createStoryState, type StoryState } from '@/lib/game/story-mode';
import { ENEMY_ACROSS_THE_AISLE_SCRIPT } from '@/lib/game/scenarios/enemy-across-the-aisle';
import { startSession } from '@/lib/game/story-engine';
export { continueScene, evaluateStageEnding, replayStory } from '@/lib/game/story-engine';
export const startSessionForTest = (): StoryState => ({ ...createStoryState('enemy-across-the-aisle'), session: startSession(ENEMY_ACROSS_THE_AISLE_SCRIPT) });
