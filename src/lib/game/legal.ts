import type { Career } from './career';
import { legalSchema, type Legal, type LegalCase } from './legal-schema';
import { applyActionApproval, holdsOffice } from './approval';
import { shiftLoyalty } from './support-groups';
import type { Result } from './support';
import { prisonTurn } from './prison';
import { chooseStrategy, grandCorruption, resolveTrial, scheduleTrial, type Strategy } from './court';

/**
 * Phase 6A — legal investigations. Pure, browser-safe. Cases open only from concrete evidence
 * (corruption exposure and proven or well-documented scandals), never from allegations alone, and
 * advance one stage per quarter: inquiry → formal → grand jury → indictment or dismissal.
 * Indictments go to trial in court.ts (Phase 6B). Legal fees come only from personal cash.
 */
export const legalOf = (c: Career): Legal => c.legal ?? legalSchema.parse({});
export const OPEN_AT = 55, DROP_BELOW = 25, INDICT_AT = 50;
export const activeCase = (c: Career) => legalOf(c).cases.find(k => !k.closed) ?? null;
export const roleOf = (c: Career): LegalCase['role'] => holdsOffice(c) ? 'official' : c.campaign ? 'candidate' : 'citizen';
export const stageName: Record<LegalCase['stage'], string> = { inquiry: 'Preliminary inquiry', formal: 'Special prosecutor appointed', grand_jury: 'Grand jury review', indicted: 'Indicted · awaiting trial', dismissed: 'Case dismissed', acquitted: 'Acquitted / dropped', convicted: 'Convicted' };

/** Concrete evidence only: unanswered allegations with no evidence score and cleared scandals count for nothing. */
export function evidenceBasis(c: Career): number {
  const exposure = c.corruption?.exposure ?? 0, tried = legalOf(c).adjudicated;
  const docs = c.scandals.filter(s => s.status !== 'cleared' && s.evidence > 0 && s.date > tried);
  const scandal = Math.max(0, ...docs.map(s => s.evidence * (s.status === 'proven' ? 1 : 0.6)));
  const proven = c.scandals.filter(s => s.status === 'proven' && s.date > tried).length;
  return Math.min(100, Math.round(Math.max(exposure, scandal) + proven * 5));
}
export const netCase = (k: LegalCase) => Math.max(0, k.strength - k.defense);

export const COUNSEL = {
  public: { name: 'Public defender', cost: 0, defense: 10, delay: 0 },
  firm: { name: 'Downtown law firm', cost: 15_000, defense: 25, delay: 1 },
  elite: { name: 'Elite white-collar team', cost: 60_000, defense: 45, delay: 2 },
} as const;
export const CONTEST_COST = 10_000, CONTEST_CUT = 8;

