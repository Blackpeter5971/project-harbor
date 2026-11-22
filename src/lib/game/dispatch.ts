import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import { socialOf } from './social-media';
import type { Dispatch, Kiosk, MailItem } from './dispatch-schema';

/** Dispatch mail + Magazines kiosk. Deterministic; effects touch only reputation, relationships, stress and actions. */
type Effect = { reputation?: number; relationships?: number; stress?: number };
type Reply = { label: string; effect: Effect; result: string };
type Template = { from: (c: Career) => string; subject: (c: Career) => string; body: (c: Career) => string; tag: MailItem['tag']; replies: Reply[] };

const hash = (t: string) => { let h = 2166136261; for (const ch of t) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };
const place = (c: Career) => c.office?.jurisdiction ?? c.character.state;
const friend = (c: Career) => c.life?.social?.partner?.name ?? c.life?.social?.contacts[0]?.name ?? 'Mom';

export const TEMPLATES: Record<MailItem['kind'], Template[]> = {
  whip: [
    { from: c => `${c.character.party} Party Whip`, subject: () => 'Vote with the caucus this week', tag: 'Urgent',
      body: c => `Leadership expects every ${c.character.party} member to hold the line on the upcoming budget vote. Breaking ranks will be remembered.`,
      replies: [{ label: 'Pledge loyalty', effect: { relationships: 2, reputation: -1 }, result: 'The whip notes your loyalty.' }, { label: 'Vote my conscience', effect: { reputation: 2, relationships: -1 }, result: 'Voters respect your independence; leadership does not.' }] },
    { from: c => `${c.character.party} Party Whip`, subject: () => 'Co-sponsor request', tag: 'Confidential',
      body: () => 'We need your name on the caucus infrastructure bill before it goes public. Quietly, please.',
      replies: [{ label: 'Add my name', effect: { relationships: 2 }, result: 'Caucus leaders thank you.' }, { label: 'Decline politely', effect: { stress: -2 }, result: 'You stay out of it.' }] },
  ],
  donor: [
    { from: () => 'Campaign Manager', subject: () => 'Donor briefing: big checks waiting', tag: 'Confidential',
      body: () => 'Three major donors want a private dinner before they commit. They will ask about tax policy.',
      replies: [{ label: 'Book the dinner', effect: { relationships: 3, stress: 4 }, result: 'Donors leave impressed.' }, { label: 'Grassroots only', effect: { reputation: 2 }, result: 'Supporters cheer your small-dollar stance.' }] },
    { from: () => 'Campaign Manager', subject: () => 'Fundraising numbers are slipping', tag: 'Urgent',
      body: () => 'We are behind pace this quarter. I need you on the phones for donor call-time.',
      replies: [{ label: 'Do call-time', effect: { relationships: 2, stress: 5 }, result: 'Hours on the phone pay off.' }, { label: 'Not this week', effect: { stress: -3 }, result: 'Your manager sighs.' }] },
  ],
  leak: [
    { from: () => 'anon.source@protonmail', subject: () => 'They are coming for you', tag: 'Confidential',
      body: c => `Someone in ${place(c)} is shopping a story about your finances to reporters. Get ahead of it.`,
      replies: [{ label: 'Go public first', effect: { reputation: 2, stress: 3 }, result: 'You take the narrative before it breaks.' }, { label: 'Ignore it', effect: {}, result: 'You file it away.' }] },
    { from: () => 'Intelligence Liaison', subject: () => 'Briefing: leaked memo circulating', tag: 'Press',
      body: () => 'A memo with your staff\u2019s name is circulating among journalists. We recommend a statement.',
      replies: [{ label: 'Issue statement', effect: { reputation: 1 }, result: 'Your statement calms reporters.' }, { label: 'Find the leaker', effect: { relationships: -1, stress: 4 }, result: 'Staff morale dips during the hunt.' }] },
  ],
  petition: [
    { from: c => `Residents of ${place(c)}`, subject: () => 'Petition: fix our roads (1,204 signatures)', tag: 'Constituent',
      body: () => 'Potholes on Main Street have damaged dozens of cars. Will you champion repairs?',
      replies: [{ label: 'I\u2019ll champion it', effect: { reputation: 2, stress: 2 }, result: 'Petitioners share your reply widely.' }, { label: 'Send form letter', effect: { reputation: -1 }, result: 'Residents feel brushed off.' }] },
    { from: () => 'A worried parent', subject: () => 'School safety concerns', tag: 'Constituent',
      body: c => `Our schools in ${place(c)} need crossing guards. Please don\u2019t ignore us.`,
      replies: [{ label: 'Visit the school', effect: { reputation: 2, stress: 2 }, result: 'Parents appreciate the visit.' }, { label: 'Forward to staff', effect: {}, result: 'Your staff logs the concern.' }] },
  ],
  personal: [
    { from: friend, subject: () => 'Proud of you', tag: 'Personal',
      body: () => 'Saw you on the news. Don\u2019t forget to eat and sleep. Dinner this weekend?',
      replies: [{ label: 'Yes, dinner!', effect: { stress: -6 }, result: 'A warm evening recharges you.' }, { label: 'Too busy', effect: { stress: 2 }, result: 'You feel a pang of guilt.' }] },
    { from: friend, subject: () => 'Long time no talk', tag: 'Personal',
      body: () => 'Remember when we used to just hang out? Call me sometime.',
      replies: [{ label: 'Call tonight', effect: { stress: -4 }, result: 'Catching up lifts your mood.' }, { label: 'Maybe later', effect: {}, result: 'You promise yourself you will.' }] },
  ],
};

