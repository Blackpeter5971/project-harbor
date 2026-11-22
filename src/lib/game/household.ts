import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import { clampAffinity, socialOf, type Dependent, type SocialState } from './relationships';
import type { Result } from './support';

/** Phase 6 household layer: harmony, family roster profiles, quarterly family actions, child stages, events, separation.
 * Saved under life.social.household (normalized here so old saves default). Money moves only through career.money + personal ledger. */
export type Personality = 'warm' | 'driven' | 'reserved' | 'spirited' | 'thoughtful' | 'stubborn';
export type ChildPath = 'none' | 'career' | 'business' | 'politics';
export type ChildStage = 'Early Childhood' | 'School Age' | 'Teen' | 'Adult';
export interface ChildProfile { personality: Personality; ambition: number; education: number; health: number; path: ChildPath; affinity: number }
export interface InLaw { id: string; name: string; role: string; occupation: string; affinity: number }
export interface FamilyEvent { id: string; date: string; title: string; text: string; amount?: number }
export interface FamilyRequest { id: string; kind: 'loan' | 'favor'; from: string; amount: number; date: string }
export interface Household {
  harmony: number; children: Record<string, ChildProfile>; inLaws: InLaw[]; used: Record<string, string>;
  events: FamilyEvent[]; request: FamilyRequest | null; separatedSince: string | null; lastPeriod: string; scandalsSeen: number; supportiveSince: string | null;
}

export const PERSONALITIES: Personality[] = ['warm', 'driven', 'reserved', 'spirited', 'thoughtful', 'stubborn'];
export const SEPARATION_AFFINITY = 20;
export const RECONCILE_AFFINITY = 40;
export const DIVORCE_QUARTERS = 2;
export const DIVORCE_SETTLEMENT = 0.25;
export const SUPPORTIVE_AFFINITY = 80;
export const SUPPORTIVE_HARMONY = 70;
export const SCANDAL_STRAIN = 8;
export const NEGLECT_HARMONY = 4;
export const OVERWORK_STRESS = 75;
export const EVENT_CHANCE = 0.4;
const EVENT_CAP = 8;

const hash = (seed: string) => { let h = 2166136261; for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 2 ** 32; };
const pick = <T,>(xs: readonly T[], seed: string): T => xs[Math.floor(hash(seed) * xs.length)]!;
const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
const usd = (n: number) => `$${n.toLocaleString('en-US')}`;
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export const childStage = (age: number): ChildStage => (age < 6 ? 'Early Childhood' : age < 13 ? 'School Age' : age < 18 ? 'Teen' : 'Adult');
export function defaultChild(d: Dependent): ChildProfile {
  return { personality: pick(PERSONALITIES, `${d.id}|p`), ambition: 30 + Math.floor(hash(`${d.id}|a`) * 60), education: Math.min(60, d.age * 3), health: 80 + Math.floor(hash(`${d.id}|h`) * 20), path: 'none', affinity: 70 };
}

