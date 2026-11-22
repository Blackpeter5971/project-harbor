import { ENERGY_RECHARGES, RECHARGE_THRESHOLD } from '@/lib/game/energy-costs';
import { canBuyEnergy, rechargeEnergy } from '@/lib/game/energy';
import { readWallet, spendCoins, writeWallet } from '@/lib/game/coins';
import { CoinChip, WatchAdOffer, useWallet } from './ads';
import { RetirementDecision, SafetyPanel } from './legacy-panel';
import { securityAction } from '@/lib/game/mortality';
import { useState } from 'react';
import { AlertTriangle, ArrowLeft, Car, ChevronRight, HeartPulse, House, Sparkles, Users, X, Coins } from 'lucide-react';
import { DEFAULT_ENERGY, DEFAULT_STRESS, clampVital, energyStatus, lifestyleById, lifestyleCatalog, quarterlyLifestyleCost, selectLifestyle, stressStatus, isBurnedOut } from '@/lib/game/lifestyle';
import { essentialObligations } from '@/lib/game/obligations';
import { SolvencyAdvisor } from './tax-panel';
import { DEFAULT_HEALTH, clampHealth, dietById, dietCatalog, healthStatus, insuranceById, insuranceCatalog, quarterlyDietCost, quarterlyExpenses, selectDiet, selectInsurance, clinicCatalog, clinicCost, visitClinic } from '@/lib/game/life';
import { Button } from '@/components/ui/button';
import { GaragePanel } from './garage-panel';
import { SocialPanel } from './social-panel';
import { NetworkPanel } from './network-panel';
import { networkOf } from '@/lib/game/network';
import reception from '@/assets/network-reception.jpg';
import { garageView } from '@/lib/game/garage';
import { MIXER_ASSET, socialView } from '@/lib/game/social';
import type { Career } from '@/lib/game/career';
import type { Result } from '@/lib/game/gameplay';
import { affordability, buyProperty, sellProperty, homeSaleValue, currentHousing, rentProperty, rentalMoveInCost, housingCatalog, moveInCost, type PropertyQuality } from '@/lib/game/housing';

const usd = (n: number) => `$${n.toLocaleString('en-US')}`;

interface Preview { title: string; kind: string; quality: PropertyQuality; description: string; asset: string; action: 'Rent' | 'Purchase'; required: number; propertyId?: string }

function BuyButton({ cash, required, label, onPreview }: { cash: number; required: number; label: string; onPreview: () => void }) {
  const a = affordability(cash, required);
  return <div>
    <Button variant={a.affordable ? 'game' : 'gameOutline'} className="w-full" disabled={!a.affordable} onClick={onPreview}>{label}</Button>
    {!a.affordable && <p className="shortfall mt-1">You need {usd(a.shortfall)} more in personal cash.</p>}
  </div>;
}

export type LifePanel = 'menu' | 'housing' | 'garage' | 'social' | 'network' | 'food' | 'lifestyle';
type Props = { career: Career; onResult?: (r: Result) => void; initialPanel?: LifePanel; panel?: LifePanel; onPanel?: (p: LifePanel) => void };

