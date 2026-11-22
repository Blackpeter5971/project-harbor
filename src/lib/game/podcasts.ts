import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import { socialOf } from './social-media';
import type { PodcastShow, PodcastEpisode } from './podcasts-schema';

/** CrossiaPod creator rules. Deterministic: same career + same date = same outcome. */
export const EPISODE_ENERGY = 10;
export const MAX_EPISODES_PER_QUARTER = 2;
export const SPONSOR_LISTENERS = 5_000;
/** Dollars per 1,000 quarterly downloads once sponsored. */
export const POD_CPM = 18;

export const podcastFormats = [
  { id: 'monologue', label: 'Solo Monologue', effect: 'Reputation +1', reach: 0.9, titles: ['The policy nobody explains', 'Why this budget matters to you', 'A deep-dive on housing'] },
  { id: 'guest', label: 'Guest Interview', effect: 'Contacts +1', reach: 1.05, titles: ['A lawmaker tells all', 'Inside the newsroom with a reporter', 'An insider on how deals get done'] },
  { id: 'debate', label: 'Debate Deconstruction', effect: 'High virality', reach: 1.35, titles: ['Every rival claim, taken apart', 'What they got wrong last night', 'The rebuttal they fear'] },
  { id: 'whistle', label: 'Whistleblower Special', effect: 'Huge reach, may cost reputation', reach: 1.7, titles: ['A source comes forward', 'The documents they buried', 'What the insiders saw'] },
  { id: 'rant', label: 'Late-Night Rant & Banter', effect: 'Stress −10', reach: 1.1, titles: ['Off the leash', 'Unfiltered after midnight', 'Saying what everyone thinks'] },
] as const;
export type PodcastFormat = typeof podcastFormats[number]['id'];

const hash = (t: string) => { let h = 2166136261; for (const ch of t) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };
export const quarterOf = (d: string) => `${d.slice(0, 4)}-Q${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}`;
const OFFICE_MULT: Record<string, number> = { council: 1.3, mayor: 1.8, stateLeg: 1.6, house: 2.4, governor: 3.2, senate: 3.5, president: 6 };

export const showOf = (c: Career): PodcastShow | null => socialOf(c).podcasts ?? null;
const put = (c: Career, podcasts: PodcastShow): Career => ({ ...c, socialMedia: { ...socialOf(c), podcasts } });

export const isSponsored = (s: PodcastShow) => s.listeners >= SPONSOR_LISTENERS;
/** Chart position in News & Politics (1 is best). */
export const chartRank = (s: PodcastShow) => Math.max(1, Math.round(200 - Math.log10(1 + s.listeners) * 38));
export const passiveDownloads = (s: PodcastShow) => Math.round(s.listeners * 1.2 + s.episodes.length * 25);
export const estimatedSponsorPay = (s: PodcastShow) => isSponsored(s) ? Math.round(passiveDownloads(s) / 1000 * POD_CPM) : 0;

export type PodResult = { ok: true; career: Career; message: string } | { ok: false; message: string };

export function createShow(c: Career, name: string): PodResult {
  if (showOf(c)) return { ok: false, message: 'You already host a show.' };
  const n = name.trim().slice(0, 40) || `The ${c.character.name} Hour`;
  const s: PodcastShow = { name: n, created: c.date, listeners: 0, totalDownloads: 0, earnings: 0, lastQuarterEarnings: 0, episodes: [], quarter: '', quarterEpisodes: 0, lastPaidQuarter: '', lastTurn: '' };
  return { ok: true, career: put(c, s), message: `“${n}” is now live on CrossiaPod.` };
}

export function episodeBlock(c: Career): string | null {
  const s = showOf(c);
  if (!s) return 'Start a show first.';
  if (c.actions < ACTION_COST) return 'Not enough energy this turn.';
  if (s.quarter === quarterOf(c.date) && s.quarterEpisodes >= MAX_EPISODES_PER_QUARTER) return `Episode limit reached (${MAX_EPISODES_PER_QUARTER} per quarter).`;
  return null;
}

export function projectEpisode(c: Career, format: PodcastFormat) {
  const s = showOf(c), f = podcastFormats.find(x => x.id === format)!;
  const comm = c.skills.communication, rep = Math.max(0, c.reputation);
  const officeMult = c.office ? OFFICE_MULT[c.office.id] ?? 1.5 : c.campaign ? 1.2 : 1;
  const roll = 0.75 + hash(`${c.character.name}|${c.date}|${format}|${s?.episodes.length ?? 0}`) * 0.5;
  const downloads = Math.round((250 + (s?.listeners ?? 0) * 0.8) * (1 + comm / 40) * (1 + rep / 80) * officeMult * f.reach * roll);
  const listenersGained = Math.round(downloads * (0.12 + comm / 1500));
  return { downloads, listenersGained };
}

