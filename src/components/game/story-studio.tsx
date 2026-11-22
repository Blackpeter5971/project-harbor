import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, RotateCcw, Sparkles, Undo2, X } from 'lucide-react';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { STORY_NARRATIVES, chapterForTurn, type StoryEvent, type StoryNarrative } from '@/lib/game/story-engine';
import { scenarioById } from '@/lib/game/story-mode';
import { sceneForEvent } from '@/lib/game/story-art';
import { applyOverride, approveDraft, draftMatchesEvent, loadOverrides, overrideKey, revertOverride, saveOverrides, type EventDraft, type StoryOverrides } from '@/lib/game/story-overrides';
import { draftStoryEvent } from '@/lib/story-draft.functions';

type Tone = 'keep' | 'dramatic' | 'romantic' | 'tense' | 'witty';
const TONES: Tone[] = ['keep', 'dramatic', 'romantic', 'tense', 'witty'];

function effectSummary(e: StoryEvent['choices'][number]['effects']): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(e.variables ?? {})) out.push(`${k} ${v > 0 ? '+' : ''}${v}`);
  for (const [k, v] of Object.entries(e.relationships ?? {})) out.push(`${k} bond ${v > 0 ? '+' : ''}${v}`);
  for (const [k, v] of Object.entries(e.career ?? {})) if (v) out.push(`${k} ${v > 0 ? '+' : ''}${v}`);
  for (const k of Object.keys(e.setFlags ?? {})) out.push(`flag: ${k}`);
  for (const d of e.delayed ?? []) out.push(`later (${d.inTurns}t): ${d.flag}`);
  return out;
}

function EventColumn({ heading, event, tone }: { heading: string; event: Pick<StoryEvent, 'dialogue' | 'choices'>; tone: 'original' | 'draft' }) {
  return <div className={`studio-col studio-col-${tone}`}>
    <span className="eyebrow">{heading}</span>
    <p className="story-dialogue">{event.dialogue}</p>
    <div className="studio-choices">
      {event.choices.map(c => <div key={c.id} className="studio-choice">
        <b>{c.label}</b>
        <span>{c.preview}</span>
      </div>)}
    </div>
  </div>;
}

/**
 * Scenario authoring: AI drafts alternate wording beside the original event.
 * Nothing changes until the author approves; approvals only replace text.
 */
