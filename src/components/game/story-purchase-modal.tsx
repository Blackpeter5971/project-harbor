import { useState } from 'react';
import { Coins, LockKeyhole, PlayCircle, Unlock, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { readWallet, spendCoins, writeWallet, REWARD_COINS } from '@/lib/game/coins';
import { purchaseScenario, type ScenarioDefinition } from '@/lib/game/story-mode';
import { SCENARIO_COVERS } from '@/lib/game/story-art';
import { useWallet, watchRewardedAd } from './ads';

/** Preview + purchase card for a locked premium scenario. */
export function StoryPurchaseModal({ scenario, onClose, onUnlocked }: { scenario: ScenarioDefinition; onClose: () => void; onUnlocked: (id: string) => void }) {
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const affordable = wallet.coins >= scenario.price;
  const cover = SCENARIO_COVERS[scenario.id];
  const unlock = () => {
    const r = purchaseScenario(scenario.id, { readWallet, writeWallet, spend: spendCoins });
    if (r === 'unlocked' || r === 'already-owned') onUnlocked(scenario.id);
    else setError(r === 'insufficient' ? 'Not enough coins yet.' : 'Could not save the unlock on this device. No coins were taken.');
  };
  const earn = async () => { setBusy(true); setError(null); await watchRewardedAd('coins'); setBusy(false); };
  return <div className="modal-backdrop" onClick={onClose}><section className="game-modal purchase-modal" role="dialog" aria-modal="true" aria-label={`Unlock ${scenario.title}`} onClick={e => e.stopPropagation()}>
    <button type="button" className="purchase-close" aria-label="Close" onClick={onClose}><X /></button>
    {cover && <img className="purchase-cover" src={cover} alt="" width={1280} height={720} />}
    <span className="eyebrow"><LockKeyhole className="inline size-3" /> Premium story · {scenario.genre}</span>
    <h2>{scenario.title}</h2>
    <p className="scenario-tagline">{scenario.tagline}</p>
    <p>{scenario.description}</p>
    <div className="bg-stats">
      <span>Difficulty <b>{scenario.difficulty}</b></span>
      <span><b>{scenario.playtimeMinutes}</b> min</span>
      <span><b>{scenario.actsCount}</b> acts · <b>{scenario.endingsCount}</b> endings</span>
    </div>
    {scenario.cast.length > 0 && <div className="purchase-cast"><span className="eyebrow"><Users className="inline size-3" /> Cast</span><ul>{scenario.cast.map(c => <li key={c}>{c}</li>)}</ul></div>}
    <dl className="purchase-ledger">
      <div><dt>Price</dt><dd><Coins className="inline size-3" /> {scenario.price}</dd></div>
      <div><dt>Your balance</dt><dd>{wallet.coins}</dd></div>
      <div><dt>After purchase</dt><dd className={affordable ? '' : 'purchase-short'}>{affordable ? wallet.coins - scenario.price : `${scenario.price - wallet.coins} short`}</dd></div>
    </dl>
    {error && <p className="purchase-error" role="alert">{error}</p>}
    {affordable
      ? <Button variant="game" className="w-full" onClick={unlock}><Unlock /> Unlock Scenario · {scenario.price} coins</Button>
      : <Button variant="game" className="w-full" disabled={busy} onClick={earn}><PlayCircle /> Earn {REWARD_COINS} Coins</Button>}
  </section></div>;
}
