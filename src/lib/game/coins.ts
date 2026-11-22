import { readVerified, writeSigned } from './save-integrity';
/** Device-wide coin wallet (separate from careers so coins survive new games). Browser-only; call after hydration. */
export const REWARD_COINS = 25;
export const DYNASTY_ADS_REQUIRED = 1;
const KEY = 'president-wallet-v1';

export type Wallet = { coins: number; adsWatched: number; dynastyUnlocked: boolean };
export const emptyWallet = (): Wallet => ({ coins: 0, adsWatched: 0, dynastyUnlocked: false });

/** Pure: apply a completed rewarded ad. */
export function applyReward(w: Wallet, reason: 'coins' | 'dynasty'): Wallet {
  const n = { ...w, coins: w.coins + REWARD_COINS, adsWatched: w.adsWatched + 1 };
  if (reason === 'dynasty') n.dynastyUnlocked = true;
  return n;
}
/** Pure: spend coins; null when the balance is too low. */
export function spendCoins(w: Wallet, amount: number): Wallet | null {
  if (amount <= 0 || w.coins < amount) return null;
  return { ...w, coins: w.coins - amount };
}

const listeners = new Set<() => void>();
let cache: Wallet | null = null;
export function readWallet(): Wallet {
  if (cache) return cache;
  try { const v = readVerified(localStorage, KEY); const raw = v.data ? JSON.parse(v.data) : null; cache = { ...emptyWallet(), ...(raw ?? {}) }; } catch { cache = emptyWallet(); }
  return cache!;
}
export function writeWallet(w: Wallet) {
  cache = w;
  try { writeSigned(localStorage, KEY, JSON.stringify(w)); } catch { /* storage full or blocked */ }
  listeners.forEach(l => l());
}
export function subscribeWallet(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
