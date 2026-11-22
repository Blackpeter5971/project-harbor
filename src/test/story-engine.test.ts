import { describe, expect, it } from 'vitest';
import { createStoryCareer, defaultDraft, parseCareer } from '@/lib/game/career';
import {
  advanceStory, applyStoryChoice, deriveProgress, dueEvent, evaluateEnding, narrativeFor,
  pendingStoryEvent, seedStoryState, storyEnding, storyFinished, triggerMatches,
} from '@/lib/game/story-engine';
import { applyStoryCareerEffects } from '@/lib/game/story-effects';
import { createStoryState, storyStateSchema } from '@/lib/game/story-mode';

const SID = 'enemy-across-the-aisle';
const narrative = narrativeFor(SID)!;

function freshCareer() {
  return createStoryCareer({ ...defaultDraft, name: 'Test Player' }, SID, () => 0.5);
}

/** Advance the story clock n times, auto-resolving any queued event with its first choice. */
function tick(career: ReturnType<typeof freshCareer>, n: number) {
  let c = career;
  for (let i = 0; i < n; i++) {
    c = advanceStory(c);
    const ev = pendingStoryEvent(c);
    if (ev) {
      const r = applyStoryChoice(c, ev.id, ev.choices[0]!.id);
      if (r.ok) c = r.career;
    }
  }
  return c;
}

describe('story engine: acts & chapters', () => {
  it('derives act and chapter from the story turn across variable ranges', () => {
    expect(deriveProgress(narrative, 0)).toEqual({ act: 1, chapter: 1 });
    expect(deriveProgress(narrative, 3)).toEqual({ act: 1, chapter: 2 });
    expect(deriveProgress(narrative, 6)).toEqual({ act: 2, chapter: 3 });
    expect(deriveProgress(narrative, 11)).toEqual({ act: 3, chapter: 5 });
    expect(deriveProgress(narrative, 19)).toEqual({ act: 4, chapter: 8 });
  });

  it('spans 4 acts and 20 turns with 8 chapters', () => {
    expect(narrative.acts).toHaveLength(4);
    expect(narrative.chapters).toHaveLength(8);
    expect(Math.max(...narrative.chapters.map(ch => ch.turns[1]))).toBe(20);
  });

  it('seeds initial variables and relationships on a new story career', () => {
    const c = freshCareer();
    expect(c.mode).toBe('story');
    expect(c.story?.variables).toEqual({ love: 10, suspicion: 5, loyalty: 60, trust: 50 });
    expect(c.story?.relationships?.["rival"]).toBe(0);
  });

  it('registers the key cast: Vance, campaign manager, reporter and party chair', () => {
    const ids = narrative.characters.map(c => c.id);
    expect(ids).toEqual(expect.arrayContaining(['rival', 'chief', 'reporter', 'chair']));
    expect(narrative.characters.find(c => c.id === 'rival')?.name).toBe('Senator Vance');
  });

  it('marks chapters complete as their turn ranges pass', () => {
    const c = tick(freshCareer(), 6);
    expect(c.story?.completedChapters).toContain('ch1');
    expect(c.story?.completedChapters).toContain('ch2');
    expect(c.story?.act).toBe(2);
  });
});

describe('story engine: event scheduling', () => {
  it('queues the intro event on the first turn and blocks re-triggering once done', () => {
    let c = advanceStory(freshCareer());
    expect(pendingStoryEvent(c)?.id).toBe('eata-first-clash');
    const r = applyStoryChoice(c, 'eata-first-clash', 'sparring');
    expect(r.ok).toBe(true);
    c = r.ok ? r.career : c;
    expect(pendingStoryEvent(c)).toBeNull();
    expect(c.story?.completedEvents).toContain('eata-first-clash');
    // Later turns never re-queue it.
    c = tick(c, 6);
    expect(c.story?.completedEvents.filter(id => id === 'eata-first-clash')).toHaveLength(1);
  });

  it('respects flag conditions: the rooftop scene is skipped when the rival was avoided', () => {
    const state = { ...seedStoryState(createStoryState(SID)), turn: 5, flags: { 'avoided-rival': true } };
    const ev = narrative.events.find(e => e.id === 'eata-rooftop')!;
    expect(triggerMatches(state, ev.trigger)).toBe(false);
    expect(dueEvent(narrative, state)?.id).not.toBe('eata-rooftop');
  });

  it('gates the photo event on the romance flag and its turn range', () => {
    const ev = narrative.events.find(e => e.id === 'eata-photo')!;
    const base = seedStoryState(createStoryState(SID));
    expect(triggerMatches({ ...base, turn: 10 }, ev.trigger)).toBe(false); // no romance
    expect(triggerMatches({ ...base, turn: 10, flags: { 'romance-active': true } }, ev.trigger)).toBe(true);
    expect(triggerMatches({ ...base, turn: 12, flags: { 'romance-active': true } }, ev.trigger)).toBe(false); // past range
  });

  it('gates the wedding on the engagement flag', () => {
    const ev = narrative.events.find(e => e.id === 'eata-wedding')!;
    const base = seedStoryState(createStoryState(SID));
    expect(triggerMatches({ ...base, turn: 14 }, ev.trigger)).toBe(false);
    expect(triggerMatches({ ...base, turn: 14, flags: { engaged: true } }, ev.trigger)).toBe(true);
  });

  it('rejects choices for events that are not currently queued (replay guard)', () => {
    const c = freshCareer();
    const r = applyStoryChoice(c, 'eata-first-clash', 'sparring');
    expect(r.ok).toBe(false);
  });
});

