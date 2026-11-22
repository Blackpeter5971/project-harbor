import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import { socialOf } from './social-media';
import type { TubeChannel, TubeVideo } from './tube-schema';

/** Crosstube creator rules. Deterministic: same career + same date = same outcome. */
export const MONETIZE_SUBS = 10_000;
export const MONETIZE_HOURS = 4_000;
export const VERIFY_SUBS = 100_000;
export const SILVER_SUBS = 10_000;
export const GOLD_SUBS = 100_000;
export const UPLOAD_ENERGY = 15;
export const MAX_UPLOADS_PER_QUARTER = 3;
/** Dollars per 1,000 monetized views. */
export const TUBE_RPM = 3;

export const tubeFormats = [
  { id: 'geo', label: 'Geopolitics Breakdown', minutes: 18, reach: 1.1, thumb: 'capitol', hook: ['Why the border talks collapsed', 'The trade war nobody is talking about', 'Crossia vs. its neighbours: who wins?'] },
  { id: 'policy', label: 'Policy & Economy Deep-Dive', minutes: 24, reach: 0.9, thumb: 'infrastructure', hook: ['Where your tax money really goes', 'Fixing housing in 5 steps', 'The budget, explained simply'] },
  { id: 'vlog', label: 'Campaign Trail Vlog', minutes: 12, reach: 1.0, thumb: 'ballroom', hook: ['48 hours on the campaign trail', 'Knocking on 500 doors', 'Behind the scenes at our rally'] },
  { id: 'debate', label: 'Debate Reaction & Rebuttal', minutes: 15, reach: 1.25, thumb: 'debate', hook: ['Reacting to last night\u2019s debate', 'Every lie from the debate, fact-checked', 'My rebuttal, point by point'] },
  { id: 'podcast', label: 'Spicy Political Podcast', minutes: 60, reach: 0.85, thumb: 'radio', hook: ['Ep. — Off the record', 'Ep. — Nobody wanted to say this', 'Ep. — Hot takes with a strategist'] },
  { id: 'expose', label: 'Exposing Rival Hypocrisy', minutes: 14, reach: 1.45, thumb: 'backroom', hook: ['They said one thing, did another', 'Receipts: my rival\u2019s voting record', 'The scandal they hope you forget'] },
] as const;
export type TubeFormat = typeof tubeFormats[number]['id'];

const hash = (t: string) => { let h = 2166136261; for (const ch of t) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };
const quarterOf = (d: string) => `${d.slice(0, 4)}-Q${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}`;
const OFFICE_MULT: Record<string, number> = { council: 1.3, mayor: 1.8, stateLeg: 1.6, house: 2.4, governor: 3.2, senate: 3.5, president: 6 };

export const channelOf = (c: Career): TubeChannel | null => socialOf(c).tube;
const put = (c: Career, tube: TubeChannel): Career => ({ ...c, socialMedia: { ...socialOf(c), tube } });

export const isMonetized = (ch: TubeChannel) => ch.subscribers >= MONETIZE_SUBS && ch.watchHours >= MONETIZE_HOURS;
export const isTubeVerified = (ch: TubeChannel) => ch.subscribers >= VERIFY_SUBS;
export const tier = (ch: TubeChannel): 'gold' | 'silver' | null => ch.subscribers >= GOLD_SUBS ? 'gold' : ch.subscribers >= SILVER_SUBS ? 'silver' : null;
/** Back-catalogue views per quarter and the resulting ad income estimate. */
export const passiveViews = (ch: TubeChannel) => Math.round(ch.subscribers * 0.35 + ch.videos.length * 40);
export const tierBonus = (ch: TubeChannel) => tier(ch) === 'gold' ? 1.25 : tier(ch) === 'silver' ? 1.1 : 1;
export const estimatedQuarterEarnings = (ch: TubeChannel) => isMonetized(ch) ? Math.round(passiveViews(ch) / 1000 * TUBE_RPM * tierBonus(ch)) : 0;

export type TubeResult = { ok: true; career: Career; message: string } | { ok: false; message: string };

