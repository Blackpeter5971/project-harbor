import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import type { Result } from './support';
import { impeachmentSchema, type Impeachment, type ImpeachmentVote, type UnrestChoice } from './impeachment-schema';
import { executiveOffice, docketQuarter, docketTenure, addQuarters } from './docket-schema';
import { shiftApproval } from './approval';
import { rand } from './campaign';
import { removeFromOffice } from './court';
import { registerScandal } from './scandals';
import { CHAMBER_SEATS } from './legislature-schema';

/**
 * Public unrest and impeachment for executives (mayor, governor, president). Pure and browser-safe.
 * impeachmentTurn runs once per quarter (saved watermark) after approval settles; player responses are
 * Results guarded by the saved quarter so reloads cannot replay effects.
 */
export const UNREST_THRESHOLD = 30;
export const UNREST_CALM = 38;
export const IMPEACH_LOW = 20;
export const IMPEACH_SCANDAL = 25;
export const ACQUITTAL_REPUTATION = 15;
export const DEFENSE_COST = { president: 250_000, governor: 60_000, mayor: 15_000 } as Record<string, number>;

const UNREST_TITLE: Record<string, string> = {
  mayor: 'Citywide Municipal Strike & Civic Protests',
  governor: 'Statewide Civil Disruption & Capital Demonstrations',
  president: 'Mass Nationwide Street Protests & National Gridlock',
};
const UNREST_DRAIN: Record<string, number> = { mayor: 4_000_000, governor: 40_000_000, president: 2_000_000_000 };
const SUCCESSOR: Record<string, string> = { mayor: 'Deputy Mayor', governor: 'Lt. Governor', president: 'Vice President' };
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export const impeachmentOf = (c: Career): Impeachment => impeachmentSchema.parse(c.impeachment ?? {});
const approvalOf = (c: Career) => c.approval?.overall ?? 50;
export const majorScandal = (c: Career) => c.scandals.some(s => s.severity === 'Severe' && s.status !== 'cleared' && s.phase !== 'Managed');

/** Procedure per office: mayors face one council vote; governors and presidents face a house vote then a 2/3 senate trial. */
export function procedure(officeId: string) {
  if (officeId === 'mayor') return { house: { label: 'City Council no-confidence & recall vote', chamber: 'City Council', seats: CHAMBER_SEATS.council }, senate: null };
  if (officeId === 'governor') return { house: { label: 'State House articles of impeachment', chamber: 'State House', seats: CHAMBER_SEATS.stateLeg }, senate: { label: 'State Senate impeachment trial', chamber: 'State Senate', seats: 40 } };
  return { house: { label: 'U.S. House articles of impeachment', chamber: 'U.S. House', seats: CHAMBER_SEATS.house }, senate: { label: 'U.S. Senate impeachment trial', chamber: 'U.S. Senate', seats: CHAMBER_SEATS.senate } };
}

/** Opposition share of seats in the relevant chamber: saved legislature seating when present, else 50%. */
function oppositionShare(c: Career, chamber: string) {
  const id = chamber.includes('Council') ? 'council' : chamber.startsWith('State') ? 'stateLeg' : chamber.includes('Senate') ? 'senate' : 'house';
  const seat = c.legislature?.seating.find(s => s.chamber === id);
  const party = c.office?.party;
  if (!seat) return { own: 0.45, opp: 0.5, ind: 0.05 };
  const own = party === 'Republican' || party === 'Democrat' ? seat.composition[party] : 0;
  const ind = seat.composition.Independent - (party === 'Independent' ? 0 : 0);
  return { own: own / seat.seats, opp: (seat.seats - own - ind) / seat.seats, ind: ind / seat.seats };
}

/** Deterministic vote: opposition votes YES; own party defects as approval sinks; defense lobbying holds swing votes. */
export function impeachmentVote(c: Career, p: NonNullable<Impeachment['proceeding']>, which: 'house' | 'senate', date: string): ImpeachmentVote {
  const proc = procedure(p.office), body = which === 'house' ? proc.house : proc.senate!;
  const a = approvalOf(c), share = oppositionShare(c, body.chamber), scandal = majorScandal(c) ? 0.15 : 0;
  const partyStanding = c.approval?.party ?? a;
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const defense = p.defense * 0.06;
  const oppYes = clamp(0.9 + scandal - defense * 0.5);
  const ownYes = clamp((IMPEACH_SCANDAL + 5 - a) / 40 + scandal + (40 - partyStanding) / 200 - defense);
  const indYes = clamp((40 - a) / 30 + scandal - defense);
  const noise = 1 + (rand(`${p.id}|${which}|vote`) - 0.5) * 0.08;
  const seats = body.seats;
  const yes = Math.max(0, Math.min(seats, Math.round(seats * (share.opp * oppYes + share.own * ownYes + share.ind * indYes) * noise)));
  const needed = which === 'senate' ? Math.ceil(seats * 2 / 3) : Math.floor(seats / 2) + 1;
  return { label: body.label, chamber: body.chamber, seats, yes, no: seats - yes, needed, passed: yes >= needed, date };
}

