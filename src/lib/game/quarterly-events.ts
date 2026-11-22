import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import type { GovEvent } from './finance-schema';
import { indicators, revenueBase, spendTreasury, treasuryFunds } from './budget';
import { shiftApproval } from './approval';
import { rand, usd } from './campaign';
import { tenureKey, type Result } from './support';
import { credit, financeOf, isExecutive, relationship, withFinance } from './government-finance';

/* Phase 3 — Quarterly crises & positive events for executives. Pure, browser-safe.
   Events live in the tenure-scoped treasury finance record; a persisted end watermark
   makes each quarter roll/progress exactly once, and keyed treasury entries prevent double charges. */

export type Severity = GovEvent['severity'];
export type Kind = GovEvent['kind'];
type Scope = 'mayor' | 'governor' | 'president';
type Def = { id: string; name: string; kind: Kind; scopes: Scope[]; detail: string; minSeverity?: Severity };

export const SEVERITY: Record<Severity, { label: string; cost: number; mood: number; quarters: [number, number]; approval: number }> = {
  low: { label: 'Low', cost: 0.4, mood: 0.3, quarters: [1, 1], approval: 0.5 },
  moderate: { label: 'Moderate', cost: 1, mood: 0.7, quarters: [1, 2], approval: 1 },
  high: { label: 'High', cost: 2, mood: 1.2, quarters: [2, 3], approval: 2 },
  critical: { label: 'Critical', cost: 3.5, mood: 2, quarters: [3, 4], approval: 3 },
};
const ORDER: Severity[] = ['low', 'moderate', 'high', 'critical'];
const ALL: Scope[] = ['mayor', 'governor', 'president'];

export const EVENT_CATALOG: Def[] = [
  { id: 'flood', name: 'Flash flooding', kind: 'manageable', scopes: ALL, detail: 'Rivers burst their banks; homes and roads are under water.' },
  { id: 'wildfire', name: 'Wildfire', kind: 'manageable', scopes: ['governor', 'president'], detail: 'A fast-moving fire threatens towns and forests.' },
  { id: 'outbreak', name: 'Disease outbreak', kind: 'manageable', scopes: ALL, detail: 'Clinics report a surge of infections.' },
  { id: 'water-main', name: 'Water main failure', kind: 'manageable', scopes: ['mayor'], detail: 'A major pipe burst; districts lose running water.' },
  { id: 'bridge', name: 'Bridge closure', kind: 'manageable', scopes: ['mayor', 'governor'], detail: 'Inspectors close a crumbling bridge on a key route.' },
  { id: 'transit', name: 'Regional transit breakdown', kind: 'manageable', scopes: ['governor'], detail: 'Rail and bus lines halt across the region.' },
  { id: 'food', name: 'Food & water shortage', kind: 'manageable', scopes: ['governor', 'president'], detail: 'Supply disruptions empty shelves and reservoirs.' },
  { id: 'security', name: 'Local security incident', kind: 'manageable', scopes: ['mayor', 'governor'], detail: 'A violent incident shakes public confidence.' },
  { id: 'national-security', name: 'National security threat', kind: 'manageable', scopes: ['president'], detail: 'Agencies warn of a credible threat to the country.' },
  { id: 'trade-dispute', name: 'International trade dispute', kind: 'manageable', scopes: ['president'], detail: 'A major partner imposes retaliatory tariffs.' },
  { id: 'recession', name: 'Global recession', kind: 'external', scopes: ALL, detail: 'Worldwide demand collapses; local revenue and jobs suffer.' },
  { id: 'earthquake', name: 'Earthquake', kind: 'external', scopes: ALL, detail: 'A powerful quake damages buildings and roads.', minSeverity: 'moderate' },
  { id: 'trade-shock', name: 'International trade shock', kind: 'external', scopes: ['governor', 'president'], detail: 'Shipping lanes and export markets are disrupted.' },
  { id: 'climate', name: 'Severe climate anomaly', kind: 'external', scopes: ALL, detail: 'Record heat and drought strain power and farms.' },
  { id: 'investment', name: 'Foreign investment boom', kind: 'positive', scopes: ALL, detail: 'International firms announce new offices and plants.' },
  { id: 'trade-pact', name: 'Trade pact signed', kind: 'positive', scopes: ['governor', 'president'], detail: 'A new agreement opens markets for local producers.' },
  { id: 'tourism', name: 'Tourism spike', kind: 'positive', scopes: ALL, detail: 'Visitors pour in; hotels and restaurants are full.' },
  { id: 'resource', name: 'Resource discovery', kind: 'positive', scopes: ['governor', 'president'], detail: 'Surveyors confirm valuable new deposits.' },
  { id: 'sports', name: 'Championship victory', kind: 'positive', scopes: ALL, detail: 'The home team wins the title; streets fill with celebration.' },
  { id: 'tech', name: 'Major tech breakthrough', kind: 'positive', scopes: ALL, detail: 'A local lab unveils a breakthrough that draws investors.' },
];

