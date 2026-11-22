import { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Landmark, LockKeyhole, Wallet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { bankOf, creditProfile, depositQuote, loanQuote, CD_TERMS, LOAN_TERMS, type BankRequest } from '@/lib/game/banking';
import { monthLabel } from '@/lib/game/gameplay';
import type { Result } from '@/lib/game/gameplay';
import { TaxCard } from './tax-panel';

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
type Service = 'accounts' | 'deposits' | 'loans' | 'taxes';
export function BankPanel({ career, onRequest, onResult }: { career: Career; onRequest: (request: BankRequest) => void; onResult?: (r: Result) => void }) {
  const [tab, setTab] = useState<Service>('accounts');
  const [amount, setAmount] = useState('1000');
  const [turns, setTurns] = useState(1);
  const [tenure, setTenure] = useState(8);
  const [confirm, setConfirm] = useState<BankRequest | null>(null);
  const b = bankOf(career), value = Number(amount), credit = creditProfile(career, tenure);
  const cd = depositQuote(value, turns, career.date), loan = loanQuote(value > 0 ? value : 0, tenure, credit.rate);
  const valid = Number.isFinite(value) && value > 0 && Math.round(value * 100) / 100 === value;
  const amountInput = <label className="bank-field">Amount (USD)<input aria-label="Amount (USD)" type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label>;
  const request = (kind: 'save' | 'withdraw' | 'deposit' | 'loan') => setConfirm(kind === 'deposit' || kind === 'loan' ? { kind, amount: value, turns: kind === 'deposit' ? turns : tenure, revision: b.revision } : { kind, amount: value, revision: b.revision });
  return <div className="bank-panel">
    <div className="bank-heading"><Landmark /><div><span className="eyebrow">Personal banking</span><h2 className="step-title">Bank</h2></div></div>
    <div className="bank-summary"><div><span>Checking / Current</span><b>{usd(career.money)}</b></div><div><span>High-Yield Savings</span><b>{usd(b.savings)}</b></div></div>
    <div className="bank-tabs" role="tablist" aria-label="Bank services">{(['accounts', 'deposits', 'loans', 'taxes'] as const).map(t => <Button key={t} role="tab" aria-selected={tab === t} variant={tab === t ? 'game' : 'gameQuiet'} onClick={() => { setTab(t); setConfirm(null); }}>{t === 'accounts' ? 'Accounts' : t === 'deposits' ? 'Fixed Deposits' : t === 'loans' ? 'Loans' : 'Taxes'}</Button>)}</div>
    {tab === 'taxes' && onResult && <TaxCard career={career} onResult={onResult} />}
    {tab === 'accounts' && <>
      <div className="bank-products"><article className="bank-product"><Wallet /><h3>Checking / Current Account</h3><p>0% APR · no withdrawal fees</p><b>{usd(career.money)}</b></article><article className="bank-product"><ArrowDownToLine /><h3>High-Yield Savings Account</h3><p>4% APR · 1% each quarter, compounded</p><b>{usd(b.savings)}</b></article></div>
      {amountInput}<div className="bank-actions"><Button variant="game" disabled={!valid || value > career.money} onClick={() => request('save')}><ArrowDownToLine /> Deposit to savings</Button><Button variant="gameOutline" disabled={!valid || value > b.savings} onClick={() => request('withdraw')}><ArrowUpFromLine /> Withdraw to checking</Button></div>
    </>}
    {tab === 'deposits' && <>
      {amountInput}<label className="bank-field">Deposit term<select aria-label="Deposit term" value={turns} onChange={e => setTurns(Number(e.target.value))}>{CD_TERMS.map(t => <option key={t.turns} value={t.turns}>{t.turns * 3} months · {t.turns} {t.turns === 1 ? 'turn' : 'turns'} · {t.apr * 100}% APR</option>)}</select></label>
      {cd && <div className="expense-list"><span>Guaranteed payout<b>{usd(cd.payout)}</b></span><span>Interest earned<b className="amt-in">{usd(cd.payout - cd.principal)}</b></span><span>Maturity<b>{monthLabel(cd.maturity)}</b></span></div>}
      <p className="mini-note mt-2"><LockKeyhole className="inline size-3" /> Locked until maturity. Early withdrawal is not available. Principal and simple interest return to checking automatically.</p>
      <Button variant="game" className="w-full mt-3" disabled={!valid || !cd || value > career.money} onClick={() => request('deposit')}><LockKeyhole /> Open fixed deposit</Button>
      <h3 className="section-label mt-3">Deposit accounts</h3><div className="row-list">{b.deposits.length ? [...b.deposits].reverse().map(d => <article className="bank-record" key={d.id}><b>{usd(d.principal)} · {d.apr * 100}% APR</b><p>{d.turns * 3} months · {d.status === 'locked' ? 'Locked' : 'Paid to checking'}</p><p>{monthLabel(d.maturity)} · payout {usd(d.payout)}</p></article>) : <p className="mini-note">No fixed deposits.</p>}</div>
    </>}
    {tab === 'loans' && <>
      <div className="bank-summary"><div><span>Credit rating</span><b>{credit.score} / 850</b></div><div><span>Available borrowing</span><b>{usd(credit.cap)}</b></div></div>
      <div className="expense-list"><span>Personal net worth<b>{usd(credit.netWorth)}</b></span><span>Employment income / quarter<b>{usd(credit.income)}</b></span><span>Existing debt<b>{usd(credit.debt)}</b></span><span>Debt-to-income<b>{Math.round(credit.dti * 100)}%</b></span><span>On-time / missed payments<b>{b.onTime} / {b.missed}</b></span><span>Collateral value<b>{usd(credit.collateral)}</b></span><span>Missed quarters in a row<b className={credit.missedStreak ? 'amt-out' : ''}>{credit.missedStreak} / 8</b></span></div>
      <p className="mini-note mt-2">Borrowing limits come mainly from your net worth and collateral (home, vehicles, savings, business stake). Missing payments for 8 quarters in a row triggers foreclosure.</p>{credit.foreclosed && <p className="shortfall mt-2">Recent foreclosure on record · credit rating crashed.</p>}
      {credit.reason && <p className="shortfall mt-2" role="alert">{credit.reason}</p>}
      {amountInput}<label className="bank-field">Repayment tenure<select aria-label="Repayment tenure" value={tenure} onChange={e => setTenure(Number(e.target.value))}>{LOAN_TERMS.map(t => <option key={t} value={t}>{t} turns · {t * 3} months</option>)}</select></label>
      <div className="expense-list"><span>Quarterly interest rate<b>{credit.rate * 100}%</b></span><span>Quarterly repayment<b>{usd(loan.payment)}</b></span><span>Total repayment<b>{usd(loan.total)}</b></span><span>Total interest<b>{usd(loan.interest)}</b></span></div>
      <p className="mini-note mt-2">Automatic checking repayments after salary and deposit maturity, before living costs. A missed payment adds 2% of the shortfall (minimum $25) and lowers credit. Savings are never drawn automatically.</p>
      <Button variant="game" className="w-full mt-3" disabled={!valid || value > credit.cap || !!credit.reason} onClick={() => request('loan')}>Apply for personal loan</Button>
      <h3 className="section-label mt-3">Loan accounts</h3>{b.loans.map(l => <article className="bank-record" key={l.id}><b>{usd(l.principal)} · {l.rate * 100}% quarterly</b><p>Remaining {usd(l.remaining)} · {l.elapsed}/{l.turns} installments due</p><p>{l.remaining + l.fees === 0 ? 'Repaid' : `Next payment ${monthLabel(l.nextDue)} · ${usd(l.payment)}`}</p>{l.arrears + l.fees > 0 && <><p className="shortfall">Overdue {usd(l.arrears)} · fees {usd(l.fees)}</p><Button variant="gameOutline" disabled={career.money < l.arrears + l.fees} onClick={() => setConfirm({ kind: 'clear', id: l.id, revision: b.revision })}>Clear overdue payments · {usd(l.arrears + l.fees)}</Button></>}</article>)}
    </>}
    <h3 className="section-label mt-3">Bank activity</h3>{b.transactions.length ? [...b.transactions].reverse().slice(0, 12).map(t => <div className="bank-record" key={t.key}><b>{t.label}</b><p>{monthLabel(t.date)} · <span className={t.amount >= 0 ? 'amt-in' : 'amt-out'}>{usd(t.amount)}</span></p></div>) : <p className="mini-note">No banking transactions yet.</p>}
    {confirm && <div className="modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="bank-confirm"><div className="modal-head"><h2 id="bank-confirm">Confirm {confirm.kind === 'deposit' ? 'fixed deposit' : confirm.kind === 'loan' ? 'personal loan' : confirm.kind === 'clear' ? 'arrears payment' : 'transfer'}</h2><Button variant="gameQuiet" size="icon" aria-label="Cancel banking transaction" onClick={() => setConfirm(null)}><X /></Button></div><p>{confirm.kind === 'deposit' && cd ? `${usd(cd.principal)} locked until ${monthLabel(cd.maturity)}. Guaranteed payout ${usd(cd.payout)}. No early withdrawal.` : confirm.kind === 'loan' ? `${usd(value)} credited to checking. ${usd(loan.payment)} per quarter for ${tenure} turns; total ${usd(loan.total)}.` : confirm.kind === 'clear' ? 'Pay overdue installments and fees from checking.' : `${usd(value)} transferred between your personal accounts. No fee.`}</p><Button variant="game" className="w-full" onClick={() => { onRequest(confirm); setConfirm(null); }}>Confirm transaction</Button></section></div>}
  </div>;
}