export function householdOf(s: SocialState): Household {
  const r: any = s.household && typeof s.household === 'object' ? s.household : {};
  const children: Record<string, ChildProfile> = {};
  for (const d of s.dependents) {
    const x = r.children?.[d.id], b = defaultChild(d);
    children[d.id] = x && typeof x === 'object' ? { personality: PERSONALITIES.includes(x.personality) ? x.personality : b.personality, ambition: clamp(num(x.ambition, b.ambition)), education: clamp(num(x.education, b.education)), health: clamp(num(x.health, b.health)), path: ['none', 'career', 'business', 'politics'].includes(x.path) ? x.path : 'none', affinity: clamp(num(x.affinity, 70)) } : b;
  }
  const inLaws: InLaw[] = Array.isArray(r.inLaws) ? r.inLaws.filter((x: any) => x && typeof x.id === 'string' && typeof x.name === 'string').map((x: any) => ({ id: x.id, name: x.name, role: String(x.role ?? 'In-Law'), occupation: String(x.occupation ?? 'Retired'), affinity: clamp(num(x.affinity, 50)) })) : [];
  const used: Record<string, string> = r.used && typeof r.used === 'object' ? Object.fromEntries(Object.entries(r.used).filter(([, v]) => typeof v === 'string')) as Record<string, string> : {};
  const events: FamilyEvent[] = Array.isArray(r.events) ? r.events.filter((e: any) => e && typeof e.id === 'string' && typeof e.title === 'string').slice(0, EVENT_CAP) : [];
  const q = r.request;
  const request: FamilyRequest | null = q && typeof q.id === 'string' && (q.kind === 'loan' || q.kind === 'favor') ? { id: q.id, kind: q.kind, from: String(q.from ?? 'A relative'), amount: Math.max(0, Math.round(num(q.amount, 0))), date: String(q.date ?? '') } : null;
  return { harmony: clamp(num(r.harmony, baselineHarmony(s))), children, inLaws, used, events, request, separatedSince: typeof r.separatedSince === 'string' ? r.separatedSince : null, lastPeriod: typeof r.lastPeriod === 'string' ? r.lastPeriod : '', scandalsSeen: Math.max(0, Math.round(num(r.scandalsSeen, -1))), supportiveSince: typeof r.supportiveSince === 'string' ? r.supportiveSince : null };
}

function baselineHarmony(s: SocialState): number {
  const fam = s.contacts.filter(x => x.status === 'family').map(x => x.affinity);
  const vals = [...(s.partner && s.maritalStatus !== 'single' ? [s.partner.affinity] : []), ...fam];
  return vals.length ? clamp(vals.reduce((a, b) => a + b, 0) / vals.length) : 60;
}

const withHousehold = (c: Career, s: SocialState, h: Household): Career => ({ ...c, life: { ...c.life!, social: { ...s, household: h } } });
const charge = (c: Career, label: string, amount: number, date = c.date): Career => (amount > 0 ? { ...c, money: c.money - amount, ledger: [{ month: date, label, amount: -amount }, ...c.ledger] } : c);
const addEvent = (h: Household, e: FamilyEvent): Household => ({ ...h, events: [e, ...h.events.filter(x => x.id !== e.id)].slice(0, EVENT_CAP) });

// ---------- Roster (read-only) ----------
export interface FamilyMember { id: string; kind: 'Spouse' | 'Partner' | 'Child' | 'Parent' | 'Sibling' | 'In-Law'; name: string; portrait: string; age: number; health: number; personality: Personality; occupation: string; ambition: number; affinity: number; stage?: ChildStage; path?: ChildPath; education?: number }
const OCCUPATIONS = ['Teacher', 'Nurse', 'Attorney', 'Architect', 'Small-business owner', 'Engineer', 'Journalist', 'Physician'];
const PARENT_JOBS = ['Retired teacher', 'Retired factory foreman', 'Retired judge', 'Shop owner', 'Retired nurse'];
const IN_LAW_JOBS = ['Retired banker', 'Pastor', 'Real-estate agent', 'Retired police captain', 'Farmer'];

