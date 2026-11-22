import { ACTION_COST } from './energy-costs';
import type { Career, CharacterDraft } from './career';
import type { Result } from './support';

/** Personal social circle (Life 5A). Fully separate from political contacts, groups and party standing. Schema/catalog only. */
export type ArchetypeCategory = 'friend' | 'mentor' | 'professional' | 'family' | 'romantic';
export type ArchetypeId = 'confidant' | 'organizer' | 'executive' | 'mentor' | 'reporter' | 'parents' | 'sibling' | 'romantic';
export type ContactStatus = 'acquaintance' | 'friend' | 'close' | 'family' | 'estranged';
export type MaritalStatus = 'single' | 'dating' | 'engaged' | 'married' | 'divorced';
export type Trait = 'loyal' | 'ambitious' | 'idealistic' | 'pragmatic' | 'wise' | 'inquisitive' | 'generous' | 'protective' | 'charming';

export interface Archetype { id: ArchetypeId; category: ArchetypeCategory; role: string; defaultName: string; description: string; traits: Trait[]; baseAffinity: number; portrait: string }
export interface SocialContact { id: string; archetypeId: ArchetypeId; name: string; role: string; affinity: number; status: ContactStatus; portrait: string; lastInteraction?: string | undefined; neglect?: number | undefined }
export interface Partner extends SocialContact { weddingDate: string | null; sharedMonthlyExpenses: number; datingSince?: string | null | undefined }
export interface Dependent { id: string; name: string; age: number; supportCost: number }
export type FamilyImage = 'neutral' | 'stable' | 'strained';
export interface SocialState { contacts: SocialContact[]; maritalStatus: MaritalStatus; partner: Partner | null; dependents: Dependent[]; lastFamilyPeriod?: string | undefined; familyImage?: FamilyImage | undefined; household?: unknown }

export const archetypes: Archetype[] = [
  { id: 'confidant', category: 'friend', role: 'University Friend', defaultName: 'Daniel Reyes', description: 'Your oldest friend from college. Tells you the truth when nobody else will.', traits: ['loyal', 'pragmatic'], baseAffinity: 60, portrait: '/images/characters/confidant.jpg' },
  { id: 'organizer', category: 'friend', role: 'Grassroots Organizer', defaultName: 'Keisha Morgan', description: 'Knows every block captain in town and believes change starts at the door.', traits: ['idealistic', 'loyal'], baseAffinity: 40, portrait: '/images/characters/organizer.jpg' },
  { id: 'executive', category: 'professional', role: 'Executive & Philanthropist', defaultName: 'Eleanor Whitfield', description: 'A boardroom veteran who funds causes she believes in, and expects results.', traits: ['ambitious', 'generous'], baseAffinity: 25, portrait: '/images/characters/executive.jpg' },
  { id: 'mentor', category: 'mentor', role: 'Law Professor & Mentor', defaultName: 'Prof. Harold Brennan', description: 'A respected legal scholar who has advised governors and sees promise in you.', traits: ['wise', 'protective'], baseAffinity: 45, portrait: '/images/characters/mentor.jpg' },
  { id: 'reporter', category: 'professional', role: 'Political Columnist', defaultName: 'Sofia Alvarez', description: 'A sharp columnist who can make or break a reputation in one Sunday edition.', traits: ['inquisitive', 'ambitious'], baseAffinity: 20, portrait: '/images/characters/reporter.jpg' },
  { id: 'parents', category: 'family', role: 'Parents', defaultName: 'Mom & Dad', description: 'They raised you and still call every Sunday.', traits: ['protective', 'generous'], baseAffinity: 75, portrait: '/images/characters/parents.jpg' },
  { id: 'sibling', category: 'family', role: 'Younger Sister', defaultName: 'Emily', description: 'Proud of you, honest with you, and never impressed by titles.', traits: ['loyal', 'charming'], baseAffinity: 65, portrait: '/images/characters/sibling.jpg' },
  { id: 'romantic', category: 'romantic', role: 'Romantic Interest', defaultName: 'Julian Hart', description: 'You met at a fundraiser. The conversation went on long after the speeches ended.', traits: ['charming', 'idealistic'], baseAffinity: 30, portrait: '/images/characters/romantic.jpg' },
];

export const archetypeById = (id: string): Archetype | undefined => archetypes.find(a => a.id === id);
export const clampAffinity = (n: unknown, d = 50) => typeof n === 'number' && Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : d;
export const defaultSocial = (): SocialState => ({ contacts: [], maritalStatus: 'single', partner: null, dependents: [] });

