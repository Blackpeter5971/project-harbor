/** Player bills need at least 30% of their caucus (own-party lawmakers in their chamber) as co-sponsors. */
export const CAUCUS_MIN = 0.3;
export function caucusSupport(L: Legislature, bill: LegislativeBill, mine: string | null, seat: string | null): { share: number; sponsors: number; caucus: number } {
  const chamber = seat ?? L.seating[0]!.chamber;
  const own = (p: string) => !mine || p === mine;
  const keys = L.lawmakers.filter(l => l.chamber === chamber && own(l.party));
  const blocs = L.backbench.filter(b => b.chamber === chamber && own(b.party));
  // Rank-and-file co-sponsor in proportion to discipline when the bill sits within reach of the bloc's ideology; key members follow their relationship.
  const blocSponsors = blocs.reduce((s, b) => s + (Math.abs(b.ideology - bill.ideology) <= 60 ? Math.round(b.seats * b.discipline / 100 * (1 - Math.abs(b.ideology - bill.ideology) / 120)) : 0), 0);
  const keySponsors = keys.filter(l => l.relationship >= 10 || (l.relationship >= -15 && Math.abs(l.ideology - bill.ideology) <= 60)).length;
  const caucus = keys.length + blocs.reduce((s, b) => s + b.seats, 0);
  const sponsors = blocSponsors + keySponsors;
  return { share: caucus ? sponsors / caucus : 1, sponsors, caucus };
}

/** Resolves the three quarterly legislative cards. Pure, browser-safe and revision-guarded so stale clicks cannot replay effects. */
import type { Career } from './career';
import { addQuarters } from './docket-schema';
import { ensureLegislativeDocket, playerChamber, playerParty, votingChamber } from './legislation';
import { COMMITTEE_ACTIONS, COST_REF, projectCommittee, rollCall, type CommitteeAction } from './committees';
import { CHAMBER_NAMES, floorVoteChoices, seeded, type FloorVoteChoice, type Lawmaker, type Legislature, type LegislativeBill } from './legislature-schema';
import { applyLegislativeFallout, partyLineFallout } from './approval';
import { lobbyOdds } from './legislature-actions';
import type { Result } from './support';

/** `vote` is the player's own roll-call vote on a floor_vote; omitted, their seat votes with the rank-and-file. */
export type LegislativeRequest = { docketId: string; revision: number; slot: 'priority' | 'committee' | 'whip'; choice: string; vote?: FloorVoteChoice };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

export const LEGISLATIVE_CHOICE_LABEL: Record<string, string> = {
  introduce: 'Introduce Bill', floor_vote: 'Go to Floor Vote', await: 'Awaiting committee',
  ...Object.fromEntries(Object.entries(COMMITTEE_ACTIONS).map(([k, v]) => [k, v.label])),
  whip: 'Whip Vote', compromise: 'Offer Compromise',
};

