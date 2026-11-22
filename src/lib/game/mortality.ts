import type { Career } from './career';
import type { Result } from './support';
import { archiveTerm } from './terms';
import { closeTenure } from './legislation';
import { baselineSpend } from './budget';
import { captureLegacy, legacyOf, recordLife } from './legacy';

export const OLD_AGE = 70;
const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; return (h >>> 0) / 2 ** 32; };
const recentCare = (c: Career, period = c.date) => !!c.life?.medical?.lastCheckup && c.life.medical.lastCheckup >= `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`;
export function naturalMortalityRisk(c: Career): number {
  if (c.age < OLD_AGE) return 0;
  const health = c.health / 100, stress = (c.life?.stress ?? 20) / 100;
  return Math.min(0.65, (0.003 + (c.age - OLD_AGE) * 0.0015 + Math.max(0, c.age - 85) ** 2 * 0.0005) * (1.6 - health) * (0.8 + stress) * (recentCare(c) ? 0.65 : 1) * (c.life?.medical?.chronic ? 1.6 : 1));
}
export function securityRisk(c: Career) {
  const high = ['governor', 'president'].includes(c.office?.id ?? '');
  const extreme = c.treasury?.finance?.mood?.score === -5;
  const enemies = c.network?.figures.filter(f => f.score <= -70 && f.influence >= 70).length ?? 0;
  const l = legacyOf(c);
  const baseline = c.office ? (baselineSpend(c)['safety'] ?? 0) : 0;
  const funding = baseline > 0 ? Math.min(1.5, (c.budget?.spending['safety'] ?? baseline) / baseline) : 0;
  const bodyguard = l.security.bodyguardUntil > c.date;
  const armored = !c.life?.maintenanceOverdue && !!c.life?.vehicles?.some(v => v.id === c.life?.activeVehicleId && v.modelId === 'armored_sedan' && v.condition > 30);
  const risk = !high && !extreme ? 0 : Math.min(0.05, (0.001 + (extreme ? 0.008 : 0) + enemies * 0.0015) * Math.max(0.2, 1.5 - funding * 0.6) * (bodyguard ? 0.45 : 1) * (armored ? 0.6 : 1) * (l.security.reviewedPeriod === c.date ? 0.6 : 1));
  return { risk, warning: extreme ? 'Extreme unrest: heightened threat to your safety.' : enemies ? `${enemies} influential political enemies: intelligence threat warning.` : high ? 'Executive protection briefing: routine vigilance.' : 'No elevated executive threat.', enemies, funding, bodyguard: !!bodyguard };
}

/** Archive first, then release the existing office and appointment; never transfer public funds. */
export function endResponsibilities(c: Career, reason: 'retired' | 'death'): Career {
  let n = captureLegacy(c);
  if (n.office) n = archiveTerm(n, n.date, reason === 'death' ? 'died in office' : 'retired');
  const appointments = n.appointments;
  const appointment = appointments?.current;
  const closed = closeTenure(n);
  return { ...closed, office: null, publicOffice: false, eligibleAppointment: false, position: 'none', campaign: null,
    warChest: c.campaign ? Math.max(0, c.campaign.funds) : c.warChest, termPlan: null, executiveDocket: null, legislature: null,
    ...(appointments ? { appointments: { ...appointments, current: null, pledge: null, owed: null, history: appointment ? [...appointments.history, { title: appointment.title, superior: appointment.superiorName, since: appointment.since, ended: c.date, reason: 'resigned' as const }] : appointments.history } } : {}),
  };
}

export function concludeDeath(c: Career, cause: string): Career {
  if (legacyOf(c).death) return c;
  const office = c.office?.title ?? null;
  let n = endResponsibilities(c, 'death');
  n = recordLife(n, 'death', cause, office);
  return { ...n, health: 0, actions: 0, report: null, newspaperPending: false, pendingEvent: null, eventEncounter: null, debate: null,
    log: [`${c.character.name} died at age ${c.age}: ${cause}.`, ...n.log],
    newsQueue: [...n.newsQueue, { h: `${c.character.name} dies at ${c.age}`, sub: cause, body: legacyOf(n).death?.obituary ?? '', tag: 'government', subject: c.character.name }] };
}

