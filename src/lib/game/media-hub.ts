import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import { communicationsGain, communicationsSeverity } from './campaign-staff-schema';
import type { Result } from './support';
import { applyActionApproval, ensureApproval, holdsOffice } from './approval';
import { shiftLoyalty, supportGroupCatalog, type Deltas, type SupportGroupId } from './support-groups';
import { socialOf } from './social-media';
import { eventReactions } from './media';
import { mediaStories, outletsFor, friendliness, type Channel, type MediaStory, type Outlet, type StoryKind } from './media-outlets';

/**
 * Media Hub invitations (TV, radio, newspaper). Pure and browser-safe.
 * Invitations are derived from mediaStories, so an outlet only calls when a real event supports it.
 * Saved guards: socialMedia.hubAnswered (story|channel answered or declined) and hubUsed (one appearance per channel per quarter).
 */
export type Format = 'interview' | 'debate' | 'talk' | 'radio_talk' | 'rural' | 'address' | 'release' | 'print' | 'editorial';
export const FORMATS: Record<Format, { channel: Channel; label: string }> = {
  interview: { channel: 'tv', label: 'TV interview' },
  debate: { channel: 'tv', label: 'Televised debate' },
  talk: { channel: 'tv', label: 'Primetime talk appearance' },
  radio_talk: { channel: 'radio', label: 'Talk radio discussion' },
  rural: { channel: 'radio', label: 'Rural broadcast commentary' },
  address: { channel: 'radio', label: 'Public address slot' },
  release: { channel: 'newspaper', label: 'Press release' },
  print: { channel: 'newspaper', label: 'Print interview' },
  editorial: { channel: 'newspaper', label: 'Editorial response' },
};
export const MAX_INVITES_PER_CHANNEL = 3;
const BASE_DIFFICULTY: Record<Channel, number> = { tv: 45, radio: 38, newspaper: 32 };
const WEIGHT: Record<Channel, number> = { tv: 1.5, radio: 1, newspaper: 1 };
const FEED_INDEX: Record<Channel, number> = { tv: 11, radio: 12, newspaper: 13 };

export type Invitation = { id: string; channel: Channel; format: Format; outlet: Outlet; story: MediaStory; question: string };

const hash = (t: string) => { let h = 2166136261; for (const ch of t) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };
const r1 = (n: number) => Math.round(n * 10) / 10;
const answeredKey = (story: MediaStory, channel: Channel) => `${story.id}|${channel}`;
const BIG_OFFICES = ['house', 'senate', 'governor', 'president'];

function formatFor(c: Career, story: MediaStory, channel: Channel, outlet: Outlet): Format {
  if (channel === 'tv') return story.kind === 'campaign' ? 'debate' : story.kind === 'scandal' || story.kind === 'crisis' ? 'interview' : 'talk';
  if (channel === 'radio') return outlet.scope === 'Rural' ? 'rural' : holdsOffice(c) && ['crisis', 'economy', 'project', 'bill'].includes(story.kind) ? 'address' : 'radio_talk';
  if (story.kind === 'scandal' || (story.good && ['bill', 'project', 'election'].includes(story.kind))) return 'editorial';
  return story.kind === 'campaign' || story.kind === 'election' ? 'print' : 'release';
}

/** National outlets only call on big-office holders, popular accounts or severe stories. */
function reachable(c: Career, outlet: Outlet, story: MediaStory) {
  if (outlet.scope !== 'National') return true;
  return BIG_OFFICES.includes(c.office?.id ?? '') || socialOf(c).followers >= 50_000 || story.kind === 'scandal';
}

const QUESTION: Record<StoryKind, (t: string, good: boolean | null) => string> = {
  scandal: t => `Reporters are asking about “${t}”. What do you say to people who no longer trust you?`,
  crisis: (t, g) => g ? `The ${t.replace(/ resolved$/, '')} is over. What did you learn?` : `People are worried about the ${t}. What is your plan?`,
  economy: (t, g) => g === false ? `Families are feeling the ${t}. What are you doing about it?` : `Let’s talk about the economy: ${t}. Who gains and who pays?`,
  election: (t, g) => g ? `${t}. What will you do with the win?` : `${t}. What happens to your movement now?`,
  bill: t => `${t}. Critics call it a mistake. Why should voters back it?`,
  project: t => `${t}. Was it worth the money?`,
  campaign: t => `Voters are deciding on ${t}. Why you, and why now?`,
};

