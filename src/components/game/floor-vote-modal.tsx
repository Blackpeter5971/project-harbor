import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Gavel, MinusCircle, ThumbsDown, ThumbsUp, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { playerChamber, playerParty, votingChamber } from '@/lib/game/legislation';
import { CATEGORY_LABEL, COST_REF, rollCall, type RollCall, type Vote } from '@/lib/game/committees';
import { CHAMBER_NAMES, PARTY_COLOR, ROLE_NAMES, type Legislature, type LegislatureParty } from '@/lib/game/legislature-schema';
import { describeLegislativeFallout, REBEL_INDEPENDENT, REBEL_PARTY_STANDING } from '@/lib/game/approval';

type Step = { key: string; label: string; detail: string; party: LegislatureParty; yes: number; no: number; abstain: number; kind: 'lawmaker' | 'bloc' | 'player' };
const STEP_MS = 320;
const ideologyLabel = (n: number) => n < -15 ? 'Progressive' : n > 15 ? 'Conservative' : 'Centrist';
const voteWord = (v: Vote) => v === 'yes' ? 'YEA' : v === 'no' ? 'NAY' : 'PRESENT';

/** Ordered reveal: named lawmakers one by one, then rank-and-file blocs by region, then the player. */
function stepsFor(rc: RollCall, playerName: string, party: Step['party']): Step[] {
  const out: Step[] = rc.lawmakers.map(l => ({ key: l.lawmaker.id, label: l.lawmaker.name, detail: `${ROLE_NAMES[l.lawmaker.role]} · ${l.lawmaker.district}`, party: l.lawmaker.party, yes: l.vote === 'yes' ? 1 : 0, no: l.vote === 'no' ? 1 : 0, abstain: 0, kind: 'lawmaker' }));
  for (const r of rc.regions) if (r.seats) out.push({ key: `${r.party}|${r.region}`, label: `${r.party} rank-and-file`, detail: r.region, party: r.party, yes: r.yes, no: r.seats - r.yes, abstain: 0, kind: 'bloc' });
  if (rc.player) out.push({ key: 'player', label: `${playerName} (you)`, detail: 'Your vote', party, yes: rc.player === 'yes' ? 1 : 0, no: rc.player === 'no' ? 1 : 0, abstain: rc.player === 'abstain' ? 1 : 0, kind: 'player' });
  return out;
}

