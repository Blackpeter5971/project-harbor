import { ACTION_COST } from './energy-costs';
import { ineffectiveRecord } from './legislative-record';
import { pledgeTargets, weakSpots } from './rival-pressure';
import type { Career } from './career';
import type { Result } from './gameplay';
import { endorsementFactor, baseCosts, homeCity, officeById, rand, supportGain, takePoll, usd, type Campaign, type OfficeId } from './campaign';
import { shiftLoyalty, supportGroupCatalog, type Deltas, type SupportGroupId } from './support-groups';
import { pendingDebate } from './debates';
import { criminalRecord } from './criminal-record';
import type { TownHall, TownHallAnswerKind } from './town-hall-schema';

/**
 * Town halls: once per campaign quarter the candidate can host voters who ask three hard questions.
 * Each answer style moves voter-bloc loyalty (support-groups.ts) and campaign momentum. Pure and browser-safe.
 */
export const TOWN_HALL_QUESTIONS = 3;
export const answerKinds: { id: TownHallAnswerKind; label: string; summary: string }[] = [
  { id: 'populist', label: 'Populist', summary: 'Pleases labor and youth, alienates business' },
  { id: 'fiscal', label: 'Fiscal moderate', summary: 'Pleases business and rural voters, alienates labor' },
  { id: 'reformist', label: 'Principled reform', summary: 'Wins independents and civic groups, neutral elsewhere' },
];

type Effect = { deltas: Deltas; momentum: number; support: number };
const BASE: Record<TownHallAnswerKind, Effect> = {
  populist: { deltas: { labor: 3, youth: 2, business: -3 }, momentum: 1.5, support: 0 },
  fiscal: { deltas: { business: 3, rural: 2, labor: -3 }, momentum: 1, support: 0 },
  reformist: { deltas: { veterans: 1, religious: 1 }, momentum: 0.5, support: 1 },
};

type Line = { text: string; reply: string };
/** `sting` is momentum lost when a rival-planted question gets a weak answer. */
type Question = { id: string; topic: string; role: string; text: (c: Career) => string; answers: Record<TownHallAnswerKind, Line>; extra?: Partial<Record<TownHallAnswerKind, Deltas>>; sting?: Partial<Record<TownHallAnswerKind, number>>; when?: (c: Career) => boolean };
const scandalSpot = (c: Career) => weakSpots(c).find(s => s.id === 'scandal');

