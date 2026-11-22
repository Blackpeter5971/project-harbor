import type { Career } from './career';
import { groups, groupRel, rand } from './campaign';
import { shiftLoyalty, type Deltas } from './support-groups';

/* Phase 5 — Approval & public opinion. Persistent, cause-tracked approval:
   overall, party and independent support, plus per voter-group meters.
   Every change is recorded with its reason so the UI can always explain a shift. */

const clamp = (n: number, lo = 5, hi = 95) => Math.round(Math.max(lo, Math.min(hi, n)) * 10) / 10;

export type ApprovalState = NonNullable<Career['approval']>;
export type ApprovalChange = ApprovalState['history'][number];

/** Initial standing when a player first takes office: derived from reputation and margin, seeded per group. */
export function initApproval(c: Career): ApprovalState {
  const o = c.office;
  const base = clamp(38 + c.reputation * 0.3 + (o?.margin ?? 0) * 0.6);
  const gs: Record<string, number> = {};
  for (const g of groups) {
    const noise = (rand(`${c.character.name}|${g.id}|approval`) - 0.5) * 10;
    gs[g.id] = clamp(base + (groupRel(c, g.id) - 20) * 0.5 + noise);
  }
  const partyBias = o?.party === 'Independent' ? 0 : 8;
  return {
    overall: base,
    party: o?.party === 'Independent' ? 0 : clamp(base + partyBias),
    independent: clamp(base - 2),
    groups: gs,
    history: [{ date: c.date, change: 0, reason: `Took office as ${o?.title ?? 'officeholder'} with ${Math.round(base)}% approval.` }],
    actionTurn: '',
    actionUses: {},
    driftTurn: '',
  };
}

/** Lazily attach the approval state to old saves or freshly elected players. */
export function ensureApproval(c: Career): Career {
  if (c.approval || !c.office) return c;
  return { ...c, approval: initApproval(c) };
}

export type GroupDelta = { group: string; delta: number };

/** Approval scale: routine actions move opinion by fractions, major events by a few points. */
export const APPROVAL_BOUNDS = { routine: 1, major: 5 } as const;
export type ApprovalTier = keyof typeof APPROVAL_BOUNDS;
const r1 = (n: number) => Math.round(n * 10) / 10;
const bound = (n: number, lim: number) => Math.max(-lim, Math.min(lim, n));

/** Apply an approval shift with a mandatory visible cause; groups can move differently.
    No single shift may exceed the major-event bound (±5). */
export function shiftApproval(c: Career, delta: number, reason: string, groupDeltas: GroupDelta[] = []): Career {
  const a = ensureApproval(c).approval;
  if (!a) return c;
  delta = bound(delta, APPROVAL_BOUNDS.major);
  const groups2 = { ...a.groups };
  for (const g of groups) {
    const specific = groupDeltas.find(d => d.group === g.id)?.delta;
    groups2[g.id] = clamp((groups2[g.id] ?? a.overall) + bound(specific ?? delta, APPROVAL_BOUNDS.major + 3));
  }
  const next: ApprovalState = {
    ...a,
    overall: clamp(a.overall + delta),
    party: a.party === 0 && c.office?.party === 'Independent' ? 0 : clamp(a.party + delta),
    independent: clamp(a.independent + delta),
    groups: groups2,
    history: [{ date: c.date, change: r1(delta), reason }, ...a.history].slice(0, 20),
  };
  return { ...c, approval: next };
}

/** Times an action already moved approval this turn (resets when the turn date changes). */
export function actionUses(c: Career, key: string): number {
  const a = c.approval;
  return a && a.actionTurn === c.date ? a.actionUses[key] ?? 0 : 0;
}

/** Scaled approval for a gameplay action: bounded by tier, positive gains dampened by 1/(1+uses)
    within the same turn, and failures are never rewarded (<= 0). */
export function actionApprovalDelta(c: Career, key: string, raw: number, tier: ApprovalTier, failed = false): number {
  const d = bound(raw, APPROVAL_BOUNDS[tier]);
  if (failed) return Math.min(0, d);
  return d > 0 ? Math.floor((d / (1 + actionUses(c, key))) * 10) / 10 : d;
}

