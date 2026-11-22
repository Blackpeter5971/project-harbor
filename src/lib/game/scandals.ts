import type { Career } from './career';
import { scandalSchema, type Scandal } from './scandal-schema';
import { socialMediaSchema, handleOf } from './social-media';

const months = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
const tenure = (c: Career) => c.office ? `${c.office.id}|${c.office.jurisdiction}|${c.office.since}` : '';
export function coverageTone(s: Scandal) {
  if (s.status === 'cleared') return 'Correction / allegation unsupported';
  if (s.status === 'proven') return 'Critical / substantiated findings';
  if (s.evidence === 0) return 'Cautious / unsupported claim';
  return s.phase === 'Exploded' ? 'Intense scrutiny / guilt not established' : 'Scrutiny / evidence incomplete';
}
/** Allegations from the same family within this window fold into one Scrutiny Case. */
export const CONSOLIDATE_MONTHS = 6;
const family = (t: Scandal['trigger']) => t === 'corruption' || t === 'business' ? 'corruption' : t;
/** Still open for new related allegations: not campaign claims, unanswered, not resolved. */
export const isOpenCase = (s: Scandal) => !s.id.startsWith('campaign|') && !s.response && s.phase !== 'Managed' && s.status !== 'cleared';
export const isResolved = (s: Scandal) => s.phase === 'Managed';
/** Close every still-open case (trial verdict, dismissal); history is kept, prompts stop. */
export function closeScandals(c: Career, end: string, finding: string): Career {
  return { ...c, scandals: c.scandals.map(s => s.phase === 'Managed' || s.date > end ? s : { ...s, phase: 'Managed' as const, closedAt: end, falloutTurn: end, finding: s.finding ?? finding, reported: [...s.reported, `Managed|${s.status}`] }) };
}
export const activeScandals = (c: Career) => c.scandals.filter(s => s.phase !== 'Managed');
const settled = (s: Scandal) => s.resolution === 'defused' || s.resolution === 'contained';

/** Saved coverage per transition, with no additional guilt or approval penalties. */
export function announceScandal(c: Career, s: Scandal): Career {
  const key = `${s.phase}|${s.status}`;
  if (s.reported.includes(key)) return c;
  const tone = coverageTone(s), qualifier = s.status === 'proven' ? s.finding ?? 'Independent findings substantiated the conduct.' : s.status === 'cleared' ? s.finding ?? 'The allegation is unsupported.' : 'This is an allegation, not a finding of guilt.';
  const social = c.socialMedia ?? socialMediaSchema.parse({});
  return { ...c, scandals: c.scandals.map(x => x.id === s.id ? { ...s, reported: [...s.reported, key] } : x),
    newsQueue: s.id.startsWith('campaign|') ? c.newsQueue : [...c.newsQueue.filter(st => !st.h.startsWith(`${s.title} — `)), { h: `${s.title} — ${s.phase.toLowerCase()} scrutiny (${s.date.slice(0, 7)})`, sub: `${s.source} · ${tone}`, body: `${s.summary} Evidence: ${s.evidence}%. ${qualifier}`, tag: 'scandal', subject: s.subject, portrait: c.character.portrait, priority: 1 }],
    socialMedia: { ...social, reactionFeed: [{ id: `scandal-${s.id}-${key}`, date: s.lastProcessed || s.date, about: s.title, role: 'press' as const, author: 'Capitol News Desk', handle: '@capitolnews', verified: true, text: `${handleOf(c)}: ${s.title}. ${s.summary} ${qualifier}`, likes: 24, reposts: 8, replies: 12, views: 1200 }, ...social.reactionFeed.filter(p => !p.id.startsWith(`scandal-${s.id}-`))].slice(0, 30) } };
}
export function registerScandal(c: Career, input: Pick<Scandal, 'id' | 'title' | 'summary' | 'source' | 'severity' | 'evidence' | 'trigger'> & Partial<Scandal>): Career {
  if (c.scandals.some(s => s.id === input.id || s.related.includes(input.id))) return c;
  const date = input.date ?? c.date;
  const open = c.scandals.find(s => isOpenCase(s) && family(s.trigger) === family(input.trigger) && Math.abs(months(s.date, date)) <= CONSOLIDATE_MONTHS);
  if (open) {
    const rank = { Minor: 0, Moderate: 1, Severe: 2 } as const;
    const merged: Scandal = { ...open, related: [...open.related, input.id], evidence: Math.min(100, Math.max(open.evidence, input.evidence) + 5),
      severity: rank[input.severity] > rank[open.severity] ? input.severity : open.severity,
      summary: `${open.allegation} Related: ${input.summary}`.slice(0, 600) };
    // One case, one story: the merged case keeps its saved coverage keys, so no extra pop-ups or reports.
    return { ...c, scandals: c.scandals.map(x => x.id === open.id ? merged : x) };
  }
  const s = scandalSchema.parse({ tenure: tenure(c), date: c.date, subject: c.character.name, allegation: input.summary, status: 'alleged', ...input });
  return announceScandal({ ...c, scandals: [...c.scandals, s] }, s);
}