export function familyRoster(c: Career): FamilyMember[] {
  const s = socialOf(c), h = householdOf(s), out: FamilyMember[] = [];
  const p = s.partner;
  if (p && s.maritalStatus !== 'single' && s.maritalStatus !== 'divorced') out.push({ id: p.id, kind: s.maritalStatus === 'married' ? 'Spouse' : 'Partner', name: p.name, portrait: p.portrait, age: c.age + Math.floor(hash(`${p.id}|age`) * 9) - 4, health: 75 + Math.floor(hash(`${p.id}|hl`) * 25), personality: pick(PERSONALITIES, `${p.id}|p`), occupation: pick(OCCUPATIONS, `${p.id}|o`), ambition: 30 + Math.floor(hash(`${p.id}|am`) * 60), affinity: p.affinity });
  for (const d of s.dependents) { const k = h.children[d.id]!; out.push({ id: d.id, kind: 'Child', name: d.name, portrait: '/images/characters/sibling.jpg', age: d.age, health: k.health, personality: k.personality, occupation: d.age < 6 ? 'At home' : d.age < 18 ? `Student · ${childStage(d.age)}` : k.path === 'politics' ? 'Junior candidate' : k.path === 'business' ? 'Family business' : k.path === 'career' ? 'Independent career' : 'Deciding', ambition: k.ambition, affinity: k.affinity, stage: childStage(d.age), path: k.path, education: k.education }); }
  for (const x of s.contacts.filter(x => x.status === 'family')) {
    const parent = x.archetypeId === 'parents';
    out.push({ id: x.id, kind: parent ? 'Parent' : 'Sibling', name: x.name, portrait: x.portrait, age: parent ? c.age + 26 + Math.floor(hash(`${x.id}|a`) * 6) : Math.max(16, c.age - 1 - Math.floor(hash(`${x.id}|a`) * 6)), health: parent ? 55 + Math.floor(hash(`${x.id}|h`) * 30) : 80 + Math.floor(hash(`${x.id}|h`) * 20), personality: pick(PERSONALITIES, `${x.id}|p`), occupation: parent ? pick(PARENT_JOBS, `${x.id}|o`) : pick(OCCUPATIONS, `${x.id}|o`), ambition: 20 + Math.floor(hash(`${x.id}|am`) * 60), affinity: x.affinity });
  }
  for (const x of h.inLaws) out.push({ id: x.id, kind: 'In-Law', name: x.name, portrait: '/images/characters/parents.jpg', age: c.age + 27, health: 65, personality: pick(PERSONALITIES, `${x.id}|p`), occupation: x.occupation, ambition: 40, affinity: x.affinity });
  return out;
}

export const harmonyLabel = (n: number) => (n >= 80 ? 'Thriving' : n >= 60 ? 'Content' : n >= 40 ? 'Tense' : n >= 20 ? 'Troubled' : 'In crisis');

export interface Milestone { date: string; text: string }
/** Next few milestones: children's birthdays (each January), adulthood at 18, wedding anniversary. */
export function upcomingMilestones(c: Career): Milestone[] {
  const s = socialOf(c), out: Milestone[] = [], y = Number(c.date.slice(0, 4));
  const nextJan = `${c.date.slice(5, 7) === '01' ? y : y + 1}-01`;
  for (const d of s.dependents) out.push({ date: nextJan, text: d.age + 1 === 18 ? `${d.name} turns 18 — adulthood and career choice` : `${d.name} turns ${d.age + 1}${d.age + 1 === 6 ? ' and starts school' : d.age + 1 === 13 ? ' — teenage years' : ''}` });
  const w = s.partner?.weddingDate;
  if (s.maritalStatus === 'married' && w) { const m = w.slice(5, 7); const yr = `${y}-${m}` >= c.date.slice(0, 7) ? y : y + 1; out.push({ date: `${yr}-${m}`, text: `Wedding anniversary #${yr - Number(w.slice(0, 4))}` }); }
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
}

