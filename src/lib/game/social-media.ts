import { POST_COST } from './energy-costs';
import { z } from 'zod';
import type { Career } from './career';
import { contextMessages } from './social-context';
import { tubeChannelSchema } from './tube-schema';
import { podcastShowSchema } from './podcasts-schema';
import { dispatchSchema, kioskSchema } from './dispatch-schema';
import { heartbeatSchema } from './heartbeat-schema';

/**
 * S — the in-game political social platform. Pure, browser-safe.
 * Posts spend turn energy (career.actions, POST_COST). A per-quarter post cap
 * and diminishing returns keep energy from becoming a substitute for main turn actions.
 * socialTurn (called once per turn from advanceTurn, guarded by lastTurn) grows followers,
 * delivers mentions, inbox messages, verification, monetization and creator payouts.
 */
export const postTypes = [
  { id: 'campaign', label: 'Campaign Update', template: 'Out knocking doors today — every conversation reminds me why we are running. #OnTheTrail' },
  { id: 'policy', label: 'Policy Stance', template: 'My position is clear: practical solutions over partisan noise. Here is the plan. 🧵' },
  { id: 'rebuttal', label: 'Rebuttal', template: 'Let’s set the record straight. The facts tell a very different story than my opponents claim.' },
  { id: 'praise', label: 'Community Praise', template: 'Huge thanks to the volunteers and local businesses who keep this community strong. 🙌' },
] as const;
export type PostType = typeof postTypes[number]['id'];

export const reactionSchema = z.object({ author: z.string(), handle: z.string(), role: z.enum(['citizen', 'opposition', 'party', 'press']), verified: z.boolean().default(false), text: z.string(), likes: z.number().default(0) });
export type Reaction = z.infer<typeof reactionSchema>;
const postSchema = z.object({ id: z.string(), date: z.string(), type: z.string(), text: z.string(), likes: z.number(), reposts: z.number(), replies: z.number(), followersGained: z.number(), views: z.number().default(0), reactions: z.array(reactionSchema).default([]), controversial: z.boolean().default(false) });
const feedItemSchema = reactionSchema.extend({ id: z.string(), date: z.string(), about: z.string(), reposts: z.number().default(0), replies: z.number().default(0), views: z.number().default(0) });
export type ReactionFeedItem = z.infer<typeof feedItemSchema>;
const broadcastSchema = z.object({ id: z.string(), date: z.string(), kind: z.enum(['radio', 'tv']), outlet: z.string(), show: z.string(), topic: z.string(), topicKind: z.enum(['crisis', 'campaign', 'bill', 'office', 'profile', 'scandal', 'project', 'economy', 'election']) });
export type BroadcastRequest = z.infer<typeof broadcastSchema>;
const notificationSchema = z.object({
  id: z.string(), date: z.string(), kind: z.enum(['mention', 'follow', 'verified', 'monetized', 'payout']),
  author: z.string().default(''), handle: z.string().default(''), verified: z.boolean().default(false),
  tone: z.enum(['praise', 'callout', 'neutral']).default('neutral'), text: z.string(),
  likes: z.number().default(0), reposts: z.number().default(0), replies: z.number().default(0), views: z.number().default(0),
  read: z.boolean().default(false),
});
const messageSchema = z.object({
  id: z.string(), date: z.string(), threadId: z.string(), from: z.string(), role: z.string(),
  kind: z.enum(['family', 'friend', 'elite', 'press']), portrait: z.string().default(''), text: z.string(), read: z.boolean().default(false), fromMe: z.boolean().default(false),
});

