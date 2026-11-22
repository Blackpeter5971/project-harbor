import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import { communicationsGain, communicationsSeverity } from './campaign-staff-schema';
import { activeScandals, registerScandal } from './scandals';
import type { Result } from './support';
import { shiftLoyalty, type Deltas, type SupportGroupId } from './support-groups';
import { shiftApproval } from './approval';
import { mediaCompanies } from './business';
import { changeBusinessCash } from './business-schema';
import { mediaStories, outletsFor } from './media-outlets';
import { publishPost, socialMediaSchema, socialOf, handleOf, type PostType, type Reaction, type ReactionFeedItem, type SocialMedia, type BroadcastRequest } from './social-media';

/**
 * Phase 3B: feed reactions, broadcast interviews and owned-media coverage. Pure, browser-safe.
 * Lives outside social-media.ts so career.ts (which imports the schema) never pulls approval/campaign code.
 */
const hash = (t: string) => { let h = 2166136261; for (const ch of t) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };
const pick = <T,>(list: readonly T[], seed: string): T => list[Math.floor(hash(seed) * list.length) % list.length]!;
const r1 = (n: number) => Math.round(n * 10) / 10;
const inOffice = (c: Career) => !!c.office && (!c.office.termEnd || c.date < c.office.termEnd);
const rawSocial = (c: Career): SocialMedia => c.socialMedia ?? socialMediaSchema.parse({});
const tag = (name: string) => '@' + name.replace(/[^a-z]/gi, '').toLowerCase();

const CITIZENS = ['Maria Lopez', 'Jamal Carter', 'Hannah Kim', 'Tom Becker', 'Priya Nair', 'Luis Ortega', 'Grace Whitman', 'Andre Lewis', 'Sam Park', 'Ruth Adler', 'Diego Ramos', 'Nia Brooks'];
const POLITICIANS = { Democrat: ['Rep. Carol Mendes', 'Sen. Paul Ivers', 'Cllr. Dana Whitlock'], Republican: ['Rep. Hank Delaney', 'Sen. Marsha Cole', 'Cllr. Brent Haskins'], Independent: ['Cllr. Joan Reyes', 'Ind. Mark Tolliver', 'Cllr. Ivy Sato'] } as const;
const rivalParty = (c: Career) => c.character.party === 'Republican' ? 'Democrat' : 'Republican';
const opposition = (c: Career, seed: string) => c.campaign?.opponents.find(o => !o.out)?.name ?? pick(POLITICIANS[rivalParty(c)], seed);
const colleague = (c: Career, seed: string) => pick(POLITICIANS[c.character.party], seed);

/** What the public is talking about right now: active crisis, race, latest law, office or nothing. */
export function currentTopic(c: Career): { kind: BroadcastRequest['topicKind']; label: string } {
  const scandal = activeScandals(c)[0];
  if (scandal) return { kind: 'scandal', label: scandal.title };
  const crisis = c.crises.find(x => x.status === 'active' || x.status === 'escalated');
  if (crisis) return { kind: 'crisis', label: crisis.title };
  if (c.campaign) return { kind: 'campaign', label: `the ${c.campaign.title} race` };
  const bill = c.bills.find(b => b.stage === 'passed');
  if (bill) return { kind: 'bill', label: bill.title };
  if (inOffice(c)) return { kind: 'office', label: `your work as ${c.office!.title}` };
  return { kind: 'profile', label: `your rise in ${c.character.state} politics` };
}

// ------------------------------------------------------------------ post reactions
const HOT_WORDS: [RegExp, SupportGroupId][] = [[/tax|regulat/i, 'business'], [/cut|privati|layoff/i, 'labor'], [/ban|abolish|gun/i, 'rural'], [/church|faith|abortion/i, 'religious'], [/military|veteran|war/i, 'veterans'], [/tuition|student|climate/i, 'youth']];

export function isControversial(c: Career, type: PostType, text: string) {
  return type === 'rebuttal' || HOT_WORDS.some(([re]) => re.test(text)) || (type === 'policy' && hash(`${c.character.name}|${c.date}|${text}`) < 0.35);
}

