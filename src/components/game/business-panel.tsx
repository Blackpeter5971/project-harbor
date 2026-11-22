import { useState } from 'react';
import { Building2, ArrowRight, Plus, LockKeyhole, BriefcaseBusiness } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { type BusinessRequest } from '@/lib/game/business';
import { normalizeBusiness } from '@/lib/game/business-schema';
import { businessSectors, sectorById, MIN_BUSINESS_INVESTMENT, type BusinessSector } from '@/lib/game/business-sectors';
import retail from '@/assets/biz-retail.jpg';
import consulting from '@/assets/biz-consulting.jpg';
import newspaper from '@/assets/biz-newspaper.jpg';
import radio from '@/assets/biz-radio.jpg';
import mediaHouse from '@/assets/biz-media-house.jpg';
export { BusinessDashboard } from './business-dashboard';
const images: Record<string, string> = { retail, consulting, newspaper, radio, 'media-house': mediaHouse };
const usd = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

export function BusinessPanel({ career, onPortfolio, onCreate }: { career: Career; onPortfolio: () => void; onCreate: () => void }) {
  return <section className="business-entry"><h3 className="section-label mt-4">Business ownership</h3>
    <Button variant="gameChoice" className="w-full" onClick={onPortfolio}><BriefcaseBusiness /> Portfolio <span className="ml-auto">{career.businesses.length} companies</span><ArrowRight /></Button>
    <Button variant="gameChoice" className="w-full mt-2" onClick={onCreate}><Plus /> Invest in Business <ArrowRight className="ml-auto" /></Button>
  </section>;
}
export function BusinessPortfolio({ career, onSelect, onCreate }: { career: Career; onSelect: (id: string) => void; onCreate: () => void }) {
  const owned = career.businesses.map(normalizeBusiness);
  return <section aria-label="Business portfolio"><div className="portfolio-summary"><span>Companies<b>{owned.length}</b></span><span>Total company value<b>{usd(owned.reduce((s, b) => s + b.valuation, 0))}</b></span></div>
    <div className="panel-row"><h2 className="step-title">Your portfolio</h2><Button variant="gameOutline" size="icon" title="Invest in Business" aria-label="Invest in Business" onClick={onCreate}><Plus /></Button></div>
    {owned.length === 0 && <div className="notification"><Building2 /><div><b>No active businesses</b><p>Personal cash {usd(career.money)} · minimum investment $75,000 per company.</p></div></div>}
    <div className="portfolio-grid">{owned.map(b => <Button key={b.id} variant="gameQuiet" className="portfolio-company" aria-label={`Open ${b.name}`} onClick={() => onSelect(b.id)}>
      <div className="portfolio-photo"><img src={images[sectorById(b.sector)?.asset ?? 'consulting']} alt="" width={1024} height={656} loading="lazy" /></div>
      <div className="portfolio-copy"><span className="portfolio-badge">{sectorById(b.sector)?.name}</span><h3>{b.name}</h3><dl><div><dt>Company value</dt><dd>{usd(b.valuation)}</dd></div><div><dt>Operating cash</dt><dd>{usd(b.operatingCash)}</dd></div><div><dt>Quarterly net</dt><dd className={b.lastRevenue - b.lastExpenses < 0 ? 'amt-out' : 'amt-in'}>{b.lastProcessed ? usd(b.lastRevenue - b.lastExpenses) : '—'}</dd></div></dl><ArrowRight className="portfolio-arrow" /></div>
    </Button>)}</div>
  </section>;
}
export function BusinessCreation({ career, onRequest, onCreated }: { career: Career; onRequest: (r: BusinessRequest) => boolean; onCreated: () => void }) {
  const [sector, setSector] = useState<BusinessSector>('retail'), [name, setName] = useState(''), [focus, setFocus] = useState(''), [investment, setInvestment] = useState('75000'), [confirm, setConfirm] = useState(false);
  const s = sectorById(sector), amount = Number(investment), duplicate = career.businesses.some(b => b.name.trim().toLowerCase() === name.trim().toLowerCase());
  const valid = !!name.trim() && !!focus.trim() && !duplicate && Number.isFinite(amount) && amount >= MIN_BUSINESS_INVESTMENT && career.money >= amount;
  return <section aria-label="Invest in Business"><figure className="business-cover"><img src={consulting} alt="Business office ready for a new company" width={1024} height={656} /><figcaption>Invest in Business</figcaption></figure>
    <div className="portfolio-summary"><span>Personal cash<b>{usd(career.money)}</b></span><span>Minimum capital<b>$75,000</b></span></div>
    <form onSubmit={e => { e.preventDefault(); if (valid) setConfirm(true); }}>
      <label className="bank-field">Business sector<select aria-label="Business sector" value={sector} onChange={e => setSector(e.target.value as BusinessSector)}>{businessSectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="bank-field">Company name<input aria-label="Company name" value={name} maxLength={48} onChange={e => setName(e.target.value)} required /></label>
      {duplicate && <p role="alert" className="shortfall">A company with this name already exists.</p>}
      <label className="bank-field">Product / service focus<input aria-label="Product / service focus" value={focus} maxLength={120} placeholder={s?.focus} onChange={e => setFocus(e.target.value)} required /></label>
      <label className="bank-field">Initial investment<input aria-label="Initial investment" type="number" min={75000} step={1000} value={investment} onChange={e => setInvestment(e.target.value)} required /></label>
      <div className="mini-stats"><span>Baseline margin<b>{Math.round((s?.margin ?? 0) * 100)}%</b></span><span>Volatility<b>{Math.round((s?.volatility ?? 0) * 100)}%</b></span><span>Quarterly base overhead<b>{usd(s?.overhead ?? 0)}</b></span></div>
      <p className="mini-note"><LockKeyhole className="inline size-3" /> Initial and additional capital are locked. Dividends come only from retained profit. Staff and active products are required for sales; overhead is charged each quarter from company funds.</p>
      {amount < 75000 && <p className="shortfall">Each company requires at least $75,000.</p>}
      {career.money < amount && <p className="shortfall">You need {usd(amount - career.money)} more in personal cash.</p>}
      <Button variant="game" className="w-full mt-3" type="submit" disabled={!valid}><Plus /> Review investment</Button>
    </form>
    {confirm && <div className="modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="investment-title"><h2 id="investment-title">Found {name.trim()}?</h2><p>{s?.name} · {focus.trim()}</p><div className="portfolio-summary"><span>Investment<b>{usd(amount)}</b></span><span>Personal cash after<b>{usd(career.money - amount)}</b></span></div><p className="mini-note">The full investment moves to this company’s operating cash. It cannot be withdrawn as a dividend.</p><div className="modal-actions"><Button variant="game" disabled={!valid} onClick={() => { if (onRequest({ type: 'create', draft: { sector, name, focus, investment: amount }, revision: career.businessRevision ?? 0 })) { setConfirm(false); onCreated(); } }}><Plus /> Confirm investment</Button><Button variant="gameOutline" onClick={() => setConfirm(false)}>Cancel</Button></div></section></div>}
  </section>;
}
