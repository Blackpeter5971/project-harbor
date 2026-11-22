import { z } from 'zod';

/**
 * Story Mode foundation (Phase 1).
 * Pure, browser-safe module: no storage or DOM access except through the
 * injectable storage helpers at the bottom. Sandbox mode is untouched.
 */

export type GameMode = 'sandbox' | 'story';

/** Story careers persist under their own key so they never overwrite sandbox saves. */
export const STORY_SAVE_KEY = 'crosian-president-story-v1';
/** Device-wide record of completed scenarios (survives story save replacement). */
export const STORY_PROGRESS_KEY = 'crosian-president-story-progress-v1';

/** Core game systems a scenario can gate. */
export const CORE_FEATURES = ['elections', 'government', 'media', 'relationships', 'business', 'judiciary', 'treasury', 'campaign', 'crises', 'social'] as const;
export type CoreFeature = typeof CORE_FEATURES[number];

/**
 * AVAILABLE: system runs normally, including background turn ticks.
 * LOCKED: visible in the UI with a notice, but inactive (no ticks).
 * HIDDEN: not shown and inactive (no ticks).
 */
export const FEATURE_STATES = ['available', 'locked', 'hidden'] as const;
export type FeatureState = typeof FEATURE_STATES[number];

const featureMatrixSchema = z.record(z.enum(CORE_FEATURES), z.enum(FEATURE_STATES));

export const scenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  tagline: z.string(),
  description: z.string(),
  /** Total scenario length in turns (1 turn = 1 quarter). */
  turns: z.number().int().positive(),
  chapters: z.number().int().positive(),
  /** Free scenarios never cost coins; the wallet is only ever read, never charged, here. */
  free: z.boolean(),
  /** active: playable now. locked: listed with a notice, not yet playable. */
  status: z.enum(['active', 'locked']),
  features: featureMatrixSchema,
  /** Coin price to unlock; 0 means free forever. */
  price: z.number().int().min(0),
  genre: z.string().min(1),
  playtimeMinutes: z.number().int().positive(),
  actsCount: z.number().int().positive(),
  endingsCount: z.number().int().positive(),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  /** Short cast preview shown in the marketplace. */
  cast: z.array(z.string()).default([]),
});
export type ScenarioDefinition = z.infer<typeof scenarioSchema>;

const ALL_AVAILABLE: Record<CoreFeature, FeatureState> = {
  elections: 'available', government: 'available', media: 'available', relationships: 'available',
  business: 'available', judiciary: 'available', treasury: 'available', campaign: 'available',
  crises: 'available', social: 'available',
};

