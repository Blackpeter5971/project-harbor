import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import type { IllicitTxn } from './corruption-schema';
import { corruptionOf, record, riskOf } from './corruption';
import { holdsOffice } from './approval';
import { spendTreasury, treasuryFunds } from './budget';
import type { Result } from './gameplay';

/**
 * Phase 5B — laundering, influence peddling and treasury embezzlement. Pure, browser-safe.
 * Laundering is the only path from the off-books reserve to clean personal cash: it costs a fee,
 * leaves an explicit personal-ledger line and an illicit record. Each action once per turn.
 */
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const scale = (c: Career) => ({ council: 1, mayor: 2, stateLeg: 2.5, governor: 5, house: 5, senate: 8, president: 15 } as Record<string, number>)[c.office?.id ?? ''] ?? 1;

export type LaunderMethod = 'shell' | 'business' | 'offshore';
export const launderMethods: Record<LaunderMethod, { name: string; note: string; fee: number; evidence: number }> = {
  shell: { name: 'Shell consultancy', note: 'Fake invoices from a paper company. Cheap but sloppy.', fee: 0.12, evidence: 7 },
  business: { name: 'Through your company', note: 'Inflate revenue at a business you own, then pay yourself.', fee: 0.06, evidence: 10 },
  offshore: { name: 'Offshore trust', note: 'Layered through foreign banks. Expensive, hardest to trace.', fee: 0.25, evidence: 3 },
};
const txn = (c: Career, id: string, kind: IllicitTxn['kind'], amount: number, source: string, destination: IllicitTxn['destination'], favor: string, evidence: number): IllicitTxn =>
  ({ id: `${id}|${c.date}`, date: c.date, amount, kind, source, destination, favor, risk: riskOf(evidence), evidence });

export function launder(c: Career, amount: number, method: LaunderMethod): Result {
  const k = corruptionOf(c), m = launderMethods[method];
  if (!m) return { ok: false, message: 'Unknown laundering route.' };
  if (k.launderTurn === c.date) return { ok: false, message: 'Your fixer will only move money once a quarter.' };
  if (!Number.isFinite(amount) || amount <= 0 || amount > k.reserve) return { ok: false, message: `You can launder up to ${usd(k.reserve)}.` };
  if (method === 'business' && !c.businesses.length) return { ok: false, message: 'You need to own a business to run money through it.' };
  const amt = Math.round(amount), fee = Math.round(amt * m.fee), clean = amt - fee;
  // Bigger sums are harder to hide.
  const evidence = m.evidence + Math.min(12, Math.round(amt / scale(c) / 20000));
  const label = method === 'business' ? `Dividend · ${c.businesses[0]!.name}` : method === 'shell' ? 'Consulting income · Larkspur Advisory LLC' : 'Trust distribution · Cayman holdings';
  const n = record({ ...c, money: c.money + clean, ledger: [{ month: c.date, label, amount: clean }, ...c.ledger], log: [`Laundered ${usd(amt)} via ${m.name.toLowerCase()} (fee ${usd(fee)}).`, ...c.log].slice(0, 30) },
    txn(c, `launder|${method}`, 'laundering', amt, m.name, 'personal', `Fee ${usd(fee)}`, evidence), { launderTurn: c.date, reserve: k.reserve - amt });
  return { ok: true, career: n, message: `${usd(clean)} now looks like clean income. ${usd(fee)} went to the fixers.` };
}

export const influenceOffer = (c: Career) => holdsOffice(c) && corruptionOf(c).influenceTurn !== c.date
  ? { amount: Math.round(12000 * scale(c)), evidence: 8 + Math.min(8, corruptionOf(c).txns.filter(t => t.kind === 'influence').length * 2) } : null;

/** Sell access: private meetings and a friendly word with regulators, paid off the books. */
export function peddleInfluence(c: Career): Result {
  const o = influenceOffer(c);
  if (!o) return { ok: false, message: holdsOffice(c) ? 'You already sold access this quarter.' : 'Nobody pays for access to someone without office.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Hosting the lobbyists costs 15% energy.' };
  const k = corruptionOf(c);
  const n = record({ ...c, actions: c.actions - ACTION_COST, log: [`Sold access to lobbyists for ${usd(o.amount)}.`, ...c.log].slice(0, 30) },
    txn(c, 'influence', 'influence', o.amount, 'Beltline Strategies (lobbyists)', 'illicit_reserve', 'Private access & regulator calls', o.evidence), { influenceTurn: c.date, reserve: k.reserve + o.amount });
  return { ok: true, career: n, message: `${usd(o.amount)} in "speaking fees" landed in your off-books reserve.` };
}

export const EXECUTIVES = ['mayor', 'governor', 'president'] as const;
export const isExecutive = (c: Career) => holdsOffice(c) && (EXECUTIVES as readonly string[]).includes(c.office?.id ?? '');
export const EMBEZZLE_MAX_SHARE = 0.2;
export const embezzleLimit = (c: Career) => isExecutive(c) ? Math.floor(treasuryFunds(c) * EMBEZZLE_MAX_SHARE) : 0;
/** Treasury theft leaves a big paper trail: 25 base plus share of treasury taken. */
export const embezzleEvidence = (c: Career, amount: number) => Math.round(25 + Math.min(35, (amount / Math.max(1, treasuryFunds(c))) * 150));
export const embezzlePenalty = (c: Career) => c.office?.id === 'president' ? 'Treason-level charges: life imprisonment or the death penalty.'
  : c.office?.id === 'governor' ? 'Grand theft of state funds: 20+ years in prison, possibly life.' : 'Public corruption felony: up to 10 years in prison.';

/** Executives only. Debits the government treasury and credits personal cash — never silently. */
export function embezzle(c: Career, amount: number): Result {
  if (!isExecutive(c)) return { ok: false, message: 'Only a sitting mayor, governor or president controls the treasury.' };
  const k = corruptionOf(c);
  if (k.embezzleTurn === c.date) return { ok: false, message: 'Another withdrawal this quarter would surely be noticed.' };
  const amt = Math.round(amount), cap = embezzleLimit(c);
  if (!Number.isFinite(amt) || amt <= 0 || amt > cap) return { ok: false, message: `You can divert at most ${usd(cap)} (20% of the treasury) without the books collapsing.` };
  const evidence = embezzleEvidence(c, amt);
  const spent = spendTreasury(c, amt, `embezzle|${c.date}`, 'Unexplained transfer · "discretionary reserve"');
  if (!spent.ok || !spent.career) return spent;
  const n = record({ ...spent.career, money: spent.career.money + amt, ledger: [{ month: c.date, label: 'Transfer from government treasury', amount: amt }, ...spent.career.ledger], log: [`Diverted ${usd(amt)} of public money into your personal account.`, ...c.log].slice(0, 30) },
    txn(c, 'embezzle', 'embezzlement', amt, 'Government treasury', 'personal', 'Unauthorized withdrawal', evidence), { embezzleTurn: c.date });
  return { ok: true, career: n, message: `${usd(amt)} moved from the treasury to your personal account. Auditors will notice the gap.` };
}