/** Contextual questions come first when the candidate's history gives voters a reason to ask. */
const contextual: Question[] = [
  { id: 'do-nothing', topic: 'Do-nothing record', role: 'Small-business owner', when: c => ineffectiveRecord(c),
    text: c => `You sat in the ${c.legislativeRecord?.ineffective.at(-1)?.office ?? 'legislature'} and passed not one bill. Why should we send you back to do nothing again?`,
    answers: {
      populist: { text: 'The system blocked me at every turn. Send me back and I will fight louder.', reply: 'A few cheers, but plenty of skeptical faces.' },
      fiscal: { text: 'I stopped bad bills from passing and protected your money. Not every win is a new law.', reply: 'Fiscal hawks nod; others are unconvinced.' },
      reformist: { text: 'You are right. I fell short. Here is the specific bill I will pass in my first year.', reply: 'The candor lands. The owner says they will be watching.' },
    } },
  { id: 'scandal', topic: 'Scandal', role: 'Retired schoolteacher', when: c => !!scandalSpot(c),
    text: c => `The papers keep writing about "${scandalSpot(c)?.label ?? 'your scandal'}". Why should I believe anything you promise tonight?`,
    answers: {
      populist: { text: 'This is a smear from people who fear change. I answer to you, not to them.', reply: 'Your base cheers; undecided voters exchange glances.' },
      fiscal: { text: 'My lawyers are handling it. Tonight I want to talk about your taxes and your jobs.', reply: 'The dodge is noticed. A few people walk out.' },
      reformist: { text: 'I will cooperate fully, release every document and accept the findings.', reply: 'The teacher nods. It is not forgiveness, but it is a start.' },
    }, extra: { reformist: { religious: 1 } }, sting: { populist: 1.5, fiscal: 1 } },
  { id: 'tax-dodge', topic: 'Hidden taxes', role: 'Small-business bookkeeper', when: c => weakSpots(c).some(s => s.id === 'tax'),
    text: () => 'A rival campaign handed out flyers saying you hid income from the tax office. I pay every cent. Did you?',
    answers: {
      populist: { text: 'The rich dodge billions every year. My paperwork is not the scandal here.', reply: 'Some laughter, but the bookkeeper is not amused.' },
      fiscal: { text: 'I used every legal deduction available, like any accountant would advise.', reply: 'A technically careful answer that convinces no one.' },
      reformist: { text: 'I will publish my returns and settle anything owed before election day.', reply: 'The bookkeeper says she will check the returns herself.' },
    }, sting: { populist: 1.5, fiscal: 1 } },
  { id: 'pledge-counter', topic: 'Costly pledges', role: 'Volunteer for a rival campaign', when: c => pledgeTargets(c).length > 0 && !!c.campaign?.opponents.some(o => !o.out),
    text: c => `Your opponents say your promises to ${pledgeTargets(c).slice(0, 2).join(' and ')} are pandering you cannot pay for. Which one would you break first?`,
    answers: {
      populist: { text: 'None. Working people come first, and the money will be found.', reply: 'Applause from your supporters; the volunteer smirks.' },
      fiscal: { text: 'Every pledge will be costed and phased in within a balanced budget.', reply: 'A disciplined answer that blunts the attack.' },
      reformist: { text: 'I will publish the cost of each pledge and a timetable voters can audit.', reply: 'The volunteer has no follow-up.' },
    }, extra: { populist: { business: -1 } }, sting: { populist: 1 } },
  { id: 'record', topic: 'Voting record', role: 'Retired union steward', when: c => !!c.office || c.termHistory.length > 0,
    text: c => `You have held office before${c.office ? ` as ${c.office.title}` : ''}. Some of your votes hurt people like me. Why should we trust you again?`,
    answers: {
      populist: { text: 'I fought for working families every time it counted, and I will fight harder now.', reply: 'The steward nods slowly. Union members in the room applaud.' },
      fiscal: { text: 'Some votes were tough calls to keep the budget balanced. Responsible choices are not always popular.', reply: 'Business owners in the back murmur approval; the steward folds his arms.' },
      reformist: { text: 'I will publish every vote I cast with a plain explanation, and I will own my mistakes.', reply: 'A rare admission. Several undecided voters write something down.' },
    } },
  { id: 'conviction', topic: 'Criminal record', role: 'Neighborhood watch volunteer', when: c => criminalRecord(c).length > 0,
    text: () => 'You have a criminal record. Why should anyone hand you public power?',
    answers: {
      populist: { text: 'The system is rigged against people like us. I paid my debt and I understand what you face.', reply: 'Some cheer the defiance; others shift uneasily.' },
      fiscal: { text: 'I served my sentence and have rebuilt my life through hard work. Judge me on results.', reply: 'A measured answer that business voters respect.' },
      reformist: { text: 'I made a serious mistake. I will support independent oversight of my office from day one.', reply: 'The volunteer sits back, surprised by the candor.' },
    }, extra: { reformist: { religious: 1 } } },
  { id: 'dealings', topic: 'Business dealings', role: 'Local reporter', when: c => c.businesses.length > 0,
    text: c => `You own ${c.businesses.length === 1 ? 'a company' : `${c.businesses.length} companies`}. How do we know you won't govern for your own profits?`,
    answers: {
      populist: { text: 'I built my business by paying fair wages. I will make big corporations do the same.', reply: 'Workers cheer; a few owners in the audience frown.' },
      fiscal: { text: 'Running a company taught me to balance a budget. Government could use that discipline.', reply: 'The chamber-of-commerce table applauds.' },
      reformist: { text: 'I will place my holdings in a blind trust and recuse myself from any decision that touches them.', reply: 'The reporter underlines the promise. Watchdog groups will hold you to it.' },
    } },
];