/** Scenario registry. Phase 1 registers metadata only; storylines arrive in later phases. */
export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'enemy-across-the-aisle',
    title: 'Enemy Across the Aisle',
    tagline: 'A forbidden romance with your fiercest rival.',
    description: 'Fall for the opposition’s rising star while your parties demand loyalty. Every choice between love and power reshapes your career — and the headline.',
    turns: 20,
    chapters: 8,
    free: true,
    status: 'active',
    price: 0, genre: 'Political Romance', playtimeMinutes: 90, actsCount: 4, endingsCount: 7, difficulty: 'Medium', cast: ['Julian Vance — rival senator', 'Marcus Hale — party whip', 'Elena Cross — reporter'],
    features: {
      ...ALL_AVAILABLE,
      business: 'locked',
      judiciary: 'locked',
    },
  },
  {
    id: 'the-underdog',
    title: 'The Underdog',
    tagline: 'From nothing to the nation’s highest office.',
    description: 'No money, no name, no network. Build a movement from a street corner and take on the establishment machine.',
    turns: 20,
    chapters: 5,
    free: true,
    status: 'active',
    price: 0, genre: 'Rags to Riches', playtimeMinutes: 80, actsCount: 5, endingsCount: 4, difficulty: 'Hard', cast: [],
    features: { ...ALL_AVAILABLE, treasury: 'hidden', judiciary: 'locked' },
  },
  {
    id: 'the-legacy-burden',
    title: 'The Legacy Burden',
    tagline: 'A famous name is a heavy crown.',
    description: 'Born into a political dynasty, you must prove you are more than your surname — or watch the family empire crumble.',
    turns: 16,
    chapters: 4,
    free: true,
    status: 'active',
    price: 0, genre: 'Family Dynasty', playtimeMinutes: 70, actsCount: 4, endingsCount: 4, difficulty: 'Medium', cast: [],
    features: { ...ALL_AVAILABLE, business: 'locked' },
  },
  {
    id: 'crisis-leadership',
    title: 'Crisis Leadership',
    tagline: 'Govern a nation on the edge.',
    description: 'Economic collapse, mass strikes and border tensions test every instinct. Hold the coalition together or go down with it.',
    turns: 16,
    chapters: 4,
    free: true,
    status: 'active',
    price: 0, genre: 'Crisis Drama', playtimeMinutes: 70, actsCount: 4, endingsCount: 4, difficulty: 'Hard', cast: [],
    features: { ...ALL_AVAILABLE, business: 'hidden' },
  },
  {
    id: 'civil-war-alternate-destiny',
    title: 'American Civil War: Alternate Destiny',
    tagline: 'Divide a nation or preserve the Union in the crucible of 1860.',
    description: 'Lead Abraham Lincoln through the secession winter, or guide the Southern leadership toward Montgomery. Your choices rewrite 1860s America.',
    turns: 6,
    chapters: 1,
    free: true,
    status: 'active',
    price: 0, genre: 'Historical Alternate History', playtimeMinutes: 15, actsCount: 1, endingsCount: 2, difficulty: 'Hard', cast: ['Abraham Lincoln — President-elect', 'William Seward — senator', 'Robert Toombs — senator'],
    features: { ...ALL_AVAILABLE, business: 'hidden', social: 'hidden' },
  },
  {
    id: 'red-carpet-blue-blood',
    title: 'Red Carpet, Blue Blood',
    tagline: 'Marry into old money — and its old secrets.',
    description: 'A whirlwind engagement to an heiress opens every door in the capital. But her family expects a return on their investment, and the cameras never stop flashing.',
    turns: 16, chapters: 6, free: false, status: 'locked',
    price: 150, genre: 'Glamour & Intrigue', playtimeMinutes: 75, actsCount: 4, endingsCount: 5, difficulty: 'Medium',
    cast: ['Lady Celeste Ashford — heiress', 'Duke Ashford — her father', 'Ravi Morel — society columnist'],
    features: { ...ALL_AVAILABLE, judiciary: 'locked' },
  },
  {
    id: 'the-whistleblower-shadow',
    title: 'The Whistleblower’s Shadow',
    tagline: 'One folder could end a government.',
    description: 'An anonymous source hands you proof of corruption at the very top. Expose it and risk everything, bury it and become complicit — someone is always watching.',
    turns: 16, chapters: 6, free: false, status: 'locked',
    price: 150, genre: 'Political Thriller', playtimeMinutes: 80, actsCount: 4, endingsCount: 6, difficulty: 'Hard',
    cast: ['"Ledger" — the source', 'Director Hollis — intelligence chief', 'Nadia Kerr — investigative journalist'],
    features: { ...ALL_AVAILABLE, business: 'locked' },
  },
  {
    id: 'the-dark-horse-patriot',
    title: 'The Dark Horse Patriot',
    tagline: 'No party. No donors. Just the people.',
    description: 'An independent run from the heartland ignites a movement neither party saw coming. Keep your principles as the crowds grow — and the establishment closes ranks.',
    turns: 20, chapters: 8, free: false, status: 'locked',
    price: 200, genre: 'Populist Uprising', playtimeMinutes: 100, actsCount: 5, endingsCount: 7, difficulty: 'Hard',
    cast: ['Hank Duval — campaign manager', 'Senator Price — establishment frontrunner', 'Maya Lin — grassroots organiser'],
    features: { ...ALL_AVAILABLE, treasury: 'locked' },
  },
];

export const scenarioById = (id: string): ScenarioDefinition | undefined => SCENARIOS.find(s => s.id === id);

/** Feature state for a scenario; unknown scenarios/features default to hidden (safest: no ticks). */
export function featureState(scenarioId: string, feature: CoreFeature): FeatureState {
  return scenarioById(scenarioId)?.features[feature] ?? 'hidden';
}
/** Only AVAILABLE systems run background turn ticks in Story Mode. */
export const isFeatureActive = (scenarioId: string, feature: CoreFeature): boolean => featureState(scenarioId, feature) === 'available';

