import type { Career } from './career';
import { jobs } from './job-market';

export const careerLevels = [
  { min: 0, name: 'Entry Level', multiplier: 1 },
  { min: 12, name: 'Established', multiplier: 1.15 },
  { min: 36, name: 'Senior', multiplier: 1.35 },
  { min: 72, name: 'Veteran', multiplier: 1.6 },
] as const;
export function careerLevel(months: number) {
  let index = 0;
  careerLevels.forEach((l, i) => { if (months >= l.min) index = i; });
  const current = careerLevels[index] ?? careerLevels[0];
  const next = careerLevels[index + 1];
  return { level: index + 1, name: current.name, nextAt: next?.min ?? null, monthsToNext: next ? Math.max(0, next.min - months) : null };
}
type EmploymentCareer = Pick<Career, 'job' | 'workMonths'> & Partial<Pick<Career, 'skills'>>;
const round = (n: number) => Math.round(n * 100) / 100;
function performance(c: EmploymentCareer) {
  const skill = jobs.find(j => j.id === c.job?.id)?.primarySkill ?? 'communication';
  return Math.max(0, Math.min(100, c.skills?.[skill] ?? 0));
}
function scaledSalary(c: EmploymentCareer, level: number, catalog: number) {
  const step = careerLevels[level - 1] ?? careerLevels[0];
  // Performance affects only the earned increment, never the original wage.
  return round(catalog * (1 + (step.multiplier - 1) * (1 + performance(c) / 100 * 0.2)));
}
export function employmentPay(c: EmploymentCareer) {
  const job = jobs.find(j => j.id === c.job?.id);
  const progression = careerLevel(c.workMonths);
  const level = Math.max(progression.level, c.job?.payLevel ?? 1);
  const step = careerLevels[level - 1] ?? careerLevels[0];
  const salary = job ? c.job?.payLevel === level && c.job.basePay !== undefined ? c.job.basePay : scaledSalary(c, level, job.salary) : 0;
  const title = job ? level === 1 ? job.title : `${step.name} ${job.title}` : null;
  return { salary, quarterly: round(salary * 3), title, level, progression };
}
/** Lock a legacy salary without issuing money or backdating a promotion. */
export function ensureEmploymentPay(c: Career): Career {
  if (!c.job) return c;
  const pay = employmentPay(c);
  if (c.job.payLevel === pay.level && c.job.basePay === pay.salary) return c;
  return { ...c, job: { ...c.job, payLevel: pay.level, basePay: pay.salary } };
}
/** Called only after paid work months advance. No promotion claim endpoint exists. */
export function reviewPromotion(c: Career, effectiveDate: string): { career: Career; notice: string | null } {
  if (!c.job) return { career: c, notice: null };
  const oldLevel = c.job.payLevel ?? careerLevel(c.workMonths).level;
  const newLevel = careerLevel(c.workMonths).level;
  if (newLevel <= oldLevel) return { career: c, notice: null };
  const job = jobs.find(j => j.id === c.job?.id);
  if (!job) return { career: c, notice: null };
  const before = c.job.basePay ?? scaledSalary(c, oldLevel, job.salary);
  const salary = scaledSalary(c, newLevel, job.salary);
  const step = careerLevels[newLevel - 1] ?? careerLevels[0];
  const title = `${step.name} ${job.title}`;
  const promotion = { date: effectiveDate, title, fromLevel: oldLevel, toLevel: newLevel, previousSalary: before, salary };
  const next = { ...c, job: { ...c.job, payLevel: newLevel, basePay: salary, promotion } };
  return { career: next, notice: `Promotion confirmed: ${title}. Monthly base pay $${before.toFixed(2)} → $${salary.toFixed(2)}; next quarter $${round(salary * 3).toFixed(2)}. Effective ${effectiveDate}.` };
}