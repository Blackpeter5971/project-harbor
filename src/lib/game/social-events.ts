import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import type { Result } from './support';
import { archetypeById, socialOf, type ArchetypeId, type SocialContact, type SocialState } from './relationships';

/** Party & Social Events: attending queues one introduction that resolves after the turn; the player then accepts or declines it. */
export interface SocialPerson { id: string; archetypeId: Exclude<ArchetypeId, 'parents' | 'sibling'>; name: string; age: number; role: string; bio: string; personality: string; background: string }
export const PEOPLE: SocialPerson[] = [
  { id: 'maya-chen', archetypeId: 'romantic', name: 'Maya Chen', age: 29, role: 'Architect', bio: 'Designs public libraries and argues about zoning for fun.', personality: 'Witty', background: 'Middle class' },
  { id: 'marcus-bell', archetypeId: 'romantic', name: 'Marcus Bell', age: 34, role: 'ER Physician', bio: 'Works nights, cooks brunch, never misses a jazz show.', personality: 'Steady', background: 'Working class' },
  { id: 'isabel-duarte', archetypeId: 'romantic', name: 'Isabel Duarte', age: 31, role: 'Gallery Owner', bio: 'Collects young artists and old vinyl.', personality: 'Bold', background: 'Affluent' },
  { id: 'theo-nakamura', archetypeId: 'romantic', name: 'Theo Nakamura', age: 27, role: 'Software Founder', bio: 'Building an app for farmers; terrible at small talk, great at listening.', personality: 'Earnest', background: 'Self-made' },
  { id: 'nadia-okafor', archetypeId: 'romantic', name: 'Nadia Okafor', age: 38, role: 'Human Rights Lawyer', bio: 'Back from a decade abroad and impatient with excuses.', personality: 'Principled', background: 'Immigrant family' },
  { id: 'luca-moretti', archetypeId: 'romantic', name: 'Luca Moretti', age: 42, role: 'Restaurateur', bio: 'Runs three trattorias and remembers every regular\u2019s order.', personality: 'Warm', background: 'Small business' },
  { id: 'sam-whitaker', archetypeId: 'confidant', name: 'Sam Whitaker', age: 36, role: 'High School Teacher', bio: 'Coaches debate and calls out nonsense kindly.', personality: 'Honest', background: 'Working class' },
  { id: 'priya-raman', archetypeId: 'confidant', name: 'Priya Raman', age: 33, role: 'Nurse Practitioner', bio: 'Shows up with soup before you knew you were sick.', personality: 'Caring', background: 'Middle class' },
  { id: 'jamal-greene', archetypeId: 'organizer', name: 'Jamal Greene', age: 30, role: 'Union Steward', bio: 'Knows every shift worker at the port by name.', personality: 'Fiery', background: 'Working class' },
  { id: 'rosa-lindqvist', archetypeId: 'organizer', name: 'Rosa Lindqvist', age: 45, role: 'Food Bank Director', bio: 'Turns church basements into lifelines.', personality: 'Tireless', background: 'Rural' },
  { id: 'victor-hale', archetypeId: 'executive', name: 'Victor Hale', age: 55, role: 'Shipping Magnate', bio: 'Old money, new ideas, and a long memory for favors.', personality: 'Calculating', background: 'Old money' },
  { id: 'amara-singh', archetypeId: 'executive', name: 'Amara Singh', age: 41, role: 'Biotech CEO', bio: 'Took her lab public at 35 and funds STEM scholarships.', personality: 'Driven', background: 'Self-made' },
  { id: 'ruth-abernathy', archetypeId: 'mentor', name: 'Judge Ruth Abernathy', age: 67, role: 'Retired Judge', bio: 'Spent thirty years on the bench and still reads every brief.', personality: 'Wise', background: 'Established' },
  { id: 'omar-haddad', archetypeId: 'mentor', name: 'Omar Haddad', age: 60, role: 'Former Mayor', bio: 'Lost his last race gracefully and now teaches others to win.', personality: 'Patient', background: 'Immigrant family' },
  { id: 'claire-dupont', archetypeId: 'reporter', name: 'Claire Dupont', age: 35, role: 'TV Anchor', bio: 'Evening news face with a nose for a quiet scandal.', personality: 'Curious', background: 'Middle class' },
  { id: 'ben-osei', archetypeId: 'reporter', name: 'Ben Osei', age: 28, role: 'Podcast Host', bio: 'His civic podcast tops the local charts.', personality: 'Playful', background: 'Self-made' },
];
export const personById = (id: string) => PEOPLE.find(p => p.id === id);
export const contactId = (p: SocialPerson) => `contact-p-${p.id}`;

export interface SocialEvent { id: string; name: string; venue: string; cost: number; minReputation: number; leans: SocialPerson['archetypeId'][] }
export const SOCIAL_EVENTS: SocialEvent[] = [
  { id: 'birthday', name: 'Birthday Celebration', venue: 'a friend\u2019s birthday celebration', cost: 5000, minReputation: 0, leans: ['confidant', 'romantic', 'organizer'] },
  { id: 'reception', name: 'Political Reception', venue: 'a political reception', cost: 15000, minReputation: 0, leans: ['mentor', 'reporter', 'organizer'] },
  { id: 'networking', name: 'Business Networking Night', venue: 'a business networking night', cost: 25000, minReputation: 0, leans: ['executive', 'romantic', 'mentor'] },
  { id: 'party', name: 'Private Party', venue: 'a private party', cost: 40000, minReputation: 0, leans: ['romantic', 'confidant', 'reporter'] },
  { id: 'charity', name: 'Charity Gala', venue: 'a charity gala', cost: 60000, minReputation: 30, leans: ['executive', 'organizer', 'romantic'] },
  { id: 'exclusive', name: 'Exclusive Invitation', venue: 'an invitation-only soir\u00e9e', cost: 100000, minReputation: 70, leans: ['executive', 'mentor', 'romantic'] },
];