/** Persisted per-career story progress. */
export const storyStateSchema = z.object({
  scenarioId: z.string().min(1),
  chapter: z.number().int().min(1).default(1),
  act: z.number().int().min(1).default(1),
  /** Turns elapsed inside the scenario (0-based). */
  turn: z.number().int().min(0).default(0),
  /** Decision flags recorded by story cards (e.g. "denied-photo": "A"). */
  flags: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  completedChapters: z.array(z.string()).default([]),
  /** Numeric story variables (0–100), e.g. love, suspicion, party loyalty. */
  variables: z.record(z.string(), z.number().min(0).max(100)).default({}),
  /** Relationship standings with named story characters (-100–100). */
  relationships: z.record(z.string(), z.number().min(-100).max(100)).default({}),
  /** One-time story events that already fired; never re-trigger. */
  completedEvents: z.array(z.string()).default([]),
  /** Delayed trigger flags armed by earlier choices, resolved on a future turn. */
  pendingTriggers: z.array(z.object({
    atTurn: z.number().int().min(0),
    flag: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean()]).default(true),
  })).default([]),
  /** Story event currently queued for the post-turn card modal. */
  queuedEvent: z.string().nullable().default(null),
  /** Evaluated ending id once the final chapter closes (Phase 3). */
  ending: z.string().nullable().default(null),
  /** Append-only log of story decisions and relationship shifts. */
  decisionLog: z.array(z.object({
    turn: z.number().int().min(0),
    date: z.string(),
    eventId: z.string(),
    choiceId: z.string(),
    summary: z.string(),
    shifts: z.array(z.string()).default([]),
  })).default([]),
  /** Cinematic scene session (story stage); null for legacy turn-based saves. */
  session: z.object({
    sceneId: z.string().min(1),
    meters: z.record(z.string(), z.number()).default({}),
    flags: z.array(z.string()).default([]),
    /** Choice made in the current scene, awaiting Continue (null before choosing). */
    pendingChoice: z.string().nullable().default(null),
    history: z.array(z.object({ sceneId: z.string(), choiceId: z.string(), label: z.string(), deltas: z.record(z.string(), z.number()).default({}) })).default([]),
    visited: z.array(z.string()).default([]),
    complete: z.boolean().default(false),
  }).nullable().default(null),
});
export type StoryState = z.infer<typeof storyStateSchema>;

export function createStoryState(scenarioId: string): StoryState {
  if (!scenarioById(scenarioId)) throw new Error(`Unknown scenario: ${scenarioId}`);
  return storyStateSchema.parse({ scenarioId });
}

/** Card status for the Story Mode landing page. */
export type ScenarioCardStatus = 'active' | 'locked' | 'completed';
export function scenarioCardStatus(scenario: ScenarioDefinition, completed: readonly string[]): ScenarioCardStatus {
  if (completed.includes(scenario.id)) return 'completed';
  return scenario.status;
}

const achievedSchema = z.object({ id: z.string().min(1), achievedAt: z.string() });
const progressSchema = z.object({
  completed: z.array(z.string()).default([]),
  /** Discovered endings per scenario (additive; replays never erase them). */
  endings: z.record(z.string(), z.array(achievedSchema)).default({}),
});
type StoryProgress = z.infer<typeof progressSchema>;
export type AchievedEnding = z.infer<typeof achievedSchema>;
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function readProgress(storage: StorageLike): StoryProgress {
  try {
    const parsed = progressSchema.safeParse(JSON.parse(storage.getItem(STORY_PROGRESS_KEY) ?? 'null'));
    return parsed.success ? parsed.data : { completed: [], endings: {} };
  } catch { return { completed: [], endings: {} }; }
}
function writeProgress(storage: StorageLike, p: StoryProgress) {
  try { storage.setItem(STORY_PROGRESS_KEY, JSON.stringify(p)); } catch { /* storage optional */ }
}