export const socialMediaSchema = z.object({
  followers: z.number().nonnegative().default(0),
  /** Engagement rate of recent posts, 0–100. */
  engagement: z.number().min(0).max(100).default(0),
  quarter: z.string().default(''),
  quarterPosts: z.number().int().nonnegative().default(0),
  typeUses: z.record(z.string(), z.number().int().nonnegative()).default({}),
  posts: z.array(postSchema).default([]),
  notifications: z.array(notificationSchema).default([]),
  inbox: z.array(messageSchema).default([]),
  /** Turn-start date of the last processed turn; prevents replaying growth, messages or payouts. */
  lastTurn: z.string().default(''),
  verifiedSince: z.string().nullable().default(null),
  monetizedSince: z.string().nullable().default(null),
  earnings: z.number().nonnegative().default(0),
  /** Phase 3B: reactions to turn events, broadcast requests and owned-media use. */
  reactionFeed: z.array(feedItemSchema).default([]),
  lastMediaTurn: z.string().default(''),
  broadcast: broadcastSchema.nullable().default(null),
  broadcastHistory: z.array(z.object({ id: z.string(), date: z.string(), kind: z.enum(['radio', 'tv', 'newspaper']), outlet: z.string(), point: z.string(), outcome: z.string(), good: z.boolean() })).default([]),
  coverageQuarter: z.string().default(''),
  /** Spam throttle: new followers not yet announced in a batched follow notification. */
  pendingFollows: z.number().nonnegative().default(0),
  /** Event keys (election, scandal, bill, project) that already produced a contextual DM. */
  contextSent: z.array(z.string()).default([]),
  /** Media Hub: story|channel keys already answered or declined, and the last quarter each channel was used. */
  hubAnswered: z.array(z.string()).default([]),
  hubUsed: z.record(z.string(), z.string()).default({}),
  /** Post ids the player liked or reposted (toggle state). */
  liked: z.array(z.string()).default([]),
  reposted: z.array(z.string()).default([]),
  /** Achievement keys already shared or dismissed, so each milestone prompts once. */
  achievementsHandled: z.array(z.string()).default([]),
  /** Crosstube creator channel (null until created). */
  tube: tubeChannelSchema.nullable().default(null),
  /** CrossiaPod show (null until created). */
  podcasts: podcastShowSchema.nullable().default(null),
  /** Dispatch mail inbox and Magazines kiosk (null until first delivery). */
  dispatch: dispatchSchema.nullable().default(null),
  kiosk: kioskSchema.nullable().default(null),
  /** HeartBeat dating app (null until the first saved decision). */
  heartbeat: heartbeatSchema.nullable().default(null),
});
export type SocialMedia = z.infer<typeof socialMediaSchema>;
export type SocialPost = SocialMedia['posts'][number];
export type SocialNotification = SocialMedia['notifications'][number];
export type SocialMessage = SocialMedia['inbox'][number];

export const POST_ENERGY_COST = POST_COST;
export const MAX_POSTS_PER_QUARTER = 4;
export const MAX_POST_LENGTH = 280;
/** Spam throttle: follows are announced in batches of at least this many (or 2% of followers). */
export const FOLLOW_BATCH = 50;
/** Spam throttle: at most this many generic (citizen) mentions per turn; press and rivals are unaffected. */
export const MAX_CITIZEN_MENTIONS = 1;
export const followBatch = (followers: number) => Math.max(FOLLOW_BATCH, Math.round(followers * 0.02));
/** Blue badge: this many followers, or holding (or having held) one of these offices. */
export const VERIFIED_FOLLOWERS = 500_000;
export const VERIFIED_OFFICES = ['mayor', 'stateLeg', 'house', 'governor', 'senate', 'president'];
/** Creator monetization: both thresholds must be met. */
export const MONETIZE_FOLLOWERS = 10_000;
export const MONETIZE_ENGAGEMENT = 3;
/** Creator revenue in dollars per 1,000 views on the player's own posts. */
export const CREATOR_RPM = 4;
/** People start tagging the player once popular (or in office / running). */
export const POPULAR_FOLLOWERS = 5_000;

const OFFICE_REACH: Record<string, number> = { council: 400, mayor: 3_000, stateLeg: 2_500, house: 12_000, governor: 40_000, senate: 50_000, president: 600_000 };
const CAP = { posts: 30, notifications: 40, inbox: 40 };

const empty = (): SocialMedia => socialMediaSchema.parse({});

/** Quarter key: posting limits reset on each 3-month turn (career.date is always the quarter start). */
export const socialOf = (c: Career): SocialMedia => {
  const s = c.socialMedia ?? empty();
  return s.quarter === c.date ? s : { ...s, quarter: c.date, quarterPosts: 0, typeUses: {} };
};
export const energyOf = (c: Career) => c.actions;
export const handleOf = (c: Career) => '@' + c.character.name.replace(/[^a-z0-9]/gi, '').toLowerCase();
const inOffice = (c: Career) => !!c.office && (!c.office.termEnd || c.date < c.office.termEnd);

