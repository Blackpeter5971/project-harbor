import { Gavel, Handshake, Megaphone, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Portrait } from './portrait';
import type { Career } from '@/lib/game/career';
import { CHAMBER_NAMES, PARTY_COLOR } from '@/lib/game/legislature-schema';
import type { Result } from '@/lib/game/support';
import { LOBBY_LABEL, contestLeadership, lawmakerTitle, leadershipBlock, leadershipForecast, leadershipPosts, leadershipTurn, lobbyBlock, lobbyLawmaker, lobbyOdds, type LobbyKind } from '@/lib/game/legislature-actions';

const ICON: Record<LobbyKind, typeof Megaphone> = { whip: Megaphone, compromise: Handshake, sponsor: PenLine };

export function LegislatorDirectory({ career, onResult }: { career: Career; onResult: (r: Result) => void }) {
  const L = career.legislature;
  if (!L) return null;
  return <section className="game-card p-4" aria-label="Key legislators">
    <h3 className="section-label">Key legislators <span>{career.actions}% energy</span></h3>
    <div className="lawmaker-grid">{L.lawmakers.map(l => <article key={l.id} className="lawmaker-card">
      <div className="lawmaker-head">
        <Portrait index={l.portrait} className="lawmaker-portrait" />
        <div><b>{l.name}</b><p>{lawmakerTitle(L, l)}</p><small>{CHAMBER_NAMES[l.chamber]} · {l.district}</small></div>
        <span className={`party-badge ${PARTY_COLOR[l.party]}`}>{l.party[0]}</span>
      </div>
      <div className="meter-label"><small>Ideology</small><small>{l.ideology < -15 ? 'Progressive' : l.ideology > 15 ? 'Conservative' : 'Centrist'}</small></div>
      <div className="ideology-bar" aria-label={`Ideology ${l.ideology}`}><i style={{ left: `${(l.ideology + 100) / 2}%` }} /></div>
      <div className="meter-label"><small>Party loyalty</small><small>{l.loyalty}</small></div>
      <div className="term-track"><div className="term-fill" style={{ width: `${l.loyalty}%` }} /></div>
      <div className="meter-label"><small>Influence {l.influence}</small><small className={l.relationship >= 0 ? 'amt-in' : 'amt-out'}>Relationship {l.relationship > 0 ? '+' : ''}{l.relationship}</small></div>
      <div className="lawmaker-actions">{(Object.keys(LOBBY_LABEL) as LobbyKind[]).map(k => { const Icon = ICON[k]; const block = lobbyBlock(career, l.id, k); return <Button key={k} size="sm" variant="gameOutline" disabled={!!block} title={block ?? `${Math.round(lobbyOdds(career, l, k) * 100)}% chance`} onClick={() => onResult(lobbyLawmaker(career, l.id, k))}><Icon />{LOBBY_LABEL[k]}</Button>; })}</div>
    </article>)}</div>
  </section>;
}

export function LeadershipContest({ career, onResult }: { career: Career; onResult: (r: Result) => void }) {
  const L = career.legislature, posts = leadershipPosts(career);
  if (!L || !posts.length) return null;
  const open = leadershipTurn(career);
  return <section className="game-card p-4" aria-label="Chamber leadership">
    <h3 className="section-label">Chamber leadership <span>{open ? 'Leadership elections open' : 'Opens in Q1'}</span></h3>
    <div className="row-list mt-2">{posts.map(p => { const held = L.playerRoles.includes(p.key); const f = leadershipForecast(career, p); const block = leadershipBlock(career, p.key); return <div key={p.key} className="game-row static">
      <div><b>{p.title} {held && <span className="tag-ok">You hold this</span>}</b>
        <p>{held ? 'Your post for this tenure.' : `Incumbent: ${f.incumbent?.name ?? 'vacant'} · Your support ${f.player} vs ${f.rival} · ${Math.round(f.odds * 100)}% win chance`}</p></div>
      {!held && <Button size="sm" variant="gameOutline" disabled={!!block} title={block ?? undefined} onClick={() => onResult(contestLeadership(career, p.key))}><Gavel />Run</Button>}
    </div>; })}</div>
  </section>;
}
