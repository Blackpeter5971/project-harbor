import type { Career } from './career';
import { currentBudget, indicators } from './budget';
import { financeOf, isExecutive } from './government-finance';
import { publicProjects } from './public-projects';
import { tenureKey } from './support';
import { eventMoodPressure } from './quarterly-events';

/* Phase 2 — Citizen Happiness. A discrete −5…+5 mood, distinct from approval.
   It moves at most one step per quarter toward a factor-based target. */

export const MOODS: Record<number, { emoji: string; label: string }> = {
  5: { emoji: '😂', label: 'Extremely Happy' }, 4: { emoji: '😅', label: 'Very Happy' }, 3: { emoji: '😁', label: 'Happy' },
  2: { emoji: '😄', label: 'Satisfied' }, 1: { emoji: '🙂', label: 'Slightly Positive' }, 0: { emoji: '😶', label: 'Neutral' },
  [-1]: { emoji: '🙁', label: 'Dissatisfied' }, [-2]: { emoji: '☹️', label: 'Unhappy' }, [-3]: { emoji: '😞', label: 'Very Unhappy' },
  [-4]: { emoji: '😡', label: 'Angry' }, [-5]: { emoji: '👿', label: 'Extreme Unrest' },
};
export const mood = (score: number) => MOODS[Math.max(-5, Math.min(5, Math.round(score)))]!;
export const happinessScore = (c: Career) => financeOf(c).mood?.score ?? 0;

export type Factor = { label: string; value: number };
const activeScandal = (c: Career) => (c.scandals ?? []).some(s => ['Active', 'Exploded'].includes(s.phase ?? '') );
const unresolvedCrises = (c: Career) => (c.crises ?? []).filter(p => p.tenure === tenureKey(c) && p.status !== 'resolved').length;

/** Each factor is a signed contribution in mood steps; the sum (clamped) is the target. */
export function happinessFactors(c: Career): Factor[] {
  const b = currentBudget(c), e = financeOf(c).economy, ind = indicators(c);
  const done = publicProjects(c).filter(p => p.status === 'completed').length;
  const neglected = financeOf(c).decisions.filter(d => d.decision === 'rejected' || d.decision === 'ignored').length;
  const s = (v: number) => Math.round(v * 10) / 10;
  return [
    { label: 'Taxes & cost of living', value: s((b.stance === 'cut' ? 0.8 : b.stance === 'raise' ? -0.8 : 0) + (e.household - 50) / 20) },
    { label: 'Jobs & prosperity', value: s((e.employment - 50) / 15 + (e.business - 50) / 30) },
    { label: 'Health, schools & services', value: s((ind.services - 62) / 12) },
    { label: 'Infrastructure', value: s((ind.infrastructure - 58) / 15) },
    { label: 'Project delivery', value: s(Math.min(2, done * 0.6) - Math.min(2, neglected * 0.5)) },
    { label: 'Security & disasters', value: s(-Math.min(2, unresolvedCrises(c) * 0.8) - (c.stateGovernment?.disaster && !c.stateGovernment.disaster.resolved ? 0.8 : 0) - (c.city?.emergency && !c.city.emergency.resolved ? 0.8 : 0)) },
    { label: 'Events & emergencies', value: s(eventMoodPressure(c)) },
    { label: 'Corruption & scandal', value: s(activeScandal(c) ? -1.5 : 0) },
  ];
}
export const happinessTarget = (c: Career) => Math.max(-5, Math.min(5, Math.round(happinessFactors(c).reduce((t, f) => t + f.value, 0))));

/** Approval momentum per quarter. Positive momentum is cancelled by scandal or a strong opposition campaign. */
export function approvalMomentum(c: Career, score: number): number {
  const base = score >= 4 ? 1.5 : score >= 2 ? 1 : score === 1 ? 0.3 : score === 0 ? 0 : score >= -2 ? -1 : score >= -4 ? -2.5 : -4;
  if (base > 0 && (activeScandal(c) || (c.campaign?.opponents?.some(r => !r.out && r.momentum > 5) ?? false))) return 0;
  return base;
}
export function publicReaction(score: number, streak: number): { level: 'calm' | 'criticism' | 'protest' | 'unrest'; text: string } {
  if (score <= -5) return { level: 'unrest', text: streak >= 2 ? 'Civil unrest persists; crowds demand your resignation and lawmakers discuss removal.' : 'Civil unrest erupts; demands for resignation spread.' };
  if (score <= -3) return { level: 'protest', text: 'Labor strikes and student demonstrations; the opposition steps up pressure.' };
  if (score <= -1) return { level: 'criticism', text: 'Complaints mount on talk radio and in letters to the editor.' };
  return { level: 'calm', text: score >= 3 ? 'Residents broadly praise the administration.' : 'Daily life is steady; no organized protest.' };
}
export function moodSummary(c: Career) {
  const score = happinessScore(c), m = mood(score), streak = financeOf(c).mood?.unrestQuarters ?? 0;
  return { score, ...m, reaction: publicReaction(score, streak), streak };
}
export const isExecutiveMood = (c: Career) => isExecutive(c);