/** Existing campaign/office findings are mirrored, never rerolled or penalized twice. */
export function scandalsTurn(c: Career, start: string, end: string): { career: Career; notices: string[] } {
  if (c.scandalLastTurn >= end || months(start, end) !== 3) return { career: c, notices: [] };
  let n = c;
  const allegation = c.campaign?.allegation;
  if (allegation?.target === c.character.name) {
    const id = `campaign|${c.campaign?.startDate}|${allegation.date}`;
    n = registerScandal(n, { id, date: allegation.date, title: `Campaign claim: ${allegation.text}`, summary: `Opposition sources allege ${allegation.text} during the ${c.campaign?.title} race.`, source: 'Opposition Leak', severity: 'Minor', evidence: 0, trigger: 'smear' });
    n = { ...n, scandals: n.scandals.map(s => s.id === id ? { ...s, status: allegation.status, evidence: allegation.status === 'proven' ? 85 : 0, severity: allegation.status === 'proven' ? 'Moderate' : 'Minor', finding: allegation.status === 'alleged' ? null : allegation.status === 'cleared' ? 'Independent review found no supporting evidence.' : 'Independent campaign review substantiated the conduct.' } : s) };
  }
  if (!n.scandals.some(s => months(s.date, end) < 6)) {
    const projects = [...(c.city?.publicProjects ?? []), ...(c.stateGovernment?.publicProjects ?? []), ...(c.federalGovernment?.publicProjects ?? [])];
    const p = projects.find(p => c.office && p.tenure === tenure(c) && p.expectedCompletionDate && p.expectedCompletionDate < end && ['paused', 'in_progress'].includes(p.status));
    const crisis = c.crises.find(x => x.tenure === tenure(c) && x.status === 'escalated' && x.neglectedTurns > 0 && ['project_failure', 'natural_disaster'].includes(x.type));
    if (p) n = registerScandal(n, { id: `project|${p.id}`, date: end, title: `Delay scrutiny: ${p.name}`, summary: `${p.name} missed its ${p.expectedCompletionDate} completion target. Reporters question oversight; a delay alone does not prove corruption.`, source: 'Investigative Reporter', severity: 'Moderate', evidence: 60, trigger: 'project' });
    else if (crisis) n = registerScandal(n, { id: `disaster|${crisis.id}`, date: end, title: `Oversight questioned: ${crisis.title}`, summary: `${crisis.title} escalated after ${crisis.neglectedTurns} neglected quarter(s). A whistleblower calls for records; responsibility remains disputed.`, source: 'Whistleblower', severity: 'Severe', evidence: 55, trigger: 'disaster' });
  }
  n = { ...n, scandalLastTurn: end, scandals: n.scandals.map(s => {
    if (s.lastProcessed >= end || s.closedAt) return s;
    const age = months(s.date, end);
    if (settled(s)) return { ...s, phase: 'Managed' as const, closedAt: s.closedAt || end, lastProcessed: end };
    // A botched response keeps the story burning for a year before it finally fades.
    if (s.resolution === 'backfired') return { ...s, phase: age >= 12 ? 'Managed' as const : 'Exploded' as const, closedAt: age >= 12 ? s.closedAt || end : s.closedAt, lastProcessed: end };
    const phase: Scandal['phase'] = s.status === 'cleared' ? 'Managed' : s.status === 'proven' || (s.severity === 'Severe' && s.evidence >= 70) ? 'Exploded' : age >= 9 ? 'Managed' : age >= 3 ? 'Active' : 'Emerging';
    return { ...s, phase, closedAt: phase === 'Managed' ? s.closedAt || end : s.closedAt, evidence: s.status === 'cleared' ? 0 : s.status === 'proven' ? Math.max(85, s.evidence) : s.evidence, lastProcessed: end };
  }) };
  for (const s of n.scandals) n = announceScandal(n, s);
  return { career: n, notices: activeScandals(n).map(s => `Scandal watch: ${s.title} — ${s.phase}, ${s.severity}, evidence ${s.evidence}%. ${coverageTone(s)}.`) };
}