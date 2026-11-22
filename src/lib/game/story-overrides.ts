import { z } from 'zod';
import type { StoryEvent } from './story-engine';

/**
 * Author-approved text overrides for story events. Only wording changes:
 * dialogue, choice labels and consequence previews. Effects, triggers, flags
 * and choice ids always come from the original scenario data, so approved
 * rewrites can never change gameplay or replay guards.
 */
export const OVERRIDES_KEY = 'president-story-overrides-v1';

export const draftSchema = z.object({
  dialogue: z.string().trim().min(1).max(900),
  choices: z.array(z.object({
    id: z.string().min(1),
    label: z.string().trim().min(1).max(120),
    preview: z.string().trim().min(1).max(240),
  })).min(1).max(6),
});
export type EventDraft = z.infer<typeof draftSchema>;

const overridesSchema = z.record(z.string(), draftSchema);
export type StoryOverrides = z.infer<typeof overridesSchema>;

export const overrideKey = (scenarioId: string, eventId: string) => `${scenarioId}::${eventId}`;

/** A draft is approvable only if it covers exactly the event's existing choices. */
export function draftMatchesEvent(event: StoryEvent, draft: EventDraft): boolean {
  const ids = event.choices.map(c => c.id).sort();
  const got = draft.choices.map(c => c.id).sort();
  return ids.length === got.length && ids.every((id, i) => id === got[i]);
}

/** Records an approval. Returns the same object (unchanged) when the draft doesn't fit the event. */
export function approveDraft(overrides: StoryOverrides, scenarioId: string, event: StoryEvent, draft: EventDraft): StoryOverrides {
  const parsed = draftSchema.safeParse(draft);
  if (!parsed.success || !draftMatchesEvent(event, parsed.data)) return overrides;
  return { ...overrides, [overrideKey(scenarioId, event.id)]: parsed.data };
}

export function revertOverride(overrides: StoryOverrides, scenarioId: string, eventId: string): StoryOverrides {
  const next = { ...overrides };
  delete next[overrideKey(scenarioId, eventId)];
  return next;
}

/** Applies an approved override to an event's wording; everything else stays original. */
export function applyOverride(event: StoryEvent, scenarioId: string, overrides: StoryOverrides): StoryEvent {
  const o = overrides[overrideKey(scenarioId, event.id)];
  if (!o || !draftMatchesEvent(event, o)) return event;
  return {
    ...event,
    dialogue: o.dialogue,
    choices: event.choices.map(c => {
      const d = o.choices.find(x => x.id === c.id)!;
      return { ...c, label: d.label, preview: d.preview };
    }),
  };
}

export function loadOverrides(): StoryOverrides {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return {};
    const r = overridesSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : {};
  } catch { return {}; }
}

export function saveOverrides(o: StoryOverrides): void {
  try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(o)); } catch { /* storage full or blocked */ }
}