export const qualifiesForVerification = (c: Career, followers = socialOf(c).followers) =>
  followers >= VERIFIED_FOLLOWERS || (inOffice(c) && VERIFIED_OFFICES.includes(c.office!.id)) || (c.termHistory ?? []).some(t => VERIFIED_OFFICES.includes(t.office.id));
export const isVerified = (c: Career) => socialOf(c).verifiedSince !== null || qualifiesForVerification(c);
export const monetizationEligible = (s: SocialMedia) => s.followers >= MONETIZE_FOLLOWERS && s.engagement >= MONETIZE_ENGAGEMENT;
export const followingOf = (c: Career) => Math.round(120 + c.contacts * 4 + (c.life?.social?.contacts.length ?? 0) * 3);
export const unreadNotifications = (s: SocialMedia) => s.notifications.filter(n => !n.read).length;
export const unreadMessages = (s: SocialMedia) => s.inbox.filter(m => !m.read).length;
export const postViews = (p: SocialPost) => p.views || Math.round(p.likes * 25 + 40);

/** Diminishing returns: each post this quarter weakens the next; repeating a type halves it. */
export const postFactor = (s: SocialMedia, type: PostType) => (1 / (1 + s.quarterPosts)) * ((s.typeUses[type] ?? 0) > 0 ? 0.5 : 1);

const hash = (t: string) => { let h = 2166136261; for (const ch of t) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };
const pick = <T,>(list: readonly T[], seed: string): T => list[Math.floor(hash(seed) * list.length) % list.length]!;

export function postBlock(c: Career, type: PostType): string | null {
  const s = socialOf(c);
  if (type === 'campaign' && !c.campaign) return 'Campaign updates need an active campaign.';
  if (s.quarterPosts >= MAX_POSTS_PER_QUARTER) return `Posting limit reached (${MAX_POSTS_PER_QUARTER} per quarter). Advance time to post again.`;
  if (energyOf(c) < POST_ENERGY_COST) return `Not enough energy (${POST_ENERGY_COST}% needed). Advance the turn or recharge in Life.`;
  return null;
}

export function previewPost(c: Career, type: PostType) {
  const s = socialOf(c), f = postFactor(s, type);
  const reach = 20 + c.reputation * 2 + c.skills.communication * 3 + Math.sqrt(s.followers) * 2;
  return { factor: f, followers: Math.round(reach * f), communication: Math.round(0.3 * f * 100) / 100 };
}

export type PostResult = { ok: true; career: Career; message: string } | { ok: false; message: string };
export function publishPost(c: Career, type: PostType, text: string): PostResult {
  const t = postTypes.find(p => p.id === type);
  if (!t) return { ok: false, message: 'Choose a statement type.' };
  const body = text.trim().slice(0, MAX_POST_LENGTH) || t.template;
  const block = postBlock(c, type);
  if (block) return { ok: false, message: block };
  const s = socialOf(c), p = previewPost(c, type);
  const roll = hash(`${c.character.name}|${c.date}|${s.quarterPosts}|${type}`);
  const engagement = Math.round(Math.min(100, (4 + c.skills.communication * 0.3 + roll * 6) * (0.5 + p.factor * 0.5)) * 10) / 10;
  const audience = Math.max(10, s.followers + p.followers);
  const likes = Math.round(audience * engagement / 100 * 3), reposts = Math.round(likes * 0.2), replies = Math.round(likes * 0.12);
  const views = Math.round(audience * (1.2 + roll * 1.8)) + likes;
  const post: SocialPost = { id: `${c.date}-${s.quarterPosts}-${type}`, date: c.date, type, text: body, likes, reposts, replies, followersGained: p.followers, views, reactions: [], controversial: false };
  const social: SocialMedia = { ...s, followers: s.followers + p.followers, engagement: Math.round((s.engagement * 0.6 + engagement * 0.4) * 10) / 10, quarterPosts: s.quarterPosts + 1, typeUses: { ...s.typeUses, [type]: (s.typeUses[type] ?? 0) + 1 }, posts: [post, ...s.posts].slice(0, CAP.posts) };
  const comm = Math.min(100, Math.round((c.skills.communication + p.communication) * 100) / 100);
  return { ok: true, message: `Posted. −${POST_ENERGY_COST}% energy.`, career: { ...c, actions: Math.max(0, c.actions - POST_ENERGY_COST), socialMedia: social, skills: { ...c.skills, communication: comm } } };
}