export function postReactions(c: Career, type: PostType, text: string, hot: boolean): Reaction[] {
  const s = `${c.character.name}|${c.date}|${type}|${text.length}`, h = handleOf(c), topic = currentTopic(c).label;
  const who = c.office ? c.office.title : c.campaign ? 'candidate' : 'activist';
  const citizen = pick(CITIZENS, s + 'c'), opp = opposition(c, s), pal = colleague(c, s);
  const citizenText = hot
    ? pick([`${h} this is exactly why people don’t trust politicians. Read the room.`, `Hard disagree. A ${who} should bring people together, not pick fights.`, `Wow. Bold take on ${topic}. Not sure it lands with working families.`], s + 'ct')
    : type === 'praise' ? pick([`Love seeing this. Thank you ${h}! 🙏`, `This is why I voted for you.`], s + 'ct')
    : pick([`Finally someone talking sense about ${topic}.`, `Good thread. What’s the timeline, ${h}?`, `Appreciate the clarity. Keep it up.`], s + 'ct');
  const oppText = hot
    ? pick([`${h} is out of touch. Voters deserve better than slogans on ${topic}.`, `Divisive and reckless. This is the real ${c.character.name}.`], s + 'ot')
    : pick([`Nice words, ${h}. Where’s the funding plan?`, `We’ve heard promises like this before. Show us results on ${topic}.`], s + 'ot');
  const palText = hot ? pick([`Standing with ${h}. Someone has to say it.`, `${h} is right, even if it’s uncomfortable.`], s + 'pt')
    : pick([`Proud to work alongside ${h}. 💪`, `Exactly right, ${h}. Let’s get it done.`], s + 'pt');
  const base = Math.max(5, Math.round(socialOf(c).followers * 0.01));
  return [
    { author: citizen, handle: tag(citizen), role: 'citizen', verified: false, text: citizenText, likes: Math.round(base * (hot ? 2.2 : 1)) },
    { author: opp, handle: tag(opp), role: 'opposition', verified: true, text: oppText, likes: Math.round(base * 1.6) },
    { author: pal, handle: tag(pal), role: 'party', verified: true, text: palText, likes: Math.round(base * 1.2) },
  ];
}

/** Publish with NPC reactions. Controversial posts draw pushback that nudges support groups (−1 each). */
export function publishStance(c: Career, type: PostType, text: string): Result {
  const r = publishPost(c, type, text);
  if (!r.ok) return r;
  const s = socialOf(r.career), post = s.posts[0]!, hot = isControversial(c, type, post.text);
  const reactions = postReactions(c, type, post.text, hot);
  let next: Career = { ...r.career, socialMedia: { ...s, posts: [{ ...post, reactions, controversial: hot }, ...s.posts.slice(1)] } };
  if (!hot) return { ok: true, career: next, message: r.message };
  const hits = HOT_WORDS.filter(([re]) => re.test(post.text)).map(([, g]) => g);
  const groups = hits.length ? hits.slice(0, 2) : [pick(['labor', 'business', 'youth', 'rural', 'religious', 'veterans'] as const, post.id)];
  const deltas: Deltas = Object.fromEntries(groups.map(g => [g, -1]));
  next = shiftLoyalty(next, deltas, `Controversial post: ${post.text.slice(0, 40)}`);
  return { ok: true, career: next, message: `${r.message} Your post sparked pushback — some ${groups.join(' & ')} voters cooled on you.` };
}