const emptyDispatch = (): Dispatch => ({ items: [], lastTurn: '', sent: [] });
const emptyKiosk = (): Kiosk => ({ covers: [], seen: 0, interviews: [] });
export const dispatchOf = (c: Career): Dispatch => {
  const d = socialOf(c).dispatch ?? emptyDispatch();
  // Legacy generic letters, including all family correspondence, are no longer shown.
  return { ...d, sent: d.sent ?? [], items: d.items.filter(m => !!m.context) };
};
export const kioskOf = (c: Career): Kiosk => socialOf(c).kiosk ?? emptyKiosk();
const putD = (c: Career, d: Dispatch): Career => ({ ...c, socialMedia: { ...socialOf(c), dispatch: d } });
const putK = (c: Career, k: Kiosk): Career => ({ ...c, socialMedia: { ...socialOf(c), kiosk: k } });

/** Kinds whose real-world trigger currently applies. */
export function eligibleKinds(c: Career): MailItem['kind'][] {
  return [...new Set(contextualMail(c).map(m => m.kind))];
}

function contextualMail(c: Career): MailItem[] {
  const items: MailItem[] = [];
  const add = (type: NonNullable<MailItem['context']>['type'], key: string, kind: MailItem['kind'], from: string, subject: string, body: string, tag: MailItem['tag']) => {
    items.push({ id: `mail-context|${type}|${key}`, date: c.date, kind, from, subject, body, tag, read: false, starred: false, archived: false, replied: null, template: 0, context: { type, id: key } });
  };
  for (const s of c.scandals.filter(s => s.phase !== 'Managed' && s.status !== 'cleared')) add('scandal', `${s.id}|${s.phase}|${s.status}`, 'leak', 'Public affairs adviser', `Scrutiny update: ${s.title}`, `${s.summary} Current public phase: ${s.phase}. Finding: ${s.finding ?? 'No independent finding yet'}. Review the existing scandal response before making a statement.`, 'Press');
  if (c.office) for (const x of c.crises.filter(x => x.status !== 'resolved')) add('crisis', `${x.id}|${x.status}|${x.severity}`, 'petition', `Response team · ${c.office.jurisdiction}`, `Urgent: ${x.title}`, `${x.description} Severity: ${x.severity}/3. Current response: ${x.selectedResponseId ?? 'Not selected'}. Review the government response and available public funding.`, 'Urgent');
  if (c.office && ['council', 'stateLeg', 'house', 'senate'].includes(c.office.id) && c.character.party !== 'Independent') {
    for (const b of c.legislature?.bills ?? []) if (['in_committee', 'floor_debate'].includes(b.status)) add('bill', `${b.id}|${b.status}`, 'whip', `${c.character.party} caucus office`, `Pending chamber business: ${b.title}`, `${b.title} is currently ${b.status.replaceAll('_', ' ')}. Review the bill and the scheduled chamber business before deciding your position. An email acknowledgement does not cast a vote or add a sponsorship.`, 'Confidential');
  }
  if (c.campaign) {
    const cp = c.campaign, key = `${cp.office}|${cp.startDate}`;
    add('campaign', `${key}|${cp.phase}`, 'donor', 'Campaign office', `${cp.title}: ${cp.phase} campaign update`, `Your ${cp.phase} campaign for ${cp.title} in ${cp.jurisdiction} is active. Election date: ${cp.phase === 'primary' ? cp.primaryDate ?? cp.electionDate : cp.electionDate}. Available campaign cash: $${cp.funds.toLocaleString('en-US')}. Personal savings remain separate.`, null);
    if (cp.funds < 1000) add('campaign', `${key}|low-funds`, 'donor', 'Campaign finance team', 'Campaign cash needs attention', `Your ${cp.title} campaign has $${cp.funds.toLocaleString('en-US')} remaining. Review staffing costs and fundraising before committing more campaign money. No donor commitment has been received through this email.`, 'Urgent');
  }
  for (const a of c.applications.filter(a => a.status === 'offered' || a.status === 'rejected')) add('job', `${a.jobId}|${a.month}|${a.status}`, 'personal', 'Recruitment office', `Application ${a.status}: ${a.jobId}`, a.status === 'offered' ? `Your application received an offer. Review the role in Career & Business; the job is not accepted until you choose it there.` : `Your application was declined. ${a.reason ?? 'Review the role requirements before applying again.'}`, null);
  const debt = c.life?.medicalDebt ?? 0;
  if (debt > 0) add('health', 'medical-debt', 'personal', 'Medical billing office', 'Outstanding medical balance', `Your unpaid medical balance is $${debt.toLocaleString('en-US')}. Review your healthcare costs and coverage.`, 'Urgent');
  const arrears = (c.housing?.arrears ?? 0) + (c.life?.billArrears ?? 0);
  if (arrears > 0) add('finance', 'household-arrears', 'personal', 'Accounts office', 'Overdue housing or essential bills', `Your housing and essential-bill arrears total $${arrears.toLocaleString('en-US')}. Review the outstanding obligations and your personal balance before new spending.`, 'Urgent');
  return items;
}

