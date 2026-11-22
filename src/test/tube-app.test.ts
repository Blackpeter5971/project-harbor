import { describe, it, expect } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { advanceTurn } from '@/lib/game/gameplay';
import {
  createChannel, uploadVideo, channelOf, tubeTurn, isMonetized, isTubeVerified, tier, estimatedQuarterEarnings,
  MAX_UPLOADS_PER_QUARTER, UPLOAD_ENERGY, projectVideo,
} from '@/lib/game/tube';
import type { TubeChannel } from '@/lib/game/tube-schema';
import { socialOf } from '@/lib/game/social-media';

const make = (): Career => { const c = createCareer({ ...defaultDraft, name: 'Ada' }, () => 0); return { ...c, life: { ...c.life!, energy: 100 }, actions: 75 }; };
const ok = (r: ReturnType<typeof createChannel>) => { if (!r.ok) throw new Error(r.message); return r.career; };
const withChannel = (c: Career, patch: Partial<TubeChannel>) => { const n = ok(createChannel(c, 'Ada Talks')); return { ...n, socialMedia: { ...socialOf(n), tube: { ...channelOf(n)!, ...patch } } }; };

describe('Crosstube', () => {
  it('creates one channel per career', () => {
    const c = ok(createChannel(make(), 'Ada Talks'));
    expect(channelOf(c)!.name).toBe('Ada Talks');
    expect(channelOf(c)!.subscribers).toBe(0);
    expect(createChannel(c, 'Again').ok).toBe(false);
  });
  it('posting costs 1 action and 15% energy and adds views, subs and comments', () => {
    const c = ok(createChannel(make(), 'Ada'));
    const n = ok(uploadVideo(c, 'geo'));
    const ch = channelOf(n)!;
    expect(n.actions).toBe(c.actions - 15);
    expect(ch.videos).toHaveLength(1);
    expect(ch.totalViews).toBeGreaterThan(0);
    expect(ch.subscribers).toBeGreaterThan(0);
    expect(ch.videos[0]!.comments.length).toBeGreaterThan(0);
  });
  it('limits uploads to 3 per quarter', () => {
    let c = ok(createChannel(make(), 'Ada'));
    for (let i = 0; i < MAX_UPLOADS_PER_QUARTER; i++) c = ok(uploadVideo(c, 'vlog'));
    expect(uploadVideo(c, 'vlog').ok).toBe(false);
  });
  it('subscriber growth scales with charisma and office', () => {
    const c = ok(createChannel(make(), 'Ada'));
    const charismatic = { ...c, skills: { ...c.skills, communication: c.skills.communication + 40 } };
    expect(projectVideo(charismatic, 'geo').subsGained).toBeGreaterThan(projectVideo(c, 'geo').subsGained);
    const governor = { ...c, office: { id: 'governor', title: 'Governor', jurisdiction: 'X', since: c.date, party: 'Independent', elected: c.date, termEnd: '2030-01-01', margin: 5 } } as Career;
    expect(projectVideo(governor, 'geo').views).toBeGreaterThan(projectVideo(c, 'geo').views);
  });
  it('monetization needs 10K subs and 4K watch hours; verification needs 100K subs', () => {
    const ch = channelOf(withChannel(make(), {}))!;
    expect(isMonetized({ ...ch, subscribers: 10_000, watchHours: 3_999 })).toBe(false);
    expect(isMonetized({ ...ch, subscribers: 9_999, watchHours: 4_000 })).toBe(false);
    expect(isMonetized({ ...ch, subscribers: 10_000, watchHours: 4_000 })).toBe(true);
    expect(isTubeVerified({ ...ch, subscribers: 99_999 })).toBe(false);
    expect(isTubeVerified({ ...ch, subscribers: 100_000 })).toBe(true);
    expect(tier({ ...ch, subscribers: 10_000 })).toBe('silver');
    expect(tier({ ...ch, subscribers: 100_000 })).toBe('gold');
  });
  it('pays ad revenue once per turn and not before monetization', () => {
    const poor = withChannel(make(), { subscribers: 500, watchHours: 100 });
    expect(tubeTurn(poor, poor.date, poor.date).career.money).toBe(poor.money);
    const c = withChannel(make(), { subscribers: 50_000, watchHours: 9_000 });
    const pay = estimatedQuarterEarnings(channelOf(c)!);
    expect(pay).toBeGreaterThan(0);
    const once = tubeTurn(c, c.date, c.date).career;
    expect(once.money).toBe(c.money + pay);
    expect(channelOf(once)!.earnings).toBe(pay);
    expect(tubeTurn(once, c.date, c.date).career.money).toBe(once.money);
  });
  it('silver award grants reputation once', () => {
    const c = withChannel(make(), { subscribers: 9_999, watchHours: 5_000 });
    const n = ok(uploadVideo(c, 'expose'));
    expect(channelOf(n)!.milestones).toContain('silver');
    expect(n.reputation).toBe(Math.min(200, c.reputation + 5));
  });
  it('the end-of-turn step still runs and pays the channel', () => {
    const c = withChannel(make(), { subscribers: 50_000, watchHours: 9_000 });
    const next = advanceTurn(c).career;
    expect(channelOf(next)!.earnings).toBeGreaterThan(0);
    expect(next.date).not.toBe(c.date);
  });
  it('old saves load without a channel', () => {
    const loaded = parseCareer(JSON.stringify(make()))!;
    expect(channelOf(loaded)).toBeNull();
  });
});
