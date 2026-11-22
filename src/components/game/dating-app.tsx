import { useState, type FormEvent } from 'react';
import { ArrowLeft, Heart, MessageCircle, Send, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import type { Career } from '@/lib/game/career';
import {
  browseHeartBeat, heartBeatDateBlock, heartbeatCharm, heartbeatMatch, heartbeatOf, heartbeatPlayerTraits, heartbeatProfile,
  type HeartBeatInput, type HeartBeatRequest,
} from '@/lib/game/heartbeat';
import { contactId } from '@/lib/game/social-events';
import { datingAvailability, socialOf } from '@/lib/game/relationships';
import { datingPortrait } from './dating-portraits';

type Props = { career: Career; onRequest?: ((request: HeartBeatRequest) => void) | undefined };
type Tab = 'discover' | 'matches';

export function DatingApp({ career, onRequest }: Props) {
  const [tab, setTab] = useState<Tab>('discover');
  const [chatId, setChatId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const h = heartbeatOf(career), candidates = browseHeartBeat(career), current = candidates[0];
  const selected = chatId ? heartbeatMatch(career, chatId) : undefined;
  const person = selected ? heartbeatProfile(selected.personId) : undefined;
  const request = (r: HeartBeatInput) => onRequest?.({ ...r, revision: h.revision } as HeartBeatRequest);

  const decide = (choice: 'like' | 'pass') => {
    if (!current) return;
    request({ type: 'decide', personId: current.id, choice });
    if (choice === 'like') { setTab('matches'); setChatId(current.id); }
  };
  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !text.trim()) return;
    request({ type: 'chat', personId: selected.personId, text });
    setText('');
  };

  return <div className="heartbeat-app">
    <header className="heartbeat-head">
      <span className="heartbeat-brand"><Heart fill="currentColor" /> HeartBeat</span>
      <span>{h.matches.length} match{h.matches.length === 1 ? '' : 'es'}</span>
      {h.preference && <button type="button" className="heartbeat-pref-toggle" disabled={!onRequest} onClick={() => request({ type: 'set-preference', preference: h.preference === 'straight' ? 'homosexual' : 'straight' })} aria-label="Change who you want to meet"><SlidersHorizontal /> {h.preference === 'straight' ? 'Straight' : 'Homosexual'}</button>}
    </header>

    {!h.preference ? <section className="heartbeat-onboard" aria-label="Dating preference">
      <Heart fill="currentColor" />
      <h3>Who are you looking to meet?</h3>
      <div className="heartbeat-onboard-options">
        <button type="button" disabled={!onRequest} onClick={() => request({ type: 'set-preference', preference: 'straight' })}><b>Straight</b><small>Opposite gender</small></button>
        <button type="button" disabled={!onRequest} onClick={() => request({ type: 'set-preference', preference: 'homosexual' })}><b>Homosexual</b><small>Same gender</small></button>
      </div>
    </section> :

    selected && person ? <section className="heartbeat-chat" aria-label={`Chat with ${person.name}`}>
      <div className="heartbeat-chat-head">
        <button type="button" onClick={() => setChatId(null)} aria-label="Back to matches"><ArrowLeft /></button>
        <img src={datingPortrait(person.id)} alt="" width={816} height={816} />
        <div><b>{person.name}</b><small>{person.role}</small></div>
      </div>
      <div className="heartbeat-messages" aria-live="polite">
        <span className="heartbeat-match-day"><Sparkles /> You matched with {person.name}</span>
        {selected.messages.map(m => <p key={m.id} className={m.fromMe ? 'from-me' : 'from-them'}>{m.text}</p>)}
      </div>
      <form className="heartbeat-compose" onSubmit={send}>
        <input value={text} maxLength={240} onChange={e => setText(e.target.value)} placeholder={`Message ${person.name.split(' ')[0]}…`} aria-label={`Message ${person.name}`} />
        <button type="submit" disabled={!onRequest || !text.trim()} aria-label="Send message"><Send /></button>
      </form>
      <DateControls career={career} personId={person.id} onRequest={onRequest} request={request} />
    </section> : <>
      <div className="heartbeat-tabs" role="tablist" aria-label="HeartBeat sections">
        <button type="button" role="tab" aria-selected={tab === 'discover'} onClick={() => setTab('discover')}>Discover</button>
        <button type="button" role="tab" aria-selected={tab === 'matches'} onClick={() => setTab('matches')}>Matches <span>{h.matches.length}</span></button>
      </div>

      {tab === 'discover' ? <div className="heartbeat-discover">
        <div className="heartbeat-you">Your charm <b>{heartbeatCharm(career)}</b><span>{heartbeatPlayerTraits(career).join(' · ')}</span></div>
        {current ? <article className="heartbeat-card" aria-label={`${current.name}'s profile`}>
          <div className="heartbeat-photo">
            <img src={datingPortrait(current.id)} alt={`${current.name}, ${current.role}`} width={816} height={816} />
            <div><h2>{current.name}, {current.age}</h2><p>{current.role}</p></div>
          </div>
          <div className="heartbeat-profile-body">
            <p>{current.bio}</p>
            <div className="heartbeat-tags">{current.interests.map(x => <span key={x}>{x}</span>)}</div>
            <div className="heartbeat-tags personality">{current.traits.map(x => <span key={x}>{x}</span>)}</div>
          </div>
          <div className="heartbeat-actions">
            <button type="button" className="heartbeat-pass" disabled={!onRequest} onClick={() => decide('pass')} aria-label={`Pass on ${current.name}`}><X /><span>Pass</span></button>
            <button type="button" className="heartbeat-like" disabled={!onRequest} onClick={() => decide('like')} aria-label={`Like ${current.name}`}><Heart fill="currentColor" /><span>Like</span></button>
          </div>
        </article> : <div className="heartbeat-empty"><Heart /><h3>No more profiles right now</h3><p>You have reviewed everyone nearby. Check your matches or come back in another career.</p><button type="button" onClick={() => setTab('matches')}>Review matches</button></div>}
        <p className="heartbeat-hint">Mutual matches consider age, your traits and charm. Decisions are saved and cannot be rerolled.</p>
      </div> : <div className="heartbeat-match-list">
        {!h.matches.length && <div className="heartbeat-empty"><MessageCircle /><h3>No matches yet</h3><p>Like someone in Discover. If they like you too, your chat opens here.</p></div>}
        {h.matches.map(m => { const p = heartbeatProfile(m.personId)!; const last = m.messages[m.messages.length - 1]; return <button type="button" key={m.personId} onClick={() => setChatId(m.personId)} aria-label={`Open chat with ${p.name}`}>
          <img src={datingPortrait(p.id)} alt="" loading="lazy" width={816} height={816} />
          <span><b>{p.name}</b><small>{last?.text ?? 'Start the conversation'}</small></span><MessageCircle />
        </button>; })}
      </div>}
    </>}
  </div>;
}

