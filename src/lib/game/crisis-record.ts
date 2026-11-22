import type { Career } from './career';
import type { Crisis } from './crisis-schema';

export const crisisVoterGroup = (p: Pick<Crisis, 'type'>) => p.type === 'health' ? 'seniors' : ['economic', 'worker_strike'].includes(p.type) ? 'labor' : 'suburban';

/** Read the player's permanent record, not unrelated or future-office crises. */
export function crisisRecord(c: Career, date = c.date) {
  const tenures = [c.office, ...c.termHistory.map(t => t.office)].filter(o => o !== null).map(o => `${o.id}|${o.jurisdiction}|${o.since}`);
  const records = (c.crises ?? []).filter(p => p.turnCreated <= date && (p.tenure ? tenures.includes(p.tenure) : !!c.office && p.jurisdiction === (['mayor', 'council'].includes(c.office.id) ? 'city' : ['governor', 'stateLeg'].includes(c.office.id) ? 'state' : 'federal')));
  const neglected = records.filter(p => p.status !== 'resolved' && ['unaddressed', 'prolonged'].includes(p.trajectory) || p.status === 'resolved' && p.outcome === 'neglected');
  const managed = records.filter(p => p.status === 'resolved' && p.outcome === 'managed');
  return {
    score: Math.max(-4, Math.min(2, managed.length - neglected.reduce((sum, p) => sum + (p.status === 'escalated' ? 2 : 1), 0))),
    neglected: neglected.map(p => p.title),
    talkingPoints: managed.map(p => `Resolved ${p.title}`),
  };
}