export const markNotificationsRead = (c: Career): Career => {
  const s = socialOf(c);
  return unreadNotifications(s) ? { ...c, socialMedia: { ...s, notifications: s.notifications.map(n => n.read ? n : { ...n, read: true }) } } : c;
};
/** Inbox controls: mark every message read, or remove read messages (unread ones always stay). */
export const markAllMessagesRead = (c: Career): Career => {
  const s = socialOf(c);
  return unreadMessages(s) ? { ...c, socialMedia: { ...s, inbox: s.inbox.map(m => m.read ? m : { ...m, read: true }) } } : c;
};
export const readMessageCount = (s: SocialMedia) => s.inbox.filter(m => m.read).length;
export const deleteReadMessages = (c: Career): Career => {
  const s = socialOf(c);
  return readMessageCount(s) ? { ...c, socialMedia: { ...s, inbox: s.inbox.filter(m => !m.read) } } : c;
};
export const markThreadRead = (c: Career, threadId: string): Career => {
  const s = socialOf(c);
  return s.inbox.some(m => m.threadId === threadId && !m.read) ? { ...c, socialMedia: { ...s, inbox: s.inbox.map(m => m.threadId === threadId ? { ...m, read: true } : m) } } : c;
};

/** Messages grouped by sender, newest thread first. */
export function threadsOf(s: SocialMedia) {
  const map = new Map<string, SocialMessage[]>();
  for (const m of [...s.inbox].sort((a, b) => b.date.localeCompare(a.date))) map.set(m.threadId, [...(map.get(m.threadId) ?? []), m]);
  return [...map.entries()].map(([id, msgs]) => ({ id, latest: msgs.find(m => !m.fromMe) ?? msgs[0]!, last: msgs[0]!, messages: [...msgs].reverse(), unread: msgs.filter(m => !m.read).length }));
}

// ---------------------------------------------------------------- generated accounts
export const citizens = [
  ['Maria Lopez', '@marialopez_'], ['Jamal Carter', '@jcarter88'], ['Hannah Kim', '@hannahk'], ['Tom Becker', '@tombecker'], ['Priya Nair', '@priyanair'],
  ['Luis Ortega', '@lortega'], ['Grace Whitman', '@gracew'], ['Andre Lewis', '@andrelewis'], ['Megan O’Neil', '@megoneil'], ['Sam Park', '@sampark'],
  ['Ruth Adler', '@ruthadler'], ['Diego Ramos', '@diegor'], ['Carla Jensen', '@carlaj'], ['Kevin Moss', '@kmoss'], ['Nia Brooks', '@niabrooks'],
] as const;
const press = (c: Career) => [
  [`${c.character.state} Tribune`, '@' + c.character.state.replace(/\s/g, '').toLowerCase() + 'trib'],
  ['Capitol Report', '@capitolreport'], ['Metro Watch', '@metrowatch'],
] as const;
const elites = [
  { id: 'elite-chair', name: 'Linda Okafor', role: 'State Party Chair' },
  { id: 'elite-senator', name: 'Sen. Robert Hale', role: 'State Senator' },
  { id: 'elite-donor', name: 'Marcus Bell', role: 'Major Donor' },
  { id: 'elite-union', name: 'Teresa Quinn', role: 'Union President' },
  { id: 'elite-chamber', name: 'Victor Lang', role: 'Chamber of Commerce' },
  { id: 'elite-strategist', name: 'Nora Castillo', role: 'Political Strategist' },
] as const;

/** Sentiment toward the player, 0–100: approval while in office, otherwise reputation-based. */
const sentimentOf = (c: Career) => inOffice(c) && c.approval ? c.approval.overall : Math.min(85, 40 + c.reputation * 0.5);

