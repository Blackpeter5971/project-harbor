import { useEffect, useRef } from 'react';
import { Mic, SkipForward, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { DEBATE_ROUNDS, debateQuestionText } from '@/lib/game/debates';
import { portraitImages } from './portrait';
import stage from '@/assets/debate-town-hall.jpg';
import journalistImg from '@/assets/debate-journalist.jpg';
const journalist = { url: journalistImg };

export function DebateModal({ career, onChoice, onClose }: { career: Career; onChoice: (id: string, round: number, choice: string) => void; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const d = career.debate;
  useEffect(() => { panel.current?.focus(); }, [d?.id, d?.round, d?.status]);
  if (!d) return null;
  const question = DEBATE_ROUNDS[d.round];
  const finished = d.status === 'completed' || d.status === 'skipped';
  const opponent = d.opponents[d.round % d.opponents.length] ?? d.opponents[0];
  const choose = (choice: string) => onChoice(d.id, d.round, choice);
  return <div className="modal-backdrop"><section ref={panel} tabIndex={-1} className="game-modal debate-modal" role="dialog" aria-modal="true" aria-labelledby="debate-title" onKeyDown={e => {
    if (e.key !== 'Tab') return;
    const buttons = panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    const first = buttons?.[0], last = buttons?.[buttons.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }}>
    <header className="debate-heading"><span className="eyebrow"><Mic size={12} />General election · Town hall</span><h2 id="debate-title">{d.title} debate</h2></header>
    <div className="debate-stage"><img className="debate-backdrop" src={stage} alt="Town-hall debate stage" width={1536} height={1024} />
      <div className="debate-cast"><figure><img src={portraitImages[career.character.portrait]} alt={career.character.name} width={512} height={512} /><figcaption>{career.character.name}<small>{career.character.party}</small></figcaption></figure>
        <figure><img src={journalist.url} alt="Courier journalist" width={512} height={512} /><figcaption>The Courier<small>Journalist</small></figcaption></figure>
        {opponent && <figure><img src={portraitImages[opponent.portrait]} alt={opponent.name} width={512} height={512} /><figcaption>{opponent.name}<small>{opponent.party}</small></figcaption></figure>}
      </div></div>
    <div className="debate-content">
      {d.status === 'invited' && <><p>The candidates are assembled. The journalist is ready to put voters’ questions to you.</p><p className="mini-note">Contenders: {d.opponents.map(o => o.name).join(' · ')}</p><Button variant="game" className="w-full" onClick={() => choose('attend')}><Mic />Take the stage</Button><Button variant="gameOutline" className="w-full mt-2" onClick={() => choose('skip')}><SkipForward />Skip debate · −3 support, −2 approval</Button></>}
      {d.status === 'live' && question && <div key={d.round} className="debate-round"><div className="panel-row"><span className="eyebrow">{question.title}</span><span className="mini-note">{d.round + 1} / {DEBATE_ROUNDS.length}</span></div>
        {d.transcript.length > 0 && <p className="debate-reply"><b>{d.transcript.at(-1)?.speaker}</b>“{d.transcript.at(-1)?.text}”</p>}
        <p className="debate-question"><b>{d.round === 1 ? opponent?.name : 'Courier journalist'}</b>“{debateQuestionText(career, d.round)}”</p>
        <div className="debate-choices">{question.choices.map(a => <Button key={a.id} variant="gameChoice" onClick={() => choose(a.id)}>{a.text}</Button>)}</div></div>}
      {finished && <div className="debate-round"><span className="eyebrow"><TrendingUp size={14} />Trending on S</span><h3>{d.outcome}</h3><div className="campaign-finances"><div><span>Support</span><b>{d.supportDelta >= 0 ? '+' : ''}{d.supportDelta}</b></div><div><span>Approval</span><b>{d.approvalDelta >= 0 ? '+' : ''}{d.approvalDelta}</b></div></div>
        <div className="debate-transcript">{d.transcript.slice(-3).map((line, i) => <p key={i}><b>{line.speaker}</b>{line.text}</p>)}</div><Button variant="game" className="w-full mt-3" onClick={onClose}>Continue</Button></div>}
    </div>
  </section></div>;
}