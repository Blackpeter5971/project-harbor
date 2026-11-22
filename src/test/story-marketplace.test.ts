import { describe, expect, it } from 'vitest';
import { spendCoins, emptyWallet, type Wallet } from '@/lib/game/coins';
import { STORY_UNLOCKS_KEY, purchaseScenario, readUnlockedScenarios, scenarioById, unlockScenario } from '@/lib/game/story-mode';

const fakeStorage = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
const io = (coins: number, storage = fakeStorage()) => {
  let w: Wallet = { ...emptyWallet(), coins };
  return { storage, readWallet: () => w, writeWallet: (n: Wallet) => { w = n; }, spend: spendCoins, get coins() { return w.coins; } };
};

describe('story marketplace', () => {
  it('registers the required prices', () => {
    expect(scenarioById('enemy-across-the-aisle')).toMatchObject({ price: 0, actsCount: 4, endingsCount: 7 });
    expect(scenarioById('red-carpet-blue-blood')?.price).toBe(150);
    expect(scenarioById('the-whistleblower-shadow')?.price).toBe(150);
    expect(scenarioById('the-dark-horse-patriot')?.price).toBe(200);
  });

  it('unlocks persist across sessions (re-reading the same storage)', () => {
    const storage = fakeStorage();
    expect(unlockScenario('red-carpet-blue-blood', storage)).toBe(true);
    expect(JSON.parse(storage.getItem(STORY_UNLOCKS_KEY)!).unlocked).toContain('red-carpet-blue-blood');
    expect(readUnlockedScenarios(storage)).toContain('red-carpet-blue-blood');
  });

  it('rejects unknown scenario ids', () => {
    expect(unlockScenario('nope', fakeStorage())).toBe(false);
  });

  it('deducts exactly the price once and unlocks', () => {
    const h = io(300);
    expect(purchaseScenario('the-dark-horse-patriot', h)).toBe('unlocked');
    expect(h.coins).toBe(100);
    expect(purchaseScenario('the-dark-horse-patriot', h)).toBe('already-owned');
    expect(h.coins).toBe(100);
  });

  it('rejects insufficient funds without charging or unlocking', () => {
    const h = io(149);
    expect(purchaseScenario('red-carpet-blue-blood', h)).toBe('insufficient');
    expect(h.coins).toBe(149);
    expect(readUnlockedScenarios(h.storage)).not.toContain('red-carpet-blue-blood');
  });

  it('does not charge when the unlock cannot be saved', () => {
    const h = io(500, { getItem: () => null, setItem: () => { throw new Error('full'); } });
    expect(purchaseScenario('red-carpet-blue-blood', h)).toBe('failed');
    expect(h.coins).toBe(500);
  });

  it('Enemy Across the Aisle is always unlocked and never costs coins', () => {
    const storage = fakeStorage();
    storage.setItem(STORY_UNLOCKS_KEY, '{broken');
    expect(readUnlockedScenarios(storage)).toContain('enemy-across-the-aisle');
    expect(readUnlockedScenarios(null)).toContain('enemy-across-the-aisle');
    const h = io(1000, storage);
    expect(purchaseScenario('enemy-across-the-aisle', h)).toBe('already-owned');
    expect(h.coins).toBe(1000);
  });
});