function mentionText(c: Career, tone: 'praise' | 'callout', seed: string) {
  const h = handleOf(c), o = inOffice(c) ? c.office! : null, place = o?.jurisdiction ?? c.character.state;
  const praise = o ? [
    `Credit where it’s due: ${h} actually delivered for ${place}. This is what a ${o.title} should look like. 👏`,
    `Went to the town hall tonight. ${h} stayed until every question was answered. Respect.`,
    `The new budget from ${h} funds what matters. Finally. #${place.replace(/[^a-z]/gi, '')}`,
    `Say what you want, but ${h} has been one of the hardest-working officials we’ve had in years.`,
  ] : [
    `Just heard ${h} speak. Real ideas, no slogans. Keep an eye on this one.`,
    `${h} is the kind of voice ${c.character.state} politics has been missing. 🙌`,
    `Following ${h} for a while now. Consistent, honest, and actually shows up.`,
  ];
  const callout = o ? [
    `${h} promised lower costs. Rent in ${place} is up again. What exactly are you doing as ${o.title}? #Accountability`,
    `Still waiting on that answer, ${h}. Our streets haven’t been fixed since you took office.`,
    `Hey ${h}, maybe spend less time posting and more time governing. ${place} deserves better.`,
    `${h} skipped the community meeting again. Not a good look for a ${o.title}.`,
  ] : [
    `Who is funding ${h}? Asking for ${c.character.state}.`,
    `${h} talks a big game online. Let’s see a real plan.`,
    `Not convinced by ${h}. Lots of noise, little substance.`,
  ];
  return pick(tone === 'praise' ? praise : callout, seed);
}

function messageFor(c: Career, kind: 'family' | 'friend' | 'elite', who: string, seed: string) {
  const o = inOffice(c) ? c.office! : null, run = c.campaign, low = sentimentOf(c) < 45;
  if (kind === 'family') return pick(o ? [`Everyone at church keeps asking about you, ${o.title}! We’re so proud. Call us this weekend? ❤️`, `Saw you in the paper again. Are you eating properly with all this work?`, `Don’t let the comments online get to you. We know who you are.`]
    : run ? [`We put your sign in the front yard! Neighbours are asking about the ${run.title} race.`, `Proud of you for running. Don’t forget to sleep.`]
    : [`Dinner on Sunday? You’ve been so busy lately.`, `Just checking in. How are you really doing?`, `Your old teacher asked about you today. Said she always knew you’d go places.`], seed);
  if (kind === 'friend') return pick(o ? [`Look at you, ${o.title}! Drinks when you get a free evening — my treat.`, `Saw someone tag you online. Want me to share the good one? 😄`, `Real talk: people at work are loving what you’re doing.`]
    : run ? [`Count me in for door knocking Saturday. Need anything else for the campaign?`, `Your last post was everywhere today. Nice work!`]
    : [`Game night Friday? Bring snacks.`, `Haven’t heard from you in a while. Everything good?`], seed);
  if (low) return pick([`Your numbers are slipping. We should talk strategy before it gets worse. — ${who}`, `The online chatter isn’t great. Let’s get ahead of it this week.`, `Some of our people are nervous. A call would reassure them.`], seed);
  return pick(o ? [`Congratulations on the work so far. Let’s meet before the next budget vote.`, `Strong showing this quarter. The party has noticed — keep it up.`, `We’d like your support on an upcoming bill. Can my office reach yours?`]
    : run ? [`Watching your race closely. If you need introductions to donors, let me know.`, `Good momentum. Stay disciplined on message and we’ll talk soon.`]
    : [`Your profile is rising. Ever thought about running for office?`, `Liked your recent posts. Coffee sometime to talk about the party’s plans?`], seed);
}

