import { Award } from 'lucide-react';
import type { ElectionResult } from '@/lib/game/campaign';
import { usd } from '@/lib/game/campaign';
import { monthLabel } from '@/lib/game/gameplay';
import { ElectionNight } from './electoral-map';
import type { Career } from '@/lib/game/career';
import { transitionOptions, victoryOptions, lossOptions } from '@/lib/game/transition';

export function ElectionResults({ result, me, career, onTransition }: { result: ElectionResult; me?: string; career?: Career | undefined; onTransition?: ((choice: string) => void) | undefined }) {
  const opts = career && onTransition ? transitionOptions(career, result) : [];
  const chosen = result.transitionChoice ? [...victoryOptions, ...lossOptions].find(o => o.id === result.transitionChoice) : null;
  const winner = result.ec?.[0]?.name ?? result.rows[0]?.name;
  return <section className="election-results">
    <span className="eyebrow">{result.stage === 'primary' ? 'Primary result' : result.stage === 'ballot' ? 'Ballot access' : 'Election result'} · {monthLabel(result.date)}</span>
    <h3><Award /> {result.won ? 'Victory' : result.stage === 'ballot' ? 'Not on the ballot' : 'Defeat'} · {result.title}</h3>
    <p className="mini-note">{result.jurisdiction}</p>
    {winner && <p className="mini-note">Winner: <strong className="text-primary">{winner}</strong></p>}
    <div className={`row-list${result.rows.length > 4 ? " board-scroll" : ""}`}>{result.rows.map((row, i) => <div className="game-row static" key={row.name}><div><b>{i + 1}. {row.name}{row.name === winner ? ' · Winner' : ''}</b><p>{row.party} · {row.votes.toLocaleString('en-US')} votes · previous poll {row.poll}%</p></div><span className="row-cost">{row.pct}%</span></div>)}</div>
    {result.stateCalls && result.stateCalls.length > 0 && <><h4 className="section-label mt-3">Election night · state calls</h4><ElectionNight calls={result.stateCalls} me={me ?? result.rows[0]?.name ?? ''} /></>}
    {result.ec && <><h4 className="section-label mt-3">Electoral College · 270 to win</h4><div className="mini-stats">{result.ec.map(row => <span key={row.name}>{row.name}<b>{row.ev} EV</b></span>)}</div></>}
    <div className="mini-stats"><span>Raised <b>{usd(result.raised)}</b></span><span>Spent <b>{usd(result.spent)}</b></span></div>
    {opts.length > 0 && <div className={`transition-card ${result.won ? 'win' : 'loss'}`}><b>{result.won ? 'Victory Declared — choose your speech' : 'Keep the Movement Alive'}</b><div className="transition-opts">{opts.map(o => <button key={o.id} type="button" className="transition-opt" onClick={() => onTransition?.(o.id)}><strong>{o.label}</strong><span>{o.hint}</span></button>)}</div></div>}
    {chosen && <p className="transition-done">✓ {chosen.label} — {chosen.hint}</p>}
    <ul className="mini-note">{result.effects.map(effect => <li key={effect}>{effect}</li>)}</ul>
  </section>;
}