const general: Question[] = [
  { id: 'economy', topic: 'Economy', role: 'Factory shift worker',
    text: c => `Prices keep climbing and good jobs keep leaving ${homeCity(c)}. What will you actually do about it?`,
    answers: {
      populist: { text: 'Raise wages, protect local jobs and make big companies pay their fair share.', reply: 'The shift worker shouts “About time!” over the applause.' },
      fiscal: { text: 'Cut red tape and taxes so employers expand here instead of somewhere else.', reply: 'Small-business owners nod; union members look skeptical.' },
      reformist: { text: 'Tie every incentive to real hiring targets, and publish the results each year.', reply: 'A practical answer. Independents in the room seem impressed.' },
    } },
  { id: 'crime', topic: 'Crime', role: 'Corner-store owner',
    text: () => 'My shop has been broken into twice this year. What is your plan for public safety?',
    answers: {
      populist: { text: 'Fund jobs and youth programs so fewer young people turn to crime in the first place.', reply: 'Younger voters applaud; the shop owner wanted more.' },
      fiscal: { text: 'Put more officers on the street and get serious about repeat offenders.', reply: 'Veterans and business owners clap loudly.' },
      reformist: { text: 'Pair community policing with clear accountability so residents and officers trust each other.', reply: 'A balanced answer that draws nods across the room.' },
    }, extra: { fiscal: { veterans: 2, youth: -1 } } },
  { id: 'rights', topic: 'Civil rights', role: 'Community organizer',
    text: () => 'People in my neighborhood still get treated differently by landlords, banks and police. Where do you stand?',
    answers: {
      populist: { text: 'Discrimination is a fight for working people. I will enforce the law against anyone who breaks it.', reply: 'The organizer smiles. Youth activists cheer.' },
      fiscal: { text: 'Strong local businesses and home ownership are the best path to equal opportunity.', reply: 'Polite applause, but the organizer looks disappointed.' },
      reformist: { text: 'I will commission an independent audit and publish the findings, whatever they show.', reply: 'Civic groups in the room take notice.' },
    }, extra: { populist: { youth: 1 } } },
  { id: 'health', topic: 'Healthcare', role: 'Night-shift nurse',
    text: () => 'Our clinic is short-staffed and patients wait hours. How will you fix healthcare?',
    answers: {
      populist: { text: 'Expand coverage and make sure care is a right, not a privilege for the wealthy.', reply: 'Nurses and labor members rise to applaud.' },
      fiscal: { text: 'Bring in competition and cut waste so care gets cheaper without raising taxes.', reply: 'Some business owners agree; the nurse frowns.' },
      reformist: { text: 'Fund staffing first and publish wait times so we can see if it is working.', reply: 'The nurse says she will hold you to that.' },
    }, extra: { populist: { veterans: 1 } } },
  { id: 'taxes', topic: 'Local taxes', role: 'Retired homeowner',
    text: () => 'My property taxes went up again. I am on a fixed income. Will you raise them further?',
    answers: {
      populist: { text: 'The wealthy and big developers should pay more so families like yours pay less.', reply: 'Applause from labor; developers in the room go quiet.' },
      fiscal: { text: 'No new taxes. We will find savings in the budget before we ask you for another dollar.', reply: 'The retiree claps. Rural voters agree loudly.' },
      reformist: { text: 'I will open the budget line by line so you can see exactly where your money goes.', reply: 'The homeowner nods; transparency seems to land.' },
    }, extra: { fiscal: { religious: 1 } } },
  { id: 'housing', topic: 'Housing costs', role: 'Young renter',
    text: () => 'Rent takes half my paycheck. Will I ever be able to afford a home here?',
    answers: {
      populist: { text: 'Cap runaway rents and build public housing for working families.', reply: 'Young voters cheer; landlords in the room scowl.' },
      fiscal: { text: 'Let builders build. Fewer restrictions mean more homes and lower prices.', reply: 'Developers approve; renters are unsure.' },
      reformist: { text: 'Reform zoning with real neighborhood input and track affordability every year.', reply: 'A thoughtful answer. The renter seems cautiously hopeful.' },
    } },
  { id: 'schools', topic: 'Education', role: 'Parent of two',
    text: () => 'Our school has leaking ceilings and outdated books. What will you do for our kids?',
    answers: {
      populist: { text: 'Pay teachers what they deserve and fix every school, starting with the poorest.', reply: 'Teachers in the audience applaud warmly.' },
      fiscal: { text: 'Every dollar must reach classrooms, not administrators. Results first.', reply: 'Taxpayer groups approve; teachers are lukewarm.' },
      reformist: { text: 'Publish a repair list with deadlines and let parents check progress online.', reply: 'The parent says that is the first concrete answer she has heard.' },
    }, extra: { reformist: { religious: 1 } } },
];
const bank = [...contextual, ...general];
const findQuestion = (id: string) => bank.find(q => q.id === id);

