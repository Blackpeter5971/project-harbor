import { ACTION_COST } from './energy-costs';
import { createCareer, type Career } from './career';
import { dynastySchema, type Dynasty } from './dynasty-schema';
import { CHILD_QUARTERLY_COST, archetypeById, socialOf, type Dependent, type SocialContact } from './relationships';
import type { Result } from './support';
import { heirBonus } from './household';
import { captureLegacy, carryArchive, legacyMetrics, legacyOf, recordLife } from './legacy';
import { endResponsibilities } from './mortality';

/** Childbirth, the political manager contract, retirement and dynastic succession. Pure, browser-safe Results. */
export const FERTILE_MIN = 22, FERTILE_MAX = 50;
export const CHILD_ATTEMPT_COST = 1500;
export const BIRTH_CHANCE = 0.45;
export const HEIR_AGE = 18;
export const MANAGER_BOOST = 1.4;
export const MANAGER_PLANS = {
  4: { label: '1-year contract', upfront: 12_000, retainer: 3_000 },
  8: { label: '2-year contract', upfront: 20_000, retainer: 2_500 },
} as const;
export type ManagerTerm = keyof typeof MANAGER_PLANS;

export const dynastyOf = (c: Career): Dynasty => dynastySchema.parse(c.dynasty ?? {});
const withDynasty = (c: Career, d: Dynasty): Career => ({ ...c, dynasty: d });
const usd = (n: number) => `$${n.toLocaleString('en-US')}`;
const hash = (seed: string) => { let h = 2166136261; for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 2 ** 32; };
const charge = (c: Career, label: string, amount: number): Career => (amount > 0 ? { ...c, money: c.money - amount, ledger: [{ month: c.date, label, amount: -amount }, ...c.ledger] } : c);
const log = (c: Career, m: string): Career => ({ ...c, log: [m, ...c.log].slice(0, 12) });
const surname = (c: Career) => c.character.name.trim().split(/\s+/).slice(-1)[0] ?? '';

// ---------- Childbirth ----------
/** Partners are assumed to be of the opposite sex; their age is a stable offset from the player's. */
export const partnerAge = (c: Career, p: Pick<SocialContact, 'id'>) => c.age + Math.floor(hash(`${p.id}|age`) * 9) - 4;
export type Conception = { id: string; name: string; context: 'marriage' | 'partner' | 'affair'; label: string };

export function conceptionOptions(c: Career): Conception[] {
  const s = socialOf(c);
  const out: Conception[] = [];
  const together = s.partner && ['dating', 'engaged', 'married'].includes(s.maritalStatus);
  if (together) out.push({ id: s.partner!.id, name: s.partner!.name, context: s.maritalStatus === 'married' ? 'marriage' : 'partner', label: s.maritalStatus === 'married' ? 'In marriage' : 'With your partner · out of wedlock' });
  for (const k of s.contacts) if (archetypeById(k.archetypeId)?.category === 'romantic' && k.affinity >= 50 && k.id !== s.partner?.id) out.push({ id: k.id, name: k.name, context: 'affair', label: 'Out of wedlock' });
  return out;
}

/** Fertility rule: a female player must be 22–50; a male player's (female) partner must be 22–50. */
export function fertilityCheck(c: Career, partnerId: string): { ok: boolean; reason: string } {
  const opt = conceptionOptions(c).find(o => o.id === partnerId);
  if (!opt) return { ok: false, reason: 'You need a partner or a close romantic interest first.' };
  const female = c.character.sex === 'Female';
  const age = female ? c.age : partnerAge(c, { id: partnerId });
  if (age < FERTILE_MIN || age > FERTILE_MAX) return { ok: false, reason: female ? `You must be between ${FERTILE_MIN} and ${FERTILE_MAX} to have a child (you are ${c.age}).` : `${opt.name} must be between ${FERTILE_MIN} and ${FERTILE_MAX} (she is ${age}).` };
  return { ok: true, reason: '' };
}

export function childAvailability(c: Career, partnerId: string): { ok: boolean; reason: string } {
  if (!c.life) return { ok: false, reason: 'Life features are unavailable.' };
  const f = fertilityCheck(c, partnerId);
  if (!f.ok) return f;
  if (dynastyOf(c).lastChildAttempt === c.date) return { ok: false, reason: 'You already tried for a child this turn.' };
  if (c.actions < ACTION_COST) return { ok: false, reason: 'Not enough energy this turn.' };
  if (c.money < CHILD_ATTEMPT_COST) return { ok: false, reason: `You need ${usd(CHILD_ATTEMPT_COST - c.money)} more in personal cash.` };
  return { ok: true, reason: '' };
}

const boyNames = ['James', 'Henry', 'Theodore', 'William', 'Samuel', 'Elijah', 'Benjamin', 'Lucas', 'Jonah', 'Isaac'];
const girlNames = ['Charlotte', 'Eleanor', 'Grace', 'Victoria', 'Amelia', 'Clara', 'Hazel', 'Iris', 'Naomi', 'Ruth'];

