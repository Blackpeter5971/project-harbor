import { useState } from 'react';
import { MessagesSquare, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import type { Result } from '@/lib/game/gameplay';
import { usd } from '@/lib/game/campaign';
import { answerKinds, answerLine, answerTownHall, blocName, hostTownHall, townHallBlocker, townHallCost, townHallEffects } from '@/lib/game/town-halls';
import type { TownHallAnswerKind } from '@/lib/game/town-hall-schema';

const initials = (name: string) => name.split(' ').map(p => p[0]).join('').slice(0, 2);
const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

export function TownHallPanel({ career, run }: { career: Career; run: (result: Result) => void }) {
  const camp = career.campaign;
  const [picked, setPicked] = useState<TownHallAnswerKind | null>(null);
  if (!camp) return null;
  const th = camp.townHall ?? null;
  const blocker = townHallBlocker(career);
  const live = th?.status === 'live' ? th : null;
  const question = live ? live.questions[live.round] : undefined;

  if (live && question) {
    return <div role="tabpanel" className="town-hall">
      <div className="panel-row"><span className="eyebrow"><Mic />{live.venue}</span><span className="actions-chip">Question {live.round + 1}/{live.questions.length}</span></div>
      <div className="town-hall-speaker">
        <span className="town-hall-badge" aria-hidden="true">{initials(question.speaker)}</span>
        <div><b>{question.speaker}</b><p>{question.role} · {question.topic}</p></div>
      </div>
      <p className="town-hall-question">“{question.text}”</p>
      <div className="town-hall-choices">{answerKinds.map(k => {
        const line = answerLine(question.id, k.id), fx = townHallEffects(career, question.id, k.id);
        return <Button key={k.id} variant="gameChoice" aria-pressed={picked === k.id} className={picked === k.id ? 'is-picked' : ''} onClick={() => setPicked(k.id)}>
          <span><small className="town-hall-kind">{k.label}</small>{line?.text}
            <span className="town-hall-chips">
              {Object.entries(fx.deltas).map(([g, d]) => <span key={g} className={(d ?? 0) >= 0 ? 'chip-up' : 'chip-down'}>{blocName(g)} {signed(d ?? 0)}</span>)}
              {fx.support > 0 && <span className="chip-up">Independents ↑</span>}
              <span className="chip-up">Momentum {signed(fx.momentum)}</span>
            </span>
          </span>
        </Button>;
      })}</div>
      <Button variant="game" className="mt-3 w-full" disabled={!picked} onClick={() => { if (!picked) return; run(answerTownHall(career, live.id, live.round, picked)); setPicked(null); }}>Give this answer</Button>
    </div>;
  }

  return <div role="tabpanel" className="town-hall">
    <h3 className="section-label">Town hall · voter Q&amp;A</h3>
    <p className="mini-note">Face three local voters and answer their hardest questions. Each answer pleases some voter groups and costs you with others. One town hall per quarter.</p>
    <Button variant="game" className="mt-3 w-full" disabled={!!blocker} onClick={() => run(hostTownHall(career))}><MessagesSquare />Host a town hall · {usd(townHallCost(camp))} · 15% energy</Button>
    {blocker && <p className="mini-note mt-2">{blocker}</p>}
    {th?.status === 'completed' && <div className="mt-3">
      <h3 className="section-label">Last town hall · {th.venue}</h3>
      <p className="mini-note">{th.outcome}</p>
      <div className="town-hall-chips">
        <span className="chip-up">Support {signed(th.supportDelta)}</span>
        <span className="chip-up">Momentum {signed(th.momentum)}</span>
        {Object.entries(th.loyalty).map(([g, d]) => <span key={g} className={d >= 0 ? 'chip-up' : 'chip-down'}>{blocName(g)} {signed(d)}</span>)}
      </div>
      <ul className="mini-note mt-2">{th.questions.map((q, i) => { const a = th.answers[i]; return <li key={q.id}><b>{q.topic}:</b> {a ? answerKinds.find(k => k.id === a.kind)?.label : 'No answer'}</li>; })}</ul>
    </div>}
  </div>;
}
