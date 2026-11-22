import { describe, it, expect } from 'vitest';
import { STORY_NARRATIVES } from '@/lib/game/story-engine';
import { applyOverride, approveDraft, revertOverride } from '@/lib/game/story-overrides';

const n = STORY_NARRATIVES[0]!;
const ev = n.events[0]!;
const draft = { dialogue: 'New words.', choices: ev.choices.map(c => ({ id: c.id, label: 'L ' + c.id, preview: 'P' })) };

describe('story overrides', () => {
  it('unapproved drafts never change the event', () => {
    expect(applyOverride(ev, n.scenarioId, {})).toBe(ev);
  });
  it('approved drafts change wording only, never effects', () => {
    const o = approveDraft({}, n.scenarioId, ev, draft);
    const out = applyOverride(ev, n.scenarioId, o);
    expect(out.dialogue).toBe('New words.');
    expect(out.choices.map(c => c.effects)).toEqual(ev.choices.map(c => c.effects));
    expect(out.trigger).toEqual(ev.trigger);
  });
  it('rejects drafts that drop a choice', () => {
    const o = approveDraft({}, n.scenarioId, ev, { ...draft, choices: draft.choices.slice(1) });
    expect(o).toEqual({});
  });
  it('restoring the original removes the edit', () => {
    const o = revertOverride(approveDraft({}, n.scenarioId, ev, draft), n.scenarioId, ev.id);
    expect(applyOverride(ev, n.scenarioId, o)).toBe(ev);
  });
});
