import { describe, it, expect } from 'vitest';
import { createCareer, defaultDraft, parseCareer, ACTIONS_PER_MONTH, type Career } from '@/lib/game/career';
import {
  publishPost, socialOf, POST_ENERGY_COST, previewPost, socialTurn, isVerified, markNotificationsRead, markThreadRead, threadsOf,
  VERIFIED_FOLLOWERS, MONETIZE_FOLLOWERS, MONETIZE_ENGAGEMENT, socialMediaSchema,
} from '@/lib/game/social-media';

const make = (): Career => { const c = createCareer({ ...defaultDraft, name: 'Ada' }, () => 0); return { ...c, life: { ...c.life!, energy: 80 } }; };
const ok = (r: ReturnType<typeof publishPost>) => { if (!r.ok) throw new Error(r.message); return r.career; };
const withSocial = (c: Career, patch: Partial<ReturnType<typeof socialOf>>): Career => ({ ...c, socialMedia: { ...socialMediaSchema.parse({}), quarter: c.date, ...patch } });
const office = (c: Career, id: string): Career => ({ ...c, office: { id, title: id, jurisdiction: 'City of Testville', since: c.date, party: 'Independent', elected: c.date, termEnd: '2030-01-01', margin: 5 }, publicOffice: true });
const turn = (c: Career) => socialTurn(c, c.date, '2026-04-01');

describe('social media', () => {
  it('posting on S costs 5% turn energy', () => {
    const c = make();
    const n = ok(publishPost(c, 'policy', 'Hello'));
    expect(POST_ENERGY_COST).toBe(5);
    expect(n.actions).toBe(c.actions - 5);
    expect(socialOf(n).followers).toBeGreaterThan(0);
    expect(n.skills.communication).toBeGreaterThan(c.skills.communication);
  });
  it('blocks posting without energy', () => {
    const c = { ...make(), actions: 4 };
    expect(publishPost(c, 'policy', 'x').ok).toBe(false);
  });
  it('spamming gives diminishing returns and hits the quarterly cap', () => {
    let c: Career = make();
    const gains: number[] = [];
    for (let i = 0; i < 4; i++) { gains.push(previewPost(c, 'praise').followers); c = ok(publishPost(c, 'praise', '')); }
    for (let i = 1; i < gains.length; i++) expect(gains[i]).toBeLessThan(gains[i - 1]!);
    expect(publishPost(c, 'policy', 'x').ok).toBe(false);
    expect(socialOf({ ...c, date: '2026-04-01' }).quarterPosts).toBe(0);
  });
  it('older saves load without social data', () => {
    const { socialMedia, ...legacy } = make();
    const loaded = parseCareer(JSON.stringify(legacy))!;
    expect(socialOf(loaded).followers).toBe(0);
  });
  it('post confirmation no longer reports follower gains', () => {
    const r = publishPost(make(), 'policy', 'Hi');
    expect(r.ok && r.message).not.toMatch(/follower/i);
  });
});

describe('verification', () => {
  it('500K followers earns the blue badge', () => {
    expect(isVerified(withSocial(make(), { followers: VERIFIED_FOLLOWERS - 1 }))).toBe(false);
    expect(isVerified(withSocial(make(), { followers: VERIFIED_FOLLOWERS }))).toBe(true);
  });
  it('serving as mayor earns the blue badge; city council does not', () => {
    expect(isVerified(office(make(), 'mayor'))).toBe(true);
    expect(isVerified(office(make(), 'council'))).toBe(false);
  });
  it('the badge is kept once granted', () => {
    const c = turn(office(make(), 'governor')).career;
    expect(socialOf(c).verifiedSince).toBe('2026-04-01');
    expect(isVerified({ ...c, office: null })).toBe(true);
  });
});

describe('monetization', () => {
  it('needs both 10K followers and 3% engagement', () => {
    expect(socialOf(turn(withSocial(make(), { followers: MONETIZE_FOLLOWERS, engagement: MONETIZE_ENGAGEMENT - 1 })).career).monetizedSince).toBeNull();
    expect(socialOf(turn(withSocial(make(), { followers: MONETIZE_FOLLOWERS - 2000, engagement: 8 })).career).monetizedSince).toBeNull();
    expect(socialOf(turn(withSocial(make(), { followers: MONETIZE_FOLLOWERS, engagement: MONETIZE_ENGAGEMENT + 1 })).career).monetizedSince).toBe('2026-04-01');
  });
  it('pays creator revenue into personal savings only, once per turn', () => {
    const base = withSocial({ ...make(), warChest: 500 }, { followers: 50_000, engagement: 6, monetizedSince: '2025-10-01', posts: [{ id: 'p', date: '2026-01-01', type: 'policy', text: 'x', likes: 100, reposts: 1, replies: 1, followersGained: 0, views: 250_000, reactions: [], controversial: false }] });
    const once = turn(base).career;
    expect(once.money).toBe(base.money + 1000);
    expect(once.warChest).toBe(500);
    expect(once.ledger[0]).toMatchObject({ label: 'Creator revenue · S', amount: 1000 });
    expect(turn(once).career).toBe(once);
  });
});

describe('mentions and inbox', () => {
  it('officeholders get tagged by the public', () => {
    const c = turn(office(make(), 'mayor')).career;
    const m = socialOf(c).notifications.filter(x => x.kind === 'mention');
    expect(m.length).toBeGreaterThan(0);
    expect(m.every(x => x.text.includes('@ada'))).toBe(true);
  });
  it('unknown private citizens are not tagged', () => {
    const c = turn(withSocial(make(), { followers: 100 })).career;
    expect(socialOf(c).notifications.some(x => x.kind === 'mention')).toBe(false);
  });
  it('political elites message officeholders with their role tag', () => {
    const c = turn(office(make(), 'mayor')).career;
    const elite = socialOf(c).inbox.find(m => m.kind === 'elite');
    expect(elite?.role).toBeTruthy();
  });
  it('opening a thread and notifications marks them read', () => {
    const c = turn(office(make(), 'mayor')).career;
    const t = threadsOf(socialOf(c))[0]!;
    const read = markThreadRead(c, t.id);
    expect(threadsOf(socialOf(read)).find(x => x.id === t.id)!.unread).toBe(0);
    expect(socialOf(markNotificationsRead(c)).notifications.every(n => n.read)).toBe(true);
  });
});