export function FloorVoteModal({ career, billId, onCast, onClose }: {
  /** Snapshot taken when the vote was called, so the tally stays stable after the docket saves. */
  career: Career; billId: string;
  /** Dispatches the vote; returns false when the docket rejected it (stale or already decided). */
  onCast: (vote: Vote | undefined) => boolean;
  onClose: () => void;
}) {
  const L = career.legislature as Legislature;
  const bill = L.bills.find(b => b.id === billId)!;
  const chamber = votingChamber(L, bill), seat = playerChamber(career, L), mine = playerParty(career);
  const member = seat === chamber;
  const projection = useMemo(() => rollCall(L, bill, chamber, mine, seat, null), [L, bill, chamber, mine, seat]);
  const bicameral = L.seating.length > 1, final = !bicameral || bill.status === 'passed_house' || bill.status === 'passed_senate';
  const [result, setResult] = useState<RollCall | null>(null);
  const [step, setStep] = useState(0);
  const panel = useRef<HTMLElement>(null);
  const steps = useMemo(() => result ? stepsFor(result, career.character.name, mine) : [], [result, career.character.name, mine]);
  const done = !!result && step >= steps.length;

  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  useEffect(() => {
    if (!result || done) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setStep(steps.length); return; }
    // Named lawmakers reveal one at a time; blocs land faster so large chambers stay quick.
    const t = window.setTimeout(() => setStep(s => s + 1), steps[step]?.kind === 'bloc' ? STEP_MS / 2 : STEP_MS);
    return () => window.clearTimeout(t);
  }, [result, step, steps, done]);
  useEffect(() => { if (done) panel.current?.querySelector<HTMLButtonElement>('.roll-continue')?.focus(); }, [done]);

  const cast = (vote: Vote | undefined) => {
    const rc = rollCall(L, bill, chamber, mine, seat, member ? vote ?? null : null);
    if (!onCast(member ? vote : undefined)) { onClose(); return; }
    setResult(rc); setStep(0);
  };
  const shown = steps.slice(0, step);
  const ayes = shown.reduce((t, s) => t + s.yes, 0), nays = shown.reduce((t, s) => t + s.no, 0), present = shown.reduce((t, s) => t + s.abstain, 0);
  const seats = projection.seats, needed = projection.needed;
  const revealed = new Set(shown.map(s => s.key));
  const leader = projection.leader;
  const nextStep = result && !result.passes ? 'The bill is dead for this session.' : !final ? `It moves to the ${chamber === 'senate' ? 'House' : 'Senate'} floor next quarter.` : bicameral ? 'It goes to the President for signature or veto.' : 'It becomes law.';

  // Portaled to the game screen so it layers above game notices instead of the scrolling page.
  return createPortal(<div className="modal-backdrop"><section ref={panel} className="game-modal floor-vote-modal" role="dialog" aria-modal="true" aria-labelledby="floor-vote-title" onKeyDown={e => {
    if (e.key === 'Escape' && (!result || done)) { onClose(); return; }
    if (e.key !== 'Tab') return;
    const buttons = panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    const first = buttons?.[0], last = buttons?.[buttons.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }}>
    <div className="modal-head"><div><span className="eyebrow"><Gavel className="inline size-3" /> Roll call · {CHAMBER_NAMES[chamber]}</span><h2 id="floor-vote-title">{bill.title}</h2></div></div>
    <p className="roll-facts">{CATEGORY_LABEL[bill.category]} · ${bill.cost}M · {ideologyLabel(bill.ideology)} · Sponsor: {bill.sponsor}{bill.party && <span className={`party-badge inline ${PARTY_COLOR[bill.party]}`}>{bill.party[0]}</span>}</p>
    <p>{bill.description}</p>

    <div className="roll-counter" aria-live="polite">
      <div className="roll-count yes"><small>Ayes</small><b>{result ? ayes : projection.yes}</b></div>
      <div className="roll-needed"><small>{result ? 'Needed' : 'Projected · needed'}</small><b>{needed}</b><small>of {seats}</small></div>
      <div className="roll-count no"><small>Nays</small><b>{result ? nays : projection.no}</b></div>
    </div>
    <div className="vote-track roll-track"><div className="vote-yes" style={{ width: `${((result ? ayes : projection.yes) / seats) * 100}%` }} /><i style={{ left: `${(needed / seats) * 100}%` }} /></div>
    {result && present > 0 && <p className="mini-note">{present} present (abstaining)</p>}

    {done && <div className={`roll-banner ${result!.passes ? 'passed' : 'failed'}`} role="status">{result!.passes ? <CheckCircle2 /> : <XCircle />}<div><b>{result!.passes ? 'Passed' : 'Failed'}</b><small>{result!.yes}–{result!.no}{result!.abstain ? `, ${result!.abstain} present` : ''}. {nextStep}</small></div></div>}

    {!result && <>
      <h3 className="section-label mt-3">Projected party positions</h3>
      <div className="roll-parties">{projection.parties.filter(p => p.yes + p.no > 0).map(p => <div key={p.party} className="roll-party"><span className={`party-badge inline ${PARTY_COLOR[p.party]}`}>{p.party[0]}</span><b>{p.party}</b><span className={p.position === 'Yea' ? 'amt-in' : p.position === 'Nay' ? 'amt-out' : ''}>{p.position}</span><small>{p.yes}–{p.no}</small></div>)}</div>
      {leader && <p className="mini-note roll-whip">Your party leader <b>{leader.lawmaker.name}</b> ({ROLE_NAMES[leader.lawmaker.role]}) is whipping a <b>{leader.vote === 'yes' ? 'YES' : 'NO'}</b> vote. Breaking ranks costs {Math.abs(REBEL_PARTY_STANDING)} party loyalty but wins independents (+{REBEL_INDEPENDENT}).</p>}
      {final && <p className="mini-note">If it becomes law — {bill.party === null ? 'your bill' : 'a YES vote'}: {describeLegislativeFallout(bill, COST_REF[chamber], bill.party === null ? 'sponsor' : 'yes')}{bill.party !== null ? `. A NO vote: ${describeLegislativeFallout(bill, COST_REF[chamber], 'no')}` : ''}.</p>}
      <div className="roll-actions">{member ? <>
        <Button variant="game" className="roll-btn" onClick={() => cast('yes')}><ThumbsUp /> Vote Yes</Button>
        <Button variant="destructive" className="roll-btn" onClick={() => cast('no')}><ThumbsDown /> Vote No</Button>
        <Button variant="gameOutline" className="roll-btn" onClick={() => cast('abstain')}><MinusCircle /> Abstain</Button>
      </> : <>
        <p className="mini-note">You do not sit in the {CHAMBER_NAMES[chamber]}; you can follow the roll call but not vote.</p>
        <Button variant="game" onClick={() => cast(undefined)}><Gavel /> Watch the roll call</Button>
      </>}<Button variant="gameQuiet" onClick={onClose}>Not now</Button></div>
    </>}

    {result && <>
      <h3 className="section-label mt-3">Key lawmakers</h3>
      <div className="roll-list">{result.lawmakers.map(l => { const on = revealed.has(l.lawmaker.id); return <div key={l.lawmaker.id} className={`roll-row${on ? ' in' : ''}`}><span className={`party-badge inline ${PARTY_COLOR[l.lawmaker.party]}`}>{l.lawmaker.party[0]}</span><span className="roll-name"><b>{l.lawmaker.name}</b><small>{ROLE_NAMES[l.lawmaker.role]}</small></span><span className={`roll-vote ${on ? l.vote : ''}`}>{on ? voteWord(l.vote) : '…'}</span></div>; })}
        {result.player && <div className={`roll-row you${revealed.has('player') ? ' in' : ''}`}><span className={`party-badge inline ${PARTY_COLOR[mine]}`}>{mine[0]}</span><span className="roll-name"><b>{career.character.name} (you)</b><small>{result.rebel ? 'Broke with party leadership' : 'Your vote'}</small></span><span className={`roll-vote ${revealed.has('player') ? result.player : ''}`}>{revealed.has('player') ? voteWord(result.player) : '…'}</span></div>}
      </div>
      <h3 className="section-label mt-3">Rank-and-file by region</h3>
      <div className="roll-list compact">{steps.filter(s => s.kind === 'bloc').map(s => { const on = revealed.has(s.key); return <div key={s.key} className={`roll-row${on ? ' in' : ''}`}><span className={`party-badge inline ${PARTY_COLOR[s.party]}`}>{s.party[0]}</span><span className="roll-name"><b>{s.detail}</b></span><span className="roll-split">{on ? <><span className="amt-in">{s.yes}</span>–<span className="amt-out">{s.no}</span></> : '…'}</span></div>; })}</div>
      <div className="roll-actions">{done ? <Button variant="game" className="roll-continue" onClick={onClose}>Continue</Button> : <Button variant="gameOutline" onClick={() => setStep(steps.length)}>Skip to result</Button>}</div>
    </>}
  </section></div>, document.querySelector('.game-shell') ?? document.body);
}