export function StoryStudio({ onBack }: { onBack: () => void }) {
  const draftFn = useServerFn(draftStoryEvent);
  const [narrative] = useState<StoryNarrative>(STORY_NARRATIVES[0]!);
  const [eventId, setEventId] = useState(narrative.events[0]?.id ?? '');
  const [overrides, setOverrides] = useState<StoryOverrides>({});
  const [tone, setTone] = useState<Tone>('keep');
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setOverrides(loadOverrides()); }, []);

  const event = narrative.events.find(e => e.id === eventId)!;
  const approved = overrides[overrideKey(narrative.scenarioId, event.id)];
  const current = applyOverride(event, narrative.scenarioId, overrides);
  const scene = sceneForEvent(narrative, event);
  const character = narrative.characters.find(c => c.id === event.characterId);
  const chapter = chapterForTurn(narrative, event.trigger.turn ?? event.trigger.turnRange?.[0] ?? 0);
  const title = scenarioById(narrative.scenarioId)?.title ?? narrative.scenarioId;

  const draftEvent = useMemo(() => draft && {
    dialogue: draft.dialogue,
    choices: event.choices.map(c => ({ ...c, ...(draft.choices.find(d => d.id === c.id) ?? {}) })),
  }, [draft, event]);

  function pick(id: string) { setEventId(id); setDraft(null); setError(''); }

  async function generate() {
    setBusy(true); setError('');
    try {
      const res = await draftFn({ data: {
        scenarioTitle: title, chapter: chapter ? `${chapter.title}: ${chapter.objective}` : '', tone, note: note.trim() || undefined,
        characters: narrative.characters.map(c => ({ id: c.id, name: c.name, role: c.role })),
        event: {
          title: event.title, speaker: event.speaker, dialogue: current.dialogue,
          flagsAll: event.trigger.flagsAll ?? [], flagsNone: event.trigger.flagsNone ?? [],
          choices: current.choices.map(c => ({ id: c.id, label: c.label, preview: c.preview, effects: c.effects })),
        },
      } });
      if (!res.ok) { setError(res.error); return; }
      if (!draftMatchesEvent(event, res.draft)) { setError('The draft skipped a choice. Generate again.'); return; }
      setDraft(res.draft);
    } catch { setError('The writer is unavailable right now.'); }
    finally { setBusy(false); }
  }

  function approve() {
    if (!draft) return;
    const next = approveDraft(overrides, narrative.scenarioId, event, draft);
    if (next === overrides) { setError('This draft no longer fits the event.'); return; }
    setOverrides(next); saveOverrides(next); setDraft(null);
  }

  function revert() {
    const next = revertOverride(overrides, narrative.scenarioId, event.id);
    setOverrides(next); saveOverrides(next);
  }

  return <main className="creation screen-enter">
    <header className="screen-header"><Button variant="gameQuiet" size="icon" aria-label="Back" onClick={onBack}><ArrowLeft /></Button><div><span className="eyebrow">Story Mode</span><h1>Scenario studio</h1></div><span /></header>
    <div className="screen-body">
      <p className="step-subtitle">Draft new dialogue and choice hints for {title}. Effects never change, and nothing reaches the game until you approve.</p>
      <label className="studio-label">Event
        <select className="studio-select" value={eventId} onChange={e => pick(e.target.value)}>
          {narrative.events.map(e => <option key={e.id} value={e.id}>{overrides[overrideKey(narrative.scenarioId, e.id)] ? '✎ ' : ''}{e.title}</option>)}
        </select>
      </label>

      <div className="studio-scene">
        {scene && <img src={scene} alt="" width={1280} height={720} loading="lazy" />}
        <div className="studio-scene-text">
          <strong>{event.title}</strong>
          <span>{event.speaker}{character ? ` · ${character.role}` : ''}{chapter ? ` · ${chapter.title}` : ''}</span>
        </div>
      </div>

      <div className="studio-meta">
        {(event.trigger.flagsAll ?? []).map(f => <span key={f} className="studio-chip">needs {f}</span>)}
        {(event.trigger.flagsNone ?? []).map(f => <span key={f} className="studio-chip">without {f}</span>)}
        {event.choices.map(c => <span key={c.id} className="studio-chip studio-chip-effect" title={c.label}>{c.label.slice(0, 24)}: {effectSummary(c.effects).join(', ') || 'no effects'}</span>)}
      </div>

      <div className="studio-tones" role="radiogroup" aria-label="Tone">
        {TONES.map(t => <Button key={t} size="sm" variant={tone === t ? 'game' : 'gameOutline'} role="radio" aria-checked={tone === t} onClick={() => setTone(t)}>{t === 'keep' ? 'Same tone' : t}</Button>)}
      </div>
      <input className="studio-select" maxLength={300} placeholder="Optional direction, e.g. make Vance more guarded" value={note} onChange={e => setNote(e.target.value)} />
      <Button variant="game" className="w-full mt-2" disabled={busy} onClick={generate}><Sparkles /> {busy ? 'Drafting…' : draft ? 'Draft another version' : 'Draft alternate version'}</Button>
      {error && <p className="studio-error" role="alert">{error}</p>}

      <div className="studio-compare">
        <EventColumn heading={approved ? 'In game now (approved edit)' : 'Original'} event={current} tone="original" />
        {draftEvent
          ? <EventColumn heading="AI draft — awaiting your approval" event={draftEvent} tone="draft" />
          : <div className="studio-col studio-col-empty"><span className="eyebrow">Draft</span><p>Drafts appear here, next to the original.</p></div>}
      </div>

      {draft && <div className="studio-actions">
        <Button variant="game" onClick={approve}><Check /> Approve & use in game</Button>
        <Button variant="gameOutline" onClick={() => setDraft(null)}><X /> Discard</Button>
      </div>}
      {approved && !draft && <Button variant="gameOutline" className="w-full mt-2" onClick={revert}><Undo2 /> Restore original wording</Button>}
      {approved && <p className="save-state"><RotateCcw className="inline size-3" /> Approved edits are saved on this device.</p>}
    </div>
    <footer className="screen-actions"><Button variant="gameQuiet" onClick={onBack}><ArrowLeft /> Back</Button><span /></footer>
  </main>;
}
