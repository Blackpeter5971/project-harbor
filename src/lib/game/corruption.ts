import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import { corruptionSchema, type Corruption, type IllicitTxn } from './corruption-schema';
import { rand } from './campaign';
import { registerScandal } from './scandals';
import { holdsOffice } from './approval';
import type { Result } from './gameplay';

/**
 * Phase 5A — corruption foundation. Pure, browser-safe.
 * Illicit cash lives only in corruption.reserve and corruption.txns. Bribes never touch
 * career.money, the personal ledger or treasury; dark money enters campaign funds only with
 * an explicit "Undisclosed" campaign line plus a matching illicit record. Each corrupt
 * choice is allowed once per turn and every one raises the saved exposure rating.
 */
export const corruptionOf = (c: Career): Corruption => c.corruption ?? corruptionSchema.parse({});
const clamp = (n: number) => Math.round(Math.max(0, Math.min(100, n)) * 10) / 10;
const scale = (c: Career) => ({ council: 1, mayor: 2, stateLeg: 2.5, governor: 5, house: 5, senate: 8, president: 15 } as Record<string, number>)[c.office?.id ?? ''] ?? 1;

export type BribeOffer = { id: string; source: string; favor: string; amount: number; evidence: number; risk: IllicitTxn['risk'] };
const BRIBES = [
  { source: 'Harlan Development Group', favor: 'Rezone the riverfront lots for luxury condos', amount: 25000, evidence: 14 },
  { source: 'Crestline Waste Services', favor: 'Steer the sanitation contract their way', amount: 40000, evidence: 20 },
  { source: 'Meridian Holdings', favor: 'Quietly kill a tenant-protection ordinance', amount: 18000, evidence: 10 },
  { source: 'Northgate Logistics', favor: 'Waive environmental review on a new depot', amount: 55000, evidence: 26 },
] as const;
export const riskOf = (evidence: number): IllicitTxn['risk'] => evidence >= 20 ? 'High' : evidence >= 12 ? 'Medium' : 'Low';

/** This turn's deterministic backroom offer (officeholders only), or null once answered. */
export function bribeOffer(c: Career): BribeOffer | null {
  if (!holdsOffice(c) || corruptionOf(c).bribeTurn === c.date) return null;
  const b = BRIBES[Math.floor(rand(`${c.character.name}|${c.date}|bribe`) * BRIBES.length)] ?? BRIBES[0];
  const evidence = b.evidence + Math.min(10, corruptionOf(c).txns.length * 2);
  return { id: `bribe|${c.date}`, source: b.source, favor: b.favor, amount: Math.round(b.amount * scale(c)), evidence, risk: riskOf(evidence) };
}

/** This turn's undisclosed donation offer while a campaign runs. */
export function darkMoneyOffer(c: Career) {
  if (!c.campaign || corruptionOf(c).darkMoneyTurn === c.date) return null;
  const amount = Math.round((15000 + rand(`${c.character.name}|${c.date}|dark`) * 25000) * scale(c));
  const evidence = 12 + Math.round(amount / scale(c) / 4000);
  return { id: `dark|${c.date}`, source: 'Citizens for a Brighter Tomorrow (shell PAC)', amount, evidence, risk: riskOf(evidence) };
}

export const record = (c: Career, txn: IllicitTxn, patch: Partial<Corruption>): Career => {
  const k = corruptionOf(c);
  return { ...c, corruption: { ...k, ...patch, exposure: clamp(k.exposure + txn.evidence), txns: [txn, ...k.txns].slice(0, 60) } };
};

export function acceptBribe(c: Career): Result {
  const o = bribeOffer(c);
  if (!o) return { ok: false, message: 'There is no backroom offer on the table this turn.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Taking the meeting costs 15% energy.' };
  const k = corruptionOf(c);
  const txn: IllicitTxn = { id: o.id, date: c.date, amount: o.amount, kind: 'bribe', source: o.source, destination: 'illicit_reserve', favor: o.favor, risk: o.risk, evidence: o.evidence };
  const n = record({ ...c, actions: c.actions - ACTION_COST, log: [`Backroom deal: took $${o.amount.toLocaleString('en-US')} from ${o.source}.`, ...c.log].slice(0, 30) }, txn, { bribeTurn: c.date, reserve: k.reserve + o.amount });
  return { ok: true, career: n, message: `$${o.amount.toLocaleString('en-US')} moved into your off-books reserve. The paper trail grew.` };
}
export function declineBribe(c: Career): Result {
  if (!bribeOffer(c)) return { ok: false, message: 'There is no offer to decline.' };
  return { ok: true, career: { ...c, corruption: { ...corruptionOf(c), bribeTurn: c.date } }, message: 'You showed them the door.' };
}

export function acceptDarkMoney(c: Career): Result {
  const o = darkMoneyOffer(c), camp = c.campaign;
  if (!o || !camp) return { ok: false, message: 'No undisclosed donors are circling this turn.' };
  const txn: IllicitTxn = { id: o.id, date: c.date, amount: o.amount, kind: 'dark_money', source: o.source, destination: 'campaign', favor: '', risk: o.risk, evidence: o.evidence };
  const campaign = { ...camp, funds: camp.funds + o.amount, raised: camp.raised + o.amount, txns: [{ month: c.date, label: `Undisclosed contribution · ${o.source}`, amount: o.amount }, ...camp.txns].slice(0, 40) };
  const n = record({ ...c, campaign, log: [`Dark money: $${o.amount.toLocaleString('en-US')} undisclosed into the campaign.`, ...c.log].slice(0, 30) }, txn, { darkMoneyTurn: c.date });
  return { ok: true, career: n, message: `$${o.amount.toLocaleString('en-US')} in undisclosed money hit the campaign account.` };
}
export function declineDarkMoney(c: Career): Result {
  if (!darkMoneyOffer(c)) return { ok: false, message: 'There is no offer to decline.' };
  return { ok: true, career: { ...c, corruption: { ...corruptionOf(c), darkMoneyTurn: c.date } }, message: 'You turned the donors away.' };
}

