import type { Career } from './career';
import type { Legal } from './legal-schema';
import { socialOf } from './relationships';
import { createCareer } from './career';
import { rand } from './campaign';
import { activeManager } from './business';

/**
 * Phase 7A — incarceration. Pure, browser-safe. Prison only exists after a court verdict wrote
 * legal.prison. Each quarter (3-month turn) is served once (prison.lastTurn guard): meters drift,
 * outside-world updates arrive, the sentence completes or — on death row — the career ends.
 * Health and Energy reuse career.health and life.energy; Prison Reputation lives on the prison record.
 */
type Prison = NonNullable<Legal['prison']>;
export const prisonOf = (c: Career): Prison | null => c.legal?.prison ?? null;
export const isExecuted = (c: Career) => !!c.legal?.executed;
/** Political campaigning, office duties and political navigation are locked while true. */
export const isIncarcerated = (c: Career) => !!prisonOf(c) || isExecuted(c) || c.crime?.arrest?.custody === 'remand';
/** Police detention permits counsel and existing-circle letters, not outside work. Bail does not lock play. */
export const isDetained = (c: Career) => isIncarcerated(c) || c.crime?.arrest?.custody === 'police';
export const remainingTurns = (p: Prison) => p.life || p.death ? Infinity : Math.max(0, p.quarters - p.served);
export const PRISON_LOCK = 'You are incarcerated. Politics, campaigns and office duties are locked until release.';

const clamp = (n: number) => Math.round(Math.max(0, Math.min(100, n)));
const pick = <T,>(xs: readonly T[], seed: string) => xs[Math.floor(rand(seed) * xs.length)] ?? xs[0]!;

function outsideNews(c: Career, end: string): Prison['updates'] {
  const out: Prison['updates'] = [];
  for (const b of c.businesses.slice(0, 2)) out.push({ date: end, kind: 'business', text: `${b.name}: account $${Math.round(b.account).toLocaleString('en-US')}, last quarter revenue $${Math.round(b.lastRevenue).toLocaleString('en-US')}. ${activeManager(c, b)?.name ? `${activeManager(c, b)?.name} maintains operations without an owner-absence penalty.` : 'No active manager; production capacity is reduced.'}` });
  const s = socialOf(c), kid = s.dependents[0];
  if (s.partner) out.push({ date: end, kind: 'family', text: pick([`${s.partner.name} visited on Sunday and held your hand through the glass.`, `${s.partner.name} wrote that the house feels empty without you.`, `${s.partner.name} missed visiting day. A short letter came instead.`], `${end}|partner`) });
  if (kid) out.push({ date: end, kind: 'family', text: pick([`${kid.name} (age ${kid.age}) drew you a picture of the family.`, `${kid.name} asked when you are coming home.`, `${kid.name} is doing well in school, your family writes.`], `${end}|kid`) });
  if (!s.partner && !kid) out.push({ date: end, kind: 'family', text: 'No visitors this quarter.' });
  const headline = c.news[0]?.stories[0]?.h;
  out.push({ date: end, kind: 'politics', text: headline ? `On the yard TV: "${headline}"` : pick(['Congress is gridlocked over the budget again.', 'A new governor race is heating up back home.', 'The president gave a speech on crime and corruption.'], `${end}|pol`) });
  return out;
}

/** Serve one quarter. Idempotent per quarter end. */
export function prisonTurn(c: Career, end: string): { career: Career; notices: string[] } {
  const p = prisonOf(c), L = c.legal;
  if (!p || !L || L.executed || p.lastTurn >= end) return { career: c, notices: [] };
  const notices: string[] = [];
  if (p.death && p.executionDate && p.executionDate <= end) {
    notices.push('Your final appeal was denied. The sentence of death was carried out. Your career has ended.');
    return { career: { ...c, legal: { ...L, prison: { ...p, lastTurn: end, updates: [{ date: end, kind: 'prison' as const, text: 'Final appeal denied.' }, ...p.updates].slice(0, 16) }, executed: end }, log: ['The sentence of death was carried out.', ...c.log].slice(0, 30),
      newsQueue: [...c.newsQueue, { h: `${c.character.name} executed after failed appeals`, sub: 'Former president convicted of embezzling public funds', body: 'The state carried out the sentence after the final appeal was denied.', tag: 'scandal', subject: c.character.name, priority: 0 }] }, notices };
  }
  const served = p.served + 1;
  const crew = rand(`${p.caseId}|${end}|yard`) < Math.max(0.05, 0.25 - p.prisonRep / 500);
  const health = clamp(c.health - (crew ? 6 : 2));
  const energy = clamp((c.life?.energy ?? 80) + 10);
  const prisonRep = clamp(p.prisonRep + 3 + (crew ? 2 : 0));
  const updates = [...(crew ? [{ date: end, kind: 'prison' as const, text: 'A fight broke out in the yard. You held your ground but got hurt.' }] : []), ...outsideNews(c, end), ...p.updates].slice(0, 16);
  let n: Career = { ...c, health, life: c.life ? { ...c.life, energy } : c.life, legal: { ...L, prison: { ...p, served, prisonRep, updates, lastTurn: end } } };
  const left = remainingTurns({ ...p, served });
  if (left === 0) {
    const trialTier = L.cases.find(k => k.id === p.caseId)?.trial?.tier;
    const felony = trialTier ? trialTier !== 'minor' : p.tier.toLowerCase().includes('felony');
    n = { ...n, legal: { ...L, prison: null, served: [...L.served, { caseId: p.caseId, since: p.since, released: end, quarters: p.quarters, felony, pardoned: false }] }, reputation: Math.max(0, n.reputation - 5),
      newsQueue: [...n.newsQueue, { h: `${c.character.name} released from prison`, sub: `After ${p.quarters} quarters behind bars`, body: 'The former official walked out of the penitentiary this morning. Whether voters will forgive is another question.', tag: 'scandal', subject: c.character.name, priority: 1 }] };
    notices.push(`Prison: you served your full sentence (${p.quarters} quarters) and were released.`);
  } else notices.push(p.life || p.death ? `Prison: another quarter served${p.death ? ' on death row' : ' of a life sentence'}.` : `Prison: ${served} of ${p.quarters} quarters served · ${left} remaining.`);
  return { career: n, notices };
}

/** The oldest child can carry the family forward after an execution. */
export const heirOf = (c: Career) => [...socialOf(c).dependents].sort((a, b) => b.age - a.age)[0] ?? null;

export function continueAsHeir(c: Career): Career | null {
  const heir = heirOf(c);
  if (!isExecuted(c) || !heir) return null;
  const years = Math.max(0, 18 - heir.age);
  const date = `${Number(c.date.slice(0, 4)) + years}${c.date.slice(4)}`;
  const fresh = createCareer({ ...c.character, name: heir.name.includes(' ') ? heir.name : `${heir.name} ${c.character.name.split(' ').slice(-1)[0] ?? ''}`.trim() }, () => 0.5);
  const inheritance = Math.round(Math.max(0, c.money) * 0.5);
  return { ...fresh, date, age: Math.max(18, heir.age), money: fresh.money + inheritance, reputation: Math.max(0, fresh.reputation - 10),
    ledger: inheritance ? [{ month: date, label: `Inheritance from ${c.character.name} (after estate seizure)`, amount: inheritance }] : [],
    log: [`You carry the ${c.character.name.split(' ').slice(-1)[0]} name forward. The family's disgrace follows you.`] };
}
