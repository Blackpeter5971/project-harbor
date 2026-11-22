import { ineffectiveRecord } from './legislative-record';
import { pledgeTargets, weakSpots } from './rival-pressure';
import type { Career } from './career';
import type { Result } from './gameplay';
import { favorability, rand, supportGain, takePoll } from './campaign';
import { initApproval, shiftApproval } from './approval';
import { socialOf } from './social-media';
import type { Debate } from './debate-schema';
import { communicationsGain, communicationsSeverity } from './campaign-staff-schema';

/** Rivals challenge an ineffective legislative record in the rebuttal round. */
export const DO_NOTHING_QUESTION = 'You served a full legislative term and passed zero bills. Why should voters trust a do-nothing legislator to deliver now?';
export const SCANDAL_QUESTION = (label: string) => `Voters are still reading about "${label}". Why should anyone trust a word you say on this stage?`;
export const TAX_QUESTION = 'Our research shows you hid income from the tax authorities. How can you ask families to pay their share when you dodged yours?';
export const PLEDGE_QUESTION = (groups: string[]) => `Your rivals call your pledges to ${groups.slice(0, 2).join(' and ')} unaffordable pandering. If the budget falls short, which promise takes priority—and what will you postpone?`;

/** The rival's rebuttal attack on the weakest spot in the record (zero bills keeps priority). */
export function debateAttack(c: Career, round: number): { question: string; penalty: number } | null {
  if (round === 1) {
    if (ineffectiveRecord(c)) return { question: DO_NOTHING_QUESTION, penalty: 1 };
    const spot = weakSpots(c).find(s => s.id !== 'do-nothing');
    if (spot?.id === 'scandal') return { question: SCANDAL_QUESTION(spot.label), penalty: 1 };
    if (spot?.id === 'tax') return { question: TAX_QUESTION, penalty: 1 };
  }
  // The journalist follow-up relays the rivals' counter-attack on recorded pledges.
  if (round === 2) { const groups = pledgeTargets(c); if (groups.length) return { question: PLEDGE_QUESTION(groups), penalty: 1 }; }
  return null;
}
export const debateQuestionText = (c: Career, round: number) => debateAttack(c, round)?.question ?? DEBATE_ROUNDS[round]?.question ?? '';
/** Penalty for the answer: weak-spot attacks always sting; pledge counters only punish non-committal answers. */
const attackPenalty = (c: Career, round: number, value: number) => { const a = debateAttack(c, round); return !a ? 0 : round === 2 && value >= 2 ? 0 : a.penalty; };
export const DEBATE_ROUNDS = [
  { title: 'Cost of living', question: 'Families are struggling with rising costs. What would you do first?', choices: [
    { id: 'plan', text: 'Set measurable priorities and fund them within a published budget.', value: 2, reply: 'A costed plan gives voters something they can hold you to.' },
    { id: 'promise', text: 'Promise immediate relief for everyone, without any trade-offs.', value: -2, reply: 'How will you pay for that? The audience wants specifics.' },
    { id: 'listen', text: 'Meet affected families before choosing targeted relief.', value: 1, reply: 'Listening helps, but voters still want a timetable.' },
  ] },
  { title: 'Opponent rebuttal', question: 'Your promises sound good, but why should voters trust you to deliver?', choices: [
    { id: 'evidence', text: 'Publish milestones and let independent reviewers track delivery.', value: 2, reply: 'Then we will hold you to those milestones.' },
    { id: 'attack', text: 'You are the last person who should lecture anyone about trust.', value: -2, reply: 'Personal insults are not an answer to the question.' },
    { id: 'contrast', text: 'We disagree on priorities. Let voters compare our plans.', value: 1, reply: 'Fair enough. Let us put the differences on the record.' },
  ] },
  { title: 'Journalist follow-up', question: 'If the budget falls short, which promise takes priority—and what will you postpone?', choices: [
    { id: 'tradeoff', text: 'Protect essential services and publish the costs of postponed plans.', value: 2, reply: 'A clear trade-off, rather than another blanket promise.' },
    { id: 'dodge', text: 'That will not happen. My leadership will solve everything.', value: -2, reply: 'That avoids the budget question. Voters notice.' },
    { id: 'review', text: 'Request an independent review before committing more funds.', value: 1, reply: 'Prudent, though some voters wanted a firmer answer tonight.' },
  ] },
  { title: 'Closing statement', question: 'One final message to voters who are still undecided?', choices: [
    { id: 'unite', text: 'Judge my plan and my conduct. I will serve even those who disagree.', value: 2, reply: 'The audience responds warmly to your inclusive closing.' },
    { id: 'divide', text: 'If you are not with me, you are standing in the way.', value: -2, reply: 'The divisive closing draws boos and critical clips.' },
    { id: 'base', text: 'Thank you to our supporters. Together we will keep working.', value: 1, reply: 'Your supporters applaud; undecided voters remain cautious.' },
  ] },
] as const;
const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
const complete = (d: Debate) => d.status === 'completed' || d.status === 'skipped';
export const pendingDebate = (c: Career) => c.debate && !complete(c.debate) ? c.debate : null;
export const debateReady = (c: Career) => !c.report && !c.newspaperPending && !!pendingDebate(c);