/** Quarterly leak probability from exposure: nothing below 20%, rising to 60% at full exposure. */
export const leakChance = (exposure: number) => exposure < 20 ? 0 : Math.min(0.6, (exposure - 10) / 150);
export const WHISTLE_CHANCE = 0.4;
export const AUDIT_AT = 70, EXPOSURE_DECAY = 2;
export const exposureLabel = (e: number) => e < 20 ? 'Quiet' : e < 45 ? 'Whispers' : e < 70 ? 'Reporters digging' : 'Audit imminent';

/** Once per quarter: leak and audit checks feed Phase 4 scandals, then the trail fades slightly. */
export function corruptionTurn(c: Career, end: string, roll = rand(`${c.character.name}|${end}|leak`)): { career: Career; notices: string[] } {
  const k = c.corruption;
  if (!k || k.lastTurn >= end) return { career: c, notices: [] };
  let n = c; const notices: string[] = [];
  const recent = k.txns[0];
  const severity = k.exposure >= 70 ? 'Severe' as const : k.exposure >= 40 ? 'Moderate' as const : 'Minor' as const;
  if (recent && roll < leakChance(k.exposure)) {
    const dark = recent.kind === 'dark_money';
    if (recent.kind === 'self_dealing') n = registerScandal(n, { id: `corruption|leak|${end}`, date: end, title: `No-bid contract: ${recent.source}`, summary: `Reporters found a public contract was steered without tender to a company owned by the official: ${recent.favor}.`, source: 'Investigative Reporter', severity, evidence: Math.round(k.exposure), trigger: 'corruption' });
    else if (recent.kind === 'embezzlement') n = registerScandal(n, { id: `corruption|leak|${end}`, date: end, title: 'Public money missing from the treasury', summary: `Auditors and reporters found a ${'$'}${recent.amount.toLocaleString('en-US')} unexplained transfer from government accounts that traces back to the official.`, source: 'Investigative Reporter', severity: 'Severe', evidence: Math.round(Math.max(60, k.exposure)), trigger: 'corruption' });
    else if (recent.kind === 'laundering' || recent.kind === 'influence') n = registerScandal(n, { id: `corruption|leak|${end}`, date: end, title: recent.kind === 'laundering' ? `Money trail through ${recent.source}` : 'Access for sale', summary: recent.kind === 'laundering' ? `Bank records suggest off-books cash was washed through ${recent.source.toLowerCase()} into the official's personal accounts.` : `Lobbyists from ${recent.source} paid "speaking fees" in exchange for private access and calls to regulators.`, source: 'Investigative Reporter', severity, evidence: Math.round(k.exposure), trigger: 'corruption' });
    else
    n = registerScandal(n, { id: `corruption|leak|${end}`, date: end, title: dark ? 'Undisclosed donor money' : `Backroom payment: ${recent.source}`, summary: dark ? `Reporters traced undisclosed contributions from ${recent.source} into the campaign. Finance filings do not list them.` : `An investigative report links ${recent.source} payments to a decision to ${recent.favor.toLowerCase()}.`, source: 'Investigative Reporter', severity, evidence: Math.round(k.exposure), trigger: 'corruption' });
    notices.push(`Leak: investigative reporters are publishing on your finances (exposure ${Math.round(k.exposure)}%).`);
  }
  // Whistleblowers: each unreported self-dealing award gets one deterministic 40% chance per quarter.
  const whistled = [...(k.whistled ?? [])];
  for (const t of k.txns.filter(t => t.kind === 'self_dealing' && !whistled.includes(t.id))) {
    if (rand(`${t.id}|${end}|whistle`) >= WHISTLE_CHANCE) continue;
    whistled.push(t.id);
    n = registerScandal(n, { id: `corruption|whistle|${t.id}`, date: end, title: `Whistleblower: ${t.source} contract`, summary: `A procurement officer says ${t.favor} was awarded by executive discretion to the official's own company with no independent review.`, source: 'Whistleblower', severity: k.exposure >= 45 ? 'Severe' : 'Moderate', evidence: Math.round(Math.max(40, k.exposure)), trigger: 'corruption' });
    notices.push(`Whistleblower: a procurement insider reported the ${t.source} contract.`);
  }
  let lastAudit = k.lastAudit;
  if (k.exposure >= AUDIT_AT && (!lastAudit || lastAudit < end.replace(/^(\d{4})/, y => String(Number(y) - 1)))) {
    n = registerScandal(n, { id: `corruption|audit|${end}`, date: end, title: 'Legal audit of your finances', summary: `Auditors opened a formal review of ${k.txns.length} questionable transaction(s). No charges have been filed.`, source: 'Legal Audit', severity: 'Severe', evidence: Math.round(k.exposure), trigger: 'corruption' });
    lastAudit = end; notices.push('Legal audit opened into your finances.');
  }
  n = { ...n, corruption: { ...k, whistled, lastAudit, lastTurn: end, exposure: clamp(k.exposure - EXPOSURE_DECAY) } };
  return { career: n, notices };
}