/** Apply an action's approval shift and record the use for repetition dampening. */
export function applyActionApproval(c: Career, key: string, raw: number, tier: ApprovalTier, reason: string, failed = false, groupDeltas: GroupDelta[] = []): Career {
  const ready = ensureApproval(c);
  const delta = actionApprovalDelta(ready, key, raw, tier, failed);
  const n = shiftApproval(ready, delta, reason, groupDeltas.map(g => ({ ...g, delta: failed ? Math.min(0, g.delta) : g.delta })));
  const a = n.approval;
  if (!a) return n;
  const uses = a.actionTurn === c.date ? a.actionUses : {};
  return { ...n, approval: { ...a, actionTurn: c.date, actionUses: { ...uses, [key]: (uses[key] ?? 0) + 1 } } };
}

/** True only while the player holds an unexpired office; duty penalties and officeholder bonuses require it. */
export const holdsOffice = (c: Career) => !!c.office && (!c.office.termEnd || c.date < c.office.termEnd);

/** Office-duty approval shift (crises, neglected emergencies, legislative results). Non-officeholders are exempt. */
export function dutyApproval(c: Career, delta: number, reason: string, groupDeltas: GroupDelta[] = []): Career {
  return holdsOffice(c) ? shiftApproval(c, delta, reason, groupDeltas) : c;
}

/** Office-adjusted resting level for public approval (local offices sit slightly warmer than federal ones). */
export function approvalBaseline(c: Career): number {
  const id = c.office?.id ?? '';
  return ['council', 'mayor'].includes(id) ? 50 : ['stateLeg', 'governor'].includes(id) ? 48 : 45;
}
/** Fraction of the gap to baseline closed per quiet quarter, capped per turn so regression stays gradual. */
export const DRIFT_RATE = 0.15;
export const DRIFT_CAP = 1.5;

/** Did the officeholder take a significant governing action during the turn starting at `start`? */
export function governedThisTurn(c: Career, start: string): boolean {
  const a = c.approval;
  return c.governmentDecisions.some(d => d.date >= start) || (!!a && a.actionTurn >= start && Object.keys(a.actionUses).length > 0);
}

/** Per-turn drift for officeholders only: economy/scandal effects, plus a soft pull toward the
    office baseline when no significant governing action was taken. Party support drifts on its own track. */
/** Seeded 2–4 point quarterly approval decay for officeholders. */
export const incumbencyFatigue = (c: Career, start: string) => 2 + Math.floor(rand(`${c.character.name}|${start}|fatigue`) * 3);
export function approvalDrift(c: Career, start: string): Career {
  if (!holdsOffice(c) || !c.approval) return c;
  // Idempotency: drift for a turn start is applied at most once, so re-running or
  // reloading the same turn never double-applies drift, economy or scandal effects.
  if (c.approval.driftTurn === start) return c;
  c = { ...c, approval: { ...c.approval, driftTurn: start } };
  const seeded = rand(`${c.character.name}|${start}|economy`);
  const economy = seeded < 0.35 ? -1 : seeded > 0.7 ? 1 : 0;
  const scandal = c.campaign?.allegation && c.campaign.allegation.target === c.character.name && c.campaign.allegation.status === 'proven';
  let n = c;
  if (!governedThisTurn(c, start)) {
    const base = approvalBaseline(c), gap = base - n.approval!.overall;
    const step = r1(bound(gap * DRIFT_RATE, DRIFT_CAP));
    const party = n.approval!.party;
    if (step !== 0) n = shiftApproval(n, step, `A quiet quarter in office: opinion settled toward ${base}%.`);
    // Party support regresses on its own track rather than mirroring overall approval.
    if (c.office?.party !== 'Independent') n = { ...n, approval: { ...n.approval!, party: clamp(party + r1(bound((base + 5 - party) * DRIFT_RATE, DRIFT_CAP))) } };
  }
  // Incumbency fatigue: every quarter in office wears 2–4 points off overall approval.
  const fatigue = incumbencyFatigue(c, start);
  n = shiftApproval(n, -fatigue, `Incumbency fatigue: voters grew restless (−${fatigue}%).`);
  if (economy !== 0) {
    n = shiftApproval(n, economy, economy > 0 ? 'A strengthening economy lifted public mood.' : 'A soft economy weighed on public mood.',
      [{ group: 'business', delta: economy * 1.5 }, { group: 'working', delta: economy * 1.5 }, { group: 'labor', delta: economy }]);
  }
  if (scandal) {
    n = shiftApproval(n, -3, 'A proven scandal damaged your standing.', [{ group: 'establishment', delta: -4 }, { group: 'religious', delta: -4 }]);
  }
  return n;
}

