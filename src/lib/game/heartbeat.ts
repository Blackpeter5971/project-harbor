import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import type { Result } from './support';
import type { HeartBeatMatch, HeartBeatPreference, HeartBeatState } from './heartbeat-schema';
import { socialOf as mediaOf } from './social-media';
import { PEOPLE, contactId, type SocialPerson } from './social-events';
import { ensureLife } from './life';
import {
  beginDating, datingAvailability, interactWithContact, interactionAvailability, interactionById,
  introduceRomanticContact, socialOf as circleOf,
} from './relationships';

export type HeartBeatGender = 'male' | 'female';
export interface HeartBeatProfile extends SocialPerson {
  gender: HeartBeatGender;
  interests: string[];
  traits: string[];
  attractedTo: string[];
  /** Optional custom portrait path kept on the contact/partner record. */
  portrait?: string;
}

const DETAILS: Record<string, Pick<HeartBeatProfile, 'gender' | 'interests' | 'traits' | 'attractedTo'>> = {
  'maya-chen': { gender: 'female', interests: ['Architecture', 'Museums', 'City walks'], traits: ['Witty', 'Creative', 'Curious'], attractedTo: ['Creative', 'Ambitious', 'Genuine'] },
  'marcus-bell': { gender: 'male', interests: ['Jazz', 'Cooking', 'Sunday brunch'], traits: ['Steady', 'Caring', 'Warm'], attractedTo: ['Grounded', 'Genuine', 'Family-oriented'] },
  'isabel-duarte': { gender: 'female', interests: ['Modern art', 'Vinyl', 'Late dinners'], traits: ['Bold', 'Creative', 'Sophisticated'], attractedTo: ['Sophisticated', 'Connected', 'Ambitious'] },
  'theo-nakamura': { gender: 'male', interests: ['Technology', 'Hiking', 'Independent films'], traits: ['Earnest', 'Curious', 'Ambitious'], attractedTo: ['Ambitious', 'Resilient', 'Intellectual'] },
  'nadia-okafor': { gender: 'female', interests: ['Human rights', 'Bookshops', 'Travel'], traits: ['Principled', 'Intellectual', 'Direct'], attractedTo: ['Grounded', 'Intellectual', 'Principled'] },
  'luca-moretti': { gender: 'male', interests: ['Restaurants', 'Family meals', 'Football'], traits: ['Warm', 'Generous', 'Outgoing'], attractedTo: ['Family-oriented', 'Outgoing', 'Genuine'] },
};

export const HEARTBEAT_PROFILES: HeartBeatProfile[] = PEOPLE.filter(p => p.archetypeId === 'romantic').map(p => ({ ...p, ...DETAILS[p.id]! }));
export const heartbeatProfile = (personId: string) => HEARTBEAT_PROFILES.find(p => p.id === personId);
export const emptyHeartBeat = (): HeartBeatState => ({ revision: 0, decisions: [], matches: [] });
export const heartbeatOf = (c: Career): HeartBeatState => mediaOf(c).heartbeat ?? emptyHeartBeat();
export const heartbeatMatch = (c: Career, personId: string): HeartBeatMatch | undefined => heartbeatOf(c).matches.find(m => m.personId === personId);

const put = (c: Career, h: HeartBeatState): Career => ({ ...c, socialMedia: { ...mediaOf(c), heartbeat: h } });
const changed = (c: Career, h: HeartBeatState): Career => put(c, { ...h, revision: h.revision + 1 });
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const hash = (text: string) => { let h = 2166136261; for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };

/** HeartBeat charm is derived from existing progress, not a new player stat: social confidence plus communication and relationships. */
export const heartbeatCharm = (c: Career) => clamp(20 + c.skills.communication * 0.6 + c.relationships * 2);

/** Display traits derived from the established character background, education and social development. */
export function heartbeatPlayerTraits(c: Career): string[] {
  const byBackground: Record<Career['character']['background'], string[]> = {
    'Nobody': ['Genuine', 'Resilient'],
    'Working-Class Family': ['Grounded', 'Family-oriented'],
    'Wealthy Family': ['Sophisticated', 'Connected'],
    'Political Dynasty': ['Ambitious', 'Connected'],
    'Self-Made': ['Ambitious', 'Resilient'],
  };
  const traits = [...byBackground[c.character.background]];
  if (['Law', 'Political Science', 'Advanced Degree'].includes(c.character.education)) traits.push('Intellectual');
  if (c.character.education === 'Military') traits.push('Disciplined');
  if (c.skills.communication >= 30) traits.push('Charismatic');
  if (c.relationships >= 4) traits.push('Outgoing');
  return [...new Set(traits)];
}