/** The first quarterly turn crossing election-minus-three-months, never the election turn. */
export function prepareDebate(c: Career, start: string, end: string): Career {
  const camp = c.campaign;
  if (!camp || camp.phase !== 'general' || camp.office === 'council' || c.legal?.prison) return c;
  const target = monthIndex(camp.electionDate) - 3;
  if (monthIndex(end) < target || monthIndex(start) >= monthIndex(camp.electionDate) || end >= camp.electionDate) return c;
  const id = `${camp.office}|${camp.startDate}|${camp.electionDate}`;
  if (c.debate?.id === id || c.debateHistory?.some(d => d.id === id)) return c;
  const opponents = camp.opponents.filter(o => !o.out && !o.primary).map((o, i) => ({ name: o.name, party: o.party, policy: o.policy, portrait: o.portrait ?? (c.character.portrait + i + 1) % 6 }));
  if (!opponents.length) return c;
  const debate: Debate = { id, date: end, office: camp.office, title: camp.title, electionDate: camp.electionDate, status: 'invited', opponents, round: 0, answers: [], score: 0, transcript: [], supportDelta: 0, approvalDelta: 0, outcome: '' };
  return { ...c, debate, newsQueue: [...c.newsQueue, { h: `${camp.title} candidates invited to town-hall debate`, sub: camp.jurisdiction, body: `${c.character.name} and ${opponents.map(o => o.name).join(', ')} will face voters and a Courier journalist before the general election.`, tag: 'campaign', subject: c.character.name, portrait: c.character.portrait }] };
}