/** What the Government tab renders: overall, party/independent, and per-group meters with latest causes. */
export function approvalView(c: Career) {
  const a = c.approval;
  if (!a) return null;
  return {
    overall: a.overall,
    party: c.office?.party === 'Independent' ? null : a.party,
    independent: a.independent,
    groups: groups.map(g => ({ id: g.id, name: g.name, value: a.groups[g.id] ?? a.overall })),
    history: a.history.slice(0, 6),
  };
}

/* ---------- Legislative fallout: enacted laws move voter blocs; breaking with party leadership costs party loyalty ---------- */
type ApprovalGroup = 'working' | 'suburban' | 'business' | 'labor' | 'youth' | 'environment' | 'seniors' | 'religious' | 'establishment';
type FalloutTable = { approval: Partial<Record<ApprovalGroup, number>>; loyalty: Deltas };
/** Progressive (left) and conservative (right) versions of each bill category. Centrist text uses half the matching side. */
export const LEGISLATIVE_FALLOUT: Record<string, { left: FalloutTable; right: FalloutTable }> = {
  health: { left: { approval: { working: 4, seniors: 4, labor: 3, business: -3, establishment: -2 }, loyalty: { labor: 3, veterans: 2, business: -3 } },
    right: { approval: { business: 3, establishment: 2, seniors: -3, working: -2 }, loyalty: { business: 3, labor: -2 } } },
  tax: { left: { approval: { working: 4, labor: 3, business: -4, establishment: -3 }, loyalty: { labor: 3, business: -4 } },
    right: { approval: { business: 4, suburban: 3, establishment: 2, labor: -3, working: -1 }, loyalty: { business: 4, labor: -3 } } },
  defense: { left: { approval: { seniors: 2, working: 2, youth: -2 }, loyalty: { veterans: 4, youth: -1 } },
    right: { approval: { religious: 3, seniors: 2, establishment: 2, youth: -3 }, loyalty: { veterans: 4, rural: 2, youth: -3 } } },
  education: { left: { approval: { youth: 4, labor: 3, suburban: 2, establishment: -2 }, loyalty: { youth: 4, labor: 2, business: -1 } },
    right: { approval: { religious: 4, suburban: 2, labor: -3, youth: -2 }, loyalty: { religious: 3, youth: -2 } } },
  justice: { left: { approval: { youth: 4, working: 2, seniors: -2, religious: -2 }, loyalty: { youth: 3, religious: -2 } },
    right: { approval: { seniors: 3, religious: 3, suburban: 2, youth: -3 }, loyalty: { veterans: 2, religious: 2, youth: -3 } } },
  infrastructure: { left: { approval: { working: 3, labor: 3, environment: 2, establishment: -2 }, loyalty: { labor: 3, rural: 2, business: -1 } },
    right: { approval: { business: 3, working: 2, environment: -2 }, loyalty: { business: 2, rural: 3 } } },
};
export type FalloutBill = { title: string; category: string; ideology: number; cost: number };
/** Major (expensive) laws move opinion more: 0.6× for small bills up to 1.4× at or above the chamber's reference cost. */
export const falloutScale = (cost: number, reference: number) => Math.round((0.6 + Math.min(0.8, cost / Math.max(1, reference) * 0.8)) * 10) / 10;
/** Bloc changes for an enacted bill before the player's involvement factor is applied. */
export function legislativeFallout(bill: FalloutBill, reference: number): FalloutTable {
  const t = LEGISLATIVE_FALLOUT[bill.category];
  if (!t) return { approval: {}, loyalty: {} };
  const side = bill.ideology > 0 ? t.right : t.left, k = falloutScale(bill.cost, reference) * (Math.abs(bill.ideology) <= 15 ? 0.5 : 1);
  const scale = <T extends Record<string, number | undefined>>(o: T) => Object.fromEntries(Object.entries(o).map(([g, v]) => [g, r1((v ?? 0) * k)])) as T;
  return { approval: scale(side.approval), loyalty: scale(side.loyalty) };
}
/** How much an enacted law sticks to the player: sponsor or signer 1, yes vote 0.6, no vote −0.4 (opponents earn the reverse), veto −0.5. */
export const INVOLVEMENT = { sponsor: 1, sign: 1, yes: 0.6, no: -0.4, veto: -0.5, abstain: 0 } as const;
export type Involvement = keyof typeof INVOLVEMENT;
/** Apply an enacted (or vetoed) law's bloc fallout to approval and support-group loyalty. Officeholders only. */
export function applyLegislativeFallout(c: Career, bill: FalloutBill, reference: number, involvement: Involvement, reason: string): Career {
  const f = INVOLVEMENT[involvement];
  if (!f || !holdsOffice(c)) return c;
  const t = legislativeFallout(bill, reference);
  const groupDeltas = Object.entries(t.approval).map(([group, d]) => ({ group, delta: r1((d ?? 0) * f) }));
  const net = groupDeltas.reduce((s, g) => s + g.delta, 0) / Math.max(1, groupDeltas.length);
  const moved = shiftApproval(c, r1(bound(net, APPROVAL_BOUNDS.routine)), reason, groupDeltas);
  return shiftLoyalty(moved, Object.fromEntries(Object.entries(t.loyalty).map(([g, d]) => [g, r1((d ?? 0) * f)])), reason);
}

