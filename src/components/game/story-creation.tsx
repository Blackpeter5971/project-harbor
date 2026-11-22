import { ArrowLeft, Check, BookOpenText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CharacterDraft } from '@/lib/game/career';
import { Portrait } from './portrait';
import { clampPortrait, portraitsForSex, type StorySex } from '@/lib/game/story-text';

const IDENTITIES = [
  { id: 'Male' as const, label: 'Man' },
  { id: 'Female' as const, label: 'Woman' },
  { id: 'Custom' as const, label: 'Custom' },
];

/** Single-screen protagonist setup for Story Mode: identity, name and portrait only. */
export function StoryCreation({ draft, setDraft, onBack, onCreate, error }: {
  draft: CharacterDraft; setDraft: (d: CharacterDraft) => void; onBack: () => void; onCreate: () => void; error: string;
}) {
  const update = <K extends keyof CharacterDraft>(k: K, v: CharacterDraft[K]) => setDraft({ ...draft, [k]: v });
  return <main className="creation screen-enter">
    <header className="screen-header"><Button variant="gameQuiet" size="icon" aria-label="Back" onClick={onBack}><ArrowLeft /></Button><div><span className="eyebrow">Story Mode</span><h1>Your Protagonist</h1></div><BookOpenText className="text-primary mx-auto size-4" /></header>
    <div className="screen-body">
      <h2 className="step-title">Who walks into this story?</h2>
      <p className="step-subtitle">The rest of your life is already written — your choices decide how it ends.</p>
      <div className="field"><span className="field-label">You are</span><div className="segmented">{IDENTITIES.map(i => <Button key={i.id} variant="gameChoice" aria-pressed={draft.sex === i.id} onClick={() => setDraft({ ...draft, sex: i.id, portrait: clampPortrait(i.id, draft.portrait) })}>{i.label}{draft.sex === i.id && <Check />}</Button>)}</div></div>
      <label className="field"><span className="field-label">Name</span><input className="game-input" value={draft.name} onChange={e => update('name', e.target.value)} placeholder="Enter your name" maxLength={32} autoComplete="off" /></label>
      <div className="field"><span className="field-label">Choose your portrait</span><div className="portrait-grid">{portraitsForSex(draft.sex as StorySex).map(i => <Button key={i} variant="gameChoice" className="portrait-choice" aria-label={`Choose portrait ${i + 1}`} aria-pressed={draft.portrait === i} onClick={() => update('portrait', i)}><Portrait index={i} />{draft.portrait === i && <span className="portrait-tick"><Check /></span>}</Button>)}</div></div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
    <footer className="screen-actions"><Button variant="gameQuiet" onClick={onBack}><ArrowLeft /> Back</Button><Button variant="game" disabled={!draft.name.trim()} onClick={onCreate}>Begin Story <Check /></Button></footer>
  </main>;
}