/** 0–100 danger gauge shown before charges are brought. */
export function impeachmentRisk(c: Career): { risk: number; level: 'Low' | 'Elevated' | 'High' | 'Critical'; reasons: string[] } {
  const s = impeachmentOf(c), a = approvalOf(c), reasons: string[] = [];
  if (s.proceeding) return { risk: 100, level: 'Critical', reasons: ['Impeachment proceedings are under way.'] };
  let risk = Math.max(0, (45 - a) * 2.2);
  if (a < IMPEACH_LOW) { risk += 15 + s.lowQuarters * 20; reasons.push(`Approval below ${IMPEACH_LOW}% for ${s.lowQuarters} quarter(s); 2 in a row brings charges.`); }
  else if (a < 35) reasons.push(`Approval ${a}% is in dangerous territory.`);
  if (majorScandal(c)) { risk += 25; reasons.push(`Major scandal active: approval under ${IMPEACH_SCANDAL}% brings charges.`); }
  if ((c.treasury?.finance?.mood?.unrestQuarters ?? 0) >= 2) { risk += 20; reasons.push('Extreme citizen unrest has persisted for two or more quarters.'); }
  if (s.unrest) { risk += 10; reasons.push(`${s.unrest.title} is ongoing.`); }
  risk = Math.round(Math.max(0, Math.min(99, risk)));
  return { risk, level: risk >= 75 ? 'Critical' : risk >= 50 ? 'High' : risk >= 25 ? 'Elevated' : 'Low', reasons };
}

const note = (s: Impeachment, date: string, text: string): Impeachment => ({ ...s, history: [{ date, text }, ...s.history].slice(0, 20) });
const story = (c: Career, h: string, body: string) => ({ h, sub: `${c.office?.title ?? ''} · ${c.office?.jurisdiction ?? ''}`, body, tag: 'government' as const, subject: c.character.name, priority: 1 });