const statuses: ContactStatus[] = ['acquaintance', 'friend', 'close', 'family', 'estranged'];
const marital: MaritalStatus[] = ['single', 'dating', 'engaged', 'married', 'divorced'];

export function contactFrom(a: Archetype, overrides: Partial<SocialContact> = {}): SocialContact {
  return { id: `contact-${a.id}`, archetypeId: a.id, name: a.defaultName, role: a.role, affinity: a.baseAffinity, status: a.category === 'family' ? 'family' : 'acquaintance', portrait: a.portrait, ...overrides };
}

function normContact(raw: any): SocialContact | null {
  const a = raw && typeof raw.id === 'string' ? archetypeById(raw.archetypeId) : undefined;
  if (!a) return null;
  return { id: raw.id, archetypeId: a.id, name: typeof raw.name === 'string' && raw.name ? raw.name : a.defaultName, role: typeof raw.role === 'string' && raw.role ? raw.role : a.role, affinity: clampAffinity(raw.affinity, a.baseAffinity), status: statuses.includes(raw.status) ? raw.status : 'acquaintance', portrait: a.portrait, ...(typeof raw.lastInteraction === 'string' ? { lastInteraction: raw.lastInteraction } : {}), ...(typeof raw.neglect === 'number' && raw.neglect > 0 ? { neglect: Math.round(raw.neglect) } : {}) };
}

/** Sanitizes saved social state; unknown archetypes and malformed entries are dropped, and a missing partner forces a coherent marital status. */
export function normalizeSocial(raw: any): SocialState {
  if (!raw || typeof raw !== 'object') return defaultSocial();
  const contacts = Array.isArray(raw.contacts) ? raw.contacts.map(normContact).filter((c: SocialContact | null): c is SocialContact => !!c) : [];
  const base = raw.partner ? normContact(raw.partner) : null;
  const partner: Partner | null = base ? { ...base, weddingDate: typeof raw.partner.weddingDate === 'string' ? raw.partner.weddingDate : null, sharedMonthlyExpenses: Math.max(0, Math.round(Number(raw.partner.sharedMonthlyExpenses) || 0)), ...(typeof raw.partner.datingSince === 'string' ? { datingSince: raw.partner.datingSince } : {}) } : null;
  let maritalStatus: MaritalStatus = marital.includes(raw.maritalStatus) ? raw.maritalStatus : 'single';
  if (!partner && (maritalStatus === 'dating' || maritalStatus === 'engaged' || maritalStatus === 'married')) maritalStatus = 'single';
  const dependents: Dependent[] = Array.isArray(raw.dependents) ? raw.dependents.flatMap((d: any) => d && typeof d.id === 'string' && typeof d.name === 'string' ? [{ id: d.id, name: d.name, age: Math.max(0, Math.round(Number(d.age) || 0)), supportCost: Math.max(0, Math.round(Number(d.supportCost) || 0)) }] : []) : [];
  return { contacts, maritalStatus, partner, dependents, ...(typeof raw.lastFamilyPeriod === 'string' ? { lastFamilyPeriod: raw.lastFamilyPeriod } : {}), ...(raw.familyImage === 'stable' || raw.familyImage === 'strained' || raw.familyImage === 'neutral' ? { familyImage: raw.familyImage as FamilyImage } : {}), ...(raw.household && typeof raw.household === 'object' ? { household: raw.household } : {}), ...(raw.pendingSocialEvent && typeof raw.pendingSocialEvent.eventId === 'string' ? { pendingSocialEvent: raw.pendingSocialEvent } : {}), ...(Array.isArray(raw.introductions) ? { introductions: raw.introductions.filter((i: any) => i && typeof i.personId === 'string') } : {}) } as SocialState;
}

/** Starting personal circle by background lore. Everyone keeps their university friend; families and dynasties start closer to home. */
export function startingSocial(background: CharacterDraft['background']): SocialState {
  const a = (id: ArchetypeId) => archetypeById(id)!;
  const friend = contactFrom(a('confidant'), { status: 'friend' });
  switch (background) {
    case 'Political Dynasty': return { ...defaultSocial(), contacts: [contactFrom(a('parents'), { name: 'The Senator & Mrs.', affinity: 70 }), contactFrom(a('sibling')), contactFrom(a('mentor'), { affinity: 60, status: 'friend' }), friend] };
    case 'Wealthy Family': return { ...defaultSocial(), contacts: [contactFrom(a('parents'), { affinity: 70 }), contactFrom(a('executive'), { affinity: 40 }), friend] };
    case 'Working-Class Family': return { ...defaultSocial(), contacts: [contactFrom(a('parents'), { affinity: 80 }), contactFrom(a('sibling'), { affinity: 70 }), friend] };
    case 'Self-Made': return { ...defaultSocial(), contacts: [friend, contactFrom(a('organizer'))] };
    default: return { ...defaultSocial(), contacts: [friend] };
  }
}