/** One attempt per turn; the roll is seeded by name/date/serial so a reload cannot reroll it. */
export function tryForChild(c: Career, partnerId: string, roll?: number): Result {
  const check = childAvailability(c, partnerId);
  if (!check.ok) return { ok: false, message: check.reason };
  const opt = conceptionOptions(c).find(o => o.id === partnerId)!;
  const d = dynastyOf(c);
  const r = roll ?? hash(`${c.character.name}|${c.date}|child|${d.childSerial}`);
  let n = charge({ ...c, actions: c.actions - ACTION_COST }, 'Family · Fertility care & doctor visits', CHILD_ATTEMPT_COST);
  const nd: Dynasty = { ...d, lastChildAttempt: c.date };
  if (r >= BIRTH_CHANCE) { const message = `You and ${opt.name} tried for a child. Not this time — try again next turn.`; return { ok: true, message, career: log(withDynasty(n, nd), message) }; }
  const girl = hash(`${c.character.name}|${c.date}|sex|${d.childSerial}`) < 0.5;
  const pool = girl ? girlNames : boyNames;
  const first = pool[Math.floor(hash(`${c.character.name}|${c.date}|nm|${d.childSerial}`) * pool.length)]!;
  const child: Dependent = { id: `child-${d.childSerial + 1}-${c.date}`, name: `${first} ${surname(c)}`.trim(), age: 0, supportCost: CHILD_QUARTERLY_COST };
  const s = socialOf(n);
  n = { ...n, life: { ...n.life!, social: { ...s, dependents: [...s.dependents, child] } } };
  if (opt.context === 'affair') n = { ...n, reputation: Math.max(0, Math.round((n.reputation - 2) * 10) / 10) };
  const message = `${child.name} was born${opt.context === 'marriage' ? '' : ' out of wedlock'}! Support costs ${usd(CHILD_QUARTERLY_COST)} per quarter.${opt.context === 'affair' ? ' Whispers cost you 2 reputation.' : ''}`;
  return { ok: true, message, career: log(withDynasty(n, { ...nd, childSerial: d.childSerial + 1 }), message) };
}

// ---------- Political manager ----------
export const managerActive = (c: Career) => (dynastyOf(c).manager?.remaining ?? 0) > 0;
export const managerMultiplier = (c: Career) => (managerActive(c) ? MANAGER_BOOST : 1);

export function hireManager(c: Career, quarters: ManagerTerm): Result {
  const plan = MANAGER_PLANS[quarters];
  if (!plan) return { ok: false, message: 'Choose a 1-year or 2-year contract.' };
  if (managerActive(c)) return { ok: false, message: 'Your political manager is already under contract.' };
  if (c.money < plan.upfront) return { ok: false, message: `You need ${usd(plan.upfront - c.money)} more in personal cash for the signing fee.` };
  const d = dynastyOf(c);
  const n = charge(c, `Political manager · ${plan.label} signing fee`, plan.upfront);
  const message = `You hired a political manager on a ${plan.label}. Activity rewards are boosted 40% for ${quarters} quarters (${usd(plan.retainer)} retainer each quarter).`;
  return { ok: true, message, career: log(withDynasty(n, { ...d, manager: { quarters, remaining: quarters, retainer: plan.retainer, signed: c.date } }), message) };
}

/** Once per turn (keyed by the turn start date): ages children on the new year and bills the manager retainer. */
export function dynastyTurn(c: Career, start: string): { career: Career; notices: string[] } {
  const d = dynastyOf(c);
  if (d.lastPeriod === start) return { career: c, notices: [] };
  const notices: string[] = [];
  let n = c;
  if (start.slice(5, 7) === '10' && c.life) {
    const s = socialOf(n);
    if (s.dependents.length) {
      const dependents = s.dependents.map(x => ({ ...x, age: x.age + 1 }));
      n = { ...n, life: { ...n.life!, social: { ...s, dependents } } };
      for (const x of dependents) if (x.age === HEIR_AGE) notices.push(`${x.name} turned ${HEIR_AGE} and can now carry on the family's political legacy.`);
    }
  }
  let manager = d.manager;
  if (manager && manager.remaining > 0) {
    n = charge(n, 'Political manager · quarterly retainer', manager.retainer);
    manager = { ...manager, remaining: manager.remaining - 1 };
    notices.push(manager.remaining ? `Political manager: ${manager.remaining} quarter${manager.remaining === 1 ? '' : 's'} left on contract.` : 'Your political manager contract has ended.');
  }
  return { career: withDynasty(n, { ...d, manager, lastPeriod: start }), notices };
}

// ---------- Retirement & succession ----------
export const adultHeirs = (c: Career) => socialOf(c).dependents.filter(x => x.age >= HEIR_AGE).sort((a, b) => b.age - a.age);

