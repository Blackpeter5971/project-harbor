import { describe, expect, it } from 'vitest';
import { applyReward, emptyWallet, spendCoins } from './coins';

describe('coin wallet', () => {
  it('a watched ad gives 25 coins', () => { expect(applyReward(emptyWallet(), 'coins').coins).toBe(25); });
  it('Political Dynasty unlocks only through an ad', () => {
    expect(applyReward(emptyWallet(), 'coins').dynastyUnlocked).toBe(false);
    expect(applyReward(emptyWallet(), 'dynasty').dynastyUnlocked).toBe(true);
  });
  it('cannot spend more coins than held', () => { expect(spendCoins({ ...emptyWallet(), coins: 10 }, 20)).toBeNull(); });
});