/* ---------- Interactions & romance (Life 5C): personal cash + personal ledger only ---------- */

export type InteractionType = 'coffee' | 'dinner' | 'gift';
export interface Interaction { id: InteractionType; name: string; romanticName: string; short: string; romanticShort: string; cost: number; actions: number; affinity: number; stress: number }
export const interactionCatalog: Interaction[] = [
  { id: 'coffee', name: 'Coffee Chat', romanticName: 'Coffee Chat', short: 'Coffee', romanticShort: 'Coffee', cost: 50, actions: 1, affinity: 5, stress: -5 },
  { id: 'dinner', name: 'Formal Dinner', romanticName: 'Romantic Date', short: 'Dinner', romanticShort: 'Date', cost: 250, actions: 1, affinity: 12, stress: -15 },
  { id: 'gift', name: 'Thoughtful Gift', romanticName: 'Thoughtful Gift', short: 'Gift', romanticShort: 'Gift', cost: 500, actions: 0, affinity: 20, stress: 0 },
];
export const interactionById = (id: string) => interactionCatalog.find(i => i.id === id);

export const DATING_AFFINITY = 75;
export const PROPOSAL_AFFINITY = 90;
export const WEDDING_MIN_BUDGET = 2000;
export const WEDDING_MAX_BUDGET = 25000;
export const MARRIED_QUARTERLY_COST = 500;
export const CHILD_QUARTERLY_COST = 600;
export const HAPPY_FAMILY_AFFINITY = 60;
export const FAMILY_STRESS_RELIEF = 5;
export const MEET_COST = 100;
export const weddingPackages = [
  { id: 'courthouse', name: 'Courthouse Ceremony', budget: 2000 },
  { id: 'classic', name: 'Classic Wedding', budget: 10000 },
  { id: 'grand', name: 'Grand Celebration', budget: 25000 },
] as const;
/** A slight public-image lift: +1 reputation, +2 from $10,000, +3 at $25,000. */
export const weddingReputation = (budget: number) => (budget >= 25000 ? 3 : budget >= 10000 ? 2 : 1);

const usd = (n: number) => `$${n.toLocaleString('en-US')}`;
const together = (s: SocialState) => !!s.partner && (s.maritalStatus === 'dating' || s.maritalStatus === 'engaged' || s.maritalStatus === 'married');
export const socialOf = (c: Career): SocialState => normalizeSocial(c.life?.social);
const withSocial = (c: Career, social: SocialState): Career => ({ ...c, life: { ...c.life!, social } });
const charge = (c: Career, label: string, amount: number): Career => (amount > 0 ? { ...c, money: c.money - amount, ledger: [{ month: c.date, label, amount: -amount }, ...c.ledger] } : c);
const isRomantic = (c: SocialContact, s: SocialState) => c.archetypeId === 'romantic' || (together(s) && s.partner!.id === c.id);
export const interactionLabel = (i: Interaction, romantic: boolean) => (romantic ? i.romanticName : i.name);

function statusFor(prev: ContactStatus, affinity: number): ContactStatus {
  if (prev === 'family') return 'family';
  if (affinity >= 80) return 'close';
  if (affinity >= 55) return 'friend';
  return prev === 'estranged' && affinity < 30 ? 'estranged' : 'acquaintance';
}

export interface Availability { ok: boolean; reason: string }
/** Why an interaction is or is not available right now; the UI and the transaction share this check. One visit per person per turn. */
export function interactionAvailability(c: Career, personId: string, type: InteractionType): Availability {
  const i = interactionById(type);
  const s = socialOf(c);
  const person = s.contacts.find(x => x.id === personId) ?? (together(s) && s.partner!.id === personId ? s.partner! : undefined);
  if (!i || !c.life || !person) return { ok: false, reason: 'That person is not in your circle.' };
  if (person.lastInteraction === c.date) return { ok: false, reason: `You already saw ${person.name} this turn.` };
  if (c.actions < i.actions * ACTION_COST) return { ok: false, reason: 'Not enough energy this turn.' };
  if (c.money < i.cost) return { ok: false, reason: `You need ${usd(i.cost - c.money)} more in personal cash.` };
  return { ok: true, reason: '' };
}

