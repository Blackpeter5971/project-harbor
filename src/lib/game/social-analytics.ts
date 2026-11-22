import type { Career } from './career';
import { postTypes, postViews, socialOf, type SocialPost } from './social-media';
import { supportGroupCatalog, supportGroupsOf } from './support-groups';

/**
 * Read-only S Professional Dashboard figures. Everything is derived from saved career state, so the
 * dashboard never writes to the save and shows the same numbers after a reload.
 */
export type Share = { label: string; pct: number };

/** Integer percentages that always add up to exactly 100 (largest-remainder rounding). */
export function toShares(entries: [string, number][]): Share[] {
  const total = entries.reduce((t, [, v]) => t + Math.max(0, v), 0) || 1;
  const raw = entries.map(([label, v]) => ({ label, exact: (Math.max(0, v) / total) * 100 }));
  const out = raw.map(r => ({ label: r.label, pct: Math.floor(r.exact) }));
  let left = 100 - out.reduce((t, r) => t + r.pct, 0);
  for (const i of raw.map((r, i) => ({ i, rem: r.exact - Math.floor(r.exact) })).sort((a, b) => b.rem - a.rem).map(x => x.i)) {
    if (left <= 0) break;
    out[i]!.pct++; left--;
  }
  return out;
}

/** Engagement rate of one post: interactions per view, as a percentage with one decimal. */
export const postEngagement = (p: SocialPost) => { const v = postViews(p); return v ? Math.round(((p.likes + p.reposts + p.replies) / v) * 1000) / 10 : 0; };

const OFFICE_LEVEL: Record<string, number> = { council: 0.3, mayor: 0.3, stateLeg: 0.4, governor: 0.45, house: 0.55, senate: 0.6, president: 0.75 };

export function reachAnalytics(c: Career) {
  const s = socialOf(c);
  const quarter = s.posts.filter(p => p.date === c.date);
  const totalViews = s.posts.reduce((t, p) => t + postViews(p), 0);
  const recent = s.posts.slice(0, 6).reverse().map(p => ({ id: p.id, date: p.date, views: postViews(p) }));
  return {
    followers: s.followers,
    quarterViews: quarter.reduce((t, p) => t + postViews(p), 0),
    totalViews,
    avgViews: s.posts.length ? Math.round(totalViews / s.posts.length) : 0,
    /** Average views per post relative to follower count (can exceed 100% when posts travel). */
    reachRate: s.followers && s.posts.length ? Math.round((totalViews / s.posts.length / s.followers) * 100) : 0,
    followersFromPosts: s.posts.reduce((t, p) => t + p.followersGained, 0),
    recent,
    peak: Math.max(1, ...recent.map(r => r.views)),
  };
}

export function followerDemographics(c: Career) {
  const groups = supportGroupsOf(c).loyalty;
  const loyalty = (id: string) => groups[id] ?? 50;
  // Voter blocs: loyal blocs follow more (squared weighting keeps hostile blocs a small minority).
  const blocs = toShares(supportGroupCatalog.map(g => [g.name, (10 + loyalty(g.id)) ** 2]));
  const youth = loyalty('youth') - 50, older = (loyalty('religious') + loyalty('veterans')) / 2 - 50;
  const ages = toShares([['18–29', 30 + youth * 0.3], ['30–44', 31], ['45–64', 25 + older * 0.15], ['65+', 14 + older * 0.2]]);
  const office = c.office && (!c.office.termEnd || c.date < c.office.termEnd) ? c.office.id : null;
  const national = office ? OFFICE_LEVEL[office] ?? 0.3 : 0.2;
  const abroad = Math.min(8, 1 + Math.log10(Math.max(10, socialOf(c).followers)));
  const locations = toShares([[`In ${c.character.state}`, (1 - national) * 100], ['Elsewhere in the US', national * 100 - abroad], ['Outside the US', abroad]]);
  return { blocs, ages, locations };
}

export function engagementBreakdown(c: Career) {
  const s = socialOf(c);
  const byType = postTypes.map(t => {
    const posts = s.posts.filter(p => p.type === t.id);
    return { id: t.id, label: t.label, posts: posts.length, rate: posts.length ? Math.round((posts.reduce((x, p) => x + postEngagement(p), 0) / posts.length) * 10) / 10 : 0 };
  });
  const best = [...s.posts].sort((a, b) => postEngagement(b) - postEngagement(a))[0] ?? null;
  const totals = s.posts.reduce((t, p) => ({ likes: t.likes + p.likes, reposts: t.reposts + p.reposts, replies: t.replies + p.replies }), { likes: 0, reposts: 0, replies: 0 });
  return { overall: s.engagement, byType, best: best ? { text: best.text, rate: postEngagement(best), date: best.date } : null, totals };
}
