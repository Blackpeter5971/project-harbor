import { describe, it, expect } from 'vitest';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { socialOf, toggleLike, toggleRepost, pendingAchievements, shareAchievement, dismissAchievement, ambientPosts } from '@/lib/game/social-media';

const base = (): Career => createCareer({ ...defaultDraft, name: 'Ada' }, () => 0);
const withWin = (): Career => { const c = base(); return { ...c, elections: [{ office: 'council', title: 'City Council', jurisdiction: 'Springfield', date: c.date, stage: 'general', won: true } as unknown as Career['elections'][number]] }; };

describe('S likes, reposts and achievements', () => {
  it('like and repost toggle on and off', () => {
    const c = toggleLike(toggleRepost(base(), 'p1'), 'p1');
    expect(socialOf(c).liked).toEqual(['p1']); expect(socialOf(c).reposted).toEqual(['p1']);
    const off = toggleLike(c, 'p1');
    expect(socialOf(off).liked).toEqual([]);
  });
  it('an election win can be shared once and lands on the feed', () => {
    const c = withWin(); const [a] = pendingAchievements(c);
    expect(a?.kind).toBe('election');
    const r = shareAchievement(c, a!.key); expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(socialOf(r.career).posts[0]?.text).toContain('City Council');
    expect(socialOf(r.career).followers).toBeGreaterThan(socialOf(c).followers);
    expect(pendingAchievements(r.career)).toHaveLength(0);
    expect(shareAchievement(r.career, a!.key).ok).toBe(false);
  });
  it('dismissing removes the prompt without posting', () => {
    const c = withWin(); const k = pendingAchievements(c)[0]!.key;
    const d = dismissAchievement(c, k);
    expect(pendingAchievements(d)).toHaveLength(0); expect(socialOf(d).posts).toHaveLength(0);
  });
  it('some NPC posts carry images', () => {
    let any = false; const c = base();
    for (let y = 2026; y < 2040 && !any; y++) any = ambientPosts({ ...c, date: `${y}-01-01` }).some(p => p.image);
    expect(any).toBe(true);
  });
});
