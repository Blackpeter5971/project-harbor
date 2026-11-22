import { describe, it, expect } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { socialOf, handleOf } from '@/lib/game/social-media';
import { mediaTurn } from '@/lib/game/media';
import { rivalFeedItems, profileFor, activeRivals } from '@/lib/game/rival-feed';
import type { Campaign, Cand } from '@/lib/game/campaign';

const make = (): Career => createCareer({ ...defaultDraft, name: 'Ada' }, () => 0);
const rival = (name: string, over: Partial<Cand> = {}): Cand => ({ name, portrait: 2, party: 'Republican', bio: 'Former TV news anchor', policy: 'Cut taxes for families', trait: 'media', quality: 20, funds: 5000, raised: 0, spent: 0, staff: 1, volunteers: 10, support: 12, momentum: 2, primary: false, out: false, ...over });
const withCampaign = (c: Career, over: Partial<Campaign> = {}): Career => ({
  ...c,
  campaign: { office: 'mayor', title: 'Mayor', jurisdiction: 'City of Testville', party: 'Democrat', electionDate: '2027-11-01', primaryDate: null, startDate: c.date, phase: 'general', slogan: 'Forward', strategy: 'grassroots', manager: null, funds: 1000, raised: 0, spent: 0, donors: 0, staff: 0, volunteers: 5, support: 8, momentum: 1, opponents: [rival('Rosa Ruiz'), rival('Frank Morrow', { out: true })], polls: [{ date: c.date, shares: { Ada: 30, 'Rosa Ruiz': 35, Undecided: 35 } }], txns: [], endorsements: [], headlines: [], attack: null, allegation: null, turnActs: [], lastProcessedEnd: c.date, ...over } as Campaign,
});
const mayor = (c: Career): Career => ({ ...c, office: { id: 'mayor', title: 'Mayor', jurisdiction: 'City of Testville', since: c.date, party: 'Independent', elected: c.date, termEnd: '2030-01-01', margin: 5 }, approval: { overall: 52, party: 50, independent: 50, groups: {}, history: [] } as unknown as Career['approval'] });

describe('rival race feed', () => {
  it('active rivals post about the race; defeated rivals stay quiet', () => {
    const c = withCampaign(make());
    const items = rivalFeedItems(c);
    expect(items.map(i => i.author)).toEqual(['Rosa Ruiz']);
    expect(items[0]!.verified).toBe(true);
    expect(items[0]!.text).toMatch(/Mayor race|Testville/);
  });
  it('is deterministic and survives a save/load cycle unchanged', () => {
    const c = withCampaign(make());
    const loaded = parseCareer(JSON.stringify(c))!;
    expect(rivalFeedItems(loaded)).toEqual(rivalFeedItems(c));
  });
  it('a leading rival taunts; a trailing rival rallies', () => {
    const leading = rivalFeedItems(withCampaign(make()))[0]!.text;
    const trailing = rivalFeedItems(withCampaign(make(), { polls: [{ date: '2026-01-01', shares: { Ada: 50, 'Rosa Ruiz': 20, Undecided: 30 } }] }))[0]!.text;
    expect(leading).toMatch(/ahead|climbing/i);
    expect(trailing).toMatch(/closing the gap|slogans/i);
  });
  it('attack ads show up as an attack post naming the player', () => {
    const c = withCampaign(make(), { attack: 'Rosa Ruiz' });
    expect(rivalFeedItems(c)[0]!.text).toContain(handleOf(c));
  });
  it('no campaign means no rival posts', () => {
    expect(rivalFeedItems(make())).toEqual([]);
  });
});

describe('rival attacks and approval', () => {
  it('a fresh attack ad costs an officeholder 1 approval and hits the feed once', () => {
    const before = mayor(withCampaign(make()));
    const after = { ...before, campaign: { ...before.campaign!, attack: 'Rosa Ruiz' } };
    const once = mediaTurn(before, after, before.date, '2026-04-01').career;
    expect(once.approval!.overall).toBe(51);
    expect(socialOf(once).reactionFeed.some(f => f.about.includes('Rosa Ruiz'))).toBe(true);
    expect(mediaTurn(before, once, before.date, '2026-04-01').career).toBe(once);
  });
});

describe('profiles', () => {
  it('a rival profile shows their bio, policy and race', () => {
    const c = withCampaign(make());
    const p = profileFor(c, 'Rosa Ruiz');
    expect(p.verified).toBe(true);
    expect(p.bio).toContain('Former TV news anchor');
    expect(p.bio).toContain('Cut taxes for families');
    expect(p.posts.length).toBeGreaterThan(0);
    expect(p.portrait).toBe(2);
  });
  it('other authors get a generic public profile', () => {
    const p = profileFor(make(), 'Maria Lopez');
    expect(p.verified).toBe(false);
    expect(p.handle).toBe('@marialopez');
    expect(p.posts).toEqual([]);
  });
  it('activeRivals respects primary phase and dropouts', () => {
    const c = withCampaign(make(), { phase: 'primary', opponents: [rival('A', { primary: true }), rival('B', { primary: false })] });
    expect(activeRivals(c.campaign!).map(x => x.name)).toEqual(['A']);
  });
});