describe('story engine: variables, flags & delayed triggers', () => {
  it('applies variable and relationship deltas, clamped to 0–100 / -100–100', () => {
    let c = advanceStory(freshCareer());
    const r = applyStoryChoice(c, 'eata-first-clash', 'sparring');
    expect(r.ok).toBe(true);
    c = r.ok ? r.career : c;
    expect(c.story?.variables["love"]).toBe(20);
    expect(c.story?.relationships["rival"]).toBe(15);
    // Clamp: going public drops suspicion by 100 from any value.
    const state = { ...c.story!, turn: 11, flags: { 'romance-active': true }, queuedEvent: 'eata-ultimatum' };
    c = { ...c, story: state };
    const r2 = applyStoryChoice(c, 'eata-ultimatum', 'public');
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.career.story?.variables["suspicion"]).toBe(0);
  });

  it('arms delayed trigger flags that resolve on a future turn', () => {
    // Resolve the intro, then reach turn 2 and pick "help" (arms party-whispers in 2 turns).
    let c = freshCareer();
    c = advanceStory(c); // turn 1
    let r = applyStoryChoice(c, 'eata-first-clash', 'sparring');
    expect(r.ok).toBe(true);
    c = r.ok ? r.career : c;
    c = advanceStory(c); // turn 2
    r = applyStoryChoice(c, 'eata-late-vote', 'help');
    expect(r.ok).toBe(true);
    c = r.ok ? r.career : c;
    expect(c.story?.flags['helped-amendment']).toBe(true);
    expect(c.story?.flags['party-whispers']).toBeUndefined();
    expect(c.story?.pendingTriggers).toContainEqual({ atTurn: 4, flag: 'party-whispers', value: true });
    c = advanceStory(c); // turn 3
    expect(c.story?.flags['party-whispers']).toBeUndefined();
    c = advanceStory(c); // turn 4 — trigger resolves
    expect(c.story?.flags['party-whispers']).toBe(true);
    expect(c.story?.pendingTriggers).toHaveLength(0);
  });
});

describe('story engine: decision log & completion', () => {
  it('records every choice in the append-only decision log with shifts', () => {
    let c = advanceStory(freshCareer());
    const r = applyStoryChoice(c, 'eata-first-clash', 'sparring');
    expect(r.ok).toBe(true);
    c = r.ok ? r.career : c;
    const entry = c.story?.decisionLog[0];
    expect(entry?.eventId).toBe('eata-first-clash');
    expect(entry?.choiceId).toBe('sparring');
    expect(entry?.summary).toContain('Senator Vance');
    expect(entry?.shifts.join(' ')).toContain('love +10');
  });

  it('finishes the scenario after the final chapter range passes', () => {
    const c = tick(freshCareer(), 21);
    expect(c.story?.completedChapters).toEqual(expect.arrayContaining(['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8']));
    expect(storyFinished(c.story!)).toBe(true);
  });

  it('survives a save/load round-trip with all story fields intact', () => {
    let c = tick(freshCareer(), 3);
    const loaded = parseCareer(JSON.stringify(c));
    expect(loaded?.story).toEqual(c.story);
  });

  it('Phase 1 saves without engine fields still parse with defaults', () => {
    const legacy = { scenarioId: SID, chapter: 2, act: 2, turn: 5, flags: { x: true }, completedChapters: ['ch1'] };
    const parsed = storyStateSchema.parse(legacy);
    expect(parsed.variables).toEqual({});
    expect(parsed.completedEvents).toEqual([]);
    expect(parsed.decisionLog).toEqual([]);
    expect(parsed.queuedEvent).toBeNull();
    expect(parsed.ending).toBeNull();
  });
});