// ---------- Quarterly family actions ----------
export type FamilyActionId = 'quality_time' | 'date_night' | 'vacation' | 'discuss' | 'resolve' | 'celebrate' | 'school_support' | 'mentor' | 'career_guidance';
export interface FamilyAction { id: FamilyActionId; name: string; actions: number; cost: number; perChild?: boolean; desc: string }
export const familyActions: FamilyAction[] = [
  { id: 'quality_time', name: 'Quality Time', actions: 1, cost: 100, desc: 'Evening at home. Everyone +4, harmony +5, stress −5.' },
  { id: 'date_night', name: 'Romantic Date', actions: 1, cost: 300, desc: 'Spouse/partner +10, harmony +4, stress −8.' },
  { id: 'vacation', name: 'Family Vacation', actions: 2, cost: 3000, desc: '+$500 per child. Everyone +8, harmony +12, stress −20.' },
  { id: 'discuss', name: 'Talk It Through', actions: 1, cost: 0, desc: 'Discuss personal problems. Harmony +6, stress −8.' },
  { id: 'resolve', name: 'Resolve Dispute', actions: 1, cost: 500, desc: 'Counseling session. Spouse +12, harmony +15. Needs tension.' },
  { id: 'celebrate', name: 'Celebrate', actions: 0, cost: 800, desc: 'Birthday or anniversary party. Harmony +8, family +5, reputation +0.5.' },
  { id: 'school_support', name: 'School Support', actions: 1, cost: 1200, perChild: true, desc: 'Tutoring & tuition for one child (6–17). Education +15.' },
  { id: 'mentor', name: 'Mentor Teen', actions: 1, cost: 0, perChild: true, desc: 'Guide a teenager (13–17). Ambition +10, affinity +8.' },
  { id: 'career_guidance', name: 'Career Guidance', actions: 1, cost: 0, perChild: true, desc: 'Help an adult child (18+) choose a path.' },
];
export const familyActionById = (id: string) => familyActions.find(a => a.id === id);

const vacationCost = (s: SocialState) => 3000 + 500 * s.dependents.length;
export const familyActionCost = (c: Career, id: FamilyActionId) => (id === 'vacation' ? vacationCost(socialOf(c)) : familyActionById(id)?.cost ?? 0);
const together = (s: SocialState) => !!s.partner && ['dating', 'engaged', 'married'].includes(s.maritalStatus);
const celebrationDue = (c: Career, s: SocialState) => (c.date.slice(5, 7) === '01' && s.dependents.length > 0) || (s.maritalStatus === 'married' && !!s.partner?.weddingDate && Math.floor((Number(s.partner.weddingDate.slice(5, 7)) - 1) / 3) === Math.floor((Number(c.date.slice(5, 7)) - 1) / 3) && s.partner.weddingDate.slice(0, 7) < c.date.slice(0, 7));

export function familyActionAvailability(c: Career, id: FamilyActionId, childId?: string): { ok: boolean; reason: string } {
  const a = familyActionById(id);
  if (!a || !c.life) return { ok: false, reason: 'Unavailable.' };
  const s = socialOf(c), h = householdOf(s);
  const key = a.perChild ? `${id}:${childId ?? ''}` : id;
  if (h.used[key] === c.date) return { ok: false, reason: 'Already done this turn.' };
  if (id === 'date_night' && !together(s)) return { ok: false, reason: 'You need a partner.' };
  if (id === 'resolve' && h.harmony >= 50 && !h.separatedSince) return { ok: false, reason: 'No dispute to resolve.' };
  if (id === 'celebrate' && !celebrationDue(c, s)) return { ok: false, reason: 'No birthday or anniversary this quarter.' };
  if (['quality_time', 'vacation', 'discuss'].includes(id) && familyRoster(c).length === 0) return { ok: false, reason: 'No family to spend time with.' };
  if (a.perChild) {
    const d = s.dependents.find(x => x.id === childId);
    if (!d) return { ok: false, reason: 'Choose a child.' };
    if (id === 'school_support' && (d.age < 6 || d.age >= 18)) return { ok: false, reason: 'For school-age children (6–17).' };
    if (id === 'mentor' && (d.age < 13 || d.age >= 18)) return { ok: false, reason: 'For teenagers (13–17).' };
    if (id === 'career_guidance' && d.age < 18) return { ok: false, reason: 'For adult children (18+).' };
  }
  if (c.actions < a.actions * ACTION_COST) return { ok: false, reason: 'Not enough energy this turn.' };
  const cost = familyActionCost(c, id);
  if (c.money < cost) return { ok: false, reason: `Need ${usd(cost - c.money)} more personal cash.` };
  return { ok: true, reason: '' };
}

