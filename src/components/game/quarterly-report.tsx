import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, Wallet, Star, Landmark, HeartPulse, Award, Sparkles, Users, BookOpen, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { Portrait } from './portrait';
import { quarterlyReportData, reportMoney, reportNumber, signedReportNumber } from './quarterly-report-data';

const tone = (value: number) => value > 0 ? 'report-positive' : value < 0 ? 'report-negative' : 'report-neutral';
function Metric({ icon, label, value, detail, change = 0 }: { icon: ReactNode; label: string; value: string; detail: string; change?: number }) {
  return <article className="quarter-metric"><div className="quarter-metric-label">{icon}<span>{label}</span></div><strong className={tone(change)}>{value}</strong><small>{detail}</small></article>;
}
function Finances({ income, entries, total }: { income: boolean; entries: { label: string; amount: number }[]; total: number }) {
  return <article className="quarter-finance"><h3>{income ? <ArrowDownLeft /> : <ArrowUpRight />}{income ? 'Money In' : 'Money Out'}</h3>
    {entries.length ? <dl>{entries.map(entry => <div key={entry.label}><dt>{entry.label}</dt><dd className={income ? 'report-positive' : 'report-negative'}>{income ? '+' : '−'}{reportMoney(entry.amount)}</dd></div>)}</dl> : <p>{income ? 'No income received this quarter' : 'No expenses this quarter'}</p>}
    <div className="quarter-finance-total"><b>{income ? 'Total Income' : 'Total Expenses'}</b><strong className={total ? income ? 'report-positive' : 'report-negative' : 'report-neutral'}>{reportMoney(total)}</strong></div>
  </article>;
}

export function QuarterlyReport({ career, onContinue, children }: { career: Career; onContinue: () => void; children?: ReactNode }) {
  const data = quarterlyReportData(career);
  const dialog = useRef<HTMLElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    continueButton.current?.focus({ preventScroll: true });
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <div className="modal-backdrop quarterly-backdrop"><section ref={dialog} className="game-modal turn-report-modal quarterly-dashboard" role="dialog" aria-modal="true" aria-labelledby="report-title" onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, [tabindex="0"]');
    const first = controls?.[0], last = controls?.[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <header className="quarter-header"><div className="quarter-header-icon"><Landmark /></div><div><span>QUARTERLY REPORT</span><h2 id="report-title" aria-label={`Turn report · ${data.title}`}>{data.title}</h2><p>{career.character.name} · {career.office?.title ?? 'Personal & career review'}</p></div></header>
    <div className="report-content quarter-scroll" tabIndex={0} aria-label="Quarterly report details">
      <div className="quarter-metrics">
        <Metric icon={<Wallet />} label="Net Financial Change" value={`${data.net > 0 ? '+' : data.net < 0 ? '−' : ''}${reportMoney(data.net)}`} change={data.net} detail="Personal account · this quarter" />
        <Metric icon={<Star />} label="Reputation Change" value={signedReportNumber(data.reputationDelta)} change={data.reputationDelta} detail={`${reportNumber(career.reputation)} total reputation`} />
        <Metric icon={career.approval ? <Landmark /> : <TrendingUp />} label={career.approval ? 'Political Approval' : 'Experience Gained'} value={signedReportNumber(career.approval ? data.approvalDelta : data.experienceDelta)} change={career.approval ? data.approvalDelta : data.experienceDelta} detail={career.approval ? `${reportNumber(career.approval.overall)}% current approval` : `${reportNumber(career.experience)} total experience`} />
        <Metric icon={<HeartPulse />} label="Well-being" value={`${reportNumber(career.actions)}%`} detail={career.life ? `Turn energy · Stress ${reportNumber(career.life.stress)}%` : 'No well-being data available'} />
      </div>
      <section className="quarter-section" aria-labelledby="quarter-finances-title"><h3 id="quarter-finances-title">Financial Breakdown</h3><div className="quarter-finances"><Finances income entries={data.income} total={data.totalIncome} /><Finances income={false} entries={data.expenses} total={data.totalExpenses} /></div></section>
      <section className="quarter-section" aria-labelledby="quarter-highlights-title"><h3 id="quarter-highlights-title"><Sparkles />Quarter Highlights</h3>
        {data.highlights.map(line => <article className="quarter-highlight" key={line}>{/promot|offer|elected|won|birthday/i.test(line) ? <Portrait index={career.character.portrait} /> : <div className="quarter-highlight-icon"><Award /></div>}<div><span className="quarter-badge">{/promot/i.test(line) ? 'Promotion' : /alert|warning|unpaid|could not/i.test(line) ? 'Attention' : 'Quarter milestone'}</span><p>{line}</p></div></article>)}
        <div className="quarter-supplement">{children}</div>
        {!data.highlights.length && <p className="quarter-quiet">A quiet quarter.</p>}
      </section>
      <section className="quarter-section quarter-progression" aria-labelledby="quarter-progression-title"><h3 id="quarter-progression-title">Progression Summary</h3><div className="quarter-progress-badges"><span><Award />Experience <b>{reportNumber(career.experience)}</b></span><span><Users />Contacts <b>{reportNumber(career.contacts)}</b></span><span><BookOpen />Communication <b>{reportNumber(career.skills.communication)}</b></span><span>Leadership <b>{reportNumber(career.skills.leadership)}</b></span><span>Knowledge <b>{reportNumber(career.skills.knowledge)}</b></span></div></section>
    </div>
    <footer className="quarter-footer"><Button ref={continueButton} variant="game" aria-label="Continue" onClick={onContinue}>CONTINUE<ArrowUpRight /></Button></footer>
  </section></div>;
}