export interface MatchEvaluation { score: number; matched: boolean; charm: number; ageGap: number; sharedTraits: string[] }
export const MATCH_THRESHOLD = 45;

/** Deterministic mutual matching: age compatibility (30), charm (25), shared traits (30) and stable chemistry (15). */
export function evaluateMatch(c: Career, personId: string): MatchEvaluation | null {
  const p = heartbeatProfile(personId);
  if (!p) return null;
  const traits = heartbeatPlayerTraits(c);
  const sharedTraits = traits.filter(t => p.attractedTo.includes(t)).slice(0, 3);
  const ageGap = Math.abs(c.age - p.age);
  const agePoints = Math.max(0, 30 - Math.max(0, ageGap - 5) * 2);
  const charm = heartbeatCharm(c);
  const charmPoints = charm * 0.25;
  const chemistry = hash(`${c.character.name}|${p.id}|heartbeat`) * 15;
  const score = clamp(agePoints + charmPoints + sharedTraits.length * 10 + chemistry);
  return { score, matched: score >= MATCH_THRESHOLD, charm, ageGap, sharedTraits };
}

/** Undecided adults who are not already in the player's personal circle. */
export function browseHeartBeat(c: Career): HeartBeatProfile[] {
  const h = heartbeatOf(c), s = circleOf(c);
  const decided = new Set(h.decisions.map(d => d.personId));
  const known = new Set([...s.contacts.map(x => x.id), s.partner?.id ?? '']);
  const target = heartbeatTargetGender(c);
  if (!target) return [];
  return HEARTBEAT_PROFILES.filter(p => p.gender === target && p.age >= 18 && !decided.has(p.id) && !known.has(contactId(p)));
}

/** Straight targets the opposite gender, homosexual the same; null until a preference is chosen. */
export function heartbeatTargetGender(c: Career): HeartBeatGender | null {
  const pref = heartbeatOf(c).preference;
  if (!pref) return null;
  const own: HeartBeatGender = c.character.sex === 'Female' ? 'female' : 'male';
  const opposite: HeartBeatGender = own === 'male' ? 'female' : 'male';
  return pref === 'straight' ? opposite : own;
}

/** Records the player's orientation; existing matches and decisions are kept. */
export function setHeartBeatPreference(c: Career, preference: HeartBeatPreference): Career {
  return changed(c, { ...heartbeatOf(c), preference });
}

export type HeartBeatInput =
  | { type: 'decide'; personId: string; choice: 'like' | 'pass' }
  | { type: 'chat'; personId: string; text: string }
  | { type: 'ask-date'; personId: string }
  | { type: 'begin-dating'; personId: string }
  | { type: 'set-preference'; preference: HeartBeatPreference };
export type HeartBeatRequest = HeartBeatInput & { revision: number };

const together = (c: Career) => {
  const s = circleOf(c);
  return !!s.partner && ['dating', 'engaged', 'married'].includes(s.maritalStatus);
};

export function heartBeatDateBlock(c: Career, personId: string): string | null {
  const p = heartbeatProfile(personId);
  if (!p || !heartbeatMatch(c, personId)) return 'You need a mutual match first.';
  const s = circleOf(c), id = contactId(p);
  if (together(c) && s.partner?.id !== id) return 'You are already in a relationship.';
  if (s.contacts.some(x => x.id === id) || s.partner?.id === id) {
    const check = interactionAvailability(c, id, 'dinner');
    return check.ok ? null : check.reason;
  }
  const dinner = interactionById('dinner')!;
  if (c.actions < dinner.actions * ACTION_COST) return 'Not enough energy this turn.';
  if (c.money < dinner.cost) return `You need $${(dinner.cost - c.money).toLocaleString('en-US')} more in personal cash.`;
  return null;
}

