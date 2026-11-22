import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import type { Result } from '@/lib/game/support';
import { ensureLife } from '@/lib/game/life';
import { garageView, quarterlyUpkeep, vehiclePerks } from '@/lib/game/garage';
import { buyPossession, buyVehicle, possessionCatalog, resaleValue, sellVehicle, serviceCatalog, serviceVehicle, setActiveVehicle, vehicleModelById, vehicleModels } from '@/lib/game/vehicles';

const usd = (n: number) => `$${n.toLocaleString('en-US')}`;

function PriceButton({ cash, price, label, onBuy }: { cash: number; price: number; label: string; onBuy?: (() => void) | undefined }) {
  const ok = cash >= price;
  return <div>
    <Button variant={ok ? 'game' : 'gameOutline'} className="w-full" disabled={!ok || !onBuy} onClick={onBuy}>{ok ? label : `Requires ${usd(price)}`}</Button>
    {!ok && <p className="shortfall mt-1">You need {usd(price - cash)} more in personal cash.</p>}
  </div>;
}

export function GaragePanel({ career, onResult }: { career: Career; onResult?: ((r: Result) => void) | undefined }) {
  const act = (r: Result) => onResult?.(r);
  const [tab, setTab] = useState<'dealership' | 'possessions'>('dealership');
  const g = garageView(career);
  const life = ensureLife(career).life!;
  const owned = new Set((life.possessions ?? []).map(p => p.itemId));
  const ownedModels = new Set((life.vehicles ?? []).map(v => v.modelId));
  const cash = career.money;
  return <>
    <section className="life-hero" aria-label="Current vehicle">
      <img className="life-hero-img" src={g.model.asset} alt={g.model.name} width={992} height={672} />
      <div className="life-hero-body">
        <span className="eyebrow">Current transport</span>
        <h3 className="mt-1">{g.model.name}</h3>
        <div className="life-badges"><span className={g.status === 'Daily Driver' ? 'life-badge owned' : 'life-badge'}>{g.status}</span></div>
        <div className="health-head mt-2"><span className="eyebrow">Condition</span><b>{g.condition}%</b></div>
        <div className="health-meter" role="meter" aria-label="Condition" aria-valuemin={0} aria-valuemax={100} aria-valuenow={g.condition}><span style={{ width: `${g.condition}%` }} /></div>
        {life.maintenanceOverdue && <p className="life-warning" role="alert">Maintenance overdue: last quarter's upkeep went unpaid. Vehicle perks are suspended.</p>}
        {g.status !== 'Public Transit' && g.condition < 30 && <p className="life-warning" role="alert">Breakdown risk: condition {g.condition}%. Book a service below.</p>}
        <div className="garage-upkeep">
          <div>{g.model.isDefault ? 'Fares' : 'Fuel'}<b>{usd(g.upkeep.fuel)}</b></div>
          <div>Insurance<b>{usd(g.upkeep.insurance)}</b></div>
          <div>Maintenance<b>{usd(g.upkeep.maintenance)}</b></div>
        </div>
        <div className="life-cash"><span>Quarterly upkeep</span><b data-testid="garage-upkeep">{usd(g.upkeep.total)}</b></div>
      </div>
    </section>

    {(life.vehicles ?? []).length > 0 && <section aria-label="Your garage" className="mt-3">
      <h3 className="section-label">Your garage</h3>
      <div className="garage-owned">{(life.vehicles ?? []).map(v => { const m = vehicleModelById(v.modelId)!; const driving = life.activeVehicleId === v.id; return <article key={v.id} className="garage-owned-card" aria-label={`Owned ${m.name}`}>
        <div className="garage-owned-head"><img src={m.asset} alt="" width={992} height={672} /><div><b>{m.name}</b><small>Condition {v.condition}% · Trade-in {usd(resaleValue(v.modelId, v.condition))}</small></div></div>
        <div className="garage-owned-actions">
          {serviceCatalog.map(sv => <Button key={sv.id} size="sm" variant="gameOutline" disabled={!onResult || v.condition >= 100 || cash < sv.cost} onClick={() => act(serviceVehicle(career, v.id, sv.id))}>{sv.id === 'tuneup' ? 'Tune-up' : 'Overhaul'} · {usd(sv.cost)}</Button>)}
          <Button size="sm" variant="gameQuiet" disabled={!onResult} onClick={() => act(setActiveVehicle(career, driving ? null : v.id))}>{driving ? 'Store' : 'Drive'}</Button>
          <Button size="sm" variant="gameQuiet" disabled={!onResult} onClick={() => act(sellVehicle(career, v.id))}>Sell</Button>
        </div>
      </article>; })}</div>
    </section>}

    <div className="garage-tabs" role="tablist">
      <button type="button" role="tab" aria-selected={tab === 'dealership'} onClick={() => setTab('dealership')}>Dealership</button>
      <button type="button" role="tab" aria-selected={tab === 'possessions'} onClick={() => setTab('possessions')}>Wardrobe & Possessions</button>
    </div>

    {tab === 'dealership' ? <div className="market-grid">{vehicleModels.filter(m => !m.isDefault).map(m => {
      const up = quarterlyUpkeep(m);
      const mine = ownedModels.has(m.id);
      return <article key={m.id} className={mine ? 'market-card current' : 'market-card'} aria-label={m.name}>
        <img src={m.asset} alt={m.name} loading="lazy" width={992} height={672} />
        <div className="market-body">
          <h4>{m.name}{mine && <span className="tag-ok">Owned</span>}</h4>
          <div className="life-badges"><span className="life-badge quality">Tier {m.tier}</span><span className="life-badge">Condition 100%</span>{vehiclePerks(m).map(p => <span key={p} className="life-badge">{p}</span>)}</div>
          <p>{m.description}</p>
          <div className="market-prices">
            <span>{m.id === 'chauffeur_limo' ? 'Purchase / lease' : 'Purchase'}<b>{usd(m.purchasePrice)}</b></span>
            <span>Upkeep<b>{usd(m.monthlyUpkeep)}/mo</b>{usd(up.total)} per quarter</span>
          </div>
          {!mine && <div className="market-actions"><PriceButton cash={cash} price={m.purchasePrice} label={`${m.id === 'chauffeur_limo' ? 'Lease' : 'Purchase'} for ${usd(m.purchasePrice)}`} onBuy={onResult && (() => act(buyVehicle(career, m.id)))} /></div>}
        </div>
      </article>;
    })}</div>
    : <div className="possession-shelf">{possessionCatalog.map(p => {
      const has = owned.has(p.id);
      return <article key={p.id} className={has ? 'market-card current' : 'market-card'} aria-label={p.name}>
        <img src={p.asset} alt={p.name} loading="lazy" width={992} height={672} />
        <div className="market-body">
          <h4>{p.name}</h4>
          <div className="life-badges"><span className={has ? 'life-badge owned' : 'life-badge'}>{has ? 'Owned' : 'Buy'}</span><span className="life-badge quality">{usd(p.purchasePrice)}</span></div>
          {!has && <PriceButton cash={cash} price={p.purchasePrice} label={`Buy · ${usd(p.purchasePrice)}`} onBuy={onResult && (() => act(buyPossession(career, p.id)))} />}
        </div>
      </article>;
    })}</div>}

    <div className="life-cash"><span>Personal cash</span><b data-testid="garage-cash">{usd(cash)}</b></div>
    <p className="mini-note mt-2">Vehicles and possessions are paid from personal cash only.</p>
  </>;
}