const scope = (c: Career) => c.office?.id as Scope;
const r1 = (n: number) => Math.round(n * 10) / 10;
export const eventsOf = (c: Career) => financeOf(c).events;
export const activeEvents = (c: Career) => eventsOf(c).filter(e => e.status === 'active');
export const eventCost = (c: Career, e: Pick<GovEvent, 'severity'>) => Math.round(revenueBase(c) * 0.02 * SEVERITY[e.severity].cost);
/** Ongoing mood pressure (mood steps) from active events, used by the happiness factors. */
export const eventMoodPressure = (c: Career) => Math.max(-3, Math.min(2, activeEvents(c).reduce((t, e) => t + e.pressure, 0)));

/** 0–1 score: low crime, sound infrastructure and fiscal stability make good news likelier. */
export function governanceScore(c: Career) {
  const ind = indicators(c), f = financeOf(c);
  const fiscal = f.loans.length ? 0.3 : (c.treasury?.balance ?? 0) > 0 ? 0.7 : 0.4;
  const safety = activeEvents(c).some(e => e.kind !== 'positive') ? 0.3 : 0.7;
  return Math.max(0, Math.min(1, (ind.infrastructure / 100) * 0.3 + (ind.services / 100) * 0.2 + (f.economy.employment / 100) * 0.2 + fiscal * 0.15 + safety * 0.15));
}

/** Roll for a new event (or none). Deterministic per tenure/quarter so reloads cannot reroll. */
export function rollEvent(c: Career, end: string): GovEvent | null {
  const seed = `${tenureKey(c)}|event|${end}`;
  const active = activeEvents(c);
  if (active.length >= 2) return null;
  const last = eventsOf(c)[0];
  const chance = last && last.date === c.date ? 0.15 : 0.35;
  if (rand(seed) >= chance) return null;
  const g = governanceScore(c);
  const positive = rand(`${seed}|kind`) < 0.25 + g * 0.3;
  const pool = EVENT_CATALOG.filter(d => d.scopes.includes(scope(c)) && (positive ? d.kind === 'positive' : d.kind !== 'positive') && !active.some(e => e.catalogId === d.id));
  if (!pool.length) return null;
  const def = pool[Math.floor(rand(`${seed}|pick`) * pool.length)]!;
  // Positive tiers climb with good governance; crises skew milder when governance is good.
  const roll = rand(`${seed}|sev`) + (positive ? g * 0.35 : -g * 0.2);
  let sev: Severity = roll > 0.92 ? 'critical' : roll > 0.7 ? 'high' : roll > 0.4 ? 'moderate' : 'low';
  if (def.minSeverity && ORDER.indexOf(sev) < ORDER.indexOf(def.minSeverity)) sev = def.minSeverity;
  const [lo, hi] = SEVERITY[sev].quarters;
  const remaining = def.kind === 'positive' ? 1 : lo + Math.floor(rand(`${seed}|len`) * (hi - lo + 1));
  const s = SEVERITY[sev];
  return { id: `${end}|${def.id}`, catalogId: def.id, name: def.name, detail: def.detail, kind: def.kind, severity: sev, date: c.date, remaining,
    status: 'active', response: null, petitioned: false, emergency: false, pressure: def.kind === 'positive' ? r1(s.mood * 0.7) : -s.mood,
    treasury: 0, happiness: 0, approval: 0, outcome: '', lastEnd: end };
}