const replyFor = (p: HeartBeatProfile, count: number) => [
  `I was hoping you would message. How is your week going?`,
  `You seem easy to talk to. Tell me something you care about outside work.`,
  `That sounds good. Maybe we can continue this over dinner?`,
  `I enjoyed that too. We should do it again soon.`,
][count % 4]!;

/** One revision-checked reducer for all HeartBeat mutations; Game always supplies the latest career. */
export function heartBeatAction(c: Career, request: HeartBeatRequest): Result {
  const h = heartbeatOf(c);
  if (request.revision !== h.revision) return { ok: false, message: 'HeartBeat changed in another view. Please try again.' };
  if (request.type === 'set-preference') {
    if (request.preference !== 'straight' && request.preference !== 'homosexual') return { ok: false, message: 'Choose who you want to meet.' };
    return { ok: true, career: setHeartBeatPreference(c, request.preference), message: 'HeartBeat preferences saved.' };
  }
  const p = heartbeatProfile(request.personId);
  if (!p) return { ok: false, message: 'That profile is no longer available.' };

  if (request.type === 'decide') {
    if (h.decisions.some(d => d.personId === p.id)) return { ok: false, message: 'You already decided on this profile.' };
    if (circleOf(c).contacts.some(x => x.id === contactId(p)) || circleOf(c).partner?.id === contactId(p)) return { ok: false, message: `${p.name} is already in your circle.` };
    const evaluation = evaluateMatch(c, p.id)!;
    const matched = request.choice === 'like' && evaluation.matched;
    const matches = matched ? [...h.matches, { personId: p.id, matchedOn: c.date, firstDate: null, messages: [{ id: `match-${h.revision}`, date: c.date, fromMe: false, text: `It's a match! I liked your profile too.` }] }] : h.matches;
    const next = { ...h, decisions: [...h.decisions, { personId: p.id, choice: request.choice, matched, date: c.date }], matches };
    const message = request.choice === 'pass' ? `You passed on ${p.name}.` : matched ? `It's a mutual match with ${p.name}!` : `You liked ${p.name}, but the feeling was not mutual this time.`;
    return { ok: true, career: changed(c, next), message };
  }

  const match = h.matches.find(m => m.personId === p.id);
  if (!match) return { ok: false, message: 'You need a mutual match first.' };

  if (request.type === 'chat') {
    const text = request.text.trim().slice(0, 240);
    if (!text) return { ok: false, message: 'Write a message first.' };
    const messages = [...match.messages,
      { id: `me-${h.revision}`, date: c.date, fromMe: true, text },
      { id: `reply-${h.revision}`, date: c.date, fromMe: false, text: replyFor(p, match.messages.filter(m => m.fromMe).length) },
    ].slice(-40);
    return { ok: true, career: changed(c, { ...h, matches: h.matches.map(m => m.personId === p.id ? { ...m, messages } : m) }), message: `Message sent to ${p.name}.` };
  }

  const base = ensureLife(c);
  if (request.type === 'ask-date') {
    const block = heartBeatDateBlock(base, p.id);
    if (block) return { ok: false, message: block };
    const id = contactId(p), s = circleOf(base), portrait = p.portrait;
    let prepared = base;
    if (!s.contacts.some(x => x.id === id) && s.partner?.id !== id) {
      const introduced = introduceRomanticContact(prepared, { id, name: p.name, role: p.role, affinity: 55, ...(portrait ? { portrait } : {}) });
      if (!introduced.ok) return introduced;
      prepared = introduced.career;
    }
    const dated = interactWithContact(prepared, id, 'dinner');
    if (!dated.ok) return dated;
    const nextMatch = { ...match, firstDate: match.firstDate ?? c.date, messages: [...match.messages, { id: `date-${h.revision}`, date: c.date, fromMe: false, text: replyFor(p, match.messages.filter(m => m.fromMe).length + 2) }].slice(-40) };
    return { ok: true, career: changed(dated.career, { ...h, matches: h.matches.map(m => m.personId === p.id ? nextMatch : m) }), message: `${dated.message} ${p.name} is in your Circle & Family.` };
  }

  const id = contactId(p);
  const availability = datingAvailability(base, id);
  if (!availability.ok) return { ok: false, message: availability.reason };
  const dating = beginDating(base, id);
  if (!dating.ok) return dating;
  return { ok: true, career: changed(dating.career, h), message: dating.message };
}