/** Delivers up to two contextual letters once per turn (guarded by lastTurn). Inbox capped at 40. */
export function mailTurn(c: Career, start: string): Career {
  const d = dispatchOf(c);
  if (d.lastTurn && d.lastTurn >= start) return c;
  const sent = new Set([...d.sent, ...d.items.map(m => m.id)]);
  const fresh = contextualMail(c).filter(m => !sent.has(m.id)).slice(0, 2);
  return putD(c, { lastTurn: start, sent: [...sent, ...fresh.map(m => m.id)], items: [...fresh, ...d.items].slice(0, 40) });
}

export const unreadMail = (c: Career) => dispatchOf(c).items.filter(m => !m.read && !m.archived).length;
export const repliesFor = (m: MailItem): Reply[] => m.context ? [{ label: 'Acknowledge', effect: {}, result: 'Message acknowledged.' }] : [];

const patch = (c: Career, id: string, f: (m: MailItem) => MailItem) => { const d = dispatchOf(c); return putD(c, { ...d, items: d.items.map(m => m.id === id ? f(m) : m) }); };
export const markRead = (c: Career, id: string) => patch(c, id, m => ({ ...m, read: true }));
export const toggleStar = (c: Career, id: string) => patch(c, id, m => ({ ...m, starred: !m.starred }));
export const toggleArchive = (c: Career, id: string) => patch(c, id, m => ({ ...m, archived: !m.archived, read: true }));