export type EventResponse = { id: string; label: string; cost: number; actions: number; hint: string; disabled: boolean; unavailable: string };
export function eventResponses(c: Career, id: string): EventResponse[] {
  const e = activeEvents(c).find(x => x.id === id);
  if (!e || e.kind === 'positive' || e.response) return [];
  const base = Math.round(eventCost(c, e) * (e.emergency ? 0.7 : 1));
  const ext = e.kind === 'external';
  const higher = c.office?.id === 'mayor' ? 'the Governor' : c.office?.id === 'governor' ? 'the President' : '';
  const rel = relationship(c);
  const raw: Omit<EventResponse, 'disabled' | 'unavailable'>[] = [
    { id: 'fund', label: ext ? 'Emergency mitigation funding' : 'Emergency funding', cost: base, actions: 0, hint: 'Fastest recovery; approval up, mood pressure lifted.' },
    { id: 'deploy', label: c.office?.id === 'governor' ? 'Deploy state guard & agencies' : c.office?.id === 'president' ? 'Federal disaster declaration & deployment' : 'Deploy city crews & services', cost: Math.round(base * 0.5), actions: 1, hint: 'Solid response at half the cost; needs 15% energy.' },
    ...(higher && !e.petitioned ? [{ id: 'aid', label: `Petition ${higher} for aid`, cost: 0, actions: 1, hint: `Success chance ~${rel?.score ?? 0}% (relationship & party alignment). If approved, they cover the costs.` }] : []),
    { id: 'limited', label: 'Limited action', cost: Math.round(base * 0.2), actions: 0, hint: 'Cheap; recovery drags on and residents grumble.' },
    { id: 'ignore', label: 'Delay / ignore', cost: 0, actions: 0, hint: ext ? 'No spending. The event was not your fault, but leaving it unmanaged hurts.' : 'No spending; serious approval and mood damage.' },
  ];
  return raw.map(r => {
    let unavailable = '';
    if (c.report || c.newspaperPending || c.pendingEvent || c.eventEncounter) unavailable = 'Finish the turn report first.';
    else if (r.cost > treasuryFunds(c)) unavailable = `${usd(r.cost)} required; ${usd(treasuryFunds(c))} in the government treasury.`;
    else if (c.actions < r.actions * ACTION_COST) unavailable = 'Not enough energy this turn.';
    return { ...r, disabled: !!unavailable, unavailable };
  });
}

const update = (c: Career, id: string, fn: (e: GovEvent) => GovEvent) => withFinance(c, { ...financeOf(c), events: financeOf(c).events.map(e => e.id === id ? fn(e) : e) });

export function respondToEvent(c: Career, id: string, responseId: string): Result {
  if (!isExecutive(c)) return { ok: false, message: 'Only a sitting mayor, governor or president can respond.' };
  const e = activeEvents(c).find(x => x.id === id);
  if (!e) return { ok: false, message: 'This event is no longer active.' };
  if (e.response) return { ok: false, message: 'A response was already chosen.' };
  const r = eventResponses(c, id).find(x => x.id === responseId);
  if (!r || r.disabled) return { ok: false, message: r?.unavailable || 'That response is not available.' };
  const s = SEVERITY[e.severity];
  let n: Career = { ...c, actions: c.actions - r.actions * ACTION_COST };
  if (r.cost) {
    const paid = spendTreasury(n, r.cost, `event|${id}|${r.id}`, `${e.name}: ${r.label}`);
    if (!paid.ok) return paid;
    n = paid.career;
  }
  if (r.id === 'aid') {
    const rel = relationship(c);
    const won = rand(`${tenureKey(c)}|aid|${id}`) < (rel?.score ?? 0) / 100;
    if (!won) {
      n = update(n, id, x => ({ ...x, petitioned: true }));
      const msg = `${e.name}: your aid petition was turned down (relationship ${rel?.score ?? 0}/100). Choose another response.`;
      return { ok: true, career: { ...n, log: [msg, ...n.log].slice(0, 12) }, message: msg };
    }
  }
  const p = responsePlan(e, r.id);
  const msg = `${e.name}: ${r.id === 'aid' ? 'aid petition approved — higher government covers the response' : r.label}${r.cost ? ` · ${usd(r.cost)} from the treasury` : ''}.`;
  n = shiftApproval(n, r1(p.appr), msg);
  n = update(n, id, x => ({ ...x, response: r.id === 'aid' ? 'aid' : r.id, petitioned: x.petitioned || r.id === 'aid', pressure: r1(p.pressure), remaining: Math.min(6, p.remaining), treasury: x.treasury - r.cost, approval: r1(x.approval + p.appr) }));
  return { ok: true, career: { ...n, log: [msg, ...n.log].slice(0, 12) }, message: msg };
}

