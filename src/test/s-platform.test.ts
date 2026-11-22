import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { launchCampaign } from '@/lib/game/campaign';
import { advanceTurn } from '@/lib/game/gameplay';
import {
  socialOf, socialTurn, socialMediaSchema, markAllMessagesRead, deleteReadMessages, unreadMessages, threadsOf,
  FOLLOW_BATCH, MAX_CITIZEN_MENTIONS, type SocialMessage,
} from '@/lib/game/social-media';
import { replyToThread, repliedThisTurn } from '@/lib/game/media';
import { scandalSchema } from '@/lib/game/scandal-schema';
import { followerDemographics, toShares } from '@/lib/game/social-analytics';
import { monthsBefore } from '@/lib/game/social-context';

const base = (): Career => createCareer({ ...defaultDraft, name: 'Ada Stone' }, () => 0);
const msg = (id: string, threadId: string, read: boolean): SocialMessage => ({ id, date: '2026-01-01', threadId, from: threadId, role: 'Friend', kind: 'friend', portrait: '', text: id, read, fromMe: false });
const withInbox = (inbox: SocialMessage[]): Career => { const c = base(); return { ...c, socialMedia: socialMediaSchema.parse({ quarter: c.date, inbox }) }; };
const turn = (c: Career) => socialTurn(c, c.date, '2026-04-01').career;
const inboxText = (c: Career) => socialOf(c).inbox.map(m => `${m.from}: ${m.text}`).join('\n');

describe('S inbox controls', () => {
  it('Mark All as Read marks every message read without removing any', () => {
    const c = withInbox([msg('a', 't1', false), msg('b', 't2', false), msg('c', 't3', true)]);
    const n = markAllMessagesRead(c);
    expect(unreadMessages(socialOf(n))).toBe(0);
    expect(socialOf(n).inbox).toHaveLength(3);
  });
  it('Delete All Read removes only read messages and keeps unread ones', () => {
    const c = withInbox([msg('a', 't1', false), msg('b', 't2', true), msg('c', 't3', true)]);
    const n = deleteReadMessages(c);
    expect(socialOf(n).inbox.map(m => m.id)).toEqual(['a']);
    expect(deleteReadMessages(markAllMessagesRead(c)).socialMedia?.inbox).toEqual([]);
  });
  it('deleting a replied thread cannot unlock a second reply in the same turn', () => {
    const c = withInbox([msg('a', 't1', false)]);
    const replied = replyToThread(c, 't1', 'warm');
    if (!replied.ok) throw new Error(replied.message);
    expect(repliedThisTurn(replied.career, 't1')).toBe(true);
    const cleared = deleteReadMessages(replied.career);
    expect(replyToThread(cleared, 't1', 'warm').ok).toBe(false);
  });
});

describe('S spam throttle', () => {
  it(`batches small follower gains (under ${FOLLOW_BATCH}) instead of announcing every turn, while followers still grow`, () => {
    const c = { ...base(), reputation: 2, socialMedia: socialMediaSchema.parse({ followers: 400, engagement: 1, quarter: '2026-01-01' }) };
    const n = turn(c);
    expect(socialOf(n).followers).toBeGreaterThan(400);
    expect(socialOf(n).notifications.some(x => x.kind === 'follow')).toBe(false);
    expect(socialOf(n).pendingFollows).toBe(socialOf(n).followers - 400);
  });
  it(`allows at most ${MAX_CITIZEN_MENTIONS} generic citizen mention per turn`, () => {
    const c = { ...base(), socialMedia: socialMediaSchema.parse({ followers: 80_000, quarter: '2026-01-01' }) };
    const mentions = socialOf(turn(c)).notifications.filter(x => x.kind === 'mention' && !x.verified);
    expect(mentions.length).toBeLessThanOrEqual(MAX_CITIZEN_MENTIONS);
  });
  it('older saves without the new fields still load', () => {
    const c = withInbox([]);
    const raw = JSON.parse(JSON.stringify(c));
    delete raw.socialMedia.pendingFollows; delete raw.socialMedia.contextSent;
    const loaded = parseCareer(JSON.stringify(raw))!;
    expect(socialOf(loaded).pendingFollows).toBe(0);
    expect(socialOf(loaded).contextSent).toEqual([]);
  });
});