export interface Introduction { personId: string; venue: string }
type Ext = SocialState & { pendingSocialEvent?: { eventId: string; period: string }; introductions?: Introduction[] };
const ext = (c: Career) => socialOf(c) as Ext;
const put = (c: Career, s: Ext): Career => ({ ...c, life: { ...c.life!, social: s } });
const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };

const knownIds = (s: Ext) => new Set([...s.contacts.map(x => x.id), s.partner?.id ?? '', ...(s.introductions ?? []).map(i => `contact-p-${i.personId}`)]);
export const undiscovered = (c: Career) => { const s = ext(c); const k = knownIds(s); const names = new Set([...s.contacts.map(x => x.name), s.partner?.name]); return PEOPLE.filter(p => !k.has(contactId(p)) && !names.has(p.name) && p.age >= 18); };
export const pendingIntroductions = (c: Career): (Introduction & { person: SocialPerson })[] => (ext(c).introductions ?? []).flatMap(i => { const person = personById(i.personId); return person ? [{ ...i, person }] : []; });
export const pendingEventOf = (c: Career) => { const p = ext(c).pendingSocialEvent; return p ? SOCIAL_EVENTS.find(e => e.id === p.eventId) : undefined; };

export function eventAvailability(c: Career, e: SocialEvent): { ok: true } | { ok: false; reason: string } {
  if (!c.life) return { ok: false, reason: 'Unavailable.' };
  if (ext(c).pendingSocialEvent) return { ok: false, reason: 'You already have plans this turn.' };
  if (c.reputation < e.minReputation) return { ok: false, reason: `Needs ${e.minReputation} reputation for an invite.` };
  if (c.actions < ACTION_COST) return { ok: false, reason: 'Not enough energy this turn.' };
  if (c.money < e.cost) return { ok: false, reason: `Need $${(e.cost - c.money).toLocaleString('en-US')} more.` };
  return { ok: true };
}

/** Attend an event: 1 action + ticket from personal cash, small stress relief. No one is added until after the turn. */
export function attendSocialEvent(c: Career, eventId: string): Result {
  const e = SOCIAL_EVENTS.find(x => x.id === eventId);
  if (!e) return { ok: false, message: 'Unknown event.' };
  const a = eventAvailability(c, e);
  if (!a.ok) return { ok: false, message: a.reason };
  const paid: Career = { ...c, actions: c.actions - ACTION_COST, money: c.money - e.cost, ledger: [{ month: c.date, label: `Social · ${e.name}`, amount: -e.cost }, ...c.ledger], life: { ...c.life!, stress: Math.max(0, c.life!.stress - 3) } };
  return { ok: true, message: `You RSVP'd to ${e.venue}. See who you meet after the turn.`, career: put(paid, { ...ext(c), pendingSocialEvent: { eventId: e.id, period: c.date } }) };
}

/** Post-turn: resolves the attended event (75%) or an occasional mutual-friend introduction (15%). Deterministic per date. */
export function socialEventsTurn(c: Career): { career: Career; notices: string[] } {
  if (!c.life) return { career: c, notices: [] };
  const s = ext(c);
  const pend = s.pendingSocialEvent;
  const pool = undiscovered(c);
  const intros = s.introductions ?? [];
  const { pendingSocialEvent: _p, ...rest } = s;
  void _p;
  const roll = hash(`${c.character.name}|${c.date}|social`);
  let venue = '';
  let leans: SocialPerson['archetypeId'][] = [];
  if (pend) { const e = SOCIAL_EVENTS.find(x => x.id === pend.eventId); if (e && roll < 0.75) { venue = e.venue; leans = e.leans; } }
  else { const friend = s.contacts.find(x => x.status === 'friend' || x.status === 'close'); if (friend && roll < 0.15) { venue = `${friend.name}\u2019s introduction`; leans = ['confidant', 'romantic', 'organizer', 'executive']; } }
  if (!venue || !pool.length || intros.length >= 3) {
    return { career: pend ? put(c, rest) : c, notices: pend ? ['Social: you enjoyed the evening, but nobody new stood out.'] : [] };
  }
  const leaned = pool.filter(p => leans.includes(p.archetypeId));
  const from = leaned.length ? leaned : pool;
  const person = from[Math.floor(hash(`${c.date}|pick|${pool.length}`) * from.length)]!;
  const notice = `Social: at ${venue} you were introduced to ${person.name}, ${person.role.toLowerCase()}. Decide in Family & Circle whether to stay in touch.`;
  return { career: put(c, { ...rest, introductions: [...intros, { personId: person.id, venue }] }), notices: [notice] };
}

export function respondToIntroduction(c: Career, personId: string, accept: boolean): Result {
  const s = ext(c);
  const intro = (s.introductions ?? []).find(i => i.personId === personId);
  const p = personById(personId);
  if (!intro || !p || !c.life) return { ok: false, message: 'That introduction is no longer open.' };
  const introductions = (s.introductions ?? []).filter(i => i.personId !== personId);
  if (!accept) return { ok: true, message: `You politely let things with ${p.name} rest.`, career: put(c, { ...s, introductions }) };
  const a = archetypeById(p.archetypeId)!;
  const contact: SocialContact = { id: contactId(p), archetypeId: p.archetypeId, name: p.name, role: p.role, affinity: Math.max(15, a.baseAffinity - 5), status: 'acquaintance', portrait: a.portrait };
  return { ok: true, message: `${p.name} is now part of your circle.`, career: put(c, { ...s, introductions, contacts: [...s.contacts, contact] }) };
}