/** Expected effect of a response: approval change, new mood pressure and remaining quarters. */
export function responsePlan(e: GovEvent, rid: string): { appr: number; pressure: number; remaining: number } {
  const s = SEVERITY[e.severity];
  const plan: Record<string, { appr: number; pressure: number; remaining: number }> = {
    fund: { appr: s.approval, pressure: 0, remaining: Math.max(0, e.remaining - 1) },
    deploy: { appr: s.approval * 0.6, pressure: -s.mood * 0.3, remaining: e.remaining },
    aid: { appr: s.approval * 0.5, pressure: -s.mood * 0.2, remaining: Math.max(0, e.remaining - 1) },
    limited: { appr: -s.approval * 0.3, pressure: -s.mood * 0.6, remaining: e.remaining + 1 },
    ignore: { appr: -(e.kind === 'external' ? 0.6 : 1.2) * s.approval, pressure: -s.mood * (e.kind === 'external' ? 0.8 : 1.2), remaining: e.remaining + 1 },
  };
  const p = plan[rid] ?? plan['ignore']!;
  return { appr: r1(p.appr), pressure: r1(p.pressure), remaining: Math.min(6, p.remaining) };
}

/** Per-quarter pressure while an event stays unaddressed (matches eventsTurn). */
export function eventOutlook(c: Career, e: GovEvent) {
  const unaddressed = e.kind !== 'positive' && !e.response && e.severity !== 'low';
  return { treasury: unaddressed ? -Math.round(eventCost(c, e) * 0.3) : 0, approval: unaddressed ? r1(-(e.kind === 'external' ? 0.3 : 0.6) * SEVERITY[e.severity].approval) : 0, mood: e.pressure, needsResponse: e.kind !== 'positive' && !e.response && e.severity !== 'low' };
}
/** Events needing executive attention (an unanswered non-low crisis). */
export const eventsNeedingAttention = (c: Career) => activeEvents(c).filter(e => eventOutlook(c, e).needsResponse);
/** Events triggered by the most recently settled quarter. */
export const freshEvents = (c: Career) => { const end = financeOf(c).eventEnd; return end ? eventsOf(c).filter(e => e.id.startsWith(`${end}|`)) : []; };
export const KIND_LABEL: Record<Kind, string> = { manageable: 'Manageable', external: 'External Shock', positive: 'Positive Opportunity' };
export const RESPONSE_LABEL: Record<string, string> = { fund: 'Emergency funding', deploy: 'Deployed resources', aid: 'Higher-tier aid', limited: 'Limited action', ignore: 'Delayed / ignored', department: 'Department budgets' };

export const canDeclareEmergency = (c: Career, e: GovEvent) => isExecutive(c) && e.status === 'active' && e.severity === 'critical' && !e.emergency && e.kind !== 'positive';
/** Critical events only: emergency powers cut response costs by 30% and shorten recovery, but chill the economy. */
export function declareEmergency(c: Career, id: string): Result {
  const e = activeEvents(c).find(x => x.id === id);
  if (!e || !canDeclareEmergency(c, e)) return { ok: false, message: 'A State of Emergency requires an active Critical event.' };
  const f = financeOf(c);
  let n = withFinance(c, { ...f, economy: { ...f.economy, business: Math.max(0, f.economy.business - 4), employment: Math.max(0, f.economy.employment - 2) }, events: f.events.map(x => x.id === id ? { ...x, emergency: true, remaining: Math.max(1, x.remaining - 1) } : x) });
  const msg = `State of Emergency declared over the ${e.name.toLowerCase()}: emergency spending powers granted; business activity slows.`;
  n = { ...n, newsQueue: [...n.newsQueue, { h: `${n.character.name} declares a State of Emergency`, sub: c.office?.jurisdiction ?? '', body: msg, tag: 'government', subject: n.character.name }] };
  return { ok: true, career: { ...n, log: [msg, ...n.log].slice(0, 12) }, message: msg };
}

function outcomeOf(e: GovEvent) {
  if (e.kind === 'positive') return 'Windfall delivered';
  if (e.response === 'fund' || e.response === 'aid') return 'Recovered — well managed';
  if (e.response === 'deploy') return 'Recovered';
  if (e.response === 'limited') return 'Slow, partial recovery';
  if (e.kind === 'external' && e.response !== 'ignore') return 'Weathered';
  return 'Mismanaged — lasting damage';
}