/** Coffee, dinner/date or gift with a contact or partner. Spends personal cash only (career.money); campaign funds and treasury are untouched. */
export function interactWithContact(c: Career, contactId: string, actionType: InteractionType): Result {
  const check = interactionAvailability(c, contactId, actionType);
  if (!check.ok) return { ok: false, message: check.reason };
  const i = interactionById(actionType)!;
  const s = socialOf(c);
  const isPartner = !s.contacts.some(x => x.id === contactId);
  const person = isPartner ? s.partner! : s.contacts.find(x => x.id === contactId)!;
  const label = interactionLabel(i, isRomantic(person, s));
  const affinity = clampAffinity(person.affinity + i.affinity);
  const stress = Math.max(0, Math.min(100, Math.round((c.life!.stress ?? 0) + i.stress)));
  const paid = charge({ ...c, actions: c.actions - i.actions * ACTION_COST }, `Social · ${label} with ${person.name}`, i.cost);
  const next: SocialState = isPartner
    ? { ...s, partner: { ...s.partner!, affinity, lastInteraction: c.date } }
    : { ...s, contacts: s.contacts.map(x => (x.id === contactId ? { ...x, affinity, status: statusFor(x.status, affinity), lastInteraction: c.date } : x)) };
  const eased = c.life!.stress - stress;
  return { ok: true, message: `${label} with ${person.name} for ${usd(i.cost)}. Affinity is now ${affinity}%.${eased > 0 ? ` Stress eased by ${eased}.` : ''}`, career: withSocial({ ...paid, life: { ...paid.life!, stress } }, next) };
}