export function LifeView(props: Props) {
  const [own, setOwn] = useState<LifePanel>(props.initialPanel ?? 'menu');
  const panel = props.panel ?? own;
  const setPanel = props.onPanel ?? setOwn;
  const { career } = props;
  if (panel === 'menu') {
    const { property, state } = currentHousing(career);
    const diet = dietById(career.life?.diet.tierId ?? 'standard');
    return <div className="life-menu">
      <button type="button" className="life-menu-btn" onClick={() => setPanel('housing')}>
        <img src={property.asset} alt="" width={1024} height={768} />
        <span className="life-menu-copy"><span className="eyebrow"><House className="inline size-3" /> Housing</span><b>{property.name}</b><small>{state.status === 'owning' ? 'Owned' : `Renting · ${usd(state.monthlyRent)}/mo`}</small></span>
        <ChevronRight className="life-menu-chevron" />
      </button>
      {(() => { const g = garageView(career); return <button type="button" className="life-menu-btn" onClick={() => setPanel('garage')}>
        <img src={g.model.asset} alt="" width={992} height={672} />
        <span className="life-menu-copy"><span className="eyebrow"><Car className="inline size-3" /> Garage & Assets</span><b>{g.model.name}</b><small>{g.status} · {usd(g.upkeep.total)}/quarter</small></span>
        <ChevronRight className="life-menu-chevron" />
      </button>; })()}
      {(() => { const s = socialView(career); const people = s.circle.length + s.family.length; return <button type="button" className="life-menu-btn" onClick={() => setPanel('social')}>
        <img className={s.partner ? 'portrait-thumb' : undefined} src={s.partner?.portrait ?? MIXER_ASSET} alt="" width={1024} height={768} />
        <span className="life-menu-copy"><span className="eyebrow"><Users className="inline size-3" /> Circle & Family</span><b>{s.partner ? s.partner.name : s.label}</b><small>{people} {people === 1 ? 'contact' : 'contacts'} · {s.dependents.length} {s.dependents.length === 1 ? 'dependent' : 'dependents'}</small></span>
        <ChevronRight className="life-menu-chevron" />
      </button>; })()}
      {(() => { const n0 = networkOf(career); const n = { ...n0, figures: n0.figures.filter(f => f.discovered) }; const allies = n.figures.filter(f => f.score >= 50).length, rivals = n.figures.filter(f => f.score <= -50).length; return <button type="button" className="life-menu-btn" onClick={() => setPanel('network')}>
        <img src={reception} alt="" width={1024} height={768} />
        <span className="life-menu-copy"><span className="eyebrow"><Users className="inline size-3" /> Political Network</span><b>{n.figures.length} associates</b><small>{allies} allies · {rivals} rivals{n.offers.length ? ` · ${n.offers.length} offer${n.offers.length === 1 ? '' : 's'}` : ''}</small></span>
        <ChevronRight className="life-menu-chevron" />
      </button>; })()}
      <button type="button" className="life-menu-btn" onClick={() => setPanel('food')}>
        <img src={diet.asset} alt="" width={1024} height={768} />
        <span className="life-menu-copy"><span className="eyebrow"><HeartPulse className="inline size-3" /> Food & Health</span><b>{diet.name}</b><small>Health {career.health ?? DEFAULT_HEALTH}% · {healthStatus(career.health ?? DEFAULT_HEALTH)} · {insuranceById(career.life?.insurance?.planId ?? 'none').name}</small></span>
        <ChevronRight className="life-menu-chevron" />
      </button>
      {(() => { const ls = lifestyleById(career.life?.lifestyle?.tierId ?? 'balanced'); const e = career.actions, st = career.life?.stress ?? DEFAULT_STRESS; return <button type="button" className="life-menu-btn" onClick={() => setPanel('lifestyle')}>
        <img src={ls.asset} alt="" width={1024} height={768} />
        <span className="life-menu-copy"><span className="eyebrow"><Sparkles className="inline size-3" /> Lifestyle & Living</span><b>{ls.name}</b><small>Energy {e}% · Stress {st}%</small></span>
        <ChevronRight className="life-menu-chevron" />
      </button>; })()}
      <div className="life-cash"><span>Personal cash</span><b>{usd(career.money)}</b></div>
      {props.onResult && <RetirementDecision career={career} onResult={props.onResult} />}
    </div>;
  }
  if (panel === 'network') return <>
    <Button variant="gameQuiet" size="sm" className="life-back" onClick={() => setPanel('menu')}><ArrowLeft /> Life</Button>
    <NetworkPanel career={career} onResult={props.onResult} />
  </>;
  return <>
    <Button variant="gameQuiet" size="sm" className="life-back" onClick={() => setPanel('menu')}><ArrowLeft /> Life</Button>
    {panel === 'housing' ? <HousingPanel {...props} /> : panel === 'garage' ? <GaragePanel career={career} onResult={props.onResult} /> : panel === 'social' ? <SocialPanel career={career} onResult={props.onResult} /> : panel === 'food' ? <FoodHealthPanel {...props} /> : <LifestylePanel {...props} />}
  </>;
}

