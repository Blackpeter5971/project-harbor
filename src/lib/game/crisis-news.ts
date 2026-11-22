import type { Career } from './career';

/** Persist event publication intent with the transition; old records are not re-announced. */
export function queueCrisisNews(c: Career, id: string, event: 'outbreak' | 'response' | 'outcry' | 'resolution', date: string, detail?: string): Career {
  const p = c.crises.find(item => item.id === id);
  if (!p || p.reportedEvents?.includes(event)) return c;
  const location = c.office?.jurisdiction ?? p.jurisdiction;
  const headline = event === 'outbreak' ? `${p.title} breaks out` : event === 'response' ? `${p.selectedResponseId === 'delay' ? 'Delay draws criticism' : 'Response confirmed'}: ${p.title}` : event === 'outcry' ? `Public outcry over ${p.title}` : `${p.title} officially resolved`;
  const body = detail ?? (event === 'outbreak' ? `${p.description} Severity ${p.severity} of 3; ${p.durationRemaining} quarters remain. No response has been confirmed.` : event === 'outcry' ? `The emergency has lingered for ${p.neglectedTurns} quarters without effective intervention and is now escalated. Public approval faces modest ongoing pressure.` : p.outcome === 'managed' ? `The confirmed response has run its course. The crisis is resolved, with a positive talking point and improved loyalty among affected voters.` : `The crisis duration has expired. Ongoing penalties stop, but the record of deferred or absent intervention remains; this is not a successful intervention.`);
  const story: Career['newsQueue'][number] = { h: `${headline} · ${p.jurisdiction} · ${p.turnCreated} · ${date}`, sub: `${location} · ${date}`, body, tag: 'government', priority: p.severity === 3 || event === 'outcry' ? 1 : 2 };
  const historic = c.printedHeadlines.includes(story.h) || c.news.some(e => e.stories.some(s => s.h === story.h));
  return { ...c, crises: c.crises.map(item => item.id === id ? { ...item, reportedEvents: [...(item.reportedEvents ?? []), event] } : item),
    newsQueue: historic || c.newsQueue.some(s => s.h === story.h) ? c.newsQueue : [...c.newsQueue, story] };
}

export function crisisReportLines(c: Career, before: Career): string[] {
  const previous = new Set(before.crises.flatMap(p => (p.reportedEvents ?? []).map(event => `${p.id}|${event}`)));
  return c.crises.flatMap(p => (p.reportedEvents ?? []).filter(event => !previous.has(`${p.id}|${event}`) || event === 'response' && p.responseDate === before.date).map(event =>
    `Crisis ${event === 'outbreak' ? 'began' : event === 'outcry' ? 'escalated' : event === 'resolution' ? 'resolved' : 'response confirmed'}: ${p.title}${event === 'resolution' && p.outcome === 'neglected' ? ' — expired after neglect; not a successful intervention' : ''}.`));
}

export const activeCrisisWarnings = (c: Career) => {
  if (!c.office || c.date < c.office.since || c.office.termEnd && c.date >= c.office.termEnd) return [];
  const tenure = `${c.office.id}|${c.office.jurisdiction}|${c.office.since}`;
  const active = c.crises.filter(p => p.status !== 'resolved' && p.turnCreated <= c.date && (!p.tenure || p.tenure === tenure));
  return active.length ? [`${active.length} active public ${active.length === 1 ? 'crisis' : 'crises'}; ${active.filter(p => ['unaddressed', 'prolonged'].includes(p.trajectory)).length} awaiting effective intervention.`] : [];
};