const first = ['Maria', 'Dwayne', 'Lucy', 'Hector', 'Janelle', 'Tom', 'Aisha', 'Bill', 'Sofia', 'Earl', 'Kim', 'Luis'];
const last = ['Petersen', 'Washington', 'Moreno', 'Grant', 'Cho', 'Fischer', 'Adeyemi', 'Lowe', 'Barrera', 'Quinn'];
const venues = ['Community Center', 'Public Library', 'High School Gym', 'Union Hall', 'VFW Post', 'Church Fellowship Hall'];
const pick = <T,>(seed: string, a: readonly T[]) => a[Math.floor(rand(seed) * a.length)] ?? a[0]!;
const r1 = (n: number) => Math.round(n * 10) / 10;

export const townHallQuarter = (date: string) => { const y = date.slice(0, 4), m = Number(date.slice(5, 7)) || 1; return `${y}-Q${Math.floor((m - 1) / 3) + 1}`; };
/** Venue, security and outreach cost scales with the office like other campaign prices. */
export const townHallCost = (camp: Campaign) => Math.round(baseCosts[officeById(camp.office).id as OfficeId].event * 0.25);
export const townHallOf = (camp: Campaign | null | undefined) => camp?.townHall ?? null;
export const hostedThisQuarter = (c: Career) => !!c.campaign?.townHallQuarters?.includes(townHallQuarter(c.date));

export function townHallBlocker(c: Career): string | null {
  const camp = c.campaign;
  if (!camp) return 'Town halls require an active campaign.';
  if (c.legal?.prison) return 'You cannot host a town hall from custody.';
  if (pendingDebate(c)) return 'Finish your debate first.';
  if (camp.townHall?.status === 'live') return 'Finish the town hall in progress first.';
  if (hostedThisQuarter(c)) return 'You already hosted a town hall this quarter. Advance the turn to host another.';
  if (c.actions < ACTION_COST) return 'Hosting a town hall needs 15% energy. Advance the turn first.';
  const cost = townHallCost(camp);
  if (camp.funds < cost) return `Campaign funds too low: a town hall costs ${usd(cost)}.`;
  return null;
}

/** Deterministic questions for this campaign quarter: contextual ones first, then current voter concerns. */
export function townHallQuestions(c: Career, seed: string): TownHall['questions'] {
  const ctx = contextual.filter(q => q.when?.(c)).slice(0, 2);
  const pool = [...general].sort((a, b) => rand(seed + a.id) - rand(seed + b.id));
  return [...ctx, ...pool].slice(0, TOWN_HALL_QUESTIONS).map((q, i) => ({ id: q.id, topic: q.topic, role: q.role, speaker: `${pick(seed + i + 'f', first)} ${pick(seed + i + 'l', last)}`, text: q.text(c) }));
}

export function hostTownHall(c: Career): Result {
  const blocked = townHallBlocker(c);
  if (blocked) return { ok: false, message: blocked };
  const camp = c.campaign!;
  const quarter = townHallQuarter(c.date), id = `${camp.office}|${camp.startDate}|${quarter}`;
  const cost = townHallCost(camp);
  const seed = `${c.character.name}|${id}`;
  const venue = `${homeCity(c)} ${pick(seed + 'venue', venues)}`;
  const townHall: TownHall = { id, quarter, date: c.date, venue, status: 'live', round: 0, questions: townHallQuestions(c, seed), answers: [], loyalty: {}, momentum: 0, supportDelta: 0, outcome: '' };
  const nc: Campaign = {
    ...camp, funds: camp.funds - cost, spent: camp.spent + cost,
    txns: [{ month: c.date, label: `Town hall at ${venue}`, amount: -cost }, ...camp.txns].slice(0, 40),
    turnActs: [...camp.turnActs, 'Town hall'],
    townHall, townHallQuarters: [...(camp.townHallQuarters ?? []), quarter].slice(-12),
  };
  const message = `Town hall opened at ${venue}. Three voters are waiting with questions.`;
  return { ok: true, career: { ...c, actions: c.actions - ACTION_COST, experience: r1(c.experience + 0.5), campaign: nc, log: [message, ...c.log].slice(0, 12) }, message };
}