function Gauge({ label, value, status, tone }: { label: string; value: number; status: string; tone: string }) {
  return <div className="vital-gauge">
    <div className="health-head"><span className="eyebrow">{label}</span><span className={`health-badge ${tone}`} data-testid={`${label.toLowerCase()}-status`}>{status}</span></div>
    <div className="health-row"><b data-testid={`${label.toLowerCase()}-value`}>{value}%</b></div>
    <div className="health-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={label}><span style={{ width: `${value}%` }} /></div>
  </div>;
}

const energyTone = { Peak: 'vibrant', Energetic: 'healthy', Tired: 'fatigued', Exhausted: 'ill' } as const;
const stressTone = { Serene: 'vibrant', Manageable: 'healthy', Stressed: 'fatigued', 'Burnout Risk': 'ill' } as const;

export function LifestylePanel({ career, onResult }: Props) {
  const stress = clampVital(career.life?.stress ?? DEFAULT_STRESS);
  const current = lifestyleById(career.life?.lifestyle?.tierId ?? 'balanced');
  const costs = quarterlyExpenses(career);
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  return <>
    <section className="game-card p-4" aria-label="Vitality">
      <Gauge label="Energy" value={Math.min(100, career.actions)} status={energyStatus(career.actions)} tone={energyTone[energyStatus(career.actions)]} />
      <div className="mt-3"><Gauge label="Stress" value={stress} status={stressStatus(stress)} tone={stressTone[stressStatus(stress)]} /></div>
      <h3 className="section-label mt-3">Next quarter's personal budget</h3>
      <div className="expense-list" aria-label="Quarterly personal budget">
        <span>Housing<b>{usd(costs.housing)}</b></span>
        <span>Diet<b>{usd(costs.groceries)}</b></span>
        <span>Healthcare<b>{usd(costs.medical)}</b></span>
        <span>Lifestyle<b data-testid="cost-lifestyle">{usd(costs.lifestyle)}</b></span>
        <span className="total">Total<b data-testid="budget-total">{usd(costs.total)}</b></span>
      </div>
      <div className="life-cash"><span>Personal cash</span><b>{usd(career.money)}</b></div>
    </section>
    {isBurnedOut(career) && <div className="life-warning" role="alert"><AlertTriangle className="size-4" /> Burnout: you are running on empty. Rallies are less effective until you rest.</div>}
    <EnergyRecharge career={career} {...(onResult ? { onResult } : {})} />
    <h3 className="section-label mt-3">Lifestyle & Living</h3>
    <div className="market-grid">{lifestyleCatalog.map(t => {
      const active = t.id === current.id;
      const a = affordability(career.money, quarterlyLifestyleCost(t));
      return <article key={t.id} className={active ? 'market-card current' : 'market-card'} aria-label={t.name}>
        <img src={t.asset} alt={t.name} loading="lazy" width={1024} height={768} />
        <div className="market-body">
          <h4>{t.name}{active && <span className="tag-ok">Current lifestyle</span>}</h4>
          <p>{t.description}</p>
          <div className="market-prices">
            <span>Monthly<b>{usd(t.monthlyCost)}/mo</b>{usd(quarterlyLifestyleCost(t))} per turn</span>
            <span>Per quarter<b className="amt-in">{sign(t.stressReductionPerQuarter)} Stress, {sign(t.energyBonusPerQuarter)} Energy</b></span>
          </div>
          {!active && <div className="market-actions">
            <Button variant={a.affordable ? 'game' : 'gameOutline'} className="w-full" disabled={!a.affordable || !onResult} onClick={() => onResult?.(selectLifestyle(career, t.id))}>Select Lifestyle</Button>
            {!a.affordable && <p className="shortfall">You need {usd(a.shortfall)} more in personal cash for a quarter of this lifestyle.</p>}
          </div>}
        </div>
      </article>;
    })}</div>
    <p className="mini-note mt-2">Paid from personal cash only, every quarter. Your home, diet, lifestyle and office workload shift energy and stress each turn.</p>
  </>;
}