/** Performs a family action. Spends career.actions and personal cash (ledger entry); never touches campaign or treasury. */
export function doFamilyAction(c: Career, id: FamilyActionId, childId?: string, path?: ChildPath): Result {
  const chk = familyActionAvailability(c, id, childId);
  if (!chk.ok) return { ok: false, message: chk.reason };
  if (id === 'career_guidance' && (!path || path === 'none')) return { ok: false, message: 'Choose a path.' };
  const a = familyActionById(id)!;
  let s = socialOf(c); let h = householdOf(s);
  const cost = familyActionCost(c, id);
  const child = childId ? s.dependents.find(x => x.id === childId) : undefined;
  let n = charge({ ...c, actions: c.actions - a.actions * ACTION_COST }, `Family · ${a.name}${child ? ` (${child.name})` : ''}`, cost);
  let stress = n.life!.stress, harmony = h.harmony, msg = '';
  const bumpAll = (k: number) => {
    s = { ...s, partner: s.partner && together(s) ? { ...s.partner, affinity: clampAffinity(s.partner.affinity + k), lastInteraction: c.date } : s.partner, contacts: s.contacts.map(x => x.status === 'family' ? { ...x, affinity: clampAffinity(x.affinity + k), lastInteraction: c.date } : x) };
    h = { ...h, children: Object.fromEntries(Object.entries(h.children).map(([i, k2]) => [i, { ...k2, affinity: clamp(k2.affinity + k) }])), inLaws: h.inLaws.map(x => ({ ...x, affinity: clamp(x.affinity + Math.ceil(k / 2)) })) };
  };
  const bumpPartner = (k: number) => { if (s.partner && together(s)) s = { ...s, partner: { ...s.partner, affinity: clampAffinity(s.partner.affinity + k), lastInteraction: c.date } }; };
  const setChild = (f: (k: ChildProfile) => ChildProfile) => { if (childId) h = { ...h, children: { ...h.children, [childId]: f(h.children[childId]!) } }; };
  switch (id) {
    case 'quality_time': bumpAll(4); harmony += 5; stress -= 5; msg = 'You spent a quiet evening with family. Harmony +5.'; break;
    case 'date_night': bumpPartner(10); harmony += 4; stress -= 8; msg = `A romantic evening with ${s.partner!.name}. Affinity +10.`; break;
    case 'vacation': bumpAll(8); harmony += 12; stress -= 20; msg = `Family vacation for ${usd(cost)}. Harmony +12, stress −20.`; break;
    case 'discuss': harmony += 6; stress -= 8; msg = 'You talked through what has been weighing on everyone. Harmony +6.'; break;
    case 'resolve': bumpPartner(12); harmony += 15; msg = 'A counseling session cooled tempers. Harmony +15.'; break;
    case 'celebrate': bumpAll(5); harmony += 8; n = { ...n, reputation: Math.min(100, Math.round((n.reputation + 0.5) * 10) / 10) }; msg = 'A warm family celebration. Harmony +8, reputation +0.5.'; break;
    case 'school_support': setChild(k => ({ ...k, education: clamp(k.education + 15), affinity: clamp(k.affinity + 3) })); msg = `${child!.name}'s tutoring paid off. Education +15.`; break;
    case 'mentor': setChild(k => ({ ...k, ambition: clamp(k.ambition + 10), affinity: clamp(k.affinity + 8) })); harmony += 2; msg = `You mentored ${child!.name}. Ambition +10.`; break;
    case 'career_guidance': setChild(k => ({ ...k, path: path!, affinity: clamp(k.affinity + 5) })); msg = `${child!.name} chose ${path === 'politics' ? 'to enter politics as a junior candidate' : path === 'business' ? 'to help run the family business' : 'an independent career'}.`; break;
  }
  if (h.separatedSince && s.partner && s.partner.affinity >= RECONCILE_AFFINITY) { h = { ...h, separatedSince: null }; msg += ` You and ${s.partner.name} have reconciled.`; }
  const key = a.perChild ? `${id}:${childId}` : id;
  h = { ...h, harmony: clamp(harmony), used: { ...Object.fromEntries(Object.entries(h.used).filter(([, d]) => d === c.date)), [key]: c.date } };
  n = { ...n, life: { ...n.life!, stress: clamp(stress) } };
  return { ok: true, message: msg, career: withHousehold(n, s, h) };
}