/** Breaking with your party leader on a floor vote: −5 party standing, −2 party support, +2 independent support. Abstaining costs half. */
export const REBEL_PARTY_STANDING = -5, REBEL_PARTY_SUPPORT = -2, REBEL_INDEPENDENT = 2;
export function partyLineFallout(c: Career, vote: 'yes' | 'no' | 'abstain', leaderVote: 'yes' | 'no', title: string): Career {
  if (vote === leaderVote || c.office?.party === 'Independent' || !holdsOffice(c)) return c;
  const k = vote === 'abstain' ? 0.5 : 1, reason = `${title}: you ${vote === 'abstain' ? 'abstained against' : 'broke with'} your party leadership.`;
  const ready = ensureApproval(c), a = ready.approval;
  const n = a ? { ...ready, approval: { ...a, party: clamp(a.party + REBEL_PARTY_SUPPORT * k), independent: clamp(a.independent + REBEL_INDEPENDENT * k), history: [{ date: c.date, change: 0, reason: `${reason} Party support ${REBEL_PARTY_SUPPORT * k}, independents +${REBEL_INDEPENDENT * k}.` }, ...a.history].slice(0, 20) } } : ready;
  return shiftLoyalty(n, {}, reason, REBEL_PARTY_STANDING * k);
}
/** Plain-language preview of a law's bloc fallout for a given involvement, e.g. "Working Class +4, Business −3". */
export function describeLegislativeFallout(bill: FalloutBill, reference: number, involvement: Involvement): string {
  const f = INVOLVEMENT[involvement], t = legislativeFallout(bill, reference);
  if (!f) return 'No change in voter standing.';
  const parts = Object.entries(t.approval).map(([g, d]) => [groups.find(x => x.id === g)?.name ?? g, r1((d ?? 0) * f)] as const).filter(([, d]) => d !== 0).sort((a, b) => b[1] - a[1]);
  return parts.map(([name, d]) => `${name} ${d > 0 ? '+' : '−'}${Math.abs(d)}`).join(', ') || 'No change in voter standing.';
}