export function FoodHealthPanel({ career, onResult }: Props) {
  const health = clampHealth(career.health ?? DEFAULT_HEALTH);
  const status = healthStatus(health);
  const current = dietById(career.life?.diet.tierId ?? 'standard');
  const plan = insuranceById(career.life?.insurance?.planId ?? 'none');
  const costs = quarterlyExpenses(career);
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  const [tab, setTab] = useState<'food' | 'care'>('food');
  return <>
    <section className="game-card p-4" aria-label="Health">
      <div className="health-head"><span className="eyebrow">Health & well-being</span><span className={`health-badge ${status.toLowerCase()}`} data-testid="health-status">{status}</span></div>
      <div className="health-row"><b data-testid="health-value">{health}%</b></div>
      <div className="health-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={health} aria-label="Health"><span style={{ width: `${health}%` }} /></div>
      <h3 className="section-label mt-3">Next quarter's living costs</h3>
      <div className="expense-list" aria-label="Quarterly living expenses">
        <span>Housing rent<b>{usd(costs.housing)}</b></span>
        <span>Groceries<b data-testid="cost-groceries">{usd(costs.groceries)}</b></span>
        <span>Medical<b>{usd(costs.medical)}</b></span>
        <span>Lifestyle<b>{usd(costs.lifestyle)}</b></span>
        <span className="total">Total<b data-testid="cost-total">{usd(costs.total)}</b></span>
      </div>
      <div className="life-cash"><span>Personal cash</span><b>{usd(career.money)}</b></div>
    </section>
    <ObligationsCard career={career} />
    <SolvencyAdvisor career={career} />
    {onResult && <SafetyPanel career={career} onRequest={r => onResult(securityAction(career, r))} />}

    <div className="life-tabs" role="tablist">
      <button type="button" role="tab" aria-selected={tab === 'food'} className={tab === 'food' ? 'active' : ''} onClick={() => setTab('food')}>Food & Groceries</button>
      <button type="button" role="tab" aria-selected={tab === 'care'} className={tab === 'care' ? 'active' : ''} onClick={() => setTab('care')}>Healthcare & Insurance</button>
    </div>

    {tab === 'food' ? <div className="market-grid">{dietCatalog.map(d => {
      const active = d.id === current.id;
      const a = affordability(career.money, quarterlyDietCost(d));
      return <article key={d.id} className={active ? 'market-card current' : 'market-card'} aria-label={d.name}>
        <img src={d.asset} alt={d.name} loading="lazy" width={1024} height={768} />
        <div className="market-body">
          <h4>{d.name}{active && <span className="tag-ok">Current diet</span>}</h4>
          <p>{d.description}</p>
          <div className="market-prices">
            <span>Monthly<b>{usd(d.monthlyCost)}/mo</b>{usd(quarterlyDietCost(d))} per turn</span>
            <span>Health<b className={d.healthDeltaPerQuarter < 0 ? 'amt-out' : d.healthDeltaPerQuarter > 0 ? 'amt-in' : ''}>{sign(d.healthDeltaPerQuarter)} Health/quarter</b></span>
          </div>
          {!active && <div className="market-actions">
            <Button variant={a.affordable ? 'game' : 'gameOutline'} className="w-full" disabled={!a.affordable || !onResult} onClick={() => onResult?.(selectDiet(career, d.id))}>Select Diet</Button>
            {!a.affordable && <p className="shortfall">You need {usd(a.shortfall)} more in personal cash for a quarter of this diet.</p>}
          </div>}
        </div>
      </article>;
    })}</div> : <>
      <section className={`market-card insurance-card${plan.risky ? ' risky' : ''}`} aria-label="Current health plan">
        <img src={plan.asset} alt={plan.name} loading="lazy" width={1024} height={768} />
        <div className="market-body">
          <span className="eyebrow">Your coverage</span>
          <h4 data-testid="insurance-name">{plan.name}{plan.risky && <span className="life-badge risk">Risky</span>}</h4>
          <p>{plan.description}</p>
        </div>
      </section>
      <div className="market-grid">{insuranceCatalog.filter(p => p.id !== plan.id).map(p => {
        const a = affordability(career.money, p.monthlyCost * 3);
        return <article key={p.id} className="market-card" aria-label={p.name}>
          <div className="market-body">
            <h4>{p.name}</h4>
            <p>{p.description}</p>
            <div className="market-prices">
              <span>Premium<b>{usd(p.monthlyCost)}/mo</b>{usd(p.monthlyCost * 3)} per turn</span>
              <span>Out-of-pocket<b>{Math.round((1 - p.coverage) * 100)}%</b>of medical bills</span>
            </div>
            <div className="market-actions">
              <Button variant={a.affordable ? 'gameOutline' : 'gameQuiet'} className="w-full" disabled={!a.affordable || !onResult} onClick={() => onResult?.(selectInsurance(career, p.id))}>{p.id === 'none' ? 'Drop insurance' : `Switch to ${p.name} · ${usd(p.monthlyCost)}/mo`}</Button>
              {!a.affordable && <p className="shortfall">You need {usd(a.shortfall)} more in personal cash.</p>}
            </div>
          </div>
        </article>;
      })}</div>
      <h4 className="eyebrow mt-3">Clinic visits</h4>
      {(career.life?.medicalDebt ?? 0) > 0 && <p className="shortfall" role="alert">Overdue medical bills: {usd(career.life!.medicalDebt)}</p>}
      <div className="market-grid">{clinicCatalog.map(v => {
        const cost = clinicCost(career, v);
        const a = affordability(career.money, cost);
        return <article key={v.id} className="market-card" aria-label={v.name}>
          <div className="market-body">
            <h4>{v.name}</h4>
            <p>{v.description}</p>
            <div className="market-prices"><span>Cost<b>{usd(cost)}</b>personal cash</span><span>Health<b>+{v.healthGain}</b>up to 100%</span></div>
            <div className="market-actions">
              <Button variant={a.affordable ? 'gameOutline' : 'gameQuiet'} className="w-full" disabled={!a.affordable || !onResult || (career.health ?? DEFAULT_HEALTH) >= 100} onClick={() => onResult?.(visitClinic(career, v.id))}>Book · {usd(cost)}</Button>
              {!a.affordable && <p className="shortfall">You need {usd(a.shortfall)} more in personal cash.</p>}
            </div>
          </div>
        </article>;
      })}</div>
    </>}
    <p className="mini-note mt-2">Paid from personal cash only. Enrolling pays this quarter's premium now. Health emergencies can strike when health drops below 50%.</p>
  </>;
}