const LISTENERS = ['commuter_dan', 'RosaListens', 'PolicyPod_Fan', 'nightshift_nurse', 'TruckerTom', 'CivicsTeacher', 'GrandmaVotes', 'Ari.K'];
function quotesFor(c: Career, format: PodcastFormat, seed: string) {
  const good: Record<PodcastFormat, string[]> = {
    monologue: ['Finally understood the budget. Thank you.', 'Calm, clear, no spin. Rare.'],
    guest: ['Best guest yet. Bring them back!', 'That interview changed my mind.'],
    debate: ['You took every argument apart. 🔥', 'Sent this to my whole group chat.'],
    whistle: ['This is huge. Is anyone else covering it?', 'Brave episode. Stay safe.'],
    rant: ['Laughed the whole drive home.', 'Said what we were all thinking.'],
  };
  const bad = [`Classic ${c.character.party} talking points.`, 'Too long, not enough facts.', 'Where is the evidence?'];
  return [0, 1].map(i => { const r = hash(seed + 'q' + i), list = r < (format === 'whistle' || format === 'debate' ? 0.35 : 0.2) ? bad : good[format];
    return { author: LISTENERS[Math.floor(hash(seed + 'a' + i) * LISTENERS.length)]!, text: list[Math.floor(r * 97) % list.length]! }; });
}

export function recordEpisode(c: Career, format: PodcastFormat, title?: string): PodResult {
  const block = episodeBlock(c); if (block) return { ok: false, message: block };
  const s = showOf(c)!, f = podcastFormats.find(x => x.id === format);
  if (!f) return { ok: false, message: 'Unknown episode format.' };
  const p = projectEpisode(c, format), q = quarterOf(c.date), seed = `${c.character.name}|${c.date}|${s.episodes.length}`;
  const t = (title?.trim() || `Ep. ${s.episodes.length + 1} — ${f.titles[Math.floor(hash(seed + 't') * f.titles.length)]!}`).slice(0, 90);
  const ep: PodcastEpisode = { id: `pod-${c.date}-${s.episodes.length}`, date: c.date, format, title: t, ...p, quotes: quotesFor(c, format, seed), sponsorPay: 0 };
  const next: PodcastShow = { ...s, listeners: s.listeners + p.listenersGained, totalDownloads: s.totalDownloads + p.downloads, episodes: [ep, ...s.episodes].slice(0, 40), quarter: q, quarterEpisodes: s.quarter === q ? s.quarterEpisodes + 1 : 1 };
  let n: Career = { ...c, actions: c.actions - ACTION_COST };
  let extra = '';
  if (format === 'monologue') { n = { ...n, reputation: Math.min(200, n.reputation + 1) }; extra = ' Reputation +1.'; }
  if (format === 'guest') { n = { ...n, contacts: n.contacts + 1 }; extra = ' New contact made.'; }
  if (format === 'rant' && n.life) { n = { ...n, life: { ...n.life, stress: Math.max(0, n.life.stress - 10) } }; extra = ' Stress −10.'; }
  if (format === 'whistle' && hash(seed + 'risk') < 0.4) { n = { ...n, reputation: Math.max(-100, n.reputation - 2) }; extra = ' Critics called it reckless: reputation −2.'; }
  return { ok: true, career: put(n, next), message: `Published “${t}”: ${p.downloads.toLocaleString('en-US')} downloads, +${p.listenersGained.toLocaleString('en-US')} listeners.${extra}` };
}

/** Long-tail downloads every turn; sponsor income once per quarter. */
export function podcastTurn(c: Career, start: string): { career: Career; notices: string[] } {
  const s = showOf(c);
  if (!s || s.lastTurn === start) return { career: c, notices: [] };
  const q = quarterOf(start), dl = Math.round(passiveDownloads(s) / 3);
  const pay = s.lastPaidQuarter !== q ? estimatedSponsorPay(s) : 0;
  let episodes = s.episodes;
  if (pay > 0 && episodes[0]) episodes = [{ ...episodes[0], sponsorPay: episodes[0].sponsorPay + pay }, ...episodes.slice(1)];
  const next: PodcastShow = { ...s, episodes, lastTurn: start, totalDownloads: s.totalDownloads + dl, listeners: s.listeners + Math.round(dl * 0.02),
    ...(s.lastPaidQuarter !== q && isSponsored(s) ? { lastPaidQuarter: q, earnings: s.earnings + pay, lastQuarterEarnings: pay } : {}) };
  const n: Career = pay > 0 ? { ...c, money: c.money + pay, ledger: [{ month: start, label: 'CrossiaPod sponsorships', amount: pay }, ...c.ledger] } : c;
  return { career: put(n, next), notices: pay > 0 ? [`CrossiaPod: sponsors paid $${pay.toLocaleString('en-US')} for your show.`] : [] };
}