/** Meet someone new at a community event: adds the next archetype not yet in your life. 1 action and a $100 ticket from personal cash. */
const meetOrder: ArchetypeId[] = ['romantic', 'organizer', 'executive', 'mentor', 'reporter'];
export function nextAcquaintance(c: Career): Archetype | undefined {
  const s = socialOf(c);
  return meetOrder.map(id => archetypeById(id)!).find(a => !s.contacts.some(x => x.archetypeId === a.id) && s.partner?.archetypeId !== a.id);
}
export function meetNewPeople(c: Career): Result {
  const a = nextAcquaintance(c);
  if (!c.life || !a) return { ok: false, message: 'You already know everyone on the local circuit.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  if (c.money < MEET_COST) return { ok: false, message: `You need ${usd(MEET_COST - c.money)} more in personal cash for the event ticket.` };
  const paid = charge({ ...c, actions: c.actions - ACTION_COST }, 'Social · Community reception ticket', MEET_COST);
  const s = socialOf(c);
  return { ok: true, message: `You met ${a.defaultName}, ${a.role.toLowerCase()}, at a community reception.`, career: withSocial(paid, { ...s, contacts: [...s.contacts, contactFrom(a)] }) };
}

/** Add a specifically identified romantic prospect without disturbing the existing partner, children or family markers. */
export function introduceRomanticContact(c: Career, person: { id: string; name: string; role: string; affinity?: number; portrait?: string }): Result {
  if (!c.life) return { ok: false, message: 'Your personal life is unavailable.' };
  if (!person.id.trim() || !person.name.trim()) return { ok: false, message: 'That person cannot join your circle.' };
  const s = socialOf(c);
  if (s.contacts.some(x => x.id === person.id) || s.partner?.id === person.id) return { ok: false, message: `${person.name} is already in your circle.` };
  const archetype = archetypeById('romantic')!;
  const contact = contactFrom(archetype, {
    id: person.id, name: person.name.trim(), role: person.role.trim() || archetype.role,
    affinity: clampAffinity(person.affinity ?? 55), ...(person.portrait ? { portrait: person.portrait } : {}),
  });
  return { ok: true, message: `${contact.name} is now part of your circle.`, career: withSocial(c, { ...s, contacts: [...s.contacts, contact] }) };
}

/** Friends and romantic interests can become partners once affinity reaches 75 while you are single or divorced. */
export function datingAvailability(c: Career, contactId: string): Availability & { eligible: boolean } {
  const s = socialOf(c);
  const person = s.contacts.find(x => x.id === contactId);
  const cat = person ? archetypeById(person.archetypeId)?.category : undefined;
  const eligible = cat === 'romantic' || cat === 'friend';
  if (!person || !eligible) return { ok: false, eligible: false, reason: 'Not a romantic prospect.' };
  if (together(s)) return { ok: false, eligible, reason: 'You are already in a relationship.' };
  if (person.affinity < DATING_AFFINITY) return { ok: false, eligible, reason: `Reach ${DATING_AFFINITY}% affinity to begin dating.` };
  return { ok: true, eligible, reason: '' };
}

export function beginDating(c: Career, contactId: string): Result {
  const check = datingAvailability(c, contactId);
  if (!c.life || !check.ok) return { ok: false, message: check.reason };
  const s = socialOf(c);
  const person = s.contacts.find(x => x.id === contactId)!;
  const partner: Partner = { ...person, status: 'close', weddingDate: null, sharedMonthlyExpenses: 0, datingSince: c.date };
  return { ok: true, message: `You and ${person.name} are now dating.`, career: withSocial(c, { ...s, contacts: s.contacts.filter(x => x.id !== contactId), maritalStatus: 'dating', partner }) };
}

/** Stable housing: no arrears or missed rent, and a home of your own (owned, or rented beyond a shared room). */
export function hasStableHousing(c: Career): boolean {
  const h = c.housing;
  if (!h || (h.arrears ?? 0) > 0 || (h.missedQuarters ?? 0) > 0) return false;
  return h.status === 'owning' || h.currentPropertyId !== 'room';
}

export interface ProposalCheck { ok: boolean; affinity: boolean; housing: boolean; time: boolean; reason: string }
/** Proposal needs 90% partner affinity, stable housing, and at least one full turn of dating. */
export function proposalAvailability(c: Career): ProposalCheck {
  const s = socialOf(c);
  if (s.maritalStatus !== 'dating' || !s.partner) return { ok: false, affinity: false, housing: false, time: false, reason: 'You need to be dating someone first.' };
  const affinity = s.partner.affinity >= PROPOSAL_AFFINITY;
  const housing = hasStableHousing(c);
  const time = !!s.partner.datingSince && s.partner.datingSince < c.date;
  const reason = !affinity ? `Reach ${PROPOSAL_AFFINITY}% affinity with ${s.partner.name}.` : !housing ? 'Settle into stable housing first: no rent owed and more than a shared room.' : !time ? 'Give the relationship at least one turn.' : '';
  return { ok: affinity && housing && time, affinity, housing, time, reason };
}

export function proposeMarriage(c: Career): Result {
  const check = proposalAvailability(c);
  if (!c.life || !check.ok) return { ok: false, message: check.reason };
  const s = socialOf(c);
  return { ok: true, message: `${s.partner!.name} said yes. Plan the wedding when you are ready.`, career: withSocial(c, { ...s, maritalStatus: 'engaged' }) };
}

/** Wedding paid from personal cash ($2,000–$25,000). Sets status to married, binds the partner and lifts reputation slightly. */
export function holdWedding(c: Career, budget: number): Result {
  const s = socialOf(c);
  if (!c.life || s.maritalStatus !== 'engaged' || !s.partner) return { ok: false, message: 'You need to be engaged before planning a wedding.' };
  if (!Number.isFinite(budget) || Math.round(budget) !== budget || budget < WEDDING_MIN_BUDGET || budget > WEDDING_MAX_BUDGET) return { ok: false, message: `Choose a wedding budget between ${usd(WEDDING_MIN_BUDGET)} and ${usd(WEDDING_MAX_BUDGET)}.` };
  if (c.money < budget) return { ok: false, message: `You need ${usd(budget - c.money)} more in personal cash for this wedding.` };
  const rep = weddingReputation(budget);
  const paid = charge(c, `Wedding · ${s.partner.name}`, budget);
  const married: SocialState = { ...s, maritalStatus: 'married', partner: { ...s.partner, status: 'family', weddingDate: c.date } };
  return { ok: true, message: `You married ${s.partner.name}. The ${usd(budget)} wedding lifted your reputation by ${rep}.`, career: withSocial({ ...paid, reputation: Math.min(100, Math.round((paid.reputation + rep) * 10) / 10) }, married) };
}

export interface FamilyCosts { household: number; children: number; total: number }
/** Quarterly family support: $500 shared household when married, $600 per child. Preview only; billing joins the turn later. */
export function familyCosts(s: SocialState): FamilyCosts {
  const household = s.maritalStatus === 'married' && s.partner ? MARRIED_QUARTERLY_COST : 0;
  const children = s.dependents.length * CHILD_QUARTERLY_COST;
  return { household, children, total: household + children };
}

/** A happy marriage (partner affinity 60%+) eases 5 stress per turn. Read-only helper for turn processing. */
export const familyStressRelief = (s: SocialState) => (s.maritalStatus === 'married' && s.partner && s.partner.affinity >= HAPPY_FAMILY_AFFINITY ? FAMILY_STRESS_RELIEF : 0);