export function HousingPanel({ career, onResult }: Props) {
  const { property, state } = currentHousing(career);
  const cash = career.money;
  const [preview, setPreview] = useState<Preview | null>(null);
  const owned = state.status === 'owning';

  return <>
    <section className="life-hero" aria-label="Current home">
      <img src={property.asset} alt={property.name} className="life-hero-img" width={1024} height={768} />
      <div className="life-hero-body">
        <span className="eyebrow">Your home</span>
        <h2 className="step-title mt-1">{property.name}</h2>
        <div className="life-badges">
          <span className="life-badge quality">{property.quality}</span>
          <span className={owned ? 'life-badge owned' : 'life-badge'}>{owned ? 'Owned' : 'Renting'}</span>
        </div>
        {owned
          ? <><p className="mini-note mt-2">You own this home. No rent is due.</p>
              <Button variant="gameOutline" className="w-full mt-2" onClick={() => { if (window.confirm(`Sell ${property.name} for ${usd(homeSaleValue(career))} and move into the basic rented room?`)) onResult?.(sellProperty(career)); }}>Sell home · {usd(homeSaleValue(career))}</Button></>
          : <div className="life-costs">
              <div>Monthly rent<b>{usd(state.monthlyRent)}/mo</b></div>
              <div>Next 3 months<b>{usd(moveInCost(state.monthlyRent))}</b></div>
            </div>}
        {state.arrears > 0 && <div className="life-warning" role="alert"><AlertTriangle className="size-4 shrink-0" /><span>Unpaid rent: you owe {usd(state.arrears)} in back rent.</span></div>}
        <div className="life-cash"><span>Personal cash</span><b data-testid="personal-cash">{usd(cash)}</b></div>
      </div>
    </section>

    {state.history.length > 0 && <>
      <h3 className="section-label mt-3">Past residences</h3>
      <div className="row-list">{state.history.map((h, i) => <div key={i} className="game-row static"><div><b>{housingCatalog.find(p => p.id === h.propertyId)?.name ?? h.propertyId}</b><p>{h.status === 'owning' ? 'Owned' : 'Rented'}</p></div><span className="row-cost">{h.from} → {h.to}</span></div>)}</div>
    </>}

    <h3 className="section-label mt-3">Property market</h3>
    <div className="market-grid">{housingCatalog.map(p => {
      const current = p.id === state.currentPropertyId;
      const moveIn = rentalMoveInCost(p);
      const base = { propertyId: p.id, title: p.name, kind: p.kind, quality: p.quality, description: p.description, asset: p.asset };
      return <article key={p.id} className={current ? 'market-card current' : 'market-card'} aria-label={p.name}>
        <img src={p.asset} alt={p.name} loading="lazy" width={1024} height={768} />
        <div className="market-body">
          <h4>{p.name}{current && <span className="tag-ok">Current home</span>}</h4>
          <div className="life-badges"><span className="life-badge quality">{p.quality}</span><span className="life-badge">{p.kind}</span></div>
          <p>{p.description}</p>
          <div className="market-prices">
            <span>Rent<b>{usd(p.monthlyRent)}/mo</b>{usd(moveIn)} for 3 months</span>
            <span>Purchase<b>{usd(p.purchasePrice)}</b></span>
          </div>
          {!(current && owned) && <div className="market-actions">
            {!current && <BuyButton cash={cash} required={moveIn} label={`Rent for ${usd(p.monthlyRent)}/mo`} onPreview={() => setPreview({ ...base, action: 'Rent', required: moveIn })} />}
            <BuyButton cash={cash} required={p.purchasePrice} label={`Purchase for ${usd(p.purchasePrice)}`} onPreview={() => setPreview({ ...base, action: 'Purchase', required: p.purchasePrice })} />
          </div>}
        </div>
      </article>;
    })}</div>

    <p className="mini-note mt-2">Paid from personal cash only. Renting charges 3 months up front; two unpaid quarters lead to eviction.</p>

    {preview && <div className="modal-backdrop" onClick={() => setPreview(null)}>
      <section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="property-preview-title" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h2 id="property-preview-title">{preview.title}</h2><Button autoFocus variant="gameQuiet" size="icon" aria-label="Close" onClick={() => setPreview(null)}><X /></Button></div>
        <img src={preview.asset} alt={preview.title} className="housing-image" />
        <div className="life-badges"><span className="life-badge quality">{preview.quality}</span><span className="life-badge">{preview.kind}</span></div>
        <p>{preview.description}</p>
        <div className="life-costs"><div>{preview.action === 'Rent' ? 'Move-in (3 months)' : 'Purchase price'}<b>{usd(preview.required)}</b></div><div>Cash after<b>{usd(cash - preview.required)}</b></div></div>
        {preview.propertyId && onResult
          ? <Button variant="game" className="w-full mt-3" disabled={!affordability(cash, preview.required).affordable} onClick={() => { const id = preview.propertyId!; setPreview(null); onResult(preview.action === 'Rent' ? rentProperty(career, id) : buyProperty(career, id)); }}>Confirm {preview.action === 'Rent' ? 'rental' : 'purchase'} · {usd(preview.required)}</Button>
          : <Button variant="game" className="w-full mt-3" disabled>Vehicle sales open in a future update</Button>}
      </section>
    </div>}
  </>;
}