export const markAllRead = (c: Career) => { const d = dispatchOf(c); return putD(c, { ...d, items: d.items.map(m => m.read ? m : { ...m, read: true }) }); };
export const deleteMail = (c: Career, ids: string[]) => { const s = new Set(ids), d = dispatchOf(c); return putD(c, { ...d, items: d.items.filter(m => !s.has(m.id)) }); };

export type DispatchResult = { ok: true; career: Career; message: string } | { ok: false; message: string };
const apply = (c: Career, e: Effect): Career => ({ ...c,
  reputation: Math.max(-100, Math.min(200, c.reputation + (e.reputation ?? 0))), relationships: Math.max(0, c.relationships + (e.relationships ?? 0)),
  life: c.life && e.stress ? { ...c.life, stress: Math.max(0, Math.min(100, c.life.stress + e.stress)) } : c.life });

/** One-tap reply: applies its effect once. */
export function replyMail(c: Career, id: string, choice: number): DispatchResult {
  const m = dispatchOf(c).items.find(x => x.id === id);
  if (!m) return { ok: false, message: 'Message not found.' };
  if (m.replied !== null) return { ok: false, message: 'You already replied.' };
  const r = repliesFor(m)[choice];
  if (!r) return { ok: false, message: 'Unknown reply.' };
  return { ok: true, career: patch(apply(c, r.effect), id, x => ({ ...x, read: true, replied: choice })), message: r.result };
}

/* ---------- Magazines ---------- */
export const MAGAZINES = ['Crossia Affairs', 'The Statesman', 'Capital Insight'] as const;
export const COVERS = [
  { id: 'rising', magazine: 'Capital Insight', title: 'Rising Star of the Assembly', rep: 25 },
  { id: 'visionary', magazine: 'The Statesman', title: 'Economic Visionary', rep: 50 },
  { id: 'power', magazine: 'Capital Insight', title: 'The Power 100', rep: 80 },
  { id: 'poty', magazine: 'Crossia Affairs', title: 'Person of the Year', rep: 120 },
] as const;
export const INTERVIEW_REP = 60;
export const INTERVIEW_EFFECT = { reputation: 4, relationships: 2 } as const;

/** Awards each cover once when reputation first reaches its threshold. */
export function magazineTurn(c: Career): { career: Career; notices: string[] } {
  const k = kioskOf(c), have = new Set(k.covers.map(x => x.id));
  const won = COVERS.filter(x => c.reputation >= x.rep && !have.has(x.id));
  if (!won.length) return { career: c, notices: [] };
  return { career: putK(c, { ...k, covers: [...k.covers, ...won.map(x => ({ id: x.id, magazine: x.magazine, title: x.title, date: c.date }))] }),
    notices: won.map(x => `${x.magazine} names you “${x.title}” on its front cover.`) };
}
export const interviewOffer = (c: Career) => c.reputation >= INTERVIEW_REP && !kioskOf(c).interviews.includes(c.date.slice(0, 4))
  ? { magazine: MAGAZINES[Math.floor(hash(c.date.slice(0, 4) + c.character.name) * 3)]! } : null;
export const unseenMagazines = (c: Career) => Math.max(0, kioskOf(c).covers.length - kioskOf(c).seen) + (interviewOffer(c) ? 1 : 0);
export const markCoversSeen = (c: Career) => { const k = kioskOf(c); return k.seen === k.covers.length ? c : putK(c, { ...k, seen: k.covers.length }); };

export function answerInterview(c: Career, accept: boolean): DispatchResult {
  const o = interviewOffer(c); if (!o) return { ok: false, message: 'No interview offer right now.' };
  if (accept && c.actions < ACTION_COST) return { ok: false, message: 'Not enough energy this turn.' };
  const k = kioskOf(c), base = putK(c, { ...k, interviews: [...k.interviews, c.date.slice(0, 4)] });
  if (!accept) return { ok: true, career: base, message: `You declined ${o.magazine}.` };
  return { ok: true, career: apply({ ...base, actions: base.actions - ACTION_COST }, INTERVIEW_EFFECT), message: `Your ${o.magazine} exclusive lands well with the establishment. Reputation +${INTERVIEW_EFFECT.reputation}.` };
}