/** Once-per-turn social processing. Pure and idempotent through socialMedia.lastTurn. */
export function socialTurn(c: Career, start: string, end: string): { career: Career; notices: string[] } {
  const active = c.socialMedia || inOffice(c) || c.campaign || c.reputation >= 20 || c.elections.some(e => e.date >= start && e.date < end);
  if (!active) return { career: c, notices: [] };
  const raw = c.socialMedia ?? empty();
  if (raw.lastTurn && raw.lastTurn >= start) return { career: c, notices: [] };
  const seed = `${c.character.name}|${start}`;
  const posted = raw.posts.filter(p => p.date === start);
  const notices: string[] = [];
  const notes: SocialNotification[] = [];
  const note = (n: Pick<SocialNotification, 'id' | 'date' | 'kind' | 'text'> & Partial<SocialNotification>) =>
    notes.push(notificationSchema.parse({ ...n, read: false }));

  // Organic follower growth.
  const reach = inOffice(c) ? (OFFICE_REACH[c.office!.id] ?? 0) * (0.5 + (c.approval?.overall ?? 50) / 100) : 0;
  const activity = posted.length ? 1 + posted.length * 0.15 : 0.35;
  const organic = raw.followers * 0.03 * activity * Math.min(1.6, 0.6 + raw.engagement / 10);
  const campaign = c.campaign ? 300 + Math.max(0, c.campaign.support) * 40 : 0;
  const gained = Math.max(0, Math.round((organic + reach + campaign + Math.max(0, c.reputation) * 6 * activity) * (0.85 + hash(seed + 'grow') * 0.3)));
  const followers = raw.followers + gained;
  const engagement = posted.length ? raw.engagement : Math.round(raw.engagement * 0.85 * 10) / 10;
  // Spam throttle: small follower gains accumulate silently and are announced together once they add up.
  let pendingFollows = raw.pendingFollows + gained;
  if (gained > 0 && (raw.followers === 0 || pendingFollows >= followBatch(raw.followers))) {
    const [name] = pick(citizens, seed + 'follow'), total = Math.round(pendingFollows);
    note({ id: `${start}-follow`, date: end, kind: 'follow', author: name, text: total > 1 ? `${name} and ${(total - 1).toLocaleString('en-US')} others followed you` : `${name} followed you` });
    pendingFollows = 0;
  }

  // Mentions: the public tags the player once popular, in office or running.
  if (followers >= POPULAR_FOLLOWERS || inOffice(c) || c.campaign) {
    const count = 1 + (followers >= 50_000 ? 1 : 0) + (inOffice(c) ? 1 : 0);
    const mood = sentimentOf(c) / 100;
    const recentTexts = new Set(raw.notifications.slice(0, 8).map(x => x.text));
    let citizenMentions = 0;
    for (let i = 0; i < count; i++) {
      const s = `${seed}|m${i}`, tone = hash(s + 'tone') < mood ? 'praise' as const : 'callout' as const;
      const isPress = hash(s + 'press') < 0.25, rival = c.campaign?.opponents.find(o => !o.out);
      const fromRival = !isPress && tone === 'callout' && !!rival && hash(s + 'rival') < 0.35;
      const [author, handle] = isPress ? pick(press(c), s) : fromRival ? [rival!.name, '@' + rival!.name.replace(/[^a-z]/gi, '').toLowerCase()] as const : pick(citizens, s);
      const text = mentionText(c, tone, s);
      // Spam throttle: one generic citizen tag per turn, and never the same line twice in a row.
      if (recentTexts.has(text) || (!isPress && !fromRival && citizenMentions >= MAX_CITIZEN_MENTIONS)) continue;
      if (!isPress && !fromRival) citizenMentions++;
      recentTexts.add(text);
      const aud = Math.max(200, followers * (0.02 + hash(s + 'aud') * 0.08));
      const likes = Math.round(aud * (0.05 + hash(s + 'l') * 0.1));
      note({ id: `${start}-m${i}`, date: end, kind: 'mention', author, handle, verified: isPress, tone, text, likes, reposts: Math.round(likes * 0.18), replies: Math.round(likes * 0.1), views: Math.round(aud * 3) });
    }
  }

  // Verification and monetization milestones.
  let verifiedSince = raw.verifiedSince, monetizedSince = raw.monetizedSince, earnings = raw.earnings, money = c.money, ledger = c.ledger;
  if (!verifiedSince && qualifiesForVerification(c, followers)) {
    verifiedSince = end;
    const why = followers >= VERIFIED_FOLLOWERS ? `passing ${VERIFIED_FOLLOWERS.toLocaleString('en-US')} followers` : 'holding public office';
    note({ id: `${start}-verified`, date: end, kind: 'verified', text: `Your account is now verified for ${why}. Your S checkmark is live.` });
    notices.push('S: your account is now verified with a checkmark.');
  }
  if (monetizedSince && monetizedSince <= start) {
    const views = posted.reduce((t, p) => t + postViews(p), 0), payout = Math.round(views / 1000 * CREATOR_RPM);
    if (payout > 0) {
      money += payout; earnings += payout;
      ledger = [{ month: start, label: 'Creator revenue · S', amount: payout }, ...ledger];
      note({ id: `${start}-payout`, date: end, kind: 'payout', text: `You earned $${payout.toLocaleString('en-US')} in creator revenue from ${views.toLocaleString('en-US')} views.` });
      notices.push(`Creator revenue: $${payout.toLocaleString('en-US')} paid to personal savings.`);
    }
  }
  if (!monetizedSince && monetizationEligible({ ...raw, followers, engagement })) {
    monetizedSince = end;
    note({ id: `${start}-monetized`, date: end, kind: 'monetized', text: `Your account is now monetized. Posts earn creator revenue from views starting next quarter.` });
    notices.push('S: your account is now monetized.');
  }

  // Inbox: friends, family and (when politically active) the political elite.
  const context = contextMessages(c, start, end, raw.contextSent);
  const msgs: SocialMessage[] = [...context.messages];
  const contacted = new Set(msgs.map(m => m.threadId));
  const social = c.life?.social;
  const kindOf = (id: string, role: string) => id === 'parents' || id === 'sibling' || role === 'Spouse' || role === 'Partner' ? 'family' as const : id === 'confidant' || id === 'organizer' || id === 'mentor' ? 'friend' as const : null;
  const people = [...(social?.partner ? [{ ...social.partner, role: social.maritalStatus === 'married' ? 'Spouse' : 'Partner' }] : []), ...(social?.contacts ?? []).filter(p => p.status !== 'estranged')]
    .filter(p => kindOf(p.archetypeId, p.role));
  if (people.length && hash(seed + 'dm') < 0.85) {
    const p = pick(people, seed + 'who'), kind = kindOf(p.archetypeId, p.role)!;
    if (!contacted.has(p.id)) msgs.push({ id: `${start}-dm-${p.id}`, date: end, threadId: p.id, from: p.name, role: p.role, kind, portrait: p.portrait, text: messageFor(c, kind, p.name, seed + p.id), read: false, fromMe: false });
  }
  // Generic elite check-ins give way to contextual messages so the inbox isn't padded with filler.
  if (!context.messages.length && (inOffice(c) || c.campaign || c.position !== 'none' || followers >= 10_000)) {
    const e = pick(elites, seed + 'elite');
    msgs.push({ id: `${start}-dm-${e.id}`, date: end, threadId: e.id, from: e.name, role: e.role, kind: 'elite', portrait: '', text: messageFor(c, 'elite', e.name, seed + e.id), read: false, fromMe: false });
  }

  const next: SocialMedia = {
    ...raw, followers, engagement, lastTurn: start, verifiedSince, monetizedSince, earnings, pendingFollows,
    contextSent: [...context.keys, ...raw.contextSent].slice(0, 80),
    notifications: [...notes.reverse(), ...raw.notifications].slice(0, CAP.notifications),
    inbox: [...msgs, ...raw.inbox].slice(0, CAP.inbox),
  };
  return { career: { ...c, money, ledger, socialMedia: next }, notices };
}