// ------------------------------------------------------------------ turn: event reactions + broadcast requests
type TurnEvent = { about: string; good: boolean };
export function turnEvents(before: Career, after: Career): TurnEvent[] {
  const ev: TurnEvent[] = [];
  for (const e of after.elections.slice(0, Math.max(0, after.elections.length - before.elections.length))) ev.push({ about: `${e.won ? 'won' : 'lost'} the ${e.title} ${e.stage === 'primary' ? 'primary' : 'election'}`, good: e.won });
  const passedBefore = new Set(before.bills.filter(b => b.stage === 'passed').map(b => b.id));
  for (const b of after.bills.filter(b => b.stage === 'passed' && !passedBefore.has(b.id))) ev.push({ about: `passed “${b.title}”`, good: true });
  const known = new Map(before.crises.map(x => [x.id, x.status]));
  for (const x of after.crises) {
    if (!known.has(x.id)) ev.push({ about: `is facing the ${x.title}`, good: false });
    else if (known.get(x.id) !== 'resolved' && x.status === 'resolved') ev.push({ about: `resolved the ${x.title}`, good: true });
    else if (known.get(x.id) === 'active' && x.status === 'escalated') ev.push({ about: `let the ${x.title} escalate`, good: false });
  }
  const d = (after.approval?.overall ?? 0) - (before.approval?.overall ?? 0);
  if (after.approval && before.approval && Math.abs(d) >= 2) ev.push({ about: `saw approval ${d > 0 ? 'climb' : 'drop'} to ${after.approval.overall}%`, good: d > 0 });
  if (after.campaign?.attack && after.campaign.attack !== before.campaign?.attack) ev.push({ about: `came under attack from ${after.campaign.attack}`, good: false });
  return ev.slice(0, 2);
}

export function eventReactions(c: Career, e: TurnEvent, date: string, i: number): ReactionFeedItem[] {
  const s = `${c.character.name}|${date}|ev${i}`, h = handleOf(c), name = c.character.name;
  const citizen = pick(CITIZENS, s + 'c'), opp = opposition(c, s), pal = colleague(c, s);
  const reach = Math.max(50, rawSocial(c).followers * 0.03);
  const item = (role: Reaction['role'], author: string, text: string, k: number): ReactionFeedItem => {
    const likes = Math.round(reach * k * (0.6 + hash(s + role)));
    return { id: `${date}-ev${i}-${role}`, date, about: e.about, role, author, handle: tag(author), verified: role !== 'citizen', text, likes, reposts: Math.round(likes * 0.2), replies: Math.round(likes * 0.1), views: Math.round(likes * 28) };
  };
  return [
    item('citizen', citizen, e.good ? pick([`Big news: ${h} ${e.about}. Good for us. 👏`, `Credit to ${h} — ${name} ${e.about}. Didn’t think it’d happen.`], s + 'ct') : pick([`So ${h} ${e.about}. Who’s accountable here?`, `${name} ${e.about}. We deserve answers, ${h}.`], s + 'ct'), 1),
    item('opposition', opp, e.good ? pick([`${h} ${e.about}, but the hard work is still ahead. We’ll be watching.`, `Let’s not pretend ${h} did this alone.`], s + 'ot') : pick([`${name} ${e.about}. This is what failed leadership looks like. ${h}`, `Voters will remember that ${h} ${e.about}.`], s + 'ot'), 1.4),
    item('party', pal, e.good ? pick([`Proud of ${h}. ${name} ${e.about} — that’s leadership.`, `Great day for the team. Well done ${h}!`], s + 'pt') : pick([`Tough moment, but I trust ${h} to turn it around.`, `We stand together. ${h} has our support.`], s + 'pt'), 1.1),
  ];
}

const TV_OFFICES = ['house', 'governor', 'senate', 'president'];
export const BROADCAST_CHANCE = 0.4;

/** A live TV/radio booking. Only offered when a current event (mediaStories) gives the outlet something to ask about. */
export function rollBroadcast(c: Career, date: string, followers: number): BroadcastRequest | null {
  if (!(inOffice(c) || c.campaign || followers >= 5_000)) return null;
  const story = mediaStories({ ...c, date })[0];
  if (!story) return null;
  const s = `${c.character.name}|${date}|bc`;
  if (hash(s) >= BROADCAST_CHANCE) return null;
  const tv = followers >= 50_000 || (inOffice(c) && TV_OFFICES.includes(c.office!.id)) || hash(s + 'tv') < 0.25;
  const outlets = outletsFor(c).filter(o => o.channel === (tv ? 'tv' : 'radio') && o.scope !== 'National').map(o => o.name);
  return { id: `${date}-bc`, date, kind: tv ? 'tv' : 'radio', outlet: pick(outlets, s + 'o'), show: tv ? (c.campaign && hash(s + 'd') < 0.5 ? 'Primetime Debate' : 'Primetime Interview') : 'Local Radio Interview', topic: story.title, topicKind: story.kind };
}