// ---------- Relative requests ----------
export function answerRequest(c: Career, accept: boolean): Result {
  const s = socialOf(c); let h = householdOf(s);
  const r = h.request;
  if (!r || !c.life) return { ok: false, message: 'No pending family request.' };
  let n = c; let harmony = h.harmony; let msg: string;
  if (r.kind === 'loan') {
    if (accept) { if (c.money < r.amount) return { ok: false, message: `You need ${usd(r.amount - c.money)} more personal cash.` }; n = charge(n, `Family · Loan to ${r.from}`, r.amount); harmony += 6; msg = `You lent ${usd(r.amount)} to ${r.from}.`; }
    else { harmony -= 5; msg = `You turned down ${r.from}'s loan request.`; }
  } else if (accept) { n = { ...n, reputation: Math.max(0, Math.round((n.reputation - 1.5) * 10) / 10) }; harmony += 5; msg = `You pulled strings for ${r.from}. Reputation −1.5.`; }
  else { harmony -= 4; n = { ...n, reputation: Math.min(100, Math.round((n.reputation + 0.5) * 10) / 10) }; msg = `You refused ${r.from}'s favor. Integrity noted (+0.5 reputation).`; }
  h = addEvent({ ...h, request: null, harmony: clamp(harmony) }, { id: `${r.id}-answer`, date: c.date, title: accept ? 'Request granted' : 'Request refused', text: msg, ...(r.kind === 'loan' && accept ? { amount: -r.amount } : {}) });
  return { ok: true, message: msg, career: withHousehold(n, s, h) };
}