describe('S context-aware direct messages', () => {
  const race = (support: number) => {
    const start = { ...base(), date: '2027-07-01', money: 5000, reputation: 40, experience: 100, skills: { leadership: 30, communication: 30, knowledge: 30 } };
    const launched = launchCampaign(start, 'council', 'Our community', 'grassroots');
    if (!launched.ok) throw new Error(launched.message);
    const c = launched.career;
    return advanceTurn({ ...c, campaign: { ...c.campaign!, electionDate: '2027-08-01', support } }).career;
  };
  it('an election loss brings sympathetic messages and a coffee invite', () => {
    const lost = race(-1000);
    expect(lost.elections[0]?.won).toBe(false);
    const text = inboxText(lost);
    expect(text).toMatch(/Linda Okafor: .*(stings|Hard night)/);
    expect(text).toMatch(/[Cc]offee/);
    expect(text).not.toMatch(/Congratulations|WE DID IT/);
  });
  it('an election victory brings congratulations, not sympathy', () => {
    const won = race(1000);
    expect(won.elections[0]?.won).toBe(true);
    const text = inboxText(won);
    expect(text).toMatch(/Linda Okafor: .*(Congratulations|What a night)/);
    expect(text).not.toMatch(/sorry|stings|Hard night/);
  });
  it('a major scandal brings a journalist inquiry and mentor advice, once', () => {
    const c = { ...base(), reputation: 30, scandals: [scandalSchema.parse({ id: 's1', tenure: 't', date: '2026-01-01', subject: 'Ada Stone', allegation: 'x', status: 'alleged', title: 'Contract steering claim', severity: 'Severe', phase: 'Active' })] };
    const n = turn(c);
    const s = socialOf(n);
    expect(s.inbox.some(m => m.kind === 'press' && m.text.length > 0)).toBe(true);
    expect(s.inbox.some(m => m.from === 'Nora Castillo' || m.role.includes('Mentor'))).toBe(true);
    expect(s.contextSent).toContain('scandal|s1');
    const again = socialTurn({ ...n, date: '2026-04-01' }, '2026-04-01', '2026-07-01').career;
    expect(socialOf(again).inbox.filter(m => m.kind === 'press')).toHaveLength(1);
  });
  it('minor scandals do not trigger press demands', () => {
    const c = { ...base(), reputation: 30, scandals: [scandalSchema.parse({ id: 's2', tenure: 't', date: '2026-01-01', subject: 'Ada Stone', allegation: 'x', status: 'alleged', severity: 'Minor', phase: 'Emerging' })] };
    expect(socialOf(turn(c)).inbox.some(m => m.kind === 'press')).toBe(false);
  });
  it('a passed bill brings congratulations from the affected group', () => {
    const c0 = base();
    const bill = { id: 'b1', tenure: 't', title: 'Small Business Relief Act', kind: 'bill' as const, policy: 'business' as const, stage: 'passed' as const, date: '2026-01-01', cost: 0, revision: 0, boost: 0, attempts: 1, support: null, chamberVotes: [], history: [{ date: '2026-01-01', text: 'Enacted' }], budget: null };
    const n = turn({ ...c0, reputation: 30, bills: [bill] });
    const m = socialOf(n).inbox.find(x => x.from === 'Victor Lang');
    expect(m?.text).toContain('Small Business Relief Act');
  });
  it('contextual replies from the press have their own options', () => {
    const c = withInbox([{ ...msg('p', 'press-tribune', false), kind: 'press' }]);
    const r = replyToThread(c, 'press-tribune', 'brief');
    expect(r.ok).toBe(true);
    expect(threadsOf(socialOf(r.ok ? r.career : c))[0]?.messages.at(-1)?.text).toMatch(/declined to comment/);
  });
  it('monthsBefore steps back across years', () => {
    expect(monthsBefore('2026-01-01', 3)).toBe('2025-10-01');
  });
});

describe('S Professional Dashboard', () => {
  it('demographic shares always add up to 100%', () => {
    const d = followerDemographics({ ...base(), socialMedia: socialMediaSchema.parse({ followers: 48_000 }) });
    for (const list of [d.blocs, d.ages, d.locations]) expect(list.reduce((t, x) => t + x.pct, 0)).toBe(100);
    expect(toShares([['a', 1], ['b', 1], ['c', 1]]).map(x => x.pct)).toEqual([34, 33, 33]);
  });
});