function finishDebate(c: Career, d: Debate, skipped: boolean): Career {
  const camp = c.campaign;
  if (!camp) return c;
  const raw = skipped ? -3 : d.score >= 6 ? 4 : d.score >= 2 ? 2 : d.score >= 0 ? 0 : -3;
  const supportDelta = raw > 0 ? supportGain(raw * communicationsGain(camp), camp.support) : Math.round(raw * communicationsSeverity(camp) * 10) / 10;
  const mood = skipped ? -2 : d.score >= 6 ? 2 : d.score >= 2 ? 1 : d.score < 0 ? -2 : 0;
  const approval = c.approval ?? { ...initApproval(c), overall: favorability(c), party: camp.party === 'Independent' ? 0 : favorability(c), history: [], };
  let n = shiftApproval({ ...c, approval }, mood, skipped ? 'Skipped the general-election debate.' : 'Town-hall debate performance.');
  const outcome = skipped ? 'Skipped the debate; voters criticised the empty lectern.' : d.score >= 6 ? 'Strong debate: clear answers won over voters.' : d.score >= 2 ? 'Steady debate: a modest boost with voters.' : d.score < 0 ? 'Difficult debate: evasive or divisive answers drew criticism.' : 'Mixed debate: voters remain unconvinced.';
  const result: Debate = { ...d, status: skipped ? 'skipped' : 'completed', supportDelta, approvalDelta: (n.approval?.overall ?? approval.overall) - approval.overall, outcome };
  const changed = { ...camp, support: camp.support + supportDelta, momentum: camp.momentum + mood, headlines: [outcome, ...camp.headlines].slice(0, 10) };
  n = { ...n, campaign: { ...changed, polls: [...camp.polls, takePoll(n, changed, c.date)].slice(-6) }, debate: result, debateHistory: [...(c.debateHistory ?? []), result] };
  const s = socialOf(n), tag = `#${camp.office === 'president' ? 'Presidential' : camp.title.replace(/[^a-z]/gi, '')}Debate`;
  const text = `${tag} is trending. ${c.character.name}: ${outcome} Support ${supportDelta >= 0 ? '+' : ''}${supportDelta}; approval ${result.approvalDelta >= 0 ? '+' : ''}${result.approvalDelta}.`;
  const reach = Math.round((1000 + s.followers * 0.2) * (1 + rand(d.id)));
  const reaction = { id: `${d.id}|trend`, date: c.date, about: 'general-election debate', author: 'The Courier', handle: '@courierpolitics', role: 'press' as const, verified: true, text, likes: Math.round(reach * 0.08), reposts: Math.round(reach * 0.03), replies: Math.round(reach * 0.02), views: reach };
  return { ...n, socialMedia: { ...s, reactionFeed: [reaction, ...s.reactionFeed].slice(0, 60) }, log: [outcome, ...n.log].slice(0, 12), newsQueue: [...n.newsQueue, { h: `${c.character.name}: ${skipped ? 'debate absence' : 'debate performance'} trends online`, sub: outcome, body: text, tag: 'campaign', subject: c.character.name, portrait: c.character.portrait }] };
}

/** Expected round and live career reference reject double-clicks and replayed responses. */
export function respondDebate(c: Career, id: string, round: number, choice: string): Result {
  const d = pendingDebate(c), camp = c.campaign;
  if (!d || d.id !== id || d.round !== round || !debateReady(c) || !camp || camp.phase !== 'general' || camp.office !== d.office || camp.electionDate !== d.electionDate || c.legal?.prison) return { ok: false, message: 'This debate response is no longer available.' };
  if (choice === 'skip' && d.status === 'invited') return { ok: true, career: finishDebate(c, d, true), message: 'Debate skipped: support and approval fell.' };
  if (choice === 'attend' && d.status === 'invited') return { ok: true, career: { ...c, debate: { ...d, status: 'live' } }, message: 'The town-hall debate is live.' };
  if (d.status !== 'live') return { ok: false, message: 'Join the debate before answering.' };
  const question = DEBATE_ROUNDS[d.round], answer = question?.choices.find(a => a.id === choice);
  if (!question || !answer) return { ok: false, message: 'Choose an available debate response.' };
  const rival = d.opponents[d.round % d.opponents.length];
  const next: Debate = { ...d, round: d.round + 1, answers: [...d.answers, answer.id], score: d.score + answer.value - attackPenalty(c, d.round, answer.value), transcript: [...d.transcript, { speaker: d.round === 1 ? rival?.name ?? 'Opponent' : 'Courier journalist', text: debateQuestionText(c, d.round) }, { speaker: c.character.name, text: answer.text }, { speaker: d.round === 1 ? rival?.name ?? 'Opponent' : 'Courier journalist', text: answer.reply }] };
  return { ok: true, career: next.round === DEBATE_ROUNDS.length ? finishDebate(c, next, false) : { ...c, debate: next }, message: answer.reply };
}

export function dismissDebate(c: Career, id: string): Career {
  return c.debate?.id === id && complete(c.debate) ? { ...c, debate: null } : c;
}