/** Once per turn, after socialTurn. Idempotent via socialMedia.lastMediaTurn. */
export function mediaTurn(before: Career, after: Career, start: string, end: string): { career: Career; notices: string[] } {
  if (!after.socialMedia && !inOffice(after) && !after.campaign) return { career: after, notices: [] };
  const s = rawSocial(after);
  if (s.lastMediaTurn && s.lastMediaTurn >= start) return { career: after, notices: [] };
  const feed = turnEvents(before, after).flatMap((e, i) => eventReactions(after, e, end, i));
  // Rival attack ads cost an officeholder a point of approval (campaign momentum is already hit in campaign.ts).
  if (after.campaign?.attack && inOffice(after)) after = shiftApproval(after, -1, `${after.campaign.attack}'s attack ads`);
  const req = rollBroadcast({ ...after, date: end }, end, s.followers);
  const notices = req ? [`Media request: ${req.outlet} wants you for a ${req.show.toLowerCase()} about ${req.topic}. Open Politics → Media Hub to respond.`] : [];
  // An unanswered request expires when the next turn is processed.
  return { career: { ...after, socialMedia: { ...s, lastMediaTurn: start, broadcast: req, reactionFeed: [...feed, ...s.reactionFeed].slice(0, 30) } }, notices };
}

// ------------------------------------------------------------------ broadcasts
export type TalkingPoint = 'record' | 'vision' | 'attack';
export const BROADCAST_COST = { radio: { energy: 15 }, tv: { energy: 20 } } as const;
export function talkingPoints(req: BroadcastRequest) {
  return [
    { id: 'record' as const, label: 'Defend your record', hint: 'Safe if your approval or reputation is solid.' },
    { id: 'vision' as const, label: req.topicKind === 'office' || req.topicKind === 'profile' ? 'Lay out your vision' : `Lay out your plan on ${req.topic}`, hint: 'Steady gains with a small boost to one voter group.' },
    { id: 'attack' as const, label: req.topicKind === 'campaign' ? 'Go after your opponents' : 'Blame your critics', hint: 'Big momentum swing, but controversial — some voters push back.' },
  ];
}

export function broadcastBlock(c: Career, pay: 'action' | 'energy'): string | null {
  const req = socialOf(c).broadcast;
  if (!req) return 'No media request right now.';
  if (pay === 'action' && c.actions < ACTION_COST) return 'Not enough energy this turn.';
  if (pay === 'energy' && c.actions < BROADCAST_COST[req.kind].energy) return `Not enough energy (${BROADCAST_COST[req.kind].energy}% needed).`;
  return null;
}

