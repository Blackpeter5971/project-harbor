import { ACTION_COST } from '@/lib/game/energy-costs';
import { useRef, useState } from 'react';
import { BarChart3, Check, Flag, Megaphone, PartyPopper, Radio, HandCoins, X, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ACTIONS_PER_MONTH, type Career } from '@/lib/game/career';
import { playSound } from '@/lib/game/audio';
import { actCost, actLabel, availableElections, callsUsed, campaignAction, contributionRules, launchCampaign, latestPoll, maxStaff, nextCycle, offices, prevPoll, selfFund, usd, type CampAct, type OfficeId } from '@/lib/game/campaign';
import { jobs, monthLabel, type Result } from '@/lib/game/gameplay';
import { Portrait } from './portrait';
import { ElectionResults } from './election-results';
import { termLimitReason } from '@/lib/game/terms';
import { resignOffice } from '@/lib/game/campaign';
import { ballotRestriction } from '@/lib/game/conviction';
import { TownHallPanel } from './town-hall-panel';
import { AdStudio } from './ad-studio';
import { purchaseCampaignAd, type AdRequest } from '@/lib/game/campaign';
import { CampaignHeadquarters } from './campaign-headquarters';
import { campaignStaffAction, staffRoster, type StaffRequest } from '@/lib/game/campaign';
import { isPresidentialGeneral, stateProjections, swingStates, targetCost, targetState, independentBreakthrough, independentFundingTarget, officeById } from '@/lib/game/campaign';
import { EvBar, UsTileMap } from './electoral-map';
import { PledgeCard } from './appointments-panel';

const actions: { id: CampAct; icon: typeof Flag }[] = [
  { id: 'fundraise', icon: HandCoins }, { id: 'event', icon: PartyPopper }, { id: 'rally', icon: Megaphone },
  { id: 'poll', icon: BarChart3 },
  { id: 'volunteers', icon: UsersRound },
  { id: 'respond', icon: Megaphone },
];