/** One saved deterministic survival decision per quarter; reloads never reroll. */
export function mortalityTurn(c: Career, start: string, end: string, rolls?: { natural?: number; security?: number }): { career: Career; notices: string[] } {
  const l = legacyOf(c);
  if (l.death || start <= l.lastPeriod) return { career: c, notices: [] };
  const care = recentCare(c, end), executive = ['governor', 'president'].includes(c.office?.id ?? '');
  const burnoutQuarters = executive && (c.life?.stress ?? 0) >= 95 && !care ? l.burnoutQuarters + 1 : 0;
  const loss = (burnoutQuarters >= 2 ? 10 : 0) + (c.life?.medical?.chronic && !care ? 3 : 0);
  let n = captureLegacy({ ...c, date: end, health: Math.max(0, c.health - loss), legacy: { ...l, lastPeriod: start, burnoutQuarters } });
  const notices = loss ? [`Medical warning: untreated illness or sustained executive burnout cost ${loss} health.`] : [];
  const fatalEmergency = n.life?.medical?.emergencies.filter(e => e.untreated).at(-1);
  let cause = '';
  if (n.legal?.executed) cause = 'Execution following a recorded court sentence';
  else if (n.health === 0) cause = fatalEmergency ? `Critical health failure after untreated ${fatalEmergency.name.toLowerCase()}` : burnoutQuarters >= 2 ? 'Critical health failure after sustained executive burnout without medical care' : n.life?.medical?.chronic ? 'Critical health failure from severe chronic cardiac illness' : 'Critical health failure after cumulative recorded health deterioration';
  const security = securityRisk({ ...n, date: start });
  if (!cause && (rolls?.security ?? hash(`${l.owner}|${start}|security`)) < security.risk) cause = `Assassination following ${n.treasury?.finance?.mood?.score === -5 ? 'extreme civil unrest' : security.enemies ? 'heightened threats from influential political enemies' : 'an executive security breach'}`;
  if (!cause && (rolls?.natural ?? hash(`${l.owner}|${start}|natural`)) < naturalMortalityRisk(n)) cause = 'Natural causes in advanced age';
  n = { ...n, legacy: { ...legacyOf(n), security: { ...l.security, warning: security.warning } } };
  if (cause) return { career: concludeDeath(n, cause), notices: [...notices, `${n.character.name} died at ${n.age}: ${cause}.`] };
  return { career: n, notices };
}

export type LegacyRequest = { revision: number; owner: string; date: string; action: 'bodyguard' | 'briefing' };
export function securityAction(c: Career, r: LegacyRequest): Result {
  const l = legacyOf(c);
  if (l.death || r.revision !== c.politicalActivityRevision || r.owner !== l.owner || r.date !== c.date) return { ok: false, message: 'This safety decision is no longer current.' };
  if (r.action === 'briefing' && (!['governor', 'president'].includes(c.office?.id ?? '') || l.security.reviewedPeriod === c.date)) return { ok: false, message: 'No new executive briefing is available.' };
  if (r.action === 'bodyguard' && (c.money < 3000 || l.security.bodyguardUntil > c.date)) return { ok: false, message: 'Protection is active or you need $3,000 in personal cash.' };
  const [year = 2026, month = 1] = c.date.split('-').map(Number);
  const until = `${year + Math.floor((month + 2) / 12)}-${String((month + 2) % 12 + 1).padStart(2, '0')}-01`;
  const message = r.action === 'bodyguard' ? 'Personal protection hired for this quarter.' : 'Intelligence threat briefing reviewed; precautions are in place this quarter.';
  return { ok: true, message, career: { ...c, politicalActivityRevision: c.politicalActivityRevision + 1,
    money: c.money - (r.action === 'bodyguard' ? 3000 : 0), ledger: r.action === 'bodyguard' ? [{ month: c.date, label: 'Personal security · quarterly bodyguard', amount: -3000 }, ...c.ledger] : c.ledger,
    legacy: { ...l, security: { ...l.security, ...(r.action === 'bodyguard' ? { bodyguardUntil: until } : { reviewedPeriod: c.date }) } } } };
}