describe('story engine: endings (Phase 3)', () => {
  it('defines exactly 7 ending conditions', () => {
    expect(narrative.endings).toHaveLength(7);
  });

  it('awards Power & Love for a public marriage with high love', () => {
    const state = { ...seedStoryState(createStoryState(SID)), turn: 20, flags: { 'married-public': true, 'went-public': true }, variables: { love: 75, suspicion: 0, loyalty: 40, trust: 60 } };
    expect(evaluateEnding(narrative, state).id).toBe('power-and-love');
  });

  it('awards The Secret Forever for a hidden marriage with low suspicion', () => {
    const state = { ...seedStoryState(createStoryState(SID)), turn: 20, flags: { 'married-secret': true }, variables: { love: 50, suspicion: 30, loyalty: 55, trust: 50 } };
    expect(evaluateEnding(narrative, state).id).toBe('secret-forever');
  });

  it('awards Fall from Grace when the buried photo unravels at high suspicion', () => {
    const state = { ...seedStoryState(createStoryState(SID)), turn: 20, flags: { 'denied-photo': true, 'denial-unravels': true }, variables: { love: 40, suspicion: 70, loyalty: 60, trust: 30 } };
    expect(evaluateEnding(narrative, state).id).toBe('fall-from-grace');
  });

  it('awards Burned Bridges when the rival was betrayed to the press', () => {
    const state = { ...seedStoryState(createStoryState(SID)), turn: 20, flags: { 'betrayed-rival': true } };
    expect(evaluateEnding(narrative, state).id).toBe('burned-bridges');
  });

  it('awards The Operator for choosing power with party loyalty intact', () => {
    const state = { ...seedStoryState(createStoryState(SID)), turn: 20, flags: { 'ending-power': true }, variables: { love: 20, suspicion: 20, loyalty: 75, trust: 50 } };
    expect(evaluateEnding(narrative, state).id).toBe('the-operator');
  });

  it('awards The Confession for choosing the truth on election night', () => {
    const state = { ...seedStoryState(createStoryState(SID)), turn: 20, flags: { 'ending-heart': true } };
    expect(evaluateEnding(narrative, state).id).toBe('the-confession');
  });

  it('falls back to Lone Wolf when no other ending matches', () => {
    const state = { ...seedStoryState(createStoryState(SID)), turn: 20, flags: { 'avoided-rival': true } };
    expect(evaluateEnding(narrative, state).id).toBe('lone-wolf');
  });

  it('stamps the ending onto the story state when the final chapter closes', () => {
    const base = seedStoryState(createStoryState(SID));
    const state = { ...base, turn: 20, queuedEvent: 'eata-finale', flags: { 'avoided-rival': true } };
    const c = { ...freshCareer(), story: state };
    const r = applyStoryChoice(c, 'eata-finale', 'power');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.career.story?.ending).toBe('the-operator');
      expect(storyEnding(r.career)?.title).toBe('The Operator');
    }
  });
});

describe('story engine: election integration (Phase 3)', () => {
  it('declares real career effects on Act IV climax choices', () => {
    const finale = narrative.events.find(e => e.id === 'eata-final-debate')!;
    const attack = finale.choices.find(c => c.id === 'attack-record')!;
    expect(attack.effects.career).toMatchObject({ momentum: 3, reputation: 2 });
  });

  it('applies career effects through existing approval/reputation systems', () => {
    const c = freshCareer();
    const before = c.reputation;
    const next = applyStoryCareerEffects(c, { reputation: 3, approval: 2 });
    expect(next.reputation).toBe(before + 3);
    // No office held yet: approval state stays absent rather than fabricated.
    expect(next.approval).toEqual(c.approval);
  });

  it('moves campaign momentum only when a campaign is active', () => {
    const c = freshCareer();
    const withCampaign = { ...c, campaign: { office: 'mayor', title: 'Mayor', jurisdiction: 'Springfield', party: c.character.party, electionDate: '2027-11-02', primaryDate: null, startDate: c.date, phase: 'general' as const, slogan: '', strategy: 'grassroots' as const, manager: null, funds: 0, raised: 0, spent: 0, donors: 0, staff: 0, volunteers: 10, support: 5, momentum: 3, opponents: [], polls: [], txns: [], endorsements: [], headlines: [], attack: null, allegation: null, turnActs: [], lastProcessedEnd: c.date } };
    const boosted = applyStoryCareerEffects(withCampaign, { momentum: 3 });
    expect(boosted.campaign?.momentum).toBe(6);
    // Without a campaign, momentum effects are inert.
    const idle = applyStoryCareerEffects(c, { momentum: 3 });
    expect(idle.campaign).toBeNull();
  });

  it('clamps reputation effects to 0–100', () => {
    const c = { ...freshCareer(), reputation: 99 };
    expect(applyStoryCareerEffects(c, { reputation: 5 }).reputation).toBe(100);
  });
});