export function doBroadcast(c: Career, point: TalkingPoint, pay: 'action' | 'energy'): Result {
  const block = broadcastBlock(c, pay);
  if (block) return { ok: false, message: block };
  const s = socialOf(c), req = s.broadcast!, m = req.kind === 'tv' ? 2 : 1;
  const roll = hash(`${c.character.name}|${req.id}|${point}`);
  const standing = point === 'record' ? Math.max(c.approval?.overall ?? 0, c.reputation) * 0.4 : point === 'attack' ? 6 : 10;
  const score = c.skills.communication * 0.6 + c.reputation * 0.2 + standing + roll * 40;
  const good = score >= (req.kind === 'tv' ? 45 : 35);
  let n: Career = pay === 'action' ? { ...c, actions: c.actions - ACTION_COST } : { ...c, actions: c.actions - BROADCAST_COST[req.kind].energy };
  const rep = r1(good ? 1.5 * m * communicationsGain(c.campaign) : -1 * m * communicationsSeverity(c.campaign));
  n = { ...n, reputation: Math.max(0, r1(n.reputation + rep)), skills: { ...n.skills, communication: Math.min(100, r1(n.skills.communication + 0.5)) } };
  if (inOffice(n)) n = shiftApproval(n, good ? m : -m, `${req.show} on ${req.outlet}`);
  if (n.campaign) {
    const support = good ? m * communicationsGain(c.campaign) : -0.5 * m * communicationsSeverity(c.campaign), momentum = (good ? 2 * m * communicationsGain(c.campaign) : -m * communicationsSeverity(c.campaign)) + (point === 'attack' ? 2 : 0);
    n = { ...n, campaign: { ...n.campaign, support: r1(n.campaign.support + support), momentum: r1(n.campaign.momentum + momentum) } };
  }
  if (point === 'vision' && good) n = shiftLoyalty(n, { [pick(['labor', 'business', 'youth', 'rural'] as const, req.id)]: 1 }, `${req.show}: policy plan`);
  if (point === 'attack') n = shiftLoyalty(n, { [pick(['religious', 'veterans', 'business', 'youth'] as const, req.id + 'a')]: -1 }, `${req.show}: attack line`);
  const outcome = good ? `Strong ${req.kind === 'tv' ? 'TV' : 'radio'} performance. Reputation +${rep}${inOffice(c) ? `, approval +${m}` : ''}${c.campaign ? ', polls up' : ''}.`
    : `The interview went poorly. Reputation ${rep}${inOffice(c) ? `, approval −${m}` : ''}${c.campaign ? ', polls slipped' : ''}.`;
  const label = talkingPoints(req).find(t => t.id === point)!.label;
  const fed = eventReactions(n, { about: good ? `nailed the ${req.show.toLowerCase()} on ${req.outlet}` : `stumbled on ${req.outlet}`, good }, c.date, 9);
  const ns = socialOf(n);
  n = { ...n, socialMedia: { ...ns, broadcast: null, followers: ns.followers + (good ? 400 * m : 0), reactionFeed: [...fed, ...ns.reactionFeed].slice(0, 30), broadcastHistory: [{ id: req.id, date: c.date, kind: req.kind, outlet: req.outlet, point: label, outcome, good }, ...ns.broadcastHistory].slice(0, 20) } };
  return { ok: true, career: n, message: outcome };
}
export const declineBroadcast = (c: Career): Result => {
  const s = socialOf(c);
  return s.broadcast ? { ok: true, career: { ...c, socialMedia: { ...s, broadcast: null } }, message: `You declined ${s.broadcast.outlet}.` } : { ok: false, message: 'No media request right now.' };
};

// ------------------------------------------------------------------ owned media
export const COVERAGE = {
  favorable: { label: 'Favorable coverage', cost: 3_000, risk: 0.2, rep: 2, approval: 1, polls: 1, hint: 'Your outlet runs flattering stories.' },
  editorial: { label: 'Editorial endorsement', cost: 6_000, risk: 0.35, rep: 3, approval: 2, polls: 2, hint: 'Your outlet formally backs you on its opinion page.' },
} as const;
export type CoverageMode = keyof typeof COVERAGE;

export function coverageBlock(c: Career, mode: CoverageMode): string | null {
  const outlet = [...mediaCompanies(c)].sort((a, b) => b.account - a.account)[0];
  if (!outlet) return 'You need to own a media company (Career & Business).';
  if (socialOf(c).coverageQuarter === c.date) return 'Your outlet already ran coverage for you this quarter.';
  if (outlet.account < COVERAGE[mode].cost) return `${outlet.name} needs $${COVERAGE[mode].cost.toLocaleString('en-US')} in its account.`;
  return null;
}

