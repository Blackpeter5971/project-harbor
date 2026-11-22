import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer } from '@/lib/game/career';
import { advanceTurn, jobs } from '@/lib/game/gameplay';
import { careerBusinessView, careerLevel } from '@/lib/game/business';

const employed = () => {
  const c = createCareer({ ...defaultDraft, name: 'Ada' });
  return { ...c, money: 0, job: { id: jobs[0]!.id, since: c.date }, workMonths: 10 };
};

describe('Career & Business', () => {
  it('older saves without businesses load with an empty list and keep the job', () => {
    const { businesses, ...old } = employed();
    const loaded = parseCareer(JSON.stringify(old))!;
    expect(loaded.businesses).toEqual([]);
    expect(loaded.job?.id).toBe(jobs[0]!.id);
    expect(loaded.workMonths).toBe(10);
  });

  it('overview shows salary per month and per 3-month turn', () => {
    const v = careerBusinessView(employed());
    expect(v.salaryPerMonth).toBe(jobs[0]!.salary);
    expect(v.salaryPerTurn).toBe(jobs[0]!.salary * 3);
  });

  it('career level advances at 12, 36 and 72 months worked', () => {
    expect(careerLevel(11).level).toBe(1);
    expect(careerLevel(12).level).toBe(2);
    expect(careerLevel(36).level).toBe(3);
    expect(careerLevel(72).level).toBe(4);
  });

  it('a turn still pays wages and adds 3 months of work history', () => {
    const c = employed();
    const next = advanceTurn(c).career;
    expect(next.workMonths).toBe(13);
    expect(next.ledger.some(l => l.amount > 0)).toBe(true);
    expect(next.businesses).toEqual([]);
  });
});