export function CampaignPanel({ career, onUpdate, onNotice, onAdRequest, onStaffRequest }: { career: Career; onUpdate: (career: Career) => void; onNotice: (message: string) => void; onAdRequest?: ((request: AdRequest) => void) | undefined; onStaffRequest?: ((request: StaffRequest) => void) | undefined }) {
  const [launchId, setLaunchId] = useState<OfficeId | null>(null);
  const [resignId, setResignId] = useState<OfficeId | null>(null);
  const [slogan, setSlogan] = useState('A stronger community, together');
  const [strategy, setStrategy] = useState<'grassroots' | 'media' | 'policy'>('grassroots');
  const [customTransfer, setCustomTransfer] = useState('');
  const [tab, setTab] = useState<'actions' | 'electoral' | 'staff' | 'ads' | 'townhall' | 'polls' | 'opponents' | 'finance'>('actions');
  const current = useRef(career);
  current.current = career;
  const submitStaff = (request: StaffRequest) => {
    if (onStaffRequest) { onStaffRequest(request); return; }
    const result = campaignStaffAction(current.current, request);
    if (result.ok) current.current = result.career;
    run(result);
  };
  const submitAd = (request: AdRequest) => {
    if (onAdRequest) { onAdRequest(request); return; }
    const result = purchaseCampaignAd(current.current, request);
    if (result.ok) current.current = result.career;
    run(result);
  };
  const run = (result: Result) => { if (result.ok) onUpdate(result.career); onNotice(result.message); };
  const camp = career.campaign;
  const selected = offices.find(o => o.id === launchId);
  const eligible = availableElections(career);
  const currentJob = jobs.find(j => j.id === career.job?.id);
  const poll = camp ? latestPoll(camp) : undefined;
  const previous = camp ? prevPoll(camp) : undefined;
  const campaignOffice = offices.find(o => o.id === camp?.office);
  return <>
    <PledgeCard career={career} onResult={run} />
    <div className="panel-row"><span className="eyebrow">{camp ? 'Campaign Headquarters' : 'Paths to office'}</span><span className="actions-chip">{career.actions}%{''} actions</span></div>
    {!camp ? <>
      {ballotRestriction(career) && <p className="mini-note mt-2">{ballotRestriction(career)}</p>}
      <div className="row-list">{offices.map(o => {
        const election = eligible.find(e => e.office.id === o.id);
        const date = election ?? nextCycle(career, o);
        const reqs = o.reqs(career);
        const held = career.office?.id === o.id;
        return <div className="game-row static" key={o.id}><div><b>{o.title} {held && <span className="tag-ok">Held</span>}</b><p>{o.jurisdiction(career)} · {monthLabel(date.electionDate)}</p><p>{o.schedule}</p><p className="reqs">{reqs.map(r => <span key={r.label} className={r.met ? 'met' : ''}>{r.met ? <Check /> : <X />}{r.label}</span>)}</p><Button variant={election ? 'game' : 'gameOutline'} size="sm" className="mt-2" disabled={!election || career.actions < ACTION_COST} onClick={() => { if (career.office && !held) setResignId(o.id); else setLaunchId(o.id); }}><Flag />{held ? election ? 'Launch re-election · 15% energy' : 'Currently in office' : termLimitReason(career, o.id) ? 'Term limit reached' : election ? career.office ? 'Resign to pursue this office' : 'Launch campaign · 15% energy' : 'Requirements unmet'}</Button></div></div>;
      })}</div>
      {career.termHistory.length > 0 && <><h3 className="section-label mt-3">Term history</h3><div className="row-list">{career.termHistory.map(t => <div className="game-row static" key={`${t.office.id}|${t.office.since}`}><div><b>{t.office.title} · {t.office.party}</b><p>{t.office.jurisdiction}</p><p>{monthLabel(t.office.since)} – {monthLabel(t.ended ?? t.office.termEnd)} · {t.reason ?? 'Elected term'}</p><p>Office pay: {usd(career.officePayHistory.filter(p => p.officeId === t.office.id && p.since === t.office.since).reduce((s, p) => s + p.amount, 0))} · {career.bills.filter(b => b.tenure === `${t.office.id}|${t.office.jurisdiction}|${t.office.since}`).length} measures</p></div></div>)}</div></>}
      {career.elections.length > 0 && <><h3 className="section-label mt-3">Election history</h3>{career.elections.map((r, i) => <ElectionResults key={`${r.date}-${r.office}-${r.stage}-${i}`} result={r} me={career.character.name} />)}</>}
    </> : <>
      <div className="campaign-candidate"><Portrait index={career.character.portrait} /><div><h2>{camp.title}</h2><p>{career.character.name} · {camp.party}</p><span className="eyebrow">{camp.phase === 'primary' ? 'Primary' : 'General'} campaign</span></div></div>
      <p className="campaign-slogan">“{camp.slogan}”</p>
      <p className="mini-note">{camp.jurisdiction} · General election {monthLabel(camp.electionDate)}{camp.phase === 'primary' && camp.primaryDate ? ` · Primary ${monthLabel(camp.primaryDate)}` : ''}</p>
      <div className="campaign-finances" aria-label="Campaign finances"><div><span>Campaign funds</span><b>{usd(camp.funds)}</b></div><div><span>Total raised</span><b>{usd(camp.raised)}</b></div><div><span>Expenses</span><b>{usd(camp.spent)}</b></div></div>
      <div className="mini-stats"><span>Directors <b>{staffRoster(camp).length}/4</b></span><span>Volunteers <b>{camp.volunteers}</b></span><span>Strategy <b>{camp.strategy}</b></span></div>
      <div className="campaign-tabs" role="tablist" aria-label="Campaign sections">{(['actions', ...(isPresidentialGeneral(camp) ? ['electoral'] as const : []), 'staff', 'ads', 'townhall', 'polls', 'opponents', 'finance'] as const).map(t => <Button key={t} variant="gameQuiet" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t === 'actions' ? 'Actions' : t === 'electoral' ? 'Electoral Map' : t === 'staff' ? 'Headquarters' : t === 'ads' ? 'Ad Studio' : t === 'townhall' ? 'Town Hall' : t === 'polls' ? 'Polling' : t === 'opponents' ? 'Opponents' : 'Finance'}</Button>)}</div>
      {tab === 'electoral' && isPresidentialGeneral(camp) && (() => { const p = stateProjections(career, camp); const rival = camp.opponents.find(o => !o.out && !o.primary); const battle = p.rows.filter(r => swingStates.includes(r.state)).sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin)); return <div role="tabpanel">
        <h3 className="section-label">Electoral College projection · 270 to win</h3>
        <EvBar left={p.myEv} right={p.rivalEv} leftLabel={career.character.name} rightLabel={rival?.name ?? 'Rivals'} leftParty={camp.party} rightParty={rival?.party} />
        <UsTileMap states={p.rows.map(r => ({ state: r.state, ev: r.ev, party: r.leaderParty, faded: r.tilt !== 'Safe', label: `${r.tilt} ${r.leader} ${r.margin >= 0 ? '+' : ''}${r.margin}` }))} />
        <p className="mini-note">Solid colors are safe; faded tiles are Lean or Tossup. Projection only — the real vote has noise.</p>
        {camp.party === 'Independent' && (() => { const b = independentBreakthrough(career, camp); return <p className="mini-note">Two-party loyalty: Democratic and Republican states resist Independents. Breakthrough · funding {Math.round(b.funding * 100)}% of {usd(independentFundingTarget(officeById(camp.office)))} · debate {b.debate >= 1 ? 'won' : b.debate > 0 ? 'steady' : 'not won'} · battleground pushes below.</p>; })()}
        <p className="mini-note">Tossups: {p.rows.filter(r => r.tilt === 'Tossup').map(r => `${r.state} (${r.ev})`).join(', ') || 'none'}</p>
        <h3 className="section-label mt-3">Battlegrounds · 15% energy each</h3>
        <div className="row-list">{battle.map(r => <div className="game-row static" key={r.state}><div><b>{r.state} · {r.ev} EV</b><p>{r.tilt} · {r.leader} {r.margin >= 0 ? '+' : ''}{r.margin}{r.swing ? ` · your push +${r.swing}` : ''}</p><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="gameOutline" disabled={career.actions < ACTION_COST || camp.funds < targetCost(camp, 'rally')} onClick={() => { playSound('applause'); run(targetState(career, r.state, 'rally')); }}><Megaphone />Rally · {usd(targetCost(camp, 'rally'))}</Button><Button size="sm" variant="gameOutline" disabled={career.actions < ACTION_COST || camp.funds < targetCost(camp, 'ad')} onClick={() => run(targetState(career, r.state, 'ad'))}><Radio />Ad buy · {usd(targetCost(camp, 'ad'))}</Button></div></div></div>)}</div>
      </div>; })()}
      {tab === 'staff' && <CampaignHeadquarters career={career} onRequest={submitStaff} />}
      {tab === 'ads' && <AdStudio career={career} onRequest={submitAd} />}
      {tab === 'townhall' && <TownHallPanel career={career} run={run} />}
      {tab === 'actions' && <div role="tabpanel"><h3 className="section-label">Campaign actions · 15% energy each</h3><div className="campaign-action-grid">{actions.map(({ id, icon: Icon }) => { const cost = Math.round(actCost(camp, id)); const callsOut = id === 'fundraise' && callsUsed(camp) >= 1; return <Button key={id} variant="gameChoice" disabled={career.actions < ACTION_COST || camp.funds < cost || callsOut || (id === 'staff' && camp.staff >= maxStaff(camp))} onClick={() => { if (id === 'rally' || id === 'event') playSound('applause'); else if (id === 'ads') playSound('camera'); run(campaignAction(career, id)); }}><Icon /><span>{actLabel[id]}<small>{id === 'fundraise' ? callsOut ? 'Used this turn' : 'No cost · 1 per turn' : cost ? usd(cost) : 'No campaign cost'}</small></span></Button>; })}</div>{(camp.rivalPressure?.damage ?? 0) > 0 && <p className="mini-note mt-3">Rival attacks are costing you {camp.rivalPressure!.damage} score points.{camp.attack ? ` Answer ${camp.attack} with Respond to opponents to cut the damage.` : ' The damage fades each quarter.'}</p>}{camp.headlines.length > 0 && <><h3 className="section-label mt-3">Campaign headlines</h3><ul className="mini-note">{camp.headlines.slice(0, 3).map((h, i) => <li key={i}>{h}</li>)}</ul></>}</div>}
      {tab === 'polls' && <div role="tabpanel"><h3 className="section-label">Simulated game estimates · {poll ? monthLabel(poll.date) : 'No poll'}</h3><div className="row-list">{Object.entries(poll?.shares ?? {}).map(([name, pct]) => { const delta = pct - (previous?.shares[name] ?? pct); return <div className="game-row static" key={name}><div><b>{name}</b><p>{name === 'Undecided' ? 'No candidate selected' : name === career.character.name ? camp.party : camp.opponents.find(o => o.name === name)?.party}{previous ? ` · ${delta >= 0 ? '+' : ''}${delta} points` : ''}</p></div><span className="row-cost">{pct}%</span></div>; })}</div><p className="mini-note">Total: {Object.values(poll?.shares ?? {}).reduce((sum, value) => sum + value, 0)}%</p><Button variant="gameOutline" className="mt-3 w-full" disabled={career.actions < ACTION_COST || camp.funds < actCost(camp, 'poll')} onClick={() => run(campaignAction(career, 'poll'))}><BarChart3 />Commission a poll · {usd(actCost(camp, 'poll'))} · 15% energy</Button></div>}
      {tab === 'opponents' && <div role="tabpanel"><h3 className="section-label">Active contenders</h3><div className="row-list">{camp.opponents.filter(o => !o.out).map(o => <div className="game-row static" key={o.name}><div><b>{o.name} · {o.party}</b><p>{o.bio} · {o.primary ? 'Primary contender' : 'General contender'}</p><p>{o.policy}</p><p>Funds {usd(o.funds)} · Raised {usd(o.raised)} · Staff {o.staff} · Volunteers {o.volunteers}</p></div><span className="row-cost">{poll?.shares[o.name] !== undefined ? `${poll.shares[o.name]}%` : 'Not polled'}</span></div>)}</div></div>}
      {tab === 'finance' && (
        <div role="tabpanel">
          <div className="mb-4 rounded border p-4">
            <h3 className="section-label">Contribute personal funds</h3>
            <p className="mini-note mb-2">
              Transfer personal savings into your campaign. Personal balance: <b>{usd(career.money)}</b>
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              {[100, 500, 1000, 2500].map(amt => (
                <Button
                  key={amt}
                  variant="gameOutline"
                  size="sm"
                  disabled={career.money < amt}
                  onClick={() => run(selfFund(career, amt))}
                >
                  +{usd(amt)}
                </Button>
              ))}
              <Button
                variant="gameOutline"
                size="sm"
                disabled={career.money <= 0}
                onClick={() => run(selfFund(career, career.money))}
              >
                All ({usd(career.money)})
              </Button>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                placeholder="Custom amount"
                className="game-input flex-1"
                min={1}
                max={career.money}
                value={customTransfer}
                onChange={e => setCustomTransfer(e.target.value)}
              />
              <Button
                variant="game"
                size="sm"
                disabled={!customTransfer || Number(customTransfer) <= 0 || Number(customTransfer) > career.money}
                onClick={() => {
                  const amt = Number(customTransfer);
                  run(selfFund(career, amt));
                  setCustomTransfer('');
                }}
              >
                Transfer
              </Button>
            </div>
          </div>
          <h3 className="section-label">Campaign transactions</h3>
          <div className="row-list">
            {camp.txns.length ? camp.txns.map((t, i) => (
              <div className="game-row static" key={i}>
                <div>
                  <b>{t.label}</b>
                  <p>{monthLabel(t.month)}</p>
                </div>
                <span className={t.amount >= 0 ? 'amt-in' : 'amt-out'}>
                  {t.amount >= 0 ? '+' : ''}{usd(t.amount)}
                </span>
              </div>
            )) : <p className="mini-note">No campaign transactions yet.</p>}
          </div>
          <h3 className="section-label mt-3">Contribution rules</h3>
          <ul className="mini-note">
            {campaignOffice && contributionRules(campaignOffice).map(rule => <li key={rule}>{rule}</li>)}
          </ul>
        </div>
      )}
    </>}
    {resignId && career.office && <div className="modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="campaign-resign-title"><div className="modal-head"><h2 id="campaign-resign-title">Resign before another campaign?</h2></div><p>Leave {career.office.title} now? Office pay stops and reputation falls by 2. Savings and career records remain intact. No campaign starts until you confirm its launch.</p><div className="modal-actions"><Button variant="game" onClick={() => { const r = resignOffice(career); run(r); if (r.ok) { setLaunchId(resignId); setResignId(null); } }}>Confirm resignation</Button><Button variant="gameOutline" onClick={() => setResignId(null)}>Keep office</Button></div></section></div>}
    {selected && <div className="modal-backdrop"><section className="game-modal campaign-launch-modal" role="dialog" aria-modal="true" aria-labelledby="launch-title"><div className="modal-head"><h2 id="launch-title">Launch {selected.title} campaign?</h2></div><p>Launching ends your current regular job and salary. {currentJob ? `You will leave ${currentJob.title} (${usd(currentJob.salary)}/month).` : 'You currently have no regular job.'} Personal savings and employment history are preserved. Campaign funds are separate.</p><p>Launching uses 1 turn action. Active job applications and offers will be withdrawn.</p><label className="field"><span className="field-label">Campaign slogan</span><input className="game-input" maxLength={80} value={slogan} onChange={e => setSlogan(e.target.value)} /></label><label className="field"><span className="field-label">Campaign strategy</span><select className="game-input" value={strategy} onChange={e => { if (e.target.value === 'grassroots' || e.target.value === 'media' || e.target.value === 'policy') setStrategy(e.target.value); }}><option value="grassroots">Grassroots</option><option value="media">Media</option><option value="policy">Policy</option></select></label><div className="modal-actions"><Button variant="game" disabled={!slogan.trim() || career.actions < ACTION_COST} onClick={() => { const result = launchCampaign(career, selected.id, slogan.trim(), strategy); run(result); if (result.ok) { setLaunchId(null); setTab('actions'); } }}>Confirm launch</Button><Button variant="gameOutline" onClick={() => setLaunchId(null)}>Cancel</Button></div></section></div>}
  </>;
}