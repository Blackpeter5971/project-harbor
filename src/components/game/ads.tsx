import { useEffect, useState, useSyncExternalStore } from 'react';
import { Coins, PlayCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { applyReward, emptyWallet, readWallet, subscribeWallet, writeWallet, REWARD_COINS } from '@/lib/game/coins';
import { registerAdSimulator, showBannerAd, hideBannerAd, showRewardedAd, isNativeAds, lastAdError, warmUpAds } from '@/lib/game/ads-service';

const serverWallet = emptyWallet();
export const useWallet = () => useSyncExternalStore(subscribeWallet, readWallet, () => serverWallet);

/** Plays a rewarded ad; credits coins (and the dynasty unlock) only when fully watched. */
export async function watchRewardedAd(reason: 'coins' | 'dynasty' = 'coins') {
  const ok = await showRewardedAd();
  if (ok) writeWallet(applyReward(readWallet(), reason));
  else if (isNativeAds() && lastAdError) window.alert(`Ad not available right now. ${lastAdError}`);
  return ok;
}

export function CoinChip() {
  const w = useWallet();
  const [busy, setBusy] = useState(false);
  return <span className="coin-chip"><Coins aria-hidden /> <b aria-label={`${w.coins} coins`}>{w.coins}</b>
    <button type="button" className="coin-ad" disabled={busy} aria-label={`Watch an ad for ${REWARD_COINS} coins`} title={`Watch ad +${REWARD_COINS}`} onClick={async () => { setBusy(true); await watchRewardedAd(); setBusy(false); }}><PlayCircle /></button>
  </span>;
}

export function WatchAdOffer({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  return <Button variant="gameOutline" className="ad-offer w-full" disabled={busy} onClick={async () => { setBusy(true); await watchRewardedAd(); setBusy(false); }}><PlayCircle /> {label} · +{REWARD_COINS} coins</Button>;
}

/** Bottom banner. Native: Unity banner overlays the app; web: a reserved placeholder strip. */
export function AdBanner() {
  const [native, setNative] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!isNativeAds()) return;
    let alive = true; let busy = false; let shown = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
      if (!alive || busy) return;
      if (timer) { clearTimeout(timer); timer = undefined; }
      busy = true;
      void showBannerAd().then(r => {
        busy = false;
        if (!alive) return;
        shown = r.ok; setNative(r.ok); setError(r.ok ? null : (r.error ?? 'loading…'));
        if (!r.ok) timer = setTimeout(attempt, navigator.onLine ? 20000 : 60000);
      });
    };
    // Retry right away when the phone reconnects or the player returns to the app.
    const onOnline = () => { if (!shown) attempt(); };
    const onVisible = () => { if (document.visibilityState === 'visible' && !shown) attempt(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    attempt();
    return () => { alive = false; if (timer) clearTimeout(timer); void hideBannerAd(); window.removeEventListener('online', onOnline); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  if (native) return <div className="ad-banner-space" aria-hidden />;
  return <div className="ad-banner" role="complementary" aria-label="Advertisement">{error ? `Ad · ${error}` : isNativeAds() ? 'Ad · loading…' : 'Ad · Unity banner shows here in the Android app'}</div>;
}

/** Simulated rewarded ad for the web preview. Mount once. */
export function AdHost() {
  const [pending, setPending] = useState<((c: boolean) => void) | null>(null);
  const [left, setLeft] = useState(5);
  useEffect(() => { registerAdSimulator(done => { setLeft(5); setPending(() => done); }); return () => registerAdSimulator(null); }, []);
  useEffect(() => { warmUpAds(); }, []);
  useEffect(() => { if (!pending || left <= 0) return; const t = setTimeout(() => setLeft(l => l - 1), 1000); return () => clearTimeout(t); }, [pending, left]);
  if (!pending || isNativeAds()) return null;
  const close = (c: boolean) => { pending(c); setPending(null); };
  return <div className="modal-backdrop"><section className="game-modal ad-sim" role="dialog" aria-modal="true" aria-label="Rewarded ad">
    <span className="eyebrow">Test ad · Unity Ads</span>
    <div className="ad-sim-screen"><PlayCircle /><p>{left > 0 ? `Reward in ${left}s` : 'Reward ready!'}</p></div>
    {left > 0 ? <Button variant="gameQuiet" onClick={() => close(false)}><X /> Skip (no reward)</Button> : <Button variant="game" onClick={() => close(true)}><Coins /> Claim reward</Button>}
  </section></div>;
}