export function createChannel(c: Career, name: string): TubeResult {
  if (channelOf(c)) return { ok: false, message: 'You already have a channel.' };
  const n = name.trim().slice(0, 40) || `${c.character.name} Talks`;
  const ch: TubeChannel = { name: n, created: c.date, subscribers: 0, totalViews: 0, watchHours: 0, earnings: 0, lastQuarterEarnings: 0, videos: [], quarter: '', quarterUploads: 0, lastTurn: '', milestones: [] };
  return { ok: true, career: put(c, ch), message: `Channel “${n}” is live on Crosstube.` };
}

export function uploadBlock(c: Career): string | null {
  const ch = channelOf(c);
  if (!ch) return 'Create a channel first.';
  if (c.actions < ACTION_COST) return 'Not enough energy this turn.';
  if (ch.quarter === quarterOf(c.date) && ch.quarterUploads >= MAX_UPLOADS_PER_QUARTER) return `Upload limit reached (${MAX_UPLOADS_PER_QUARTER} per quarter).`;
  return null;
}

const COMMENTERS = ['Marcus_Votes', 'LindaFromOhio', 'PolicyNerd42', 'GeoWatcher', 'Tasha.B', 'Old_Man_Earl', 'ReformNow', 'CrossiaDaily', 'kev_the_voter', 'NurseJo'];
function commentsFor(c: Career, format: TubeFormat, seed: string, views: number) {
  const party = c.character.party, pos: Record<TubeFormat, string[]> = {
    geo: ['Finally someone explains this without spin.', 'Best breakdown of the region I\u2019ve seen.'],
    policy: ['Send this to every lawmaker in the state.', 'Clear, honest numbers. Subscribed.'],
    vlog: ['Love seeing the real side of campaigning.', 'You came to my town! Great energy.'],
    debate: ['You destroyed every talking point. 🔥', 'Timestamped the best rebuttal at 6:42.'],
    podcast: ['Listened on my commute, couldn\u2019t stop.', 'Bring the strategist back next week!'],
    expose: ['The receipts don\u2019t lie. Wow.', 'This needs to go viral before the election.'],
  };
  const neg = [`Typical ${party} propaganda.`, 'Where are your sources?', 'All talk. Show us results.', 'Clickbait title, mid video.'];
  const spicy = format === 'expose' || format === 'podcast' || format === 'debate';
  return [0, 1, 2].map(i => {
    const r = hash(seed + 'c' + i), bad = r < (spicy ? 0.4 : 0.2);
    const list = bad ? neg : pos[format];
    return { author: COMMENTERS[Math.floor(hash(seed + 'a' + i) * COMMENTERS.length)]!, text: list[Math.floor(r * 97) % list.length]!, likes: Math.round(views * (0.002 + hash(seed + 'l' + i) * 0.01)) };
  });
}

/** Deterministic projection for a new upload. */
export function projectVideo(c: Career, format: TubeFormat) {
  const ch = channelOf(c), f = tubeFormats.find(x => x.id === format)!;
  const charisma = c.skills.communication, rep = Math.max(0, c.reputation);
  const officeMult = c.office ? OFFICE_MULT[c.office.id] ?? 1.5 : c.campaign ? 1.2 : 1;
  const base = 300 + (ch?.subscribers ?? 0) * 0.6;
  const roll = 0.7 + hash(`${c.character.name}|${c.date}|${format}|${ch?.videos.length ?? 0}`) * 0.6;
  const views = Math.round(base * (1 + charisma / 40) * (1 + rep / 80) * officeMult * f.reach * roll);
  const subsGained = Math.round(views * (0.03 + charisma / 2500));
  const watchHours = Math.round(views * f.minutes * 0.45 / 60);
  return { views, subsGained, watchHours, likes: Math.round(views * 0.05) };
}

