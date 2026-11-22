import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { GameEvent } from '@/lib/game/gameplay';
import type { Career } from '@/lib/game/career';
import { Heart, AlertTriangle, Handshake, Activity, ArrowRight } from 'lucide-react';
import { BACKDROPS } from './story-backdrops';
import { portraitImages } from './portrait';
import { figurePortraitById } from './figure-portraits';
import { contactPortrait } from './dating-portraits';
import { socialOf } from '@/lib/game/relationships';

export function EventModal({ event, career, onChoose }: { event: GameEvent; career?: Career; onChoose: (choice: string) => void }) {
  const panel = useRef<HTMLElement>(null);
  const [dialogue, setDialogue] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const cinematic = !!career;
  const scene = event.scene;
  const speaker = scene?.speaker ?? event.parties[1] ?? 'A concerned resident';
  const social = career ? socialOf(career) : undefined;
  const person = social?.contacts.find(p => p.id === scene?.personId) ?? (social?.partner?.id === scene?.personId ? social?.partner : undefined);
  const encoded = scene?.portrait;
  const otherPortrait = person ? contactPortrait(person) : encoded?.startsWith('figure:') ? figurePortraitById(encoded.slice(7)) : encoded?.startsWith('player:') ? portraitImages[Number(encoded.slice(7))] : encoded ?? figurePortraitById('morgan');
  const Reaction = scene?.reaction === 'heart' ? Heart : scene?.reaction === 'stress' ? Activity : scene?.reaction === 'handshake' ? Handshake : AlertTriangle;
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, [event.id]);
  return <div className={`modal-backdrop ${cinematic ? 'encounter-backdrop' : ''}`}><section ref={panel} className={`game-modal event-modal ${cinematic ? 'encounter-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="event-title" aria-describedby="event-description" onKeyDown={e => {
    if (e.key !== 'Tab') return;
    const buttons = panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    const first = buttons?.[0], last = buttons?.[buttons.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }}>
    {cinematic && career && <div className="encounter-stage">
      <img className="encounter-scenery" src={BACKDROPS[scene?.backdrop ?? (event.id.startsWith('office:') ? 'senate' : 'townhall')]} width={1280} height={768} alt={scene?.setting ?? 'A meeting after the quarter'} />
      <div className="encounter-setting">{scene?.setting ?? 'An unexpected encounter'}</div>
      <div className="encounter-cast">
        <figure className={`encounter-person ${response ? 'is-speaking' : ''}`}><img src={portraitImages[career.character.portrait]} width={512} height={512} alt={career.character.name} /><figcaption>{career.character.name}<small>{career.office?.title ?? 'Your story'}</small></figcaption></figure>
        <figure className={`encounter-person ${!response && dialogue ? 'is-speaking' : ''}`}><img src={otherPortrait} width={512} height={512} alt={speaker} onError={e => { const fallback = portraitImages[1]; if (fallback && e.currentTarget.src !== new URL(fallback, document.baseURI).href) e.currentTarget.src = fallback; }} /><figcaption>{speaker}<small>{scene?.role ?? 'Visitor'}</small></figcaption><span className="encounter-reaction" aria-hidden="true"><Reaction size={22} /></span></figure>
      </div>
    </div>}
    <div className="encounter-body"><div className="modal-head"><h2 id="event-title">{event.title}</h2></div>
    {!cinematic && <p className="mini-note">{event.parties.join(' · ')}</p>}
    <div className="encounter-dialogue" key={response ?? String(dialogue)}><small>{response ? career?.character.name : dialogue || !scene ? speaker : 'Later that evening'}</small><p id="event-description">{response ? event.choices.find(c => c.id === response)?.label : cinematic && scene && !dialogue ? scene.opening : event.text}</p></div>
    {cinematic && scene && !dialogue ? <Button variant="game" className="encounter-continue" onClick={() => setDialogue(true)}>Hear them out <ArrowRight size={16} /></Button> : response ? <div className="encounter-confirm"><p>{event.choices.find(c => c.id === response)?.hint}</p><Button variant="game" onClick={() => { onChoose(response); setResponse(null); }}>Confirm decision <ArrowRight size={16} /></Button><Button variant="gameQuiet" onClick={() => setResponse(null)}>Reconsider</Button></div> : <div className="modal-actions">{event.choices.map((choice, i) => <Button key={choice.id} disabled={choice.disabled} variant={i ? 'gameOutline' : 'game'} className="event-choice" onClick={() => cinematic && scene ? setResponse(choice.id) : onChoose(choice.id)}><span>{choice.label}</span><small>{choice.hint}</small></Button>)}</div>}
    </div>
  </section></div>;
}