// ---------- Quarterly processing (called by collectFamily, guarded by its own watermark) ----------
export function householdTurn(c: Career, periodStart: string): { career: Career; notices: string[] } {
  if (!c.life) return { career: c, notices: [] };
  let s = socialOf(c); let h = householdOf(s);
  if (h.lastPeriod && periodStart <= h.lastPeriod) return { career: c, notices: [] };
  const notices: string[] = []; let n = c; let harmony = h.harmony;
  const tookTime = Object.values(h.used).some(d => d >= periodStart);
  const hasFamily = together(s) || s.dependents.length > 0;
  if (hasFamily && !tookTime) { harmony -= NEGLECT_HARMONY; notices.push(`Family: no family time this quarter (harmony −${NEGLECT_HARMONY}).`); }
  // Scandals strain the marriage once per new scandal.
  const scandals = c.scandals.length;
  if (h.scandalsSeen >= 0 && scandals > h.scandalsSeen && together(s)) { const k = (scandals - h.scandalsSeen) * SCANDAL_STRAIN; s = { ...s, partner: { ...s.partner!, affinity: clampAffinity(s.partner!.affinity - k) } }; harmony -= 6; notices.push(`Home: the scandal coverage hurt ${s.partner!.name} (−${k} affinity).`); }
  if (c.life.stress >= OVERWORK_STRESS && together(s)) { s = { ...s, partner: { ...s.partner!, affinity: clampAffinity(s.partner!.affinity - 3) } }; harmony -= 3; notices.push('Home: long hours and stress are wearing on your relationship.'); }
  // In-laws join after a wedding.
  if (s.maritalStatus === 'married' && s.partner && h.inLaws.length === 0) {
    const last = s.partner.name.split(/\s+/).slice(-1)[0];
    h = { ...h, inLaws: [{ id: `inlaw-${s.partner.id}`, name: `The ${last}s`, role: 'Parents-in-law', occupation: pick(IN_LAW_JOBS, `${s.partner.id}|il`), affinity: 50 }] };
    notices.push(`Family: ${s.partner.name}'s parents are now part of your family.`);
  }
  if (!s.partner || s.maritalStatus !== 'married') h = { ...h, inLaws: s.maritalStatus === 'divorced' ? [] : h.inLaws };
  // Children: education grows in school, health drifts.
  h = { ...h, children: Object.fromEntries(Object.entries(h.children).map(([id, k]) => { const d = s.dependents.find(x => x.id === id)!; return [id, { ...k, education: d.age >= 6 && d.age < 18 ? clamp(k.education + 2) : k.education, health: clamp(k.health + (k.health < 90 ? 1 : 0)) }]; })) };
  // Separation & divorce.
  if (s.maritalStatus === 'married' && s.partner) {
    if (h.separatedSince) {
      if (s.partner.affinity >= RECONCILE_AFFINITY) { h = { ...h, separatedSince: null }; notices.push(`Family: you and ${s.partner.name} reconciled.`); }
      else if (quartersBetween(h.separatedSince, periodStart) >= DIVORCE_QUARTERS) {
        const settle = Math.round(Math.max(0, n.money) * DIVORCE_SETTLEMENT);
        n = charge(n, `Divorce settlement · ${s.partner.name}`, settle, periodStart);
        n = { ...n, reputation: Math.max(0, Math.round((n.reputation - 3) * 10) / 10) };
        notices.push(`Divorce: ${s.partner.name} filed for divorce. Settlement ${usd(settle)}, reputation −3.`);
        h = addEvent({ ...h, separatedSince: null, inLaws: [], supportiveSince: null }, { id: `divorce-${periodStart}`, date: periodStart, title: 'Divorce finalized', text: `${s.partner.name} and you divorced.`, amount: -settle });
        s = { ...s, maritalStatus: 'divorced', partner: null };
        harmony -= 20;
      }
    } else if (s.partner.affinity < SEPARATION_AFFINITY) {
      h = addEvent({ ...h, separatedSince: periodStart }, { id: `separation-${periodStart}`, date: periodStart, title: 'Formal separation', text: `${s.partner.name} moved out. Rebuild affinity to ${RECONCILE_AFFINITY}% within ${DIVORCE_QUARTERS} quarters or face divorce.` });
      harmony -= 10;
      notices.push(`Separation: ${s.partner.name} moved out. Reconcile within ${DIVORCE_QUARTERS} quarters or face divorce.`);
    }
  }
  // Supportive spouse bonus (small, each quarter while it holds).
  if (s.maritalStatus === 'married' && s.partner && s.partner.affinity >= SUPPORTIVE_AFFINITY && harmony >= SUPPORTIVE_HARMONY && !h.separatedSince) {
    n = { ...n, reputation: Math.min(100, Math.round((n.reputation + 0.3) * 10) / 10) };
    if (n.campaign) n = { ...n, campaign: { ...n.campaign, support: Math.min(100, Math.round((n.campaign.support + 0.5) * 10) / 10) } };
    if (!h.supportiveSince) notices.push(`Family: ${s.partner.name} is campaigning by your side (+morale, +image each quarter).`);
    h = { ...h, supportiveSince: h.supportiveSince ?? periodStart };
  } else h = { ...h, supportiveSince: null };
  // One seeded contextual event per quarter.
  const ev = rollEvent(n, s, h, periodStart);
  if (ev) { n = ev.career; h = ev.household; harmony += ev.harmony; notices.push(ev.notice); }
  h = { ...h, harmony: clamp(harmony), lastPeriod: periodStart, scandalsSeen: scandals };
  return { career: withHousehold(n, s, h), notices };
}

const quartersBetween = (a: string, b: string) => Math.round(((Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7))) / 3);