/** Once per quarter, after approval drift. Returns notices for the turn report. */
export function impeachmentTurn(c: Career, start: string): { career: Career; notices: string[] } {
  if (!executiveOffice(c) || !c.office) return { career: c, notices: [] };
  const tenure = docketTenure(c), quarter = docketQuarter(start);
  let s = impeachmentOf(c);
  if (s.tenure !== tenure) s = { ...impeachmentSchema.parse({}), tenure, barred: s.barred, acquittals: s.acquittals, history: s.history };
  if (s.lastQuarter === quarter) return { career: c, notices: [] };
  s = { ...s, lastQuarter: quarter };
  const officeId = c.office.id, notices: string[] = [];
  let n: Career = c;
  const a = approvalOf(n);
  s = { ...s, lowQuarters: a < IMPEACH_LOW ? s.lowQuarters + 1 : 0 };

  // Unrest: outbreak, ongoing drain, or calm.
  if (s.unrest) {
    if (a >= UNREST_CALM) { notices.push(`${s.unrest.title} subsided as approval recovered.`); s = note({ ...s, unrest: null }, start, `${s.unrest.title} ended.`); }
    else {
      const drain = Math.min(n.treasury?.balance ?? 0, UNREST_DRAIN[officeId] ?? 0);
      if (n.treasury && drain > 0) n = { ...n, treasury: { ...n.treasury, balance: n.treasury.balance - drain, transactions: [...n.treasury.transactions, { key: `${n.treasury.tenure}|expense|unrest|${quarter}`, tenure: n.treasury.tenure, date: start, label: 'Economic disruption from protests', amount: -drain }] } };
      n = shiftApproval(n, -1.5, `Media scrutiny of the ${s.unrest.title.toLowerCase()}`);
      s = { ...s, unrest: { ...s.unrest, quarters: s.unrest.quarters + 1 } };
      notices.push(`UNREST: ${s.unrest!.title} cost ${usd(drain)} in economic disruption and 1.5 approval points.`);
    }
  } else if (a < UNREST_THRESHOLD) {
    const title = UNREST_TITLE[officeId] ?? UNREST_TITLE['mayor']!;
    s = note({ ...s, unrest: { id: `${tenure}|unrest|${quarter}`, title, since: start, quarters: 0, respondedQuarter: '' } }, start, `${title} broke out at ${a}% approval.`);
    n = { ...n, newsQueue: [...n.newsQueue, story(n, `${title} erupts`, `With approval at ${a}%, crowds filled the streets demanding change from ${n.character.name}. Economic activity is disrupted and every outlet is covering the standoff.`)] };
    notices.push(`UNREST: ${title} broke out. Respond from the Government screen.`);
  }

  // Proceedings advance one stage per quarter.
  const p = s.proceeding;
  if (p) {
    if (p.stage === 'investigation') {
      const vote = impeachmentVote(n, p, 'house', start);
      notices.push(`${vote.label}: ${vote.yes}–${vote.no} (${vote.needed} needed) — ${vote.passed ? 'ADOPTED' : 'DEFEATED'}.`);
      if (!vote.passed) {
        n = { ...n, reputation: Math.max(0, n.reputation - 5) };
        s = note({ ...s, proceeding: null, cooldownUntil: addQuarters(quarter, 4) }, start, `${vote.label} failed ${vote.yes}–${vote.no}. −5 reputation.`);
        n = { ...n, newsQueue: [...n.newsQueue, story(n, `${n.character.name} survives ${vote.chamber} vote`, `${vote.label} fell short ${vote.yes}–${vote.no}; ${vote.needed} votes were needed.`)] };
      } else if (procedure(p.office).senate) {
        s = note({ ...s, proceeding: { ...p, stage: 'house_vote', votes: [...p.votes, vote], defense: 0 } }, start, `${vote.label} adopted ${vote.yes}–${vote.no}. Trial set for next quarter.`);
        n = { ...n, newsQueue: [...n.newsQueue, story(n, `${n.character.name} impeached`, `${vote.chamber} adopted articles ${vote.yes}–${vote.no}. A trial requiring a two-thirds vote follows next quarter.`)] };
      } else return finish(n, s, { ...p, votes: [...p.votes, vote] }, true, start, notices);
    } else if (p.stage === 'house_vote') {
      const vote = impeachmentVote(n, p, 'senate', start);
      notices.push(`${vote.label}: ${vote.yes}–${vote.no} (${vote.needed} needed to convict) — ${vote.passed ? 'CONVICTED' : 'ACQUITTED'}.`);
      return finish(n, s, { ...p, stage: 'senate_trial', votes: [...p.votes, vote] }, vote.passed, start, notices);
    }
  } else if (quarter >= s.cooldownUntil && (s.lowQuarters >= 2 || (approvalOf(n) < IMPEACH_SCANDAL && majorScandal(n)))) {
    const reason = s.lowQuarters >= 2 ? `Approval below ${IMPEACH_LOW}% for two consecutive quarters` : `Approval below ${IMPEACH_SCANDAL}% during a major scandal`;
    const articles = [majorScandal(n) ? 'Abuse of office and corruption' : 'Gross dereliction of duty', 'Loss of public confidence in the office'];
    const proc = procedure(officeId);
    s = note({ ...s, proceeding: { id: `${tenure}|impeach|${quarter}`, office: officeId, stage: 'investigation', since: start, reason, articles, votes: [], defense: 0, defenseQuarter: '' } }, start, `${proc.house.label} introduced: ${reason}.`);
    n = { ...n, newsQueue: [...n.newsQueue, story(n, `Impeachment inquiry opened against ${n.character.name}`, `${reason}. Investigators drafted articles: ${articles.join('; ')}. A ${proc.house.chamber} vote is expected next quarter.`)] };
    notices.push(`IMPEACHMENT: ${proc.house.label} introduced (${reason}). Vote next quarter.`);
  }
  return { career: { ...n, impeachment: s }, notices };
}