function ObligationsCard({ career }: { career: Career }) {
  const o = essentialObligations(career);
  const owed = career.life?.billArrears ?? 0;
  return <section className="game-card p-4 mt-3" aria-label="Essential Quarterly Obligations">
    <h3 className="section-label">Essential Quarterly Obligations</h3>
    {owed > 0 && <div className="life-warning" role="alert"><AlertTriangle className="size-4" /> In Arrears / Past Due: {usd(owed)} unpaid (+10% late fee). Utilities are shut off and your credit rating is lowered.</div>}
    <div className="expense-list">
      <span>Rent / Mortgage<b>{usd(o.rent)}</b></span>
      <span>Utilities & Services<b>{usd(o.utilities)}</b></span>
      <span>Social & Healthcare Levies<b>{usd(o.levies)}</b></span>
      {o.maintenance > 0 && <span>Property Maintenance<b>{usd(o.maintenance)}</b></span>}
      {o.arrears > 0 && <span>Past-due bills<b>{usd(o.arrears)}</b></span>}
      <span className="total">Total Compulsory Deductions Due Next Quarter<b data-testid="obligations-total">{usd(o.total)}</b></span>
    </div>
  </section>;
}

/** Balance & Comfort: energy is bought with coins only (never cash), and only below the recharge threshold. */
function EnergyRecharge({ career, onResult }: Props) {
  const wallet = useWallet();
  const open = canBuyEnergy(career);
  const buy = (id: string, price: number) => {
    const r = rechargeEnergy(career, id, readWallet().coins);
    if (r.ok) { const w = spendCoins(readWallet(), price); if (!w) return; writeWallet(w); }
    onResult?.(r);
  };
  return <section id="balance-comfort" aria-label="Balance and comfort">
    <div className="panel-row mt-3"><h3 className="section-label">Balance & Comfort</h3><CoinChip /></div>
    <p className="mini-note">Energy {career.actions}% · {open ? 'top up with coins — extra energy above 100% carries this turn.' : `available once energy drops below ${RECHARGE_THRESHOLD}%.`}</p>
    <div className="market-grid">{ENERGY_RECHARGES.map(r => {
      const can = open && wallet.coins >= r.coins;
      return <article key={r.id} className="market-card" aria-label={r.name}>
        <div className="market-body">
          <h4>{r.name}</h4>
          <p>{r.summary}</p>
          <div className="market-prices"><span>Cost<b>{r.coins} coins</b></span><span>Effect<b className="amt-in">+{r.energy}% Energy</b></span></div>
          <div className="market-actions">
            <Button variant={can ? 'game' : 'gameQuiet'} className="w-full" disabled={!can || !onResult} onClick={() => buy(r.id, r.coins)}><Coins /> Buy · {r.coins} coins</Button>
            {open && wallet.coins < r.coins && <p className="shortfall">You need {r.coins - wallet.coins} more coins.</p>}
          </div>
        </div>
      </article>;
    })}</div>
    {open && <WatchAdOffer label="Earn coins" />}
  </section>;
}