function rollEvent(c: Career, s: SocialState, h: Household, period: string): { career: Career; household: Household; harmony: number; notice: string } | null {
  const seed = `${c.character.name}|${period}|fam`;
  if (hash(seed) >= EVENT_CHANCE || h.request || (!together(s) && s.dependents.length === 0)) return null;
  const relatives = s.contacts.filter(x => x.status === 'family');
  const students = s.dependents.filter(d => d.age >= 6 && d.age < 18);
  const options: string[] = ['health'];
  if (students.length) options.push('honor');
  if (relatives.length || h.inLaws.length) options.push('loan', 'favor');
  if (relatives.some(x => x.archetypeId === 'sibling')) options.push('wedding', 'birth');
  const kind = pick(options, `${seed}|k`);
  const amt = (lo: number, hi: number) => Math.round((lo + hash(`${seed}|amt`) * (hi - lo)) / 100) * 100;
  const rel = [...relatives.map(x => x.name), ...h.inLaws.map(x => x.name)];
  const ev = (title: string, text: string, amount?: number): FamilyEvent => ({ id: `${kind}-${period}`, date: period, title, text, ...(amount ? { amount } : {}) });
  switch (kind) {
    case 'honor': { const d = pick(students, `${seed}|c`); const k = h.children[d.id]!; const text = `${d.name} earned academic honors at school.`; return { career: { ...c, reputation: Math.min(100, Math.round((c.reputation + 0.3) * 10) / 10) }, household: addEvent({ ...h, children: { ...h.children, [d.id]: { ...k, education: clamp(k.education + 10) } } }, ev('Academic honors', text)), harmony: 4, notice: `Family: ${text}` }; }
    case 'health': {
      const who = pick([...familyRoster(c).map(m => m.name), c.character.name], `${seed}|w`);
      const bill = amt(1500, 6000), paid = Math.min(bill, Math.max(0, c.money));
      const covered = Math.round(bill * (c.life?.insurance.coverage ?? 0)), due = Math.max(0, Math.min(paid, bill - covered));
      const text = `${who} had a health emergency. Medical bill ${usd(bill)}${covered ? `, insurance covered ${usd(covered)}` : ''}.`;
      return { career: charge(c, `Family · Medical bill (${who})`, due, period), household: addEvent(h, ev('Health emergency', text, -due)), harmony: -3, notice: `Family: ${text}` };
    }
    case 'loan': { const from = pick(rel, `${seed}|r`); const amount = amt(1000, 5000); return { career: c, household: addEvent({ ...h, request: { id: `req-${period}`, kind: 'loan', from, amount, date: period } }, ev('Loan request', `${from} asked to borrow ${usd(amount)}.`)), harmony: 0, notice: `Family: ${from} is asking you for a ${usd(amount)} loan.` }; }
    case 'favor': { const from = pick(rel, `${seed}|r`); return { career: c, household: addEvent({ ...h, request: { id: `req-${period}`, kind: 'favor', from, amount: 0, date: period } }, ev('Political favor', `${from} wants you to pull strings for a government job.`)), harmony: 0, notice: `Family: ${from} is asking for a political favor.` }; }
    case 'wedding': { const gift = 1000; const sib = relatives.find(x => x.archetypeId === 'sibling')!; const text = `${sib.name} got married. You gave a ${usd(gift)} gift.`; const pay = c.money >= gift ? gift : 0; return { career: charge(c, `Family · Wedding gift (${sib.name})`, pay, period), household: addEvent(h, ev('Family wedding', pay ? text : `${sib.name} got married. You could not afford a gift.`, -pay)), harmony: pay ? 5 : -3, notice: `Family: ${pay ? text : `${sib.name} got married; no gift.`}` }; }
    case 'birth': { const sib = relatives.find(x => x.archetypeId === 'sibling')!; const text = `${sib.name} welcomed a baby — you're an aunt/uncle!`; return { career: c, household: addEvent(h, ev('New baby in the family', text)), harmony: 3, notice: `Family: ${text}` }; }
  }
  return null;
}

/** Succession bonuses an heir carries from upbringing. */
export function heirBonus(c: Career, heirId: string): { experience: number; reputation: number; contacts: number } {
  const k = householdOf(socialOf(c)).children[heirId];
  if (!k) return { experience: 0, reputation: 0, contacts: 0 };
  return { experience: Math.round(k.education / 5), reputation: k.path === 'politics' ? 5 : 0, contacts: Math.round(k.ambition / 20) + (k.path === 'politics' ? 3 : 0) };
}