/** Uses the player's own outlet. Paid from that business account; exposure risk is an ethics scandal. */
export function ownedCoverage(c: Career, mode: CoverageMode): Result {
  const block = coverageBlock(c, mode);
  if (block) return { ok: false, message: block };
  const cfg = COVERAGE[mode], outlet = [...mediaCompanies(c)].sort((a, b) => b.account - a.account)[0];
  if (!outlet) return { ok: false, message: 'No media company is available.' };
  const exposed = hash(`${c.character.name}|${c.date}|${mode}|cov`) < cfg.risk;
  const businesses = c.businesses.map(b => b.id === outlet.id ? { ...changeBusinessCash(b, -cfg.cost), ledger: [{ month: c.date, label: `${cfg.label} for owner`, amount: -cfg.cost }, ...b.ledger].slice(0, 40) } : b);
  let n: Career = { ...c, businesses };
  const s = socialOf(n);
  if (exposed) {
    n = registerScandal(n, { id: `coverage|${outlet.id}|${c.date}`, title: `Editorial interference: ${outlet.name}`, summary: `Records reveal the owner ordered paid ${cfg.label.toLowerCase()} from ${outlet.name}. Editorial independence is questioned; this is not a criminal finding.`, source: 'Investigative Reporter', severity: 'Moderate', evidence: 80, trigger: 'business', phase: 'Active' });
    n = { ...n, reputation: Math.max(0, r1(n.reputation - 4)) };
    if (inOffice(n)) n = shiftApproval(n, -2, `Conflict of interest: ${outlet.name}`);
    n = shiftLoyalty(n, { youth: -2, labor: -1 }, `Owned-media coverage exposed`);
    const fed = eventReactions(n, { about: `was caught using ${outlet.name} for self-promotion`, good: false }, c.date, 8);
    n = { ...n, socialMedia: { ...socialOf(n), coverageQuarter: c.date, reactionFeed: [...fed, ...s.reactionFeed].slice(0, 30) } };
    return { ok: true, career: n, message: `Exposed! Reporters revealed you ordered coverage from ${outlet.name}. Reputation −4${inOffice(c) ? ', approval −2' : ''}.` };
  }
  n = { ...n, reputation: r1(n.reputation + cfg.rep) };
  if (inOffice(n)) n = shiftApproval(n, cfg.approval, `${cfg.label} from ${outlet.name}`);
  if (n.campaign) n = { ...n, campaign: { ...n.campaign, support: r1(n.campaign.support + cfg.polls) } };
  n = { ...n, socialMedia: { ...socialOf(n), coverageQuarter: c.date } };
  return { ok: true, career: n, message: `${outlet.name} ran ${cfg.label.toLowerCase()}. Reputation +${cfg.rep}${inOffice(c) ? `, approval +${cfg.approval}` : ''}${c.campaign ? `, polls +${cfg.polls}` : ''}.` };
}

// ------------------------------------------------------------------ inbox replies
export type ReplyTone = 'warm' | 'brief' | 'deal';
export function replyOptions(kind: 'family' | 'friend' | 'elite' | 'press') {
  if (kind === 'press') return [{ id: 'deal' as const, label: 'I’ll give you a statement on the record.', hint: 'Relationships +1' }, { id: 'brief' as const, label: 'No comment at this time.', hint: 'No effect' }];
  return kind === 'elite'
    ? [{ id: 'deal' as const, label: 'Let’s set up a meeting.', hint: 'Party standing +1, relationships +1' }, { id: 'brief' as const, label: 'Thanks — I’ll keep it in mind.', hint: 'Relationships +0.5' }]
    : [{ id: 'warm' as const, label: kind === 'family' ? 'Love you. I’ll call this weekend ❤️' : 'Miss you! Let’s catch up soon 🙌', hint: 'Bond +3' }, { id: 'brief' as const, label: 'Thanks, busy week — talk soon.', hint: 'Bond +1' }];
}
export const repliedThisTurn = (c: Career, threadId: string) => socialOf(c).inbox.some(m => m.threadId === threadId && m.fromMe && m.date === c.date);