export function resolveLegislativeDocket(career: Career, request: LegislativeRequest): Result {
  const c = ensureLegislativeDocket(career), L = c.legislature, d = L?.docket;
  if (!L || !d) return { ok: false, message: 'There is no legislative docket for your office.' };
  if (d.id !== request.docketId || d.revision !== request.revision) return { ok: false, message: 'The docket changed. Review the updated cards.' };
  const idx = (['priority', 'committee', 'whip'] as const).indexOf(request.slot), item = d.items[idx];
  if (!item || item.resolved) return { ok: false, message: 'That card is already decided this quarter.' };
  if (!item.actions.includes(request.choice as never) || request.choice === 'await') return { ok: false, message: 'That action is not available on this card.' };
  const bill = item.billId ? L.bills.find(b => b.id === item.billId) ?? null : null;
  const mine = playerParty(c), q = d.quarter;
  if (request.vote !== undefined && !(floorVoteChoices as readonly string[]).includes(request.vote)) return { ok: false, message: 'Choose Yes, No or Abstain.' };
  let bills = L.bills, lawmakers = L.lawmakers, oversight = L.oversight ?? 0, reputation = c.reputation, msg: string;
  /** Approval/loyalty consequences applied after the docket itself is saved. */
  let after = (x: Career) => x;
  const setBill = (b: LegislativeBill) => { bills = bills.map(x => x.id === b.id ? b : x); };
  const setLm = (l: Lawmaker) => { lawmakers = lawmakers.map(x => x.id === l.id ? l : x); };

  switch (request.choice) {
    case 'introduce': {
      if (!bill) return { ok: false, message: 'No bill to introduce.' };
      { const cs = caucusSupport(L, bill, mine, playerChamber(c, L)); if (cs.share < CAUCUS_MIN) return { ok: false, message: `You need at least ${Math.round(CAUCUS_MIN * 100)}% caucus co-sponsors to introduce this bill (you have ${Math.round(cs.share * 100)}%). Build relationships with colleagues first.` }; }
      setBill({ ...bill, status: 'in_committee', committeeAssigned: projectCommittee(L, bill, mine).committee.id });
      msg = `You introduced the ${bill.title}; it was referred to the ${projectCommittee(L, bill, mine).committee.name} Committee.`;
      break;
    }
    case 'floor_vote': {
      if (!bill) return { ok: false, message: 'No bill on the floor.' };
      const chamber = votingChamber(L, bill), seat = playerChamber(c, L);
      const rc = rollCall(L, bill, chamber, mine, seat, seat === chamber ? request.vote ?? null : null);
      const bicameral = L.seating.length > 1, final = !bicameral || bill.status === 'passed_house' || bill.status === 'passed_senate';
      const status: LegislativeBill['status'] = !rc.passes ? 'failed' : !final ? (chamber === 'senate' ? 'passed_senate' : 'passed_house') : bicameral ? 'awaiting_signature' : 'enacted';
      const record = { chamber, quarter: q, yes: rc.yes, no: rc.no, abstain: rc.abstain, passed: rc.passes, playerVote: rc.player, rebel: rc.rebel };
      const next: LegislativeBill = { ...bill, status, floorQuarter: status === 'passed_house' || status === 'passed_senate' ? addQuarters(q, 1) : bill.floorQuarter, rollCalls: [...bill.rollCalls, record] };
      setBill(next);
      const other = chamber === 'senate' ? 'House' : 'Senate';
      const yours = rc.player ? ` You voted ${rc.player === 'abstain' ? 'present' : rc.player.toUpperCase()}${rc.rebel ? ', breaking with your party leadership' : ''}.` : '';
      msg = `${CHAMBER_NAMES[chamber]} roll call on the ${bill.title}: ${rc.yes}–${rc.no}${rc.abstain ? `, ${rc.abstain} abstaining` : ''}. ${!rc.passes ? 'The bill failed.' : status === 'enacted' ? 'It passed into law.' : status === 'awaiting_signature' ? 'It cleared both chambers and goes to the President.' : `It passed and goes to the ${other} next quarter.`}${yours}`;
      if (bill.party === null) reputation = clamp(reputation + (rc.passes ? (final ? 4 : 2) : -2), 0, 100);
      after = x => {
        let y = rc.player && rc.leader ? partyLineFallout(x, rc.player, rc.leader.vote, bill.title) : x;
        if (status === 'enacted') y = applyLegislativeFallout(y, next, COST_REF[chamber], bill.party === null ? 'sponsor' : rc.player ?? 'abstain', `${bill.title}: enacted.`);
        return y;
      };
      break;
    }
    case 'favorable': case 'amend': case 'hearing': case 'table': {
      const action = request.choice as CommitteeAction;
      if (action !== 'hearing' && !bill) return { ok: false, message: 'No bill is before the committee.' };
      if (action === 'favorable') {
        const v = projectCommittee(L, bill!, mine);
        if (v.passes) setBill({ ...bill!, status: 'floor_debate', floorQuarter: addQuarters(q, 1) });
        msg = v.passes ? `The ${v.committee.name} Committee reported the ${bill!.title} favorably ${v.yes}–${v.no}; floor vote next quarter.` : `The ${v.committee.name} Committee deadlocked ${v.yes}–${v.no}; the ${bill!.title} stays in committee.`;
      } else if (action === 'amend') {
        const b = bill!, ideology = Math.round(b.ideology * 0.6), cost = Math.round(b.cost * 0.85);
        setBill({ ...b, ideology, cost, amendments: b.amendments + 1 });
        for (const l of lawmakers.filter(x => x.role === 'swing_member')) setLm({ ...l, relationship: clamp(l.relationship + 5, -100, 100) });
        msg = `Amendments moved the ${b.title} toward the center and cut its cost to $${cost}M. Swing members took note (+5).`;
      } else if (action === 'hearing') {
        oversight = clamp(oversight + 10, 0, 100); reputation = clamp(reputation + 2, 0, 100);
        const chair = lawmakers.find(l => l.id === item.lawmakerIds[0]);
        if (chair && chair.party !== mine) setLm({ ...chair, relationship: clamp(chair.relationship - 5, -100, 100) });
        msg = `Your hearing grilled government officials on the record (+10 oversight, +2 reputation)${chair && chair.party !== mine ? `; ${chair.name} resents it` : ''}.`;
      } else {
        const b = bill!, v = projectCommittee(L, b, mine), sponsor = lawmakers.find(l => l.name === b.sponsor);
        if (b.party === null) return { ok: false, message: 'You cannot table your own bill.' };
        setBill(v.passes ? { ...b, stalledUntil: addQuarters(q, 2) } : { ...b, status: 'failed' });
        if (sponsor) setLm({ ...sponsor, relationship: clamp(sponsor.relationship - 10, -100, 100) });
        msg = v.passes ? `You stalled the ${b.title} for two quarters; it still has the votes to return.` : `You tabled the ${b.title} — it is dead for this session.`;
      }
      break;
    }
    case 'whip': case 'compromise': {
      const l = lawmakers.find(x => x.id === item.lawmakerIds[0]);
      if (!l) return { ok: false, message: 'No lawmaker to whip.' };
      if (request.choice === 'whip') {
        const win = seeded(`${d.id}|whip|${l.id}`) < lobbyOdds(c, l, 'whip');
        setLm(win ? { ...l, loyalty: clamp(l.loyalty + 10, 0, 100), relationship: clamp(l.relationship + 10, -100, 100) } : { ...l, relationship: clamp(l.relationship - 5, -100, 100) });
        msg = win ? `${l.name} committed to your side (+10 relationship, +10 loyalty).` : `${l.name} would not commit and resents the pressure (−5).`;
      } else {
        if (bill && bill.party === null) setBill({ ...bill, ideology: Math.round(bill.ideology + (l.ideology - bill.ideology) * 0.3) });
        setLm({ ...l, relationship: clamp(l.relationship + 15, -100, 100) });
        reputation = clamp(reputation - 1, 0, 100);
        msg = `You rewrote part of ${bill?.title ?? 'your agenda'} to suit ${l.name} (+15 relationship, −1 reputation).`;
      }
      break;
    }
    default: return { ok: false, message: 'Unknown action.' };
  }
  const items = d.items.map((it, i) => i === idx ? { ...it, resolved: true, choice: request.choice, outcome: msg } : it) as NonNullable<Legislature['docket']>['items'];
  const legislature: Legislature = { ...L, bills, lawmakers, oversight, docket: { ...d, revision: d.revision + 1, items } };
  return { ok: true, career: after({ ...c, reputation, legislature, log: [msg, ...c.log].slice(0, 60) }), message: msg };
}
