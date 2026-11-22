import { useEffect, useState } from 'react';
import { EventsTab } from './events-panel';
import { takeTreasuryTab } from './treasury-tab';
import { eventsNeedingAttention } from '@/lib/game/quarterly-events';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { Career } from '@/lib/game/career';
import { usd } from '@/lib/game/campaign';
import { currentBudget, maintenanceCost, type TaxStance } from '@/lib/game/budget';
import type { Result } from '@/lib/game/support';
import { moodSummary, happinessFactors } from '@/lib/game/happiness';
import type { AnnualReport, Economy } from '@/lib/game/finance-schema';
import {
  annualAgenda, debtTotal, decideAgenda, economyPreview, financeOf, grantAmount, loanOffers, loanVisible,
  quarterHistory, quarterlyDebtService, relationship, requestGrant, revenueStreams, setTaxStance, takeLoan, taxRate,
} from '@/lib/game/government-finance';

const ECON: [keyof Economy, string][] = [['business', 'Business health'], ['employment', 'Employment'], ['household', 'Household finances'], ['happiness', 'Citizen happiness']];

export function TreasuryPanel({ career, onResult }: { career: Career; onResult: (r: Result) => void }) {
  const b = currentBudget(career), f = financeOf(career), streams = revenueStreams(career);
  const revenue = streams.reduce((s, x) => s + x.amount, 0);
  const spend = Math.round((b.spending.services + b.spending.education + b.spending.administration + maintenanceCost(career)) / 4) + quarterlyDebtService(career);
  const history = quarterHistory(career), offers = loanOffers(career), agenda = annualAgenda(career), rel = relationship(career);
  const stances: { id: TaxStance; label: string }[] = [{ id: 'cut', label: 'Lower' }, { id: 'hold', label: 'Balanced' }, { id: 'raise', label: 'Higher' }];
  const attention = eventsNeedingAttention(career).length;
  const [tab, setTab] = useState('overview');
  useEffect(() => {
    const t = takeTreasuryTab(); if (t) { setTab(t); document.getElementById('treasury-panel')?.scrollIntoView({ block: 'start' }); }
    const on = (ev: Event) => { takeTreasuryTab(); setTab((ev as CustomEvent<string>).detail); };
    window.addEventListener('treasury-tab', on); return () => window.removeEventListener('treasury-tab', on);
  }, []);
  return <section id="treasury-panel" className="game-card p-4 treasury-panel" aria-label="Treasury">
    <div className="panel-row"><span className="eyebrow">Treasury</span><HistoryDialog rows={history} reports={f.reports} /></div>
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="w-full grid grid-cols-3 sm:grid-cols-6 h-auto"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="revenue">Revenue</TabsTrigger><TabsTrigger value="taxes">Taxes</TabsTrigger><TabsTrigger value="projects">Projects</TabsTrigger><TabsTrigger value="relations">Aid</TabsTrigger><TabsTrigger value="events" aria-label={`Events${attention ? `, ${attention} need attention` : ''}`}>Events{attention > 0 && <span className="tab-count">{attention}</span>}</TabsTrigger></TabsList>
      <TabsContent value="events"><EventsTab career={career} onResult={onResult} /></TabsContent>
      <TabsContent value="overview">
        <div className="mini-stats">
          <span>Balance <b>{usd(career.treasury?.balance ?? 0)}</b></span><span>Revenue/qtr <b className="amt-in">{usd(revenue)}</b></span>
          <span>Spending/qtr <b className="amt-out">{usd(spend)}</b></span><span>Debt <b>{usd(debtTotal(career))}</b></span>
          <span>Loans <b>{f.loans.length}</b></span><span>Annual budget <b>{usd(b.total)}</b></span>
        </div>
        {loanVisible(career) && <div className="mt-3"><p className="mini-note amt-out">Reserves are below 10% of the annual budget. Emergency financing is available.</p>
          {offers.length ? offers.map(o => <div key={o.quarters} className="panel-row mt-2"><small>{usd(o.principal)} · {o.rate}% · {o.quarters} qtrs · {usd(o.payment)}/qtr · total {usd(o.total)}</small><Button size="sm" variant="gameOutline" onClick={() => onResult(takeLoan(career, o.quarters))}>Borrow</Button></div>) : <p className="mini-note">No lender will extend more credit right now.</p>}
        </div>}
      </TabsContent>
      <TabsContent value="revenue">
        <ul className="mini-note report-list">{streams.map(s => <li key={s.label} className="panel-row"><span>{s.label}</span><b>{usd(s.amount)}</b></li>)}</ul>
        <div className="mini-stats mt-2">{ECON.map(([k, l]) => <span key={k}>{l} <b>{Math.round(f.economy[k])}</b></span>)}</div>
      </TabsContent>
      <TabsContent value="taxes">
        <p className="mini-note">Current rate <b>{taxRate(career)}%</b>. One change per quarter · 15% energy.</p>
        <div className="grid grid-cols-3 gap-2 mt-2">{stances.map(s => { const p = economyPreview(career, s.id); return <Button key={s.id} variant={b.stance === s.id ? 'game' : 'gameOutline'} className="h-auto flex-col py-2" disabled={b.stance === s.id} onClick={() => onResult(setTaxStance(career, s.id))}><span>{s.label} · {taxRate(career, s.id)}%</span><small>{usd(p.revenue)}/yr</small><small>Biz {p.business >= 0 ? '+' : ''}{p.business} · Happy {p.happiness >= 0 ? '+' : ''}{p.happiness}</small></Button>; })}</div>
        <p className="mini-note mt-2">Higher taxes raise revenue but slow business, jobs and household budgets. Lower taxes do the reverse.</p>
      </TabsContent>
      <TabsContent value="projects">
        {agenda.length ? agenda.map(i => <div key={i.catalogId} className="panel-row mt-2"><span><b>{i.name}</b>{i.critical && <span className="amt-out"> · critical</span>}<br /><small className="mini-note">{usd(i.cost)}{i.carried ? ' · postponed last year' : ''}</small></span>
          {i.decision === 'pending' ? <span className="flex gap-1"><Button size="sm" variant="game" onClick={() => onResult(decideAgenda(career, i.catalogId, 'approve'))}>Fund</Button><Button size="sm" variant="gameOutline" onClick={() => onResult(decideAgenda(career, i.catalogId, 'reject'))}>Reject</Button>{i.canPostpone && <Button size="sm" variant="gameOutline" onClick={() => onResult(decideAgenda(career, i.catalogId, 'postpone'))}>Later</Button>}</span> : <small className="mini-note">{i.decision}</small>}</div>)
          : <p className="mini-note">No projects need a decision this year.</p>}
        <p className="mini-note mt-2">Undecided projects at year end count as ignored and cost approval.</p>
      </TabsContent>
      <TabsContent value="relations">
        {rel ? <><p className="mini-note">{rel.partner} ({rel.party}) relationship <b>{rel.score}/100</b>{rel.aligned ? ' · same party' : ''}. Statutory allocations are guaranteed; special aid depends on this relationship.</p>
          <Button className="w-full mt-2" variant="gameOutline" disabled={f.grantTurn === career.date} onClick={() => onResult(requestGrant(career))}>Request special aid · up to {usd(grantAmount(career))} · 15% energy</Button></>
          : <><p className="mini-note">Statutory transfers to states are paid automatically. Discretionary development grants build goodwill.</p>
          <Button className="w-full mt-2" variant="gameOutline" disabled={f.grantTurn === career.date} onClick={() => onResult(requestGrant(career))}>Award grants to states · {usd(grantAmount(career))} · 15% energy</Button></>}
      </TabsContent>
    </Tabs>
  </section>;
}

