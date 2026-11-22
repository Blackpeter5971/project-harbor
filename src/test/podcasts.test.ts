import { describe, it, expect } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { createShow, recordEpisode, showOf, podcastTurn, isSponsored, estimatedSponsorPay, EPISODE_ENERGY, MAX_EPISODES_PER_QUARTER, SPONSOR_LISTENERS } from '@/lib/game/podcasts';
import type { PodcastShow } from '@/lib/game/podcasts-schema';
import { socialOf } from '@/lib/game/social-media';

const make = (): Career => { const c = createCareer({ ...defaultDraft, name: 'Ada' }, () => 0); return { ...c, life: { ...c.life!, energy: 100 }, actions: 75 }; };
const ok = (r: ReturnType<typeof createShow>) => { if (!r.ok) throw new Error(r.message); return r.career; };
const withShow = (patch: Partial<PodcastShow>) => { const n = ok(createShow(make(), 'Ada Hour')); return { ...n, socialMedia: { ...socialOf(n), podcasts: { ...showOf(n)!, ...patch } } }; };

describe('CrossiaPod', () => {
  it('creates one show per career', () => {
    const c = ok(createShow(make(), 'Ada Hour'));
    expect(showOf(c)!.name).toBe('Ada Hour');
    expect(createShow(c, 'Again').ok).toBe(false);
  });
  it('recording costs 1 action and 10% energy and adds downloads, listeners and quotes', () => {
    const c = ok(createShow(make(), 'Ada'));
    const n = ok(recordEpisode(c, 'monologue'));
    expect(n.actions).toBe(c.actions - 15);
    const s = showOf(n)!;
    expect(s.episodes).toHaveLength(1);
    expect(s.listeners).toBeGreaterThan(0);
    expect(s.episodes[0]!.quotes.length).toBe(2);
    expect(n.reputation).toBe(c.reputation + 1);
  });
  it('allows at most 2 episodes per quarter', () => {
    let c = ok(createShow(make(), 'Ada'));
    for (let i = 0; i < MAX_EPISODES_PER_QUARTER; i++) c = ok(recordEpisode(c, 'rant'));
    expect(recordEpisode(c, 'rant').ok).toBe(false);
  });
  it('sponsors pay only at 5,000 listeners, once per quarter', () => {
    const small = withShow({ listeners: SPONSOR_LISTENERS - 1 });
    expect(isSponsored(showOf(small)!)).toBe(false);
    expect(podcastTurn(small, small.date).career.money).toBe(small.money);
    const big = withShow({ listeners: SPONSOR_LISTENERS });
    const pay = estimatedSponsorPay(showOf(big)!);
    expect(pay).toBeGreaterThan(0);
    const once = podcastTurn(big, big.date).career;
    expect(once.money).toBe(big.money + pay);
    expect(podcastTurn(once, big.date).career.money).toBe(once.money);
  });
  it('loads legacy saves without a show', () => {
    const c = make();
    const parsed = parseCareer(JSON.parse(JSON.stringify({ ...c, socialMedia: null })));
    expect(parsed && showOf(parsed)).toBeNull();
  });
});