/** All invitations open right now, grouped by channel (max three each). Read-only. */
export function hubInvitations(c: Career): Invitation[] {
  const s = socialOf(c), stories = mediaStories(c), outlets = outletsFor(c), live = s.broadcast?.outlet;
  const out: Invitation[] = [];
  for (const channel of ['tv', 'radio', 'newspaper'] as const) {
    const free = outlets.filter(o => o.channel === channel && o.name !== live);
    for (const story of stories) {
      if (out.filter(i => i.channel === channel).length >= MAX_INVITES_PER_CHANNEL) break;
      if (s.hubAnswered.includes(answeredKey(story, channel))) continue;
      const taken = new Set(out.filter(i => i.channel === channel).map(i => i.outlet.id));
      const options = free.filter(o => !taken.has(o.id) && reachable(c, o, story));
      if (!options.length) continue;
      const rural = story.groups.includes('rural') ? options.find(o => o.scope === 'Rural') : undefined;
      const outlet = rural ?? options[Math.floor(hash(`${story.id}|${channel}`) * options.length) % options.length]!;
      out.push({ id: `${story.id}|${channel}|${c.date}`, channel, format: formatFor(c, story, channel, outlet), outlet, story, question: QUESTION[story.kind](story.title, story.good) });
    }
  }
  return out;
}

export type Tone = 'safe' | 'bold' | 'risky';
export type ResponseChoice = { id: string; label: string; tone: Tone; hint: string };
const HINT: Record<Tone, string> = { safe: 'Safe · small, steady gains', bold: 'Balanced · communication and voter-group support', risky: 'Risky · big swing, some voters push back' };
const LINES: Record<StoryKind, [string, string, string]> = {
  scandal: ['Take responsibility and lay out the fixes', 'Pivot to your record of results', 'Call it a partisan smear'],
  crisis: ['Give a calm, factual update', 'Announce a concrete response plan', 'Blame the people who came before you'],
  economy: ['Reassure families that the basics are covered', 'Promise targeted relief for workers and small firms', 'Blame your opponents’ economic record'],
  election: ['Thank volunteers and voters', 'Lay out what comes next for your agenda', 'Say the system was stacked against you'],
  bill: ['Credit the coalition that passed it', 'Explain what changes for families next', 'Dare critics to try repealing it'],
  project: ['Thank the crews and the community', 'Tie it to your plan for the next project', 'Contrast it with your opponents’ failures'],
  campaign: ['Share why you are running', 'Lay out your three-point plan', 'Go after your opponent’s record'],
};
export function responseChoices(inv: Invitation): ResponseChoice[] {
  const [safe, bold, risky] = LINES[inv.story.kind];
  const winLine = inv.story.kind === 'election' && inv.story.good ? 'Claim a mandate and dare the opposition to block you' : risky;
  return ([['safe', safe], ['bold', bold], ['risky', winLine]] as const).map(([tone, label]) => ({ id: tone, label, tone, hint: HINT[tone] }));
}

export function invitationBlock(c: Career, inv: Invitation): string | null {
  if (c.actions < ACTION_COST) return 'Not enough energy this turn.';
  if (socialOf(c).hubUsed[inv.channel] === c.date) return `You already made a ${inv.channel === 'tv' ? 'TV' : inv.channel} appearance this quarter.`;
  return null;
}

const BACKLASH: SupportGroupId[] = ['youth', 'religious', 'business', 'labor', 'veterans', 'rural'];
const audience = (o: Outlet): SupportGroupId => o.scope === 'Rural' ? 'rural' : o.slant.includes('left') || o.slant === 'Left' ? 'youth' : o.slant.includes('right') || o.slant === 'Right' ? 'business' : 'labor';

/** Invitations last exactly one quarter (one turn). Anything left unanswered when the turn advances expires. */
export const INVITATION_LIFETIME_MONTHS = 3;
export function expireInvitations(before: Career, after: Career): Career {
  const keys = hubInvitations(before).map(i => answeredKey(i.story, i.channel));
  if (!keys.length) return after;
  const s = socialOf(after);
  const fresh = keys.filter(k => !s.hubAnswered.includes(k));
  if (!fresh.length) return after;
  return { ...after, socialMedia: { ...s, hubAnswered: [...fresh, ...s.hubAnswered].slice(0, 150) } };
}