/** One reply per conversation per turn. Friends/family gain affinity; elites raise party standing. */
export function replyToThread(c: Career, threadId: string, tone: ReplyTone): Result {
  const s = socialOf(c), last = s.inbox.find(m => m.threadId === threadId && !m.fromMe);
  if (!last) return { ok: false, message: 'Conversation not found.' };
  if (repliedThisTurn(c, threadId)) return { ok: false, message: `You already replied to ${last.from} this turn.` };
  const opt = replyOptions(last.kind).find(o => o.id === tone);
  if (!opt) return { ok: false, message: 'Choose a reply.' };
  const seed = `${c.character.name}|${c.date}|${threadId}`;
  const back = last.kind === 'press' ? (tone === 'deal' ? 'Thank you. We’ll include your full statement.' : 'Noted. We’ll report that you declined to comment.')
    : last.kind === 'elite' ? (tone === 'deal' ? pick(['Perfect. My office will reach out.', 'Great — I’ll bring the numbers.'], seed) : 'Understood. Door’s open.')
    : tone === 'warm' ? pick(['❤️ Can’t wait!', 'That made my day.', 'Holding you to it!'], seed) : pick(['No worries, take care of yourself.', 'Okay! Don’t work too hard.'], seed);
  const mine = { ...last, id: `${c.date}-re-${threadId}`, date: c.date, text: opt.label, read: true, fromMe: true };
  const theirs = { ...last, id: `${c.date}-re2-${threadId}`, date: c.date, text: back, read: true, fromMe: false };
  let n: Career = { ...c, socialMedia: { ...s, inbox: [theirs, mine, ...s.inbox.map(m => m.threadId === threadId ? { ...m, read: true } : m)].slice(0, 40) } };
  if (last.kind === 'press') {
    if (tone === 'deal') n = { ...n, relationships: r1(n.relationships + 1) };
  } else if (last.kind === 'elite') {
    n = { ...n, relationships: r1(n.relationships + (tone === 'deal' ? 1 : 0.5)) };
    if (tone === 'deal') n = shiftLoyalty(n, {}, `Met with ${last.from}`, 1);
  } else if (n.life?.social) {
    const bump = tone === 'warm' ? 3 : 1, so = n.life.social;
    const up = <T extends { id: string; affinity: number }>(p: T): T => p.id === threadId ? { ...p, affinity: Math.min(100, p.affinity + bump) } : p;
    n = { ...n, life: { ...n.life, social: { ...so, contacts: so.contacts.map(up), partner: so.partner ? up(so.partner) : null } } };
  }
  return { ok: true, career: n, message: `Replied to ${last.from}. ${opt.hint}.` };
}

// ------------------------------------------------------------------ ready-made drafts
export function draftSuggestions(c: Career): { type: PostType; text: string }[] {
  const t = currentTopic(c), o = inOffice(c) ? c.office! : null, place = o?.jurisdiction ?? c.character.state, tagged = place.replace(/[^a-z]/gi, '');
  const ev = rawSocial(c).reactionFeed[0]?.about;
  const out: { type: PostType; text: string }[] = [];
  if (t.kind === 'crisis') out.push({ type: 'policy', text: `Update on the ${t.label}: our teams are on the ground and I’m personally overseeing the response. We will get ${place} through this. #${tagged}Strong` });
  if (c.campaign) out.push({ type: 'campaign', text: `${c.campaign.title} race update: more doors knocked this week than ever. ${place} is ready for change. Join us! #OnTheTrail` });
  if (t.kind === 'bill') out.push({ type: 'praise', text: `“${t.label}” is now law. Thank you to everyone who made it happen — this is what working together looks like.` });
  if (ev) out.push({ type: 'rebuttal', text: `Lots of noise this week about how I ${ev}. Here are the facts, and here’s what comes next. 🧵` });
  out.push(o ? { type: 'praise', text: `Proud to serve as ${o.title}. Spent today listening to families across ${place} — your voices shape every decision I make.` }
    : { type: 'policy', text: `${c.character.state} deserves leaders who show up. I’m ${c.character.name}, and I’m ready to work for you. #${tagged}` });
  return out.slice(0, 3);
}
