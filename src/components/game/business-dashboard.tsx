import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { adviseBusiness } from '@/lib/ai-business.functions';
import { Building2, Newspaper, HardHat, Laptop, Truck, Utensils, ShoppingBasket, Factory, Sprout, BriefcaseBusiness, HeartPulse, Clapperboard, ChartNoAxesCombined, Package, Wallet, Users, LandPlot, ArrowDownToLine, ArrowUpFromLine, LockKeyhole, HandCoins, Sparkles, Cpu, Megaphone, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { Career } from '@/lib/game/career';
import { dividendLimits, liquidationQuote, type BusinessRequest } from '@/lib/game/business';
import { expansionProjects } from '@/lib/game/business-expansions';
import { MAX_LOCATIONS, PITCH_STAKES, locations, nextBranchCost, ownerStake, marketingLift } from '@/lib/game/business-growth';
import { normalizeBusiness, type Business } from '@/lib/game/business-schema';
import { sectorById } from '@/lib/game/business-sectors';
import { businessFinance } from '@/lib/game/business-finance';
import { monthLabel } from '@/lib/game/gameplay';
import { BusinessProductsPanel } from './business-products-panel';
import { BusinessWorkforcePanel } from './business-workforce-panel';
const usd = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const sectorIcons = { media: Newspaper, 'real-estate': Building2, construction: HardHat, technology: Laptop, transportation: Truck, hospitality: Utensils, retail: ShoppingBasket, manufacturing: Factory, agriculture: Sprout, finance: BriefcaseBusiness, healthcare: HeartPulse, entertainment: Clapperboard };

export function BusinessDashboard({ career, business, onRequest }: { career: Career; business: Business; onRequest: (r: BusinessRequest) => boolean }) {
  const [ads, setAds] = useState(String(business.marketingBudget ?? 0)), [stake, setStake] = useState(0.1);
  const [amount, setAmount] = useState('5000'), [divOpen, setDivOpen] = useState(false), [sellOpen, setSellOpen] = useState(false);
  const [goal, setGoal] = useState(''), [advice, setAdvice] = useState(''), [advising, setAdvising] = useState(false), advise = useServerFn(adviseBusiness);
  const b = normalizeBusiness(business), f = businessFinance(b, career), n = Number(amount), limits = dividendLimits(b, career), dividend = limits.max, revision = career.businessRevision ?? 0;
  const Icon = sectorIcons[b.sector];
  const metrics = [{ label: 'Operating Cash', value: usd(b.operatingCash) }, { label: 'Retained Distributable Profit', value: usd(dividend) }, { label: 'Last Quarter Revenue', value: b.lastProcessed ? usd(b.lastRevenue) : '—' }, { label: 'Last Quarter Expenses', value: b.lastProcessed ? usd(b.lastExpenses) : '—' }, { label: 'Net Profit / Loss', value: b.lastProcessed ? usd(b.lastRevenue - b.lastExpenses) : '—', loss: b.lastRevenue < b.lastExpenses }, { label: 'Employee Count', value: String(b.employees.length) }, { label: 'Reputation', value: `${Math.max(0, Math.min(100, Math.round(b.reputation)))}/100` }];
  return <section className="company-dashboard" aria-label="Company management">
    <header className="company-heading"><div className="company-sector-icon"><Icon /></div><div><span className="portfolio-badge">{sectorById(b.sector)?.name}</span><h2>{b.name}</h2><span className={`company-status ${b.operatingCash < 0 ? 'amt-out' : ''}`}>{b.operatingCash < 0 ? 'In Financial Distress / Cash Flow Crisis' : 'Operating'}</span></div></header>
    <p className="mini-note">{f.manager ? `General Manager: ${f.manager.name} · quality ${f.manager.quality}/100` : 'Owner-managed'} · {Math.round(f.efficiency * 100)}% efficiency</p>
    <div className="company-valuation"><span>Estimated market value</span><b>{usd(liquidationQuote(b).value)}</b></div>
    <div className="company-kpis" aria-label="Company key financial metrics">{metrics.map(m => <div key={m.label}><span>{m.label}</span><b className={m.loss ? 'amt-out' : ''}>{m.value}</b></div>)}</div>
    <Tabs defaultValue="overview">
      <TabsList className="company-tabs" aria-label="Company dashboard tabs">
        <TabsTrigger value="overview" aria-label="Overview / Performance History" title="Overview / Performance History"><ChartNoAxesCombined /><span>Overview</span></TabsTrigger>
        <TabsTrigger value="products" aria-label="Products & Services" title="Products & Services"><Package /><span>Products &<br />Services</span></TabsTrigger>
        <TabsTrigger value="finances" title="Finances"><Wallet /><span>Finances</span></TabsTrigger>
        <TabsTrigger value="employees" aria-label="Employees & Management" title="Employees & Management"><Users /><span>Employees</span></TabsTrigger>
        <TabsTrigger value="capital" aria-label="Expansion & Capital" title="Expansion & Capital"><LandPlot /><span>Capital</span></TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="company-tab-content">
        <h3 className="section-label">Company overview</h3><p className="company-focus">{b.focus}</p><p className="mini-note">Founded {monthLabel(b.founded)} · {b.products.filter(p => p.active).length} active products / services</p>
        <div className="company-facts"><span>Last units demanded<b>{b.lastUnitsDemanded.toLocaleString('en-US')}</b></span><span>Last units sold<b>{b.lastUnitsSold.toLocaleString('en-US')}</b></span></div>
        <h3 className="section-label mt-5">Performance history · last 4 quarters</h3>
        {b.quarterlyHistory.length ? [...b.quarterlyHistory].reverse().map(h => <div className="bank-record" key={h.date}><div className="panel-row"><b>{monthLabel(h.date)}</b><strong className={h.netProfit < 0 ? 'amt-out' : 'amt-in'}>{usd(h.netProfit)}</strong></div><div className="company-history-facts"><span>Revenue<b>{usd(h.revenue)}</b></span><span>Expenses<b>{usd(h.expenses)}</b></span><span>Closing cash<b>{usd(h.operatingCash)}</b></span></div></div>) : <div className="company-empty"><ChartNoAxesCombined /><h3>No completed quarters</h3><p>Founded {monthLabel(b.founded)}</p></div>}
      </TabsContent>
      <TabsContent value="products" className="company-tab-content"><BusinessProductsPanel business={b} revision={revision} onRequest={onRequest} /></TabsContent>
      <TabsContent value="finances" className="company-tab-content">
        <h3 className="section-label">Expected quarterly overhead</h3><div className="company-statement">{f.items.map(i => <div key={i.label}><span>{i.label}</span><b>{usd(i.amount)}</b></div>)}<div className="statement-total"><span>Total operating costs</span><b>{usd(f.expenses)}</b></div></div>
        <h3 className="section-label mt-5">Expected quarterly statement</h3><div className="company-statement"><div><span>Gross revenue</span><b>{usd(f.revenue)}</b></div><div><span>− Operating costs</span><b>{usd(f.expenses)}</b></div><div><span>− Local corporate tax ({(f.taxRate * 100).toFixed(2)}%)</span><b>{usd(f.taxes)}</b></div><div className="statement-total"><span>= Net retained profit</span><b className={f.netRetainedProfit < 0 ? 'amt-out' : 'amt-in'}>{usd(f.netRetainedProfit)}</b></div></div>
        <p className="mini-note">Projected sales {f.sold.toLocaleString('en-US')} / demand {f.demanded.toLocaleString('en-US')} units · capacity {f.capacity.toLocaleString('en-US')} · market index {Math.round(f.market * 100)}. Corporate tax applies only to positive operating income.</p>
        {b.lastProcessed && <><h3 className="section-label mt-5">Last quarter · {monthLabel(b.lastProcessed)}</h3><div className="company-statement"><div><span>Gross revenue</span><b>{usd(b.lastRevenue)}</b></div><div><span>− Operating costs</span><b>{usd(b.lastExpenses - b.lastTaxes)}</b></div><div><span>− Corporate tax</span><b>{usd(b.lastTaxes)}</b></div><div className="statement-total"><span>= Net profit / loss</span><b className={b.lastRevenue < b.lastExpenses ? 'amt-out' : 'amt-in'}>{usd(b.lastRevenue - b.lastExpenses)}</b></div></div></>}
        <div className="company-facts"><span>Retained earnings<b>{usd(b.retainedEarnings)}</b></span><span>Available dividend<b>{usd(dividend)}</b></span></div>
        <Button variant="game" className="w-full" onClick={() => { setAmount(String(dividend)); setDivOpen(true); }}><ArrowUpFromLine /> Withdraw Dividends</Button>
        {divOpen && <div className="modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="dividend-title"><h2 id="dividend-title">Withdraw Dividends · {b.name}</h2>
          <div className="company-statement"><div><span>Company operating cash</span><b>{usd(limits.cash)}</b></div><div><span><LockKeyhole className="inline size-3" /> Capital locked (initial + additions)</span><b>{usd(limits.locked)}</b></div><div><span>Reserved for next quarter payroll/overhead</span><b>{usd(limits.buffer)}</b></div><div className="statement-total"><span>Maximum distributable profit</span><b className="amt-in">{usd(dividend)}</b></div></div>
          <label className="bank-field">Dividend amount<input aria-label="Dividend amount" inputMode="decimal" type="number" min="0" max={dividend} value={amount} onChange={e => setAmount(e.target.value)} /></label>
          {dividend === 0 && <p className="shortfall">No distributable profit yet. Invested capital cannot be withdrawn.</p>}
          <div className="modal-actions"><Button variant="game" disabled={!Number.isFinite(n) || n <= 0 || n > dividend} onClick={() => { if (onRequest({ type: 'dividend', id: b.id, amount: n, revision })) setDivOpen(false); }}><ArrowUpFromLine /> Confirm withdrawal</Button><Button variant="gameOutline" onClick={() => setDivOpen(false)}>Cancel</Button></div></section></div>}
        <p className="mini-note"><LockKeyhole className="inline size-3" /> {usd(b.initialInvestment + b.additionalCapital)} invested capital is locked.</p>
        <Button variant="gameOutline" className="w-full mt-3" onClick={() => setSellOpen(true)}><HandCoins /> Liquidate / Sell Company</Button>
        {sellOpen && (() => { const q = liquidationQuote(b); return <div className="modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="sell-title"><h2 id="sell-title">Sell {b.name}?</h2><p className="mini-note">A buyer offers the estimated market value. Staff severance is settled first; the company is dissolved. This is not a dividend.</p>
          <div className="company-statement"><div><span>Buyer acquisition offer</span><b>{usd(q.value)}</b></div><div><span>− Severance (1 quarter payroll)</span><b>{usd(q.severance)}</b></div><div className="statement-total"><span>Net to personal cash</span><b className={q.net < 0 ? 'amt-out' : 'amt-in'}>{usd(q.net)}</b></div></div>
          <div className="modal-actions"><Button variant="game" onClick={() => { if (onRequest({ type: 'liquidate', id: b.id, revision })) setSellOpen(false); }}><HandCoins /> Confirm sale</Button><Button variant="gameOutline" onClick={() => setSellOpen(false)}>Cancel</Button></div></section></div>; })()}
        <details className="biz-ledger mt-4"><summary><Sparkles className="inline size-4" /> AI Board Advisor</summary>
          <label className="bank-field">Your goal<input aria-label="Business goal" maxLength={200} placeholder="e.g. Maximize profit, fund my Senate run" value={goal} onChange={e => setGoal(e.target.value)} /></label>
          <Button variant="gameOutline" className="w-full" disabled={advising || goal.trim().length < 2} onClick={async () => { setAdvising(true); setAdvice(''); try { const r = await advise({ data: { goal, company: { name: b.name, sector: sectorById(b.sector)?.name ?? b.sector, cash: b.operatingCash, reputation: b.reputation, employees: b.employees.length, products: b.products.filter(p => p.active).map(p => `${p.name} (${p.tier}, $${p.price})`.slice(0, 60)).slice(0, 12), expansions: b.expansions.slice(0, 8), history: b.quarterlyHistory.map(h => ({ revenue: h.revenue, expenses: h.expenses, netProfit: h.netProfit })) } } }); setAdvice(r.ok ? r.text : r.error); } catch { setAdvice(!b.products.length ? 'Offline tip: launch a product and hire staff before anything else.' : b.operatingCash < 0 ? 'Offline tip: cut staff or inject capital to escape the cash crisis.' : 'Offline tip: grow capacity with staff or machinery while demand exceeds sales.'); } finally { setAdvising(false); } }}><Sparkles /> {advising ? 'Analyzing…' : 'Get next-quarter strategy'}</Button>
          {advice && <p className="company-focus mt-2">{advice}</p>}
        </details>
        <details className="biz-ledger mt-4"><summary>Business transactions</summary>{b.ledger.map((e, i) => <div className="bank-record" key={i}><b>{e.label}</b><p className="mini-note">{monthLabel(e.month)} · {usd(e.amount)}</p></div>)}</details>
      </TabsContent>
      <TabsContent value="employees" className="company-tab-content"><BusinessWorkforcePanel career={career} business={b} onRequest={onRequest} /></TabsContent>
      <TabsContent value="capital" className="company-tab-content"><h3 className="section-label">Inject capital</h3><div className="company-facts"><span>Initial capital<b>{usd(b.initialInvestment)}</b></span><span>Additional capital<b>{usd(b.additionalCapital)}</b></span></div><label className="bank-field">Capital amount<input aria-label="Capital amount" inputMode="decimal" type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} /></label><Button variant="gameOutline" className="w-full" disabled={!Number.isFinite(n) || n <= 0 || career.money < n} onClick={() => onRequest({ type: 'inject', id: b.id, amount: n, revision })}><ArrowDownToLine /> Add capital</Button><p className="mini-note">Personal cash {usd(career.money)} · injected capital extends runway, is locked and never counts as profit.</p>
        <h3 className="section-label mt-5">Corporate expansion</h3>
        {expansionProjects.map(e => { const Ico = { branch: Building2, machinery: Cpu, marketing: Megaphone, rnd: FlaskConical }[e.id], has = b.expansions.includes(e.id); return <div className="bank-record" key={e.id}><div className="panel-row"><b><Ico className="inline size-4" /> {e.name}</b><strong>{usd(e.cost)}</strong></div><p className="mini-note">{e.benefit} · upkeep {usd(e.upkeep)}/quarter</p><Button variant={has ? 'gameQuiet' : 'gameOutline'} className="w-full mt-2" disabled={has || b.operatingCash < e.cost} onClick={() => onRequest({ type: 'expansion', id: b.id, expansionId: e.id, revision })}>{has ? 'Completed' : b.operatingCash < e.cost ? 'Not enough company cash' : 'Fund project'}</Button></div>; })}
        <p className="mini-note">Paid from company operating cash. Benefits apply from the next quarter.</p>
        <h3 className="section-label mt-5">Branch locations · {locations(b)} / {MAX_LOCATIONS}</h3>
        <p className="mini-note">Each new branch adds +12% demand and $1,500 upkeep per quarter.</p>
        <Button variant="gameOutline" className="w-full" disabled={locations(b) >= MAX_LOCATIONS || b.operatingCash < nextBranchCost(b)} onClick={() => onRequest({ type: 'open-branch', id: b.id, revision })}><Building2 /> {locations(b) >= MAX_LOCATIONS ? 'Maximum locations reached' : `Open branch · ${usd(nextBranchCost(b))}`}</Button>
        <h3 className="section-label mt-5">Annual marketing & advertising</h3>
        <label className="bank-field">Annual budget<input aria-label="Annual marketing budget" type="number" min="0" step="1000" value={ads} onChange={e => setAds(e.target.value)} /></label>
        <p className="mini-note">Billed quarterly ({usd(Number(ads) / 4 || 0)}) · +{Math.round(marketingLift(Number(ads) || 0) * 100)}% demand</p>
        <Button variant="gameOutline" className="w-full" disabled={!Number.isFinite(Number(ads)) || Number(ads) < 0 || Number(ads) === (b.marketingBudget ?? 0)} onClick={() => onRequest({ type: 'marketing', id: b.id, annual: Number(ads), revision })}><Megaphone /> Save marketing budget</Button>
        <h3 className="section-label mt-5">General Manager automation</h3>
        <p className="mini-note">{f.manager ? 'Your GM sizes staff to demand every quarter, hiring only what company cash covers.' : 'Hire a General Manager in the Employees tab to automate routine operations.'}</p>
        <Button variant={b.gmAutomation ? 'game' : 'gameOutline'} className="w-full" disabled={!f.manager} onClick={() => onRequest({ type: 'gm-automation', id: b.id, enabled: !b.gmAutomation, revision })}><Users /> {b.gmAutomation ? 'Automation on · turn off' : 'Let GM run operations'}</Button>
        <h3 className="section-label mt-5">Angel investors · you own {Math.round(ownerStake(b) * 100)}%</h3>
        {(b.investors ?? []).map(i => <p key={i.id} className="mini-note">{i.name}: {Math.round(i.stake * 100)}% for {usd(i.amount)} · {monthLabel(i.date)}</p>)}
        <label className="bank-field">Equity to offer<select aria-label="Equity to offer" value={stake} onChange={e => setStake(Number(e.target.value))}>{PITCH_STAKES.map(p => <option key={p} value={p}>{Math.round(p * 100)}%</option>)}</select></label>
        <Button variant="gameOutline" className="w-full" disabled={b.lastPitch === career.date || 1 - ownerStake(b) + stake > 0.49 + 1e-9} onClick={() => onRequest({ type: 'pitch-investors', id: b.id, stake, revision })}><HandCoins /> {b.lastPitch === career.date ? 'Already pitched this quarter' : 'Pitch angel investors'}</Button>
        <p className="mini-note">Investment goes to company cash. Investors share dividends and sale proceeds by stake; you always keep at least 51%.</p></TabsContent>
    </Tabs>
  </section>;
}