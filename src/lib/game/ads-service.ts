import { Capacitor, registerPlugin } from '@capacitor/core';

/** Unity Ads configuration per platform. Replace the iOS Game ID with the one from the Unity dashboard. */
const ANDROID_ADS = { gameId: '800425098', bannerPlacement: 'BP_Banner_Android', rewardedPlacement: 'BP_Rewarded_Android' };
const IOS_ADS = { gameId: '800448569', bannerPlacement: 'BP_Banner_iOS', rewardedPlacement: 'BP_Rewarded_iOS' };
export const UNITY_ADS = { ...(Capacitor.getPlatform() === 'ios' ? IOS_ADS : ANDROID_ADS), testMode: false } as const;

/** Native bridge contract; each native app must register a plugin named "UnityAds". */
type UnityAdsPlugin = {
  initialize(o: { gameId: string; testMode: boolean }): Promise<void>;
  preloadRewarded(o: { placementId: string }): Promise<void>;
  showBanner(o: { placementId: string; position: 'bottom' }): Promise<void>;
  hideBanner(): Promise<void>;
  showRewarded(o: { placementId: string }): Promise<{ completed: boolean }>;
};
const UnityAds = registerPlugin<UnityAdsPlugin>('UnityAds');

export const isNativeAds = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('UnityAds');

/** Rejects with a readable message if Unity never answers, so taps can't hang silently. */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} did not respond after ${Math.round(ms / 1000)}s. Check the internet connection and that Game ID ${UNITY_ADS.gameId} and its ad units are active in the Unity dashboard.`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

let ready: Promise<void> | null = null;
function init() {
  if (!ready) {
    ready = withTimeout(UnityAds.initialize({ gameId: UNITY_ADS.gameId, testMode: UNITY_ADS.testMode }), 25000, 'Unity Ads start-up')
      .then(() => { void UnityAds.preloadRewarded({ placementId: UNITY_ADS.rewardedPlacement }).catch(() => {}); })
      .catch((e) => { ready = null; throw e; });
  }
  return ready;
}

/** Starts Unity early (app launch) so the first ad is ready when tapped. */
export function warmUpAds() {
  if (isNativeAds()) void init().catch((e) => { lastAdError = errText(e); });
}

/** Last native ad error, shown to the player so failures are visible. */
export let lastAdError: string | null = null;
const errText = (e: unknown) => (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));

/** Web/preview fallback: a simulated ad shown by <AdHost/>. */
let simulator: ((done: (completed: boolean) => void) => void) | null = null;
export const registerAdSimulator = (fn: typeof simulator) => { simulator = fn; };

/** Removes any native banner (e.g. when entering ad-free Sandbox Mode). */
export async function hideBannerAd(): Promise<void> {
  if (!isNativeAds()) return;
  try { await UnityAds.hideBanner(); } catch { /* nothing showing */ }
}

export async function showRewardedAd(): Promise<boolean> {
  if (isNativeAds()) {
    try {
      await init();
      const r = await withTimeout(UnityAds.showRewarded({ placementId: UNITY_ADS.rewardedPlacement }), 120000, `Ad unit ${UNITY_ADS.rewardedPlacement}`);
      lastAdError = null;
      return !!r.completed;
    } catch (e) { lastAdError = errText(e); return false; }
  }
  return new Promise(resolve => { if (simulator) simulator(resolve); else resolve(false); });
}

/** Resolves true once a banner is visible; otherwise returns Unity's reason. */
export async function showBannerAd(): Promise<{ ok: boolean; error?: string }> {
  if (!isNativeAds()) return { ok: false };
  try {
    await init();
    await withTimeout(UnityAds.showBanner({ placementId: UNITY_ADS.bannerPlacement, position: 'bottom' }), 30000, `Banner ${UNITY_ADS.bannerPlacement}`);
    return { ok: true };
  } catch (e) { return { ok: false, error: errText(e) }; }
}