/** Accept an invitation and answer it. One action; one appearance per channel per quarter; never replays. */
export function answerInvitation(c: Career, invitationId: string, choiceId: string): Result {
  const inv = hubInvitations(c).find(i => i.id === invitationId);
  if (!inv) return { ok: false, message: 'This invitation is no longer open.' };
  const block = invitationBlock(c, inv);
  if (block) return { ok: false, message: block };
  const choice = responseChoices(inv).find(x => x.id === choiceId);
  if (!choice) return { ok: false, message: 'Choose a response.' };
  const tone = choice.tone, fr = friendliness(inv.outlet.slant, c.character.party);
  const baseWeight = WEIGHT[inv.channel];
  const roll = hash(`${c.character.name}|${inv.id}|${tone}`);
  const score = c.skills.communication * 0.6 + c.reputation * 0.2 + fr * 6 + roll * 40;
  const good = score >= BASE_DIFFICULTY[inv.channel] + (tone === 'safe' ? -12 : tone === 'risky' ? 10 : 0);
  const m = baseWeight * (good ? communicationsGain(c.campaign) : communicationsSeverity(c.campaign));
  const fmt = FORMATS[inv.format].label, reason = `${fmt} on ${inv.outlet.name}`;

  let n: Career = { ...c, actions: c.actions - ACTION_COST };
  const comm = good ? (tone === 'safe' ? 0.5 : 1) : 0.5;
  const rep = r1((good ? (tone === 'safe' ? 0.5 : tone === 'bold' ? 1 : 1.5) : tone === 'safe' ? 0 : tone === 'bold' ? -0.5 : -1.5) * m * (good && fr < 0 ? 1.5 : 1));
  n = { ...n, reputation: Math.max(0, r1(n.reputation + rep)), skills: { ...n.skills, communication: Math.min(100, r1(n.skills.communication + comm)) } };
  let approval = 0;
  if (holdsOffice(n)) {
    const raw = good ? (tone === 'safe' ? 0.5 : 1) : tone === 'safe' ? 0 : tone === 'bold' ? -0.5 : -1;
    n = ensureApproval(n);
    const before = n.approval?.overall ?? 0;
    n = applyActionApproval(n, `media-${inv.channel}`, raw, 'routine', reason, !good);
    approval = r1((n.approval?.overall ?? 0) - before);
  }
  const groups = inv.story.groups.length ? inv.story.groups : [audience(inv.outlet)];
  const deltas: Deltas = {};
  if (good) for (const g of tone === 'safe' ? groups.slice(0, 1) : groups.slice(0, 2)) deltas[g] = tone === 'risky' ? 2 : 1;
  if (tone === 'risky') { const hit = BACKLASH.find(g => !groups.includes(g) && hash(inv.id + g) < 0.5) ?? BACKLASH.find(g => !groups.includes(g))!; deltas[hit] = (deltas[hit] ?? 0) - 1; }
  if (!good && tone !== 'safe') deltas[groups[0]!] = (deltas[groups[0]!] ?? 0) - 1;
  if (Object.keys(deltas).length) n = shiftLoyalty(n, deltas, reason);
  if (n.campaign) {
    const support = good ? 0.5 * m : tone === 'safe' ? 0 : -0.3 * m, momentum = tone === 'risky' ? (good ? 2 : -1) : good ? 1 : 0;
    n = { ...n, campaign: { ...n.campaign, support: r1(n.campaign.support + support), momentum: r1(n.campaign.momentum + momentum) } };
  }
  const changes = [`reputation ${rep >= 0 ? '+' : ''}${rep}`, `communication +${comm}`, approval ? `approval ${approval > 0 ? '+' : ''}${approval}` : '', ...Object.entries(deltas).map(([g, d]) => `${supportGroupCatalog.find(x => x.id === g)?.name ?? g} ${d! > 0 ? '+' : ''}${d}`)].filter(Boolean).join(' · ');
  const outcome = `${good ? 'It landed well' : 'It did not land'}: ${changes}.`;
  const fed = eventReactions(n, { about: good ? `impressed on ${inv.outlet.name}` : `stumbled on ${inv.outlet.name}`, good }, c.date, FEED_INDEX[inv.channel]);
  const s = socialOf(n);
  n = { ...n, socialMedia: { ...s,
    followers: s.followers + (good ? Math.round(inv.outlet.reach / 2_000) : 0),
    hubAnswered: [answeredKey(inv.story, inv.channel), ...s.hubAnswered].slice(0, 150),
    hubUsed: { ...s.hubUsed, [inv.channel]: c.date },
    reactionFeed: [...fed, ...s.reactionFeed].slice(0, 30),
    broadcastHistory: [{ id: inv.id, date: c.date, kind: inv.channel, outlet: inv.outlet.name, point: choice.label, outcome, good }, ...s.broadcastHistory].slice(0, 20),
  } };
  if (inv.channel === 'newspaper') n = { ...n, newsQueue: [...n.newsQueue, { h: `${c.character.name} responds in ${inv.outlet.name}: ${inv.story.title}`, sub: `${fmt}: “${choice.label}.”`, body: `In a ${fmt.toLowerCase()} with ${inv.outlet.name}, ${c.character.name} addressed ${inv.story.title}. ${good ? 'Readers responded well.' : 'The response drew criticism.'}`, tag: 'media' }] };
  return { ok: true, career: n, message: `${reason}. ${outcome}` };
}

/** Turn an invitation down. Free; the outlet stops asking about this story on this channel. */
export function declineInvitation(c: Career, invitationId: string): Result {
  const inv = hubInvitations(c).find(i => i.id === invitationId);
  if (!inv) return { ok: false, message: 'This invitation is no longer open.' };
  const s = socialOf(c);
  return { ok: true, career: { ...c, socialMedia: { ...s, hubAnswered: [answeredKey(inv.story, inv.channel), ...s.hubAnswered].slice(0, 150) } }, message: `You declined ${inv.outlet.name}.` };
}

/** Open invitations per channel, counting a pending live TV/radio booking. */
export function invitationCounts(c: Career): Record<Channel, number> {
  const counts: Record<Channel, number> = { tv: 0, radio: 0, newspaper: 0 };
  for (const i of hubInvitations(c)) counts[i.channel]++;
  const live = socialOf(c).broadcast;
  if (live) counts[live.kind]++;
  return counts;
}
