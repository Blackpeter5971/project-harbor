import { useState } from 'react';
import { CheckCircle2, FileText, Gavel, Landmark, Megaphone, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { ensureLegislativeDocket, npcPresident, playerChamber, playerParty, votingChamber } from '@/lib/game/legislation';
import { CATEGORY_LABEL, COMMITTEE_ACTIONS, projectCommittee, projectVote, swingStance, type CommitteeAction, type Vote } from '@/lib/game/committees';
import { CHAMBER_NAMES, PARTY_COLOR, type Legislature, type LegislativeBill } from '@/lib/game/legislature-schema';
import { CAUCUS_MIN, LEGISLATIVE_CHOICE_LABEL, caucusSupport, type LegislativeRequest } from '@/lib/game/legislative-docket';
import { FloorVoteModal } from './floor-vote-modal';

const CARD = {
  priority: { name: 'Floor', icon: FileText },
  committee: { name: 'Committee & Oversight', icon: Scale },
  whip: { name: 'Negotiation & Whip', icon: Megaphone },
} as const;

function VoteBar({ yes, no, needed, label }: { yes: number; no: number; needed: number; label: string }) {
  const total = yes + no || 1;
  return <div className="vote-proj" aria-label={`${label}: ${yes} yes, ${no} no, ${needed} needed`}>
    <div className="meter-label"><small>{label}</small><small className={yes >= needed ? 'amt-in' : 'amt-out'}>{yes} yes · {no} no · {needed} needed</small></div>
    <div className="vote-track"><div className="vote-yes" style={{ width: `${(yes / total) * 100}%` }} /><i style={{ left: `${(needed / total) * 100}%` }} /></div>
  </div>;
}

function BillFacts({ bill }: { bill: LegislativeBill }) {
  return <p className="mini-note">{CATEGORY_LABEL[bill.category]} · ${bill.cost}M · {bill.ideology < -15 ? 'Progressive' : bill.ideology > 15 ? 'Conservative' : 'Centrist'}{bill.amendments ? ` · amended ×${bill.amendments}` : ''} · Sponsor: {bill.sponsor}{bill.party && <span className={`party-badge inline ${PARTY_COLOR[bill.party]}`}>{bill.party[0]}</span>}</p>;
}

/** House → Senate → President progress for a bicameral bill (or the single chamber for state/city bodies). */
export function BillTrack({ L, bill }: { L: Legislature; bill: LegislativeBill }) {
  const origin = bill.origin && L.seating.some(s => s.chamber === bill.origin) ? bill.origin : L.seating[0]!.chamber;
  const chambers = L.seating.length > 1 ? [origin, L.seating.find(s => s.chamber !== origin)!.chamber] : [origin];
  const stage = (ch: string) => { const r = [...bill.rollCalls].reverse().find(x => x.chamber === ch); return r ? (r.passed ? 'done' : 'fail') : votingChamber(L, bill) === ch && ['floor_debate', 'passed_house', 'passed_senate'].includes(bill.status) ? 'now' : ''; };
  const desk = bill.status === 'enacted' ? 'done' : bill.status === 'vetoed' ? 'fail' : bill.status === 'awaiting_signature' ? 'now' : '';
  return <ol className="bill-track" aria-label={`${bill.title} progress`}>
    {chambers.map(ch => { const s = stage(ch), r = [...bill.rollCalls].reverse().find(x => x.chamber === ch); return <li key={ch} className={s}><span>{CHAMBER_NAMES[ch]}</span>{r && <small>{r.yes}–{r.no}{r.playerVote ? ` · you: ${r.playerVote}` : ''}</small>}</li>; })}
    {L.seating.length > 1 && <li className={desk}><span>President</span>{desk && <small>{desk === 'done' ? 'Signed' : desk === 'fail' ? 'Vetoed' : 'On the desk'}</small>}</li>}
  </ol>;
}

/** Bills sent to (or decided by) the President, so legislators can follow their work after the floor. */
export function BillsToPresident({ career }: { career: Career }) {
  const L = career.legislature as Legislature | null | undefined;
  if (!L || L.seating.length < 2) return null;
  const list = L.bills.filter(b => ['awaiting_signature', 'enacted', 'vetoed', 'passed_house', 'passed_senate'].includes(b.status)).slice(-5).reverse();
  if (!list.length) return null;
  const pres = career.office?.id === 'president' ? null : npcPresident(L);
  return <section className="game-card p-4 mt-3" aria-label="Bicameral tracker">
    <h3 className="section-label"><Landmark className="inline size-3" /> {career.office?.id === 'president' ? 'Congress' : 'Bill tracker'}{pres && <span>{pres.name} ({pres.party[0]})</span>}</h3>
    <div className="row-list">{list.map(b => <div key={b.id} className="game-row static"><div className="w-full"><b>{b.title}</b><BillFacts bill={b} /><BillTrack L={L} bill={b} />
      {b.status === 'awaiting_signature' && <p className="mini-note">{career.office?.id === 'president' ? 'On your desk — decide it in the Executive Docket.' : `Awaiting ${pres?.name ?? 'the President'}'s signature or veto at quarter end.`}</p>}
      {b.executiveAction && <p className="mini-note">{b.executiveAction}</p>}</div></div>)}</div>
  </section>;
}

export function LegislativeDocketPanel({ career, onRequest }: { career: Career; onRequest: (r: LegislativeRequest) => boolean | void }) {
  const [voting, setVoting] = useState<{ snapshot: Career; billId: string; request: LegislativeRequest } | null>(null);
  const c = ensureLegislativeDocket(career), L = c.legislature as Legislature | null | undefined, d = L?.docket;
  if (!L || !d) return null;
  const mine = playerParty(c);
  return <section className="game-card p-4 legislative-docket" aria-label="Legislative docket">
    <h3 className="section-label">Legislative docket · {d.quarter} <span>Oversight {L.oversight}</span></h3>
    <div className="leg-cards">{d.items.map(item => {
      const meta = CARD[item.slot], Icon = meta.icon;
      const bill = item.billId ? L.bills.find(b => b.id === item.billId) ?? null : null;
      const chamber = bill ? votingChamber(L, bill) : L.seating[0]!.chamber;
      const floor = bill ? projectVote(L, bill, chamber, mine) : null;
      const cmte = bill && item.slot === 'committee' ? projectCommittee(L, bill, mine) : null;
      const swing = bill ? swingStance(L, bill, chamber, mine) : null;
      const target = item.slot === 'whip' ? L.lawmakers.find(l => l.id === item.lawmakerIds[0]) : null;
      return <article key={item.slot} className={`leg-card${item.resolved ? ' done' : ''}`}>
        <div className="panel-row"><span className="eyebrow"><Icon className="inline size-3" /> {meta.name}</span>{item.resolved && <span className="tag-ok"><CheckCircle2 className="inline size-3" /> Decided</span>}</div>
        <b className="leg-title">{item.title}</b>
        {bill && <BillFacts bill={bill} />}
        {item.slot === 'priority' && bill?.status === 'draft' && <p className="mini-note">{bill.description}</p>}
        {item.slot === 'priority' && bill?.status === 'draft' && (() => { const cs = caucusSupport(L, bill, mine, playerChamber(c, L)); return <p className={`mini-note ${cs.share >= CAUCUS_MIN ? 'amt-in' : 'amt-out'}`}>Caucus co-sponsors: {cs.sponsors}/{cs.caucus} ({Math.round(cs.share * 100)}%) · {Math.round(CAUCUS_MIN * 100)}% needed to introduce</p>; })()}
        {item.slot === 'priority' && bill && bill.status !== 'draft' && <BillTrack L={L} bill={bill} />}
        {cmte && <VoteBar label={`${cmte.committee.name} Committee`} yes={cmte.yes} no={cmte.no} needed={cmte.needed} />}
        {floor && <VoteBar label={`${CHAMBER_NAMES[chamber]} floor`} yes={floor.yes} no={floor.no} needed={floor.needed} />}
        {(target ?? swing?.lawmaker) && <p className="mini-note swing-line"><Gavel className="inline size-3" /> Key swing: <b>{(target ?? swing!.lawmaker).name}</b> ({(target ?? swing!.lawmaker).party}) — {swing && (!target || target.id === swing.lawmaker.id) ? swing.stance : `relationship ${(target!.relationship > 0 ? '+' : '') + target!.relationship}`}</p>}
        {item.resolved ? <p className="leg-outcome">{item.outcome}</p> : <div className="lawmaker-actions">{item.actions.map(a => <Button key={a} size="sm" variant={a === 'table' ? 'destructive' : a === 'floor_vote' ? 'game' : 'gameOutline'} disabled={a === 'await'} title={COMMITTEE_ACTIONS[a as CommitteeAction]?.detail}
          onClick={() => {
            const request: LegislativeRequest = { docketId: d.id, revision: d.revision, slot: item.slot, choice: a };
            // Floor votes open the roll call; everything else resolves directly.
            if (a === 'floor_vote' && bill) setVoting({ snapshot: c, billId: bill.id, request });
            else onRequest(request);
          }}>{LEGISLATIVE_CHOICE_LABEL[a] ?? a}</Button>)}</div>}
        {!item.resolved && item.slot === 'committee' && <p className="mini-note">{item.actions.map(a => COMMITTEE_ACTIONS[a as CommitteeAction]?.detail && `${COMMITTEE_ACTIONS[a as CommitteeAction].label}: ${COMMITTEE_ACTIONS[a as CommitteeAction].detail}`).filter(Boolean).join(' ')}</p>}
      </article>;
    })}</div>
    {voting && <FloorVoteModal career={voting.snapshot} billId={voting.billId} onClose={() => setVoting(null)}
      onCast={(vote: Vote | undefined) => onRequest({ ...voting.request, ...(vote ? { vote } : {}) }) !== false} />}
  </section>;
}

/** Every recorded roll call this tenure, newest first. */
export function PastRollCalls({ career }: { career: Career }) {
  const L = career.legislature as Legislature | null | undefined;
  const rows = (L?.bills ?? []).flatMap(b => b.rollCalls.map(r => ({ b, r }))).sort((x, y) => y.r.quarter.localeCompare(x.r.quarter));
  if (!rows.length) return <p className="mini-note">No roll calls recorded yet this term.</p>;
  return <div className="row-list">{rows.slice(0, 12).map(({ b, r }, i) => <div key={`${b.id}-${i}`} className="game-row static"><div><b>{b.title}</b><p>{CHAMBER_NAMES[r.chamber]} · {r.quarter} · {r.yes}–{r.no}{r.abstain ? `, ${r.abstain} abstain` : ''} · {r.passed ? 'Passed' : 'Failed'}{r.playerVote ? ` · you: ${r.playerVote}` : ''}</p><p className="mini-note">Sponsor: {b.sponsor}{b.party ? ` (${b.party})` : ' (you)'}</p></div></div>)}</div>;
}