function finish(n: Career, s: Impeachment, p: NonNullable<Impeachment['proceeding']>, convicted: boolean, date: string, notices: string[]): { career: Career; notices: string[] } {
  const office = n.office!, name = n.character.name, last = p.votes[p.votes.length - 1]!;
  if (!convicted) {
    n = { ...n, reputation: Math.max(0, n.reputation - ACQUITTAL_REPUTATION) };
    s = note({ ...s, proceeding: null, acquittals: s.acquittals + 1, cooldownUntil: addQuarters(docketQuarter(date), 4) }, date, `Acquitted ${last.yes}–${last.no}. Permanent −${ACQUITTAL_REPUTATION} reputation.`);
    n = { ...n, newsQueue: [...n.newsQueue, story(n, `${name} acquitted, stays in office`, `${last.label} fell short of conviction ${last.yes}–${last.no} (${last.needed} needed). The stain on ${name}'s reputation will not fade.`)] };
    notices.push(`You survived impeachment but lost ${ACQUITTAL_REPUTATION} reputation permanently.`);
    return { career: { ...n, impeachment: s }, notices };
  }
  const heir = `${SUCCESSOR[office.id] ?? 'Successor'}`;
  s = note({ ...s, proceeding: null, unrest: null, barred: true }, date, `Convicted ${last.yes}–${last.no} and removed as ${office.title}. Barred from public office; referred for prosecution.`);
  n = removeFromOffice(n, date);
  n = registerScandal(n, { id: `${p.id}|referral`, title: `Criminal referral after removal from office`, summary: `Following ${name}'s removal as ${office.title}, investigators referred the impeachment findings to prosecutors: ${p.articles.join('; ')}.`, source: 'Legal Audit', severity: 'Severe', evidence: 70, trigger: 'office' });
  n = { ...n, reputation: Math.max(0, n.reputation - 20), newsQueue: [...n.newsQueue, story({ ...n, office }, `${name} removed from office`, `${last.label} convicted ${last.yes}–${last.no}. The ${heir} was sworn in as ${office.title}. ${name} is permanently barred from public office and faces criminal referral.`)] };
  notices.push(`REMOVED: you were convicted and removed as ${office.title}. You are barred from future office.`);
  return { career: { ...n, impeachment: s }, notices };
}

/** Player response to active unrest, once per quarter. */
export function respondUnrest(c: Career, choice: UnrestChoice): Result {
  const s = impeachmentOf(c), q = docketQuarter(c.date);
  if (!executiveOffice(c) || !s.unrest) return { ok: false, message: 'There is no active unrest to respond to.' };
  if (s.unrest.respondedQuarter === q) return { ok: false, message: 'You already responded to the protests this quarter.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Responding needs 1 action.' };
  const title = s.unrest.title;
  let n: Career = { ...c, actions: c.actions - ACTION_COST }, ended = true, message = '';
  if (choice === 'address') {
    const chance = Math.min(0.85, 0.3 + c.reputation / 200 + (c.skills?.communication ?? 0) / 100);
    if (rand(`${s.unrest.id}|${q}|address`) < chance) { n = shiftApproval(shiftApproval(n, 5, 'Address to the public calmed the protests'), 1, 'Address to the public calmed the protests'); message = 'Your address landed: +6 approval and the protests are dispersing.'; }
    else { n = shiftApproval(n, -3, 'A defensive public address inflamed protesters'); ended = false; message = 'The address backfired: −3 approval and protests intensified.'; }
  } else if (choice === 'concessions') {
    n = shiftApproval(n, 4, 'Policy concessions to protesters');
    if (n.approval) n = { ...n, approval: { ...n.approval, party: Math.max(5, n.approval.party - 6) } };
    message = 'Concessions calmed the streets: +4 approval, but your party standing fell 6.';
  } else {
    n = shiftApproval(n, -3, 'Law enforcement deployed against protesters', [{ group: 'youth', delta: -8 }, { group: 'working', delta: -6 }]);
    message = 'Order restored by force: −3 approval, with steep losses among Youth Activists and the Working Class.';
  }
  const next = { ...s, unrest: ended ? null : { ...s.unrest, respondedQuarter: q } };
  return { ok: true, career: { ...n, impeachment: note(next, c.date, `${title}: ${message}`) }, message };
}

/** Lobby lawmakers against the articles: once per stage per quarter, personal money + 1 action. */
export function mountDefense(c: Career): Result {
  const s = impeachmentOf(c), p = s.proceeding, q = docketQuarter(c.date);
  if (!executiveOffice(c) || !p) return { ok: false, message: 'No impeachment proceeding is under way.' };
  if (p.defenseQuarter === q) return { ok: false, message: 'Your defense team already lobbied this quarter.' };
  const cost = DEFENSE_COST[p.office] ?? 15_000;
  if (c.actions < ACTION_COST) return { ok: false, message: 'Lobbying needs 1 action.' };
  if (c.money < cost) return { ok: false, message: `Your legal and lobbying defense costs ${usd(cost)} from personal savings.` };
  const next = { ...s, proceeding: { ...p, defense: p.defense + 1, defenseQuarter: q } };
  return { ok: true, message: `Defense team whipped swing votes (${usd(cost)}).`, career: { ...c, actions: c.actions - ACTION_COST, money: c.money - cost, ledger: [{ month: c.date, label: 'Impeachment defense counsel', amount: -cost }, ...c.ledger], impeachment: note(next, c.date, 'Defense team lobbied swing lawmakers.') } };
}

export const impeachmentBallotBar = (c: Career) => impeachmentOf(c).barred ? 'Removed from office by impeachment: permanently barred from public office.' : null;