function HistoryDialog({ rows, reports }: { rows: ReturnType<typeof quarterHistory>; reports: AnnualReport[] }) {
  return <Dialog><DialogTrigger asChild><Button size="sm" variant="gameOutline">History</Button></DialogTrigger>
    <DialogContent className="max-h-[80vh] overflow-y-auto"><DialogHeader><DialogTitle>Treasury history</DialogTitle></DialogHeader>
      {rows.length ? <ul className="mini-note report-list">{rows.map(r => <li key={r.start} className="panel-row"><span>{r.start.slice(0, 7)}</span><span className="amt-in">+{usd(r.revenue)}</span><span className="amt-out">−{usd(r.expenditure)}</span></li>)}</ul> : <p className="mini-note">No quarters settled yet.</p>}
      {reports.length > 0 && <><h3 className="eyebrow mt-3">Annual reports</h3><ul className="mini-note report-list">{reports.map(r => <li key={r.year} className="panel-row"><span>FY {r.year}</span><span>Rev {usd(r.revenue)}</span><span>Exp {usd(r.expenditure)}</span></li>)}</ul></>}
    </DialogContent></Dialog>;
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(max ? Math.min(100, value / max * 100) : 0), 50); return () => clearTimeout(t); }, [value, max]);
  return <div className="mt-2"><div className="panel-row"><small>{label}</small><small><b>{usd(value)}</b></small></div><div className="term-track"><div className="term-fill" style={{ width: `${w}%`, transition: 'width 700ms ease-out' }} /></div></div>;
}

