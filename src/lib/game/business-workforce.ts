import type { Career } from './career';
import type { Result } from './gameplay';
import { normalizeBusiness, changeBusinessCash, type Business, type GeneralManager } from './business-schema';
import { sectorById } from './business-sectors';
import { socialOf } from './relationships';
import { productEconomics } from './business-products';

export const professionalExecutives = [
  { id: 'professional', name: 'Professional Executive', quality: 70, quarterlySalary: 4500, recruitmentCost: 2500 },
  { id: 'senior-professional', name: 'Senior Executive', quality: 90, quarterlySalary: 9000, recruitmentCost: 5000 },
] as const;
export function staffingEconomics(b: Business) {
  const n = normalizeBusiness(b), s = sectorById(n.sector), price = productEconomics(n, 'standard').marketPrice;
  return { quarterlySalary: Math.max(2400, Math.round((s?.overhead ?? 7000) * .4 / 100) * 100), capacityPerEmployee: Math.max(1, Math.round((s?.revenue ?? 45000) / price * .85)) };
}
export function trustedManagers(c: Career) {
  const social = socialOf(c), contacts = [...social.contacts, ...(social.partner && !social.contacts.some(p => p.id === social.partner?.id) ? [social.partner] : [])];
  return contacts.filter(p => p.affinity >= 60 && p.status !== 'estranged').map(p => ({ ...p, quality: Math.min(95, Math.round((p.archetypeId === 'executive' ? 60 : p.archetypeId === 'mentor' ? 50 : 35) + p.affinity * .3)), quarterlySalary: p.archetypeId === 'executive' ? 4500 : 3000 }));
}
export function activeManager(c: Career | undefined, b: Business): GeneralManager | null {
  const n = normalizeBusiness(b), saved = n.generalManager;
  if (saved?.source === 'professional') return saved;
  const person = c ? trustedManagers(c).find(p => p.id === (saved?.id ?? b.managerId)) : undefined;
  if (saved && (!c || person)) return saved;
  return person ? { id: person.id, name: person.name, source: 'contact', quality: person.quality, quarterlySalary: person.quarterlySalary, appointed: b.founded } : null;
}
export function ownerUnavailable(c: Career | undefined) {
  return !!c && (!!c.legal?.prison || ['remand', 'police'].includes(c.crime?.arrest?.custody ?? '') || ['president', 'governor', 'senate', 'house'].includes(c.office?.id ?? ''));
}
export function assignBusinessManager(c: Career, id: string, personId: string | null): Result {
  const b = c.businesses.find(b => b.id === id);
  if (!b) return { ok: false, message: 'Business not found.' };
  const person = personId ? trustedManagers(c).find(p => p.id === personId) : undefined;
  const professional = professionalExecutives.find(p => p.id === personId);
  if (personId && !person && !professional) return { ok: false, message: 'Choose a trusted member of your circle or a professional executive.' };
  if ((b.generalManager?.id ?? b.managerId ?? null) === personId) return { ok: false, message: 'That management arrangement is already in place.' };
  const cost = professional?.recruitmentCost ?? 0;
  if (cost > 0 && b.account < cost) return { ok: false, message: 'Company cash cannot cover executive recruitment.' };
  const manager: GeneralManager | null = person ? { id: person.id, name: person.name, source: 'contact', quality: person.quality, quarterlySalary: person.quarterlySalary, appointed: c.date } : professional ? { id: professional.id, name: professional.name, source: 'professional', quality: professional.quality, quarterlySalary: professional.quarterlySalary, appointed: c.date } : null;
  const paid = cost ? { ...changeBusinessCash(b, -cost), ledger: [{ month: c.date, label: 'GM recruitment', amount: -cost }, ...b.ledger] } : b;
  const updated = { ...paid, generalManager: manager, managerId: manager?.id ?? null };
  return { ok: true, message: manager ? `${manager.name} appointed GM · quality ${manager.quality}/100.` : `${b.name} is now owner-managed.`, career: { ...c, businesses: c.businesses.map(x => x.id === id ? updated : x) } };
}
export type WorkforceRequest = { type: 'hire-staff'; id: string; count: number } | { type: 'fire-staff'; id: string; count: number };
export function workforceAction(c: Career, request: WorkforceRequest): Result {
  const existing = c.businesses.find(b => b.id === request.id);
  if (!existing) return { ok: false, message: 'Business not found.' };
  const b = normalizeBusiness(existing), count = request.count;
  if (!Number.isInteger(count) || count < 1 || count > 1000) return { ok: false, message: 'Choose a whole staff count between 1 and 1,000.' };
  const salary = staffingEconomics(b).quarterlySalary;
  if (request.type === 'hire-staff' && (b.employees.length + count > 1000 || b.account < salary * count)) return { ok: false, message: 'Company cash must cover one quarter of new staff salaries; maximum 1,000 employees.' };
  if (request.type === 'fire-staff' && count > b.employees.length) return { ok: false, message: 'You cannot dismiss more employees than you have.' };
  let suffix = 1;
  const additions = Array.from({ length: request.type === 'hire-staff' ? count : 0 }, () => {
    while (b.employees.some(e => e.id === `${b.id}-staff-${suffix}`)) suffix++;
    return { id: `${b.id}-staff-${suffix++}`, hired: c.date, quarterlySalary: salary };
  });
  const employees = request.type === 'hire-staff' ? [...b.employees, ...additions] : b.employees.slice(0, -count);
  return { ok: true, message: `${count} operational staff ${request.type === 'hire-staff' ? 'hired' : 'dismissed'}. Payroll settles from company cash each quarter.`, career: { ...c, businesses: c.businesses.map(x => x.id === b.id ? { ...b, employees } : x) } };
}