function DateControls({ career, personId, onRequest, request }: Props & { personId: string; request: (r: HeartBeatInput) => void }) {
  const p = heartbeatProfile(personId)!, id = contactId(p), social = socialOf(career);
  const person = social.contacts.find(x => x.id === id) ?? (social.partner?.id === id ? social.partner : null);
  const block = heartBeatDateBlock(career, personId);
  const dating = person ? datingAvailability(career, id) : null;
  return <div className="heartbeat-date-panel">
    {person && <p className="heartbeat-circle-note"><b>In your Circle & Family</b><span>{person.affinity}% affinity</span></p>}
    <button type="button" className="heartbeat-date-btn" disabled={!onRequest || !!block} onClick={() => request({ type: 'ask-date', personId })}>
      <Heart fill="currentColor" /> {selectedDateLabel(person?.lastInteraction === career.date)} <span>$250 · 15% energy</span>
    </button>
    {block && <p className="heartbeat-block">{block}</p>}
    {dating?.eligible && !['dating', 'engaged', 'married'].includes(social.maritalStatus) && <>
      <button type="button" className="heartbeat-begin-btn" disabled={!onRequest || !dating.ok} onClick={() => request({ type: 'begin-dating', personId })}>Begin Dating</button>
      {!dating.ok && <p className="heartbeat-block">{dating.reason}</p>}
    </>}
    {social.partner?.id === id && <p className="heartbeat-circle-note">Continue your relationship, proposal, wedding and family plans in Circle & Family.</p>}
  </div>;
}

const selectedDateLabel = (seen: boolean) => seen ? 'Seen this turn' : 'Ask on a Date';
