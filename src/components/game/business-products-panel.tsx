import { useState } from 'react';
import { Package, Plus, Check, X, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { BusinessRequest } from '@/lib/game/business';
import { normalizeBusiness, type Business, type BusinessProduct } from '@/lib/game/business-schema';
import { sectorProducts } from '@/lib/game/business-growth';
import { MAX_ANNUAL_VOLUME, MAX_PRODUCT_PRICE, productEconomics, productDemand, qualityTiers, type ProductTier } from '@/lib/game/business-products';
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

function PriceControl({ value, onChange, market, label }: { value: string; onChange: (value: string) => void; market: number; label: string }) {
  const amount = Number(value);
  return <><label className="bank-field">Unit selling price<input aria-label={label} type="number" inputMode="decimal" min="0.01" max={MAX_PRODUCT_PRICE} step="0.01" value={value} onChange={e => onChange(e.target.value)} required /></label>
    <Slider aria-label={`${label} slider`} className="product-price-slider" min={Math.max(.01, market * .25)} max={Math.min(MAX_PRODUCT_PRICE, market * 3)} step={.01} value={[Number.isFinite(amount) ? Math.max(market * .25, Math.min(market * 3, amount)) : market]} onValueChange={values => { const v = values[0]; if (v !== undefined) onChange(String(Math.round(v * 100) / 100)); }} />
    <p className="mini-note">Suggested market price {usd(market)} / unit</p></>;
}
function Demand({ business, price, tier, active }: { business: Business; price: number; tier: ProductTier; active: boolean }) {
  const d = productDemand(business, { price: Number.isFinite(price) && price > 0 ? price : MAX_PRODUCT_PRICE, tier, active });
  return <div className={`product-demand demand-${d.rating.toLowerCase()}`} aria-label="Customer demand"><TrendingUp /><span>Estimated demand</span><b>{active ? d.rating : 'Discontinued'}</b><div className="demand-ticks" aria-hidden="true">{[35, 65, 85, 100].map((v, i) => <i key={v} className={d.score >= (i === 0 ? 1 : [0, 35, 65, 85][i] ?? 100) ? 'filled' : ''} />)}</div></div>;
}
function ProductCard({ business, product, revision, onRequest }: { business: Business; product: BusinessProduct; revision: number; onRequest: (r: BusinessRequest) => boolean }) {
  const [price, setPrice] = useState(String(product.price)), [volume, setVolume] = useState(String(product.annualVolume ?? ''));
  const e = productEconomics(business, product.tier), amount = Number(price), vol = Number(volume);
  return <article className="company-product" aria-label={product.name}>
    <div className="product-heading"><Package /><div><h3>{product.name}</h3><span className="portfolio-badge">{qualityTiers.find(t => t.id === product.tier)?.name} quality</span></div></div>
    <div className="product-availability"><span>{product.active ? 'Active' : 'Discontinued'}</span><Switch aria-label={`Availability for ${product.name}`} checked={product.active} onCheckedChange={active => onRequest({ type: 'availability-product', id: business.id, productId: product.id, active, revision })} /></div>
    <PriceControl value={price} onChange={setPrice} market={e.marketPrice} label={`Price for ${product.name}`} />
    <Demand business={business} price={amount} tier={product.tier} active={product.active} />
    <div className="product-unit-cost"><span>Estimated production / service cost</span><b>{usd(e.unitCost)} / unit</b></div>
    <Button variant="gameOutline" className="w-full mt-3" disabled={!Number.isFinite(amount) || amount < .01 || amount > MAX_PRODUCT_PRICE || amount === product.price} onClick={() => onRequest({ type: 'price-product', id: business.id, productId: product.id, price: amount, revision })}><Check /> Save price</Button>
    <label className="bank-field mt-3">Annual manufacturing volume (units)<input aria-label={`Annual volume for ${product.name}`} type="number" min="0" step="1" max={MAX_ANNUAL_VOLUME} value={volume} placeholder="Unlimited (made to order)" onChange={ev => setVolume(ev.target.value)} /></label>
    <p className="mini-note">{product.annualVolume !== undefined ? `${Math.floor(product.annualVolume / 4).toLocaleString('en-US')} units can be sold each quarter; unsold runs still cost production.` : 'Made to order: units are produced only when sold.'}</p>
    <Button variant="gameOutline" className="w-full mt-2" disabled={volume === '' || !Number.isInteger(vol) || vol < 0 || vol > MAX_ANNUAL_VOLUME || vol === product.annualVolume} onClick={() => onRequest({ type: 'volume-product', id: business.id, productId: product.id, annualVolume: vol, revision })}><Check /> Save volume</Button>
  </article>;
}
export function BusinessProductsPanel({ business, revision, onRequest }: { business: Business; revision: number; onRequest: (r: BusinessRequest) => boolean }) {
  const b = normalizeBusiness(business);
  const options = sectorProducts[b.sector] ?? [];
  const [launch, setLaunch] = useState(false), [name, setName] = useState(options.find(o => !b.products.some(p => p.name.toLowerCase() === o.toLowerCase())) ?? ''), [volume, setVolume] = useState('4000'), [tier, setTier] = useState<ProductTier>('standard'), [price, setPrice] = useState(String(productEconomics(b, 'standard').marketPrice));
  const economics = productEconomics(b, tier), amount = Number(price), vol = Number(volume);
  const valid = !!name.trim() && Number.isInteger(vol) && vol > 0 && vol <= MAX_ANNUAL_VOLUME && Number.isFinite(amount) && amount >= .01 && amount <= MAX_PRODUCT_PRICE && b.operatingCash >= economics.setupCost && !b.products.some(p => p.name.toLowerCase() === name.trim().toLowerCase());
  return <section aria-label="Products and services catalog">
    <div className="panel-row"><h3 className="section-label">Catalog · {b.products.filter(p => p.active).length} active</h3><Button variant="gameOutline" size="icon" aria-label={launch ? 'Cancel product launch' : 'Launch New Product / Service'} title={launch ? 'Cancel product launch' : 'Launch New Product / Service'} onClick={() => setLaunch(!launch)}>{launch ? <X /> : <Plus />}</Button></div>
    {!launch && <Button variant="game" className="w-full my-3" onClick={() => setLaunch(true)}><Plus /> Launch New Product / Service</Button>}
    {launch && <form className="product-launch" aria-label="Launch product" onSubmit={e => { e.preventDefault(); if (valid && onRequest({ type: 'launch-product', id: b.id, draft: { name, tier, price: amount, annualVolume: vol }, revision })) { setLaunch(false); } }}>
      <h3>Launch New Product / Service</h3>
      <label className="bank-field">Product from your sector<select aria-label="Product from your sector" value={name} onChange={e => setName(e.target.value)} required><option value="" disabled>Choose a product</option>{options.map(o => { const taken = b.products.some(p => p.name.toLowerCase() === o.toLowerCase()); return <option key={o} value={o} disabled={taken}>{o}{taken ? ' (in catalog)' : ''}</option>; })}</select></label>
      <label className="bank-field">Production tier / quality<select aria-label="Production tier / quality" value={tier} onChange={e => { const t = qualityTiers.find(t => t.id === e.target.value); if (t) { setTier(t.id); setPrice(String(productEconomics(b, t.id).marketPrice)); } }}>{qualityTiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <PriceControl value={price} onChange={setPrice} market={economics.marketPrice} label="New product unit price" />
      <label className="bank-field">Annual manufacturing volume (units)<input aria-label="Annual manufacturing volume" type="number" min="1" step="1" max={MAX_ANNUAL_VOLUME} value={volume} onChange={e => setVolume(e.target.value)} required /></label>
      <p className="mini-note">Up to {Number.isFinite(vol) ? Math.floor(Math.max(0, vol) / 4).toLocaleString('en-US') : 0} units per quarter. Sales follow customer demand, your price, reputation and marketing spend.</p>
      <Demand business={b} price={amount} tier={tier} active />
      <div className="portfolio-summary"><span>R&D / setup cost<b>{usd(economics.setupCost)}</b></span><span>Company cash after<b>{usd(b.operatingCash - economics.setupCost)}</b></span></div>
      <p className="mini-note">Company-funded setup · {usd(economics.unitCost)} estimated cost / unit</p>
      {b.operatingCash < economics.setupCost && <p role="alert" className="shortfall">Insufficient company operating cash.</p>}
      <Button type="submit" variant="game" className="w-full mt-3" disabled={!valid}><Plus /> Launch · {usd(economics.setupCost)}</Button>
    </form>}
    {!b.products.length && !launch && <div className="company-empty"><Package /><h3>No products in production</h3><p>Your company is registered. Pick a product from your sector whenever you're ready to start selling. Focus: {b.focus}</p></div>}
    <div className="company-catalog">{b.products.map(p => <ProductCard key={`${p.id}-${p.price}`} product={p} business={b} revision={revision} onRequest={onRequest} />)}</div>
  </section>;
}