/** Read completed scenario ids. Browser-only; call after hydration. */
export function readStoryProgress(storage: StorageLike): string[] { return readProgress(storage).completed; }
/** Mark a scenario complete (additive, idempotent). Browser-only. */
export function recordScenarioComplete(storage: StorageLike, scenarioId: string): void {
  const p = readProgress(storage);
  if (p.completed.includes(scenarioId)) return;
  writeProgress(storage, { ...p, completed: [...p.completed, scenarioId] });
}
/** Endings discovered on this device for a scenario. */
export function readDiscoveredEndings(storage: StorageLike, scenarioId: string): AchievedEnding[] {
  return readProgress(storage).endings[scenarioId] ?? [];
}
/** Record a discovered ending once (keeps the first date) and mark the scenario complete. */
export function recordEndingDiscovered(storage: StorageLike, scenarioId: string, endingId: string, achievedAt: string): void {
  const p = readProgress(storage);
  const list = p.endings[scenarioId] ?? [];
  const has = list.some(e => e.id === endingId), done = p.completed.includes(scenarioId);
  if (has && done) return;
  writeProgress(storage, {
    completed: done ? p.completed : [...p.completed, scenarioId],
    endings: { ...p.endings, [scenarioId]: has ? list : [...list, { id: endingId, achievedAt }] },
  });
}

/** Device-wide record of purchased scenarios (independent of saves and the wallet). */
export const STORY_UNLOCKS_KEY = 'crosian-president-story-unlocks-v1';
/** Free flagship — always unlocked, never charged. */
export const FREE_FLAGSHIP_ID = 'enemy-across-the-aisle';
const unlocksSchema = z.object({ unlocked: z.array(z.string()).default([]) });
const defaultStorage = (): StorageLike | null => (typeof localStorage === 'undefined' ? null : localStorage);

/** Purchased + free scenario ids. Browser-only; call after hydration. */
export function readUnlockedScenarios(storage: StorageLike | null = defaultStorage()): string[] {
  let stored: string[] = [];
  try {
    const parsed = unlocksSchema.safeParse(JSON.parse(storage?.getItem(STORY_UNLOCKS_KEY) ?? 'null'));
    if (parsed.success) stored = parsed.data.unlocked;
  } catch { /* corrupt → defaults */ }
  const free = SCENARIOS.filter(s => s.price === 0).map(s => s.id);
  return [...new Set([FREE_FLAGSHIP_ID, ...free, ...stored.filter(id => scenarioById(id))])];
}
/** Persist an unlock (idempotent). Returns false for unknown ids or storage failure. */
export function unlockScenario(id: string, storage: StorageLike | null = defaultStorage()): boolean {
  if (!scenarioById(id) || !storage) return false;
  const current = readUnlockedScenarios(storage);
  if (current.includes(id)) return true;
  try { storage.setItem(STORY_UNLOCKS_KEY, JSON.stringify({ unlocked: [...current, id] })); return true; } catch { return false; }
}
export const isScenarioUnlocked = (id: string, unlocked: readonly string[]) => id === FREE_FLAGSHIP_ID || scenarioById(id)?.price === 0 || unlocked.includes(id);

/**
 * Pure purchase decision: returns the charged wallet, or null when the scenario
 * is free, already owned, unknown, or the balance is too low. Free scenarios never charge.
 */
export function chargeForScenario<W extends { coins: number }>(wallet: W, id: string, unlocked: readonly string[], spend: (w: W, n: number) => W | null): W | null {
  const s = scenarioById(id);
  if (!s || s.price <= 0 || isScenarioUnlocked(id, unlocked)) return null;
  return spend(wallet, s.price);
}

export type PurchaseResult = 'unlocked' | 'already-owned' | 'insufficient' | 'failed';
/**
 * Unlock a premium scenario: saves the unlock first, then charges the wallet,
 * so a storage failure never takes coins without granting the story.
 */
export function purchaseScenario<W extends { coins: number }>(id: string, io: {
  readWallet: () => W; writeWallet: (w: W) => void; spend: (w: W, n: number) => W | null; storage?: StorageLike | null;
}): PurchaseResult {
  const storage = io.storage === undefined ? defaultStorage() : io.storage;
  const unlocked = readUnlockedScenarios(storage);
  if (isScenarioUnlocked(id, unlocked)) return 'already-owned';
  const next = chargeForScenario(io.readWallet(), id, unlocked, io.spend);
  if (!next) return scenarioById(id) ? 'insufficient' : 'failed';
  if (!unlockScenario(id, storage)) return 'failed';
  io.writeWallet(next);
  return 'unlocked';
}