/** Background timeline posts for the current quarter. Derived, never saved. */
export function ambientPosts(c: Career) {
  const st = c.character.state, tag = st.replace(/\s/g, '');
  const lines = [
    `Turnout in ${st} could break records this cycle. Early registration numbers are up sharply. #${tag}Votes`,
    `City budget hearings start next week. Expect a fight over road repairs and school funding.`,
    `New poll: voters say cost of living is their top issue heading into the next election.`,
    `Our local diner has been open 40 years today. This is what community looks like. ☕`,
    `Traffic on the interstate is a nightmare again. Someone in charge please fix the merge lanes.`,
    `Breaking: the state legislature returns from recess with a packed agenda. #${tag}Politics`,
    `Volunteers cleaned up three parks this weekend. Huge thanks to everyone who showed up. 🌳`,
  ];
  return [0, 1, 2].map(i => {
    const s = `${c.character.name}|${c.date}|amb${i}`, isPress = i === 0 || hash(s + 'p') < 0.3;
    const [author, handle] = isPress ? pick(press(c), s) : pick(citizens, s);
    const likes = Math.round(80 + hash(s + 'l') * 4000);
    const image = hash(s + 'img') < 0.45 ? pick(POST_IMAGES, s + 'which') : undefined;
    return { id: `amb-${c.date}-${i}`, date: c.date, image, author, handle, verified: isPress, text: lines[(Math.floor(hash(`${c.character.name}|${c.date}|amb`) * lines.length) + i * 2) % lines.length]!, likes, reposts: Math.round(likes * 0.2), replies: Math.round(likes * 0.08), views: Math.round(likes * (30 + hash(s + 'v') * 40)), press: isPress };
  });
}