export function uploadVideo(c: Career, format: TubeFormat, title?: string): TubeResult {
  const block = uploadBlock(c); if (block) return { ok: false, message: block };
  const ch = channelOf(c)!, f = tubeFormats.find(x => x.id === format);
  if (!f) return { ok: false, message: 'Unknown video format.' };
  const p = projectVideo(c, format), q = quarterOf(c.date), seed = `${c.character.name}|${c.date}|${ch.videos.length}`;
  const t = (title?.trim() || f.hook[Math.floor(hash(seed + 't') * f.hook.length)]!).slice(0, 90);
  const video: TubeVideo = { id: `tv-${c.date}-${ch.videos.length}`, date: c.date, format, title: t, ...p, comments: commentsFor(c, format, seed, p.views) };
  let next: TubeChannel = { ...ch, subscribers: ch.subscribers + p.subsGained, totalViews: ch.totalViews + p.views, watchHours: ch.watchHours + p.watchHours, videos: [video, ...ch.videos].slice(0, 60), quarter: q, quarterUploads: ch.quarter === q ? ch.quarterUploads + 1 : 1 };
  let n: Career = { ...c, actions: c.actions - ACTION_COST, skills: { ...c.skills, communication: Math.min(100, c.skills.communication + 1) } };
  const m = milestones(n, next); n = m.career; next = m.channel;
  return { ok: true, career: put(n, next), message: `Published “${t}”: ${p.views.toLocaleString('en-US')} views, +${p.subsGained.toLocaleString('en-US')} subscribers.${m.notes.length ? ' ' + m.notes.join(' ') : ''}` };
}

function milestones(c: Career, ch: TubeChannel) {
  const notes: string[] = []; let n = c, list = ch.milestones;
  if (ch.subscribers >= SILVER_SUBS && !list.includes('silver')) { list = [...list, 'silver']; n = { ...n, reputation: Math.min(200, n.reputation + 5) }; notes.push('🥈 Silver Creator Award! Reputation +5.'); }
  if (ch.subscribers >= GOLD_SUBS && !list.includes('gold')) { list = [...list, 'gold']; n = { ...n, reputation: Math.min(200, n.reputation + 10) }; notes.push('🥇 Gold Creator Award! Reputation +10.'); }
  return { career: n, channel: { ...ch, milestones: list }, notes };
}

/** Quarterly back-catalogue growth and ad income; guarded by lastTurn. */
export function tubeTurn(c: Career, start: string, _end: string): { career: Career; notices: string[] } {
  const ch = channelOf(c);
  if (!ch || ch.lastTurn === start) return { career: c, notices: [] };
  const views = passiveViews(ch), subs = Math.round(views * 0.01), pay = estimatedQuarterEarnings(ch);
  let next: TubeChannel = { ...ch, lastTurn: start, totalViews: ch.totalViews + views, subscribers: ch.subscribers + subs, watchHours: ch.watchHours + Math.round(views * 0.2), earnings: ch.earnings + pay, lastQuarterEarnings: pay };
  let n: Career = pay > 0 ? { ...c, money: c.money + pay, ledger: [{ month: start, label: 'Crosstube ad revenue', amount: pay }, ...c.ledger] } : c;
  const m = milestones(n, next); n = m.career; next = m.channel;
  const notices = [...(pay > 0 ? [`Crosstube: your channel earned $${pay.toLocaleString('en-US')} in ad revenue.`] : []), ...m.notes.map(x => `Crosstube: ${x}`)];
  return { career: put(n, next), notices };
}

/** NPC videos for the home feed. Derived, never saved. */
export function trendingVideos(c: Career) {
  const st = c.character.state;
  const chans = [['Crossia Daily News', true], ['GeoPolitik Explained', true], ['The Ballot Box', false], [`${st} Watch`, false], ['Capitol Uncut Podcast', true]] as const;
  const titles = [`${st} legislature in chaos: what happened`, 'The 2026 budget fight, explained', 'Inside a campaign war room', 'Top 10 debate moments this year', 'Is the trade deal good for workers?', 'Mayor vs. council: the full story', 'Why young voters are angry'];
  const thumbs = ['capitol', 'infrastructure', 'warroom', 'debate', 'press', 'ballroom', 'radio'];
  return [0, 1, 2, 3, 4].map(i => {
    const s = `${c.date}|trend${i}`, k = Math.floor(hash(s) * titles.length);
    const [channel, verified] = chans[(i + Math.floor(hash(s + 'ch') * 5)) % 5]!;
    return { id: `trend-${c.date}-${i}`, title: titles[(k + i) % titles.length]!, channel, verified, views: Math.round(20_000 + hash(s + 'v') * 900_000), thumb: thumbs[(k + i) % thumbs.length]!, minutes: 8 + Math.floor(hash(s + 'm') * 40), date: c.date };
  });
}