export function AnnualReportModal({ report, onClose }: { report: AnnualReport; onClose: () => void }) {
  const max = Math.max(report.revenue, report.expenditure, report.planned, 1);
  return <div className="modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="annual-title">
    <div className="modal-head"><h2 id="annual-title">Annual Financial Report · FY {report.year}</h2></div>
    <Bar label="Total revenue" value={report.revenue} max={max} /><Bar label="Total expenditure" value={report.expenditure} max={max} /><Bar label="Planned budget" value={Math.round(report.planned)} max={max} />
    <div className="mini-stats mt-3"><span>Variance <b className={report.variance >= 0 ? 'amt-in' : 'amt-out'}>{report.variance >= 0 ? 'Under' : 'Over'} {usd(Math.abs(Math.round(report.variance)))}</b></span><span>Debt <b>{usd(report.debt)}</b></span>
      {ECON.map(([k, l]) => { const d = Math.round(report.economyEnd[k] - report.economyStart[k]); return <span key={k}>{l} <b>{Math.round(report.economyEnd[k])} ({d >= 0 ? '+' : ''}{d})</b></span>; })}</div>
    <p className="mini-note mt-2">Completed: {report.completed.join(', ') || 'none'}<br />Unfinished: {report.unfinished.join(', ') || 'none'}{report.ignored.length ? <><br />Ignored: {report.ignored.join(', ')}</> : null}</p>
    <Button variant="game" className="w-full mt-3" onClick={onClose}>Continue</Button>
  </section></div>;
}

export function MoodHeader({ career, approval }: { career: Career; approval: number }) {
  const m = moodSummary(career), factors = happinessFactors(career);
  return <section className={`game-card p-3 mood-header mood-${m.reaction.level}`} aria-label="Citizen happiness">
    <div className="panel-row"><span className="mood-score"><span key={m.score} className="mood-emoji" aria-hidden>{m.emoji}</span> <b>{m.score > 0 ? '+' : ''}{m.score}</b> <small>{m.label}</small></span><span>Approval <b>{approval}%</b></span></div>
    <p className="mini-note mt-1">{m.reaction.text}</p>
    <details className="mini-note"><summary>What drives the mood</summary><ul className="report-list">{factors.map(f => <li key={f.label} className="panel-row"><span>{f.label}</span><b className={f.value >= 0 ? 'amt-in' : 'amt-out'}>{f.value > 0 ? '+' : ''}{f.value}</b></li>)}</ul></details>
  </section>;
}