export function legacyScore(c: Career): number {
  return legacyMetrics(captureLegacy(c)).score;
}

export function careerSummary(c: Career): string[] {
  const offices = [...new Set(c.termHistory.map(t => t.office.title))];
  return [
    `Retired at age ${c.age} in ${c.date.slice(0, 4)}.`,
    offices.length ? `Offices held: ${offices.join(', ')}.` : 'Never held elected office.',
    `Elections won: ${c.elections.filter(e => e.won && e.stage === 'general').length}.`,
    `Reputation ${Math.round(c.reputation)} · Experience ${Math.round(c.experience)} · Personal wealth ${usd(Math.round(c.money))}.`,
    `Children: ${socialOf(c).dependents.length}. Generation ${dynastyOf(c).generation} of the ${surname(c)} family.`,
  ];
}

function retireBlock(c: Career): string {
  if (legacyOf(c).death) return 'This life has ended.';
  if (c.legal?.prison) return 'You cannot retire from prison.';
  if (c.report || c.newspaperPending || c.pendingEvent || c.eventEncounter || c.debate) return 'Finish your turn report and any pending event first.';
  if (dynastyOf(c).retired) return 'This career has already ended.';
  return '';
}

export function retireCareer(c: Career): Result {
  const b = retireBlock(c);
  if (b) return { ok: false, message: b };
  const ended = recordLife(endResponsibilities(c, 'retired'), 'retirement', 'Voluntary retirement', c.office?.title ?? null);
  const legacy = legacyScore(ended);
  const message = `You retired from politics with a legacy score of ${legacy}.`;
  return { ok: true, message, career: log(withDynasty(ended, { ...dynastyOf(c), manager: null, retired: { date: c.date, legacy, summary: careerSummary(c) } }), message) };
}

/** Continue as the chosen adult child: a fresh career carrying family prestige, an inheritance and a reputation head start. */
export function passTorch(c: Career, heirId: string): Result {
  const b = legacyOf(c).death || dynastyOf(c).retired ? '' : retireBlock(c);
  if (b) return { ok: false, message: b };
  const heir = adultHeirs(c).find(x => x.id === heirId);
  if (!heir) return { ok: false, message: 'You need an adult child (18+) to pass the torch.' };
  const d = dynastyOf(c);
  const ended = legacyOf(c).death || d.retired ? captureLegacy(c) : recordLife(endResponsibilities(c, 'retired'), 'handoff', 'Passed the torch to an adult child', c.office?.title ?? null);
  const legacy = legacyScore(c);
  const prestige = Math.round(d.prestige * 0.5 + legacy * 0.1);
  const fresh = createCareer({ ...c.character, name: heir.name.slice(0, 32), background: 'Political Dynasty', sex: hash(heir.id) < 0.5 ? 'Female' : 'Male' }, () => 0.5);
  const inheritance = Math.round(Math.max(0, c.money) * 0.6);
  const scandalPenalty = Math.min(25, legacyMetrics(ended).proven * 5 + (c.legal?.served.length ?? 0) * 5);
  const rep = Math.min(100, fresh.reputation + Math.min(25, Math.round(prestige / 4)));
  const siblings = socialOf(c).dependents.filter(x => x.id !== heir.id);
  const bonus = heirBonus(c, heir.id);
  const n: Career = {
    ...fresh, date: c.date, age: heir.age, money: inheritance, reputation: Math.max(0, Math.min(100, rep + bonus.reputation) - scandalPenalty), experience: fresh.experience + bonus.experience,
    banking: c.banking ? { ...c.banking, revision: 0 } : fresh.banking,
    businesses: c.businesses, ...(c.housing?.status === 'owning' ? { housing: c.housing } : {}),
    contacts: fresh.contacts + Math.min(10, Math.round(prestige / 10)) + bonus.contacts,
    ledger: inheritance ? [{ month: c.date, label: `Inheritance from ${c.character.name}`, amount: inheritance }] : [],
    log: [`You take up the ${surname(c)} family torch. Family prestige: ${prestige}.${scandalPenalty ? ` Lingering proven scandals cost ${scandalPenalty} reputation.` : ''}`],
    dynasty: { ...dynastySchema.parse({}), generation: d.generation + 1, prestige, ancestors: [...d.ancestors, { name: c.character.name, legacy }] },
  };
  const s = socialOf(n);
  const withSiblings: Career = n.life ? { ...n, life: { ...n.life, social: { ...s, contacts: [...s.contacts, ...siblings.slice(0, 3).map(x => ({ id: `sibling-${x.id}`, archetypeId: 'sibling' as const, name: x.name, role: 'Sibling', affinity: 65, status: 'family' as const, portrait: '/images/characters/sibling.jpg' }))] } } } : n;
  return { ok: true, message: `You now play as ${n.character.name}, generation ${d.generation + 1} of the dynasty.`, career: carryArchive(withSiblings, ended) };
}