const nextQuarter = (d: string) => { const [y = 0, m = 1] = d.split('-').map(Number), i = y * 12 + m + 2; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`; };
const patch = (c: Career, k: LegalCase): Career => ({ ...c, legal: { ...legalOf(c), cases: legalOf(c).cases.map(x => x.id === k.id ? k : x) } });
const note = (k: LegalCase, date: string, text: string): LegalCase => ({ ...k, history: [{ date, text }, ...k.history].slice(0, 20) });
const pay = (c: Career, amount: number, label: string): Career => amount ? { ...c, money: c.money - amount, ledger: [{ month: c.date, label, amount: -amount }, ...c.ledger] } : c;

export function hireCounsel(c: Career, tier: keyof typeof COUNSEL): Result {
  const k = activeCase(c), t = COUNSEL[tier];
  if (!k) return { ok: false, message: 'There is no open investigation.' };
  if (!t) return { ok: false, message: 'Choose a defense team.' };
  const order = ['none', 'public', 'firm', 'elite'];
  if (order.indexOf(tier) <= order.indexOf(k.counsel)) return { ok: false, message: 'You already retain equal or better counsel.' };
  if (c.money < t.cost) return { ok: false, message: `${t.name} needs a $${t.cost.toLocaleString('en-US')} retainer from personal funds.` };
  const prev = k.counsel === 'none' ? 0 : COUNSEL[k.counsel].defense;
  const grand = !!grandCorruption(c, legalOf(c).adjudicated);
  // Grand corruption: lawyers cannot buy delays or soften the case.
  const next = note({ ...k, counsel: tier, defense: grand ? k.defense : Math.min(100, k.defense - prev + t.defense), delays: grand ? k.delays : k.delays + t.delay }, c.date, `Retained ${t.name}.`);
  const message = `${t.name} retained${t.cost ? ` for $${t.cost.toLocaleString('en-US')} from personal funds` : ''}.`;
  return { ok: true, message, career: patch(pay({ ...c, log: [message, ...c.log].slice(0, 30) }, t.cost, `Legal fees · ${t.name}`), next) };
}

export function contestEvidence(c: Career): Result {
  const k = activeCase(c);
  if (!k) return { ok: false, message: 'There is no open investigation.' };
  if (k.counsel === 'none') return { ok: false, message: 'Retain counsel before contesting evidence.' };
  if (grandCorruption(c, legalOf(c).adjudicated)) return { ok: false, message: 'Courts reject evidence motions in grand corruption cases: the money trail is documented.' };
  if (k.contestTurn === c.date) return { ok: false, message: 'Your lawyers already filed motions this turn.' };
  if (c.money < CONTEST_COST) return { ok: false, message: 'Filing motions costs $10,000 from personal funds.' };
  const next = note({ ...k, strength: Math.max(0, k.strength - CONTEST_CUT), contestTurn: c.date }, c.date, 'Defense motions challenged the evidence.');
  return { ok: true, message: `Motions filed: case strength −${CONTEST_CUT}.`, career: patch(pay(c, CONTEST_COST, 'Legal fees · evidence motions'), next) };
}

export const chooseTrialStrategy = (c: Career, s: Strategy): Result => chooseStrategy(c, activeCase(c), s);
export const inPrison = (c: Career) => !!legalOf(c).prison;

/** Public stages hurt approval/party standing for officials; candidates and citizens lose reputation instead. */
function publicHit(c: Career, size: 'formal' | 'indicted', reason: string): Career {
  const role = roleOf(c), party = size === 'formal' ? -6 : -10;
  let n = c;
  if (role === 'official') n = applyActionApproval(n, `legal-${size}`, size === 'formal' ? -4 : -5, 'major', reason);
  else n = { ...n, reputation: Math.max(0, n.reputation - (role === 'candidate' ? 5 : 2) * (size === 'formal' ? 1 : 2)) };
  if (role !== 'citizen') n = shiftLoyalty(n, {}, reason, party);
  return n;
}

/** Once per quarter end. Opens a case from concrete evidence, then advances the open case one stage. */
const usdDebt = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;

/** Pays unpaid court fines/restitution from available personal cash (all of it, or up to `amount`). */
export function settleCourtDebt(c: Career, date: string, amount?: number): { career: Career; paid: number; notice: string } {
  const L = legalOf(c), owed = Math.max(0, L.owed);
  const paid = Math.round(Math.max(0, Math.min(owed, Math.max(0, c.money), amount ?? Infinity)));
  if (paid <= 0) return { career: c, paid: 0, notice: '' };
  const left = Math.max(0, owed - paid);
  return { paid, notice: `Paid ${usdDebt(paid)} toward court fines/restitution${left ? ` (${usdDebt(left)} remaining)` : ' — court debt cleared'}.`,
    career: { ...c, money: c.money - paid, ledger: [{ month: date, label: 'Court debt & restitution payment', amount: -paid }, ...c.ledger], legal: { ...L, owed: left } } };
}

/** Manual payoff from the Legal panel or prison dashboard. */
export function payCourtDebt(c: Career, amount?: number): Result {
  if (legalOf(c).owed <= 0) return { ok: false, message: 'You have no court debt.' };
  if (c.money <= 0) return { ok: false, message: 'No personal cash available to pay court debt.' };
  const s = settleCourtDebt(c, c.date, amount);
  return { ok: true, career: s.career, message: s.notice };
}

export function legalTurn(c: Career, end: string): { career: Career; notices: string[] } {
  const L = legalOf(c);
  if (L.lastTurn >= end) return { career: c, notices: [] };
  // Legacy saves closed indictments before trials existed: reopen them so they get a court date.
  const cases = L.cases.map(x => x.stage === 'indicted' && x.closed && !x.trial ? { ...x, closed: null } : x);
  let n: Career = { ...c, legal: { ...L, cases, lastTurn: end } };
  const notices: string[] = [];
  { const s = settleCourtDebt(n, end); n = s.career; if (s.notice) notices.push(s.notice); }
  if (L.prison || L.executed) {
    const p = prisonTurn(n, end);
    return { career: p.career, notices: [...notices, ...p.notices] };
  }
  const basis = evidenceBasis(n);
  let k = activeCase(n);
  if (!k) {
    const yearAgo = end.replace(/^(\d{4})/, y => String(Number(y) - 1));
    const blocked = !!legalOf(n).prison || cases.some(x => (x.closed ?? '') > yearAgo);
    if (basis >= OPEN_AT && !blocked) {
      const fresh: LegalCase = note({ id: `case|${end}`, opened: end, stage: 'inquiry', strength: basis, counsel: 'none', defense: 0, role: roleOf(n), stageSince: end, delays: 0, contestTurn: '', closed: null, history: [], trial: null }, end, 'Prosecutors opened a discreet preliminary inquiry.');
      n = { ...n, legal: { ...legalOf(n), cases: [fresh, ...legalOf(n).cases].slice(0, 10) } };
      notices.push('Legal: prosecutors quietly opened a preliminary inquiry. It is not public yet.');
    }
    return { career: n, notices };
  }
  if (k.stage === 'indicted') {
    const adj = legalOf(n).adjudicated;
    if (!k.trial) {
      const trial = scheduleTrial(n, k, end, adj);
      k = note({ ...k, trial }, end, `Court date set for ${trial.courtDate.slice(0, 7)}. Choose a trial strategy.`);
      notices.push(`Court: trial scheduled for ${trial.courtDate.slice(0, 7)}. Pick a strategy in Politics → Legal.`);
      return { career: patch(n, k), notices };
    }
    if (k.delays > 0 && k.trial.courtDate <= end) {
      k = note({ ...k, delays: k.delays - 1, trial: { ...k.trial, courtDate: nextQuarter(end) } }, end, 'Defense motions postponed the trial.');
      notices.push(`Court: your lawyers postponed the trial to ${k.trial!.courtDate.slice(0, 7)}.`);
      return { career: patch(n, k), notices };
    }
    if (k.trial.courtDate > end || k.trial.verdict) return { career: patch(n, k), notices };
    const r = resolveTrial(n, k, end, adj);
    notices.push(...r.notices);
    return { career: patch(r.career, r.case), notices };
  }
  if (k.stageSince >= end) return { career: n, notices };
  // New evidence strengthens the case; it never weakens on its own.
  k = { ...k, strength: Math.max(k.strength, basis), role: roleOf(n) };
  if (k.delays > 0) {
    k = note({ ...k, delays: k.delays - 1 }, end, 'Defense motions delayed proceedings.');
    notices.push(`Legal: your lawyers delayed the ${stageName[k.stage].toLowerCase()} another quarter.`);
    return { career: patch(n, k), notices };
  }
  const net = netCase(k);
  const advance = (stage: LegalCase['stage'], text: string, closed = false) => { k = note({ ...k!, stage, stageSince: end, closed: closed ? end : null }, end, text); notices.push(`Legal: ${text}`); };
  if (k.stage === 'inquiry') {
    if (net < DROP_BELOW) advance('dismissed', 'Prosecutors dropped the preliminary inquiry for lack of evidence.', true);
    else { advance('formal', 'A special prosecutor was appointed. The investigation is now public.'); n = publicHit(n, 'formal', 'Special prosecutor appointed'); }
  } else if (k.stage === 'formal') advance('grand_jury', 'The case went before a grand jury for evidentiary review.');
  else if (k.stage === 'grand_jury') {
    if (net >= INDICT_AT) { advance('indicted', `The grand jury returned a formal indictment (case ${Math.round(k.strength)} vs defense ${Math.round(k.defense)}). A court date will be set.`); n = publicHit(n, 'indicted', 'Formal indictment');
      const trial = scheduleTrial(n, k, end, legalOf(n).adjudicated);
      k = note({ ...k, trial }, end, `Court date set for ${trial.courtDate.slice(0, 7)}.`);
      notices.push(`Court: trial scheduled for ${trial.courtDate.slice(0, 7)}. Pick a strategy in Politics → Legal.`); }
    else advance('dismissed', 'The grand jury declined to indict. The case was dismissed.', true);
  }
  return { career: patch(n, k), notices };
}