/** Image keys NPC posts may attach; the UI maps them to bundled photos. */
export const POST_IMAGES = ['rally', 'press', 'capitol', 'debate', 'signing', 'trail'] as const;
export type PostImage = typeof POST_IMAGES[number];

const toggle = (list: string[], id: string) => list.includes(id) ? list.filter(x => x !== id) : [id, ...list].slice(0, 300);
export const toggleLike = (c: Career, id: string): Career => { const s = socialOf(c); return { ...c, socialMedia: { ...s, liked: toggle(s.liked, id) } }; };
export const toggleRepost = (c: Career, id: string): Career => { const s = socialOf(c); return { ...c, socialMedia: { ...s, reposted: toggle(s.reposted, id) } }; };

export type Achievement = { key: string; kind: 'election' | 'inauguration' | 'bill' | 'budget' | 'project'; title: string; text: string; date: string };
const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

/** Recent unshared political milestones, newest first (max 3). Derived from the career, never saved. */
export function pendingAchievements(c: Career): Achievement[] {
  const s = socialOf(c), done = new Set(s.achievementsHandled), out: Achievement[] = [];
  for (const e of c.elections) if (e.won && e.stage !== 'primary') out.push({ key: `elect-${e.date}-${e.office}`, kind: 'election', date: e.date, title: `Won the race for ${e.title}`, text: `Humbled and grateful. Tonight the people of ${e.jurisdiction} chose me as their ${e.title}. The work starts now. 🗳️ #Victory` });
  if (c.office?.since) out.push({ key: `inaug-${c.office.since}-${c.office.id}`, kind: 'inauguration', date: c.office.since, title: `Sworn in as ${c.office.title}`, text: `Today I took the oath as ${c.office.title} of ${c.office.jurisdiction}. I will serve every resident, whether they voted for me or not. 🇺🇸` });
  for (const b of c.bills) if (b.stage === 'passed') out.push(b.kind === 'budget'
    ? { key: `bill-${b.id}`, kind: 'budget', date: b.date, title: `Signed the ${b.title}`, text: `Signed: ${b.title}. A balanced plan that funds what matters. Promises made, promises kept. ✍️` }
    : { key: `bill-${b.id}`, kind: 'bill', date: b.date, title: `Passed the ${b.title}`, text: `It's official: the ${b.title} has passed. Proud of everyone who fought for it. ✅` });
  const projects = [...(c.city?.publicProjects ?? []), ...(c.stateGovernment?.publicProjects ?? []), ...(c.federalGovernment?.publicProjects ?? [])];
  for (const p of projects) if (p.status === 'completed') out.push({ key: `proj-${p.id}`, kind: 'project', date: c.date, title: `Completed ${p.name}`, text: `Ribbon cut! ${p.name} is finished and open to the public. This is what delivery looks like. 🏗️` });
  return out.filter(a => !done.has(a.key) && monthsBetween(a.date, c.date) <= 6).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
}

export function shareAchievement(c: Career, key: string): PostResult {
  const a = pendingAchievements(c).find(x => x.key === key);
  if (!a) return { ok: false, message: 'That milestone was already shared.' };
  const s = socialOf(c), audience = Math.max(200, s.followers), roll = hash(`${c.character.name}|${key}`);
  const likes = Math.round(audience * (0.08 + roll * 0.07)), followers = Math.round(audience * 0.03) + 25;
  const post: SocialPost = { id: `ach-${key}`, date: c.date, type: 'achievement', text: a.text, likes, reposts: Math.round(likes * 0.3), replies: Math.round(likes * 0.1), followersGained: followers, views: Math.round(audience * 2.5) + likes, reactions: [], controversial: false };
  const approval = c.approval ? { ...c.approval, overall: Math.min(100, c.approval.overall + 1), history: [{ date: c.date, change: 1, reason: `Shared on S: ${a.title}` }, ...c.approval.history].slice(0, 50) } : c.approval;
  return { ok: true, message: `Shared to S: +${followers.toLocaleString('en-US')} followers, approval +1.`, career: { ...c, approval, socialMedia: { ...s, followers: s.followers + followers, posts: [post, ...s.posts], achievementsHandled: [key, ...s.achievementsHandled].slice(0, 200) } } };
}
export const dismissAchievement = (c: Career, key: string): Career => { const s = socialOf(c); return { ...c, socialMedia: { ...s, achievementsHandled: [key, ...s.achievementsHandled].slice(0, 200) } }; };