/** Progress active events and roll a new one, once per settled quarter. */
export function eventsTurn(c: Career, start: string, end: string): { career: Career; notices: string[] } {
  if (!isExecutive(c) || c.treasury?.tenure !== tenureKey(c) || financeOf(c).eventEnd >= end) return { career: c, notices: [] };
  const notices: string[] = [];
  let n = c;
  for (const e of activeEvents(n)) {
    if (e.lastEnd >= end) continue;
    const s = SEVERITY[e.severity];
    let treasuryHit = 0, appr = 0;
    if (e.kind !== 'positive' && !e.response && e.severity !== 'low') {
      // Unaddressed: lost revenue/repairs and public frustration (milder when the root cause is external).
      treasuryHit = Math.min(treasuryFunds(n), Math.round(eventCost(n, e) * 0.3));
      appr = -(e.kind === 'external' ? 0.3 : 0.6) * s.approval;
    }
    if (treasuryHit) n = credit(n, -treasuryHit, `event|${e.id}|${end}|damage`, `${e.name}: ongoing damage`);
    if (appr) n = shiftApproval(n, r1(appr), `${e.name} still unaddressed.`);
    const remaining = e.remaining - 1;
    const mood = r1(e.pressure);
    n = update(n, e.id, x => ({ ...x, remaining: Math.max(0, remaining), lastEnd: end, treasury: x.treasury - treasuryHit, approval: r1(x.approval + appr), happiness: r1(x.happiness + mood) }));
    if (remaining <= 0) {
      const done = eventsOf(n).find(x => x.id === e.id)!;
      const outcome = outcomeOf(done);
      if (done.kind !== 'positive' && !done.response && done.severity === 'low') { n = update(n, e.id, x => ({ ...x, response: 'department' })); }
      n = update(n, e.id, x => ({ ...x, status: 'resolved', outcome: x.response === 'department' ? 'Handled by department budgets' : outcome, pressure: 0 }));
      notices.push(`${e.name} is over: ${eventsOf(n).find(x => x.id === e.id)!.outcome}.`);
    } else if (e.kind !== 'positive') notices.push(`${e.name} (${s.label}) continues · ${remaining} quarter${remaining === 1 ? '' : 's'} left${e.response ? '' : ' · awaiting your response'}.`);
  }
  const fresh = rollEvent(n, end);
  if (fresh) {
    let ev = fresh;
    if (ev.kind === 'positive') {
      const gain = Math.round(eventCost(n, ev) * 0.8), appr = r1(SEVERITY[ev.severity].approval * 0.6);
      n = credit(n, gain, `event|${ev.id}|windfall`, `${ev.name}: windfall revenue`);
      n = shiftApproval(n, appr, `${ev.name} lifts spirits.`);
      const f = financeOf(n);
      n = withFinance(n, { ...f, economy: { ...f.economy, business: Math.min(100, f.economy.business + 2), employment: Math.min(100, f.economy.employment + 1) } });
      ev = { ...ev, treasury: gain, approval: appr };
      notices.push(`🎉 ${ev.name} (${SEVERITY[ev.severity].label}): ${ev.detail} +${usd(gain)} to the treasury, approval +${appr}.`);
    } else {
      notices.push(`⚠️ ${ev.kind === 'external' ? 'External shock' : 'Crisis'} — ${ev.name} (${SEVERITY[ev.severity].label}): ${ev.detail} ${ev.severity === 'low' ? 'Departments can absorb it.' : 'Choose a response in Treasury → Events.'}`);
    }
    if (ev.severity === 'high' || ev.severity === 'critical') n = { ...n, newsQueue: [...n.newsQueue, { h: `${ev.name} hits ${n.office?.jurisdiction ?? ''}`, sub: `${SEVERITY[ev.severity].label} ${ev.kind === 'positive' ? 'opportunity' : 'emergency'}`, body: ev.detail, tag: 'government', subject: n.character.name }] };
    n = withFinance(n, { ...financeOf(n), events: [ev, ...financeOf(n).events].slice(0, 30) });
  }
  n = withFinance(n, { ...financeOf(n), eventEnd: end });
  return { career: n, notices };
}