/** Exact loyalty, momentum and independent-voter appeal an answer will apply; used by the preview and the rule. */
export function townHallEffects(c: Career, questionId: string, kind: TownHallAnswerKind): Effect {
  const base = BASE[kind], extra = findQuestion(questionId)?.extra?.[kind] ?? {};
  const scale = 1 + Math.min(100, Math.max(0, c.skills.communication)) / 200;
  const deltas: Deltas = {};
  for (const id of new Set([...Object.keys(base.deltas), ...Object.keys(extra)]) as Set<SupportGroupId>) {
    const d = (base.deltas[id] ?? 0) + (extra[id] ?? 0);
    if (d) deltas[id] = d > 0 ? r1(d * scale) : d;
  }
  return { deltas, momentum: r1(base.momentum - (findQuestion(questionId)?.sting?.[kind] ?? 0)), support: base.support };
}
export const answerLine = (questionId: string, kind: TownHallAnswerKind) => findQuestion(questionId)?.answers[kind] ?? null;
export const blocName = (id: string) => supportGroupCatalog.find(g => g.id === id)?.name ?? id;

/** Expected encounter id and round reject double taps and replayed answers after a reload. */
export function answerTownHall(c: Career, id: string, round: number, kind: TownHallAnswerKind): Result {
  const camp = c.campaign, th = camp?.townHall;
  if (!camp || !th || th.id !== id || th.status !== 'live' || th.round !== round) return { ok: false, message: 'This town-hall answer is no longer available.' };
  const question = th.questions[round], line = question ? answerLine(question.id, kind) : null;
  if (!question || !line) return { ok: false, message: 'Choose an available answer.' };
  const fx = townHallEffects(c, question.id, kind);
  let n = shiftLoyalty(c, fx.deltas, `Town hall: ${question.topic}`);
  const loyalty = { ...th.loyalty };
  for (const [g, d] of Object.entries(fx.deltas)) loyalty[g] = r1((loyalty[g] ?? 0) + (d ?? 0));
  let next: TownHall = { ...th, round: round + 1, answers: [...th.answers, { question: question.id, kind }], loyalty, momentum: r1(th.momentum + fx.momentum) };
  let nc: Campaign = { ...camp, momentum: r1(camp.momentum + fx.momentum), townHall: next };
  let message = line.reply;
  if (next.round >= th.questions.length) {
    const appeal = next.answers.reduce((s, a) => s + BASE[a.kind].support, 0);
    const supportDelta = supportGain((1 + appeal) * endorsementFactor(camp, c.character.name), camp.support);
    const reform = next.answers.filter(a => a.kind === 'reformist').length;
    const populist = next.answers.filter(a => a.kind === 'populist').length;
    const fiscal = next.answers.filter(a => a.kind === 'fiscal').length;
    const outcome = reform >= 2 ? 'Voters praised straight, reform-minded answers.' : populist >= 2 ? 'A fiery, populist night energised working-class voters.' : fiscal >= 2 ? 'A disciplined, fiscally focused night reassured business voters.' : 'A balanced town hall that gave something to everyone.';
    next = { ...next, status: 'completed', supportDelta, outcome };
    nc = { ...nc, support: r1(nc.support + supportDelta), townHall: next, headlines: [`${c.character.name} takes tough questions at ${th.venue}`, ...nc.headlines].slice(0, 10) };
    n = { ...n, campaign: nc };
    nc = { ...nc, polls: [...nc.polls, takePoll(n, nc, c.date)].slice(-6) };
    const topics = th.questions.map(q => q.topic.toLowerCase()).join(', ');
    n = { ...n, campaign: nc, newsQueue: [...n.newsQueue, { h: `${c.character.name} faces voters at ${th.venue}`, sub: outcome, body: `At a packed town hall, ${c.character.name} answered questions on ${topics}. ${outcome}`, tag: 'campaign', subject: c.character.name, portrait: c.character.portrait }] };
    message = `${line.reply} Town hall complete: +${supportDelta} support.`;
    return { ok: true, career: { ...n, log: [outcome, ...n.log].slice(0, 12) }, message };
  }
  return { ok: true, career: { ...n, campaign: nc }, message };
}
