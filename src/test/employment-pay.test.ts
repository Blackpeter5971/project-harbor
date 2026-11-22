import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { advanceTurn } from '@/lib/game/gameplay';
import { ensureEmploymentPay, employmentPay, reviewPromotion } from '@/lib/game/employment';
import { employmentForecast } from '@/lib/game/employment-forecast';
import { creditProfile } from '@/lib/game/banking';
const employed = (months = 9): Career => ({ ...createCareer({ ...defaultDraft, name: 'Ada' }), money: 20000, workMonths: months, job: { id: 'teller', since: '2026-01-01' }, skills: { communication: 0, leadership: 0, knowledge: 0 } });
describe('promotion salary', () => {
  it('raises base pay when 12 paid months unlock Established seniority and updates all forecasts immediately', () => {
    const c = employed();
    const next = advanceTurn(c).career;
    expect(next.workMonths).toBe(12);
    expect(next.job?.promotion?.title).toBe('Established Bank Teller');
    expect(next.job?.basePay).toBe(2761.08);
    expect(employmentPay(next).quarterly).toBe(8283.24);
    expect(creditProfile(next).income).toBe(8283.24);
    expect(Math.round((employmentForecast(next).net - employmentForecast(c).net) * 100) / 100).toBe(1083.24);
  });
  it('pays the next quarter at the exact promoted wage with three itemized salary lines', () => {
    const promoted = advanceTurn(employed()).career;
    const c = { ...promoted, report: null, newspaperPending: false, pendingEvent: null, eventEncounter: null };
    const next = advanceTurn(c).career;
    const wages = next.ledger.filter(e => e.month >= '2026-04-01' && e.month < '2026-07-01' && e.label.startsWith('Salary'));
    expect(wages).toHaveLength(3);
    expect(wages.map(e => e.amount)).toEqual([2761.08, 2761.08, 2761.08]);
    expect(Math.round(wages.reduce((s, e) => s + e.amount, 0) * 100) / 100).toBe(8283.24);
    expect(next.report?.lines.some(l => l.includes('8,283.24') && l.includes('Established Bank Teller'))).toBe(true);
    expect(advanceTurn(next).career.money).toBe(next.money);
  });
  it('does not retroactively raise the salary in the completed quarter', () => {
    const next = advanceTurn(employed()).career;
    expect(next.ledger.filter(e => e.label.startsWith('Salary')).map(e => e.amount)).toEqual([2400, 2400, 2400]);
  });
  it('keeps old active jobs, wealth, tenure and ledger while correcting earned seniority pay', () => {
    const c = employed(36);
    const loaded = parseCareer(JSON.stringify(c));
    if (!loaded) throw new Error('Cannot load');
    expect(loaded.job?.since).toBe(c.job?.since);
    expect(loaded.money).toBe(20000);
    expect(loaded.ledger).toEqual([]);
    expect(employmentPay(loaded).salary).toBe(3240);
    const next = advanceTurn(loaded).career;
    expect(next.ledger.filter(e => e.label.startsWith('Salary')).map(e => e.amount)).toEqual([3240, 3240, 3240]);
  });
  it('rejects repeated promotion effects without actual seniority advancement', () => {
    const locked = ensureEmploymentPay(employed());
    expect(reviewPromotion(locked, locked.date).career).toBe(locked);
    const promoted = advanceTurn(locked).career;
    const again = reviewPromotion(promoted, promoted.date);
    expect(again.notice).toBeNull();
    expect(again.career).toBe(promoted);
    const loaded = parseCareer(JSON.stringify(promoted));
    if (!loaded) throw new Error('Cannot load');
    expect(reviewPromotion(loaded, loaded.date).notice).toBeNull();
    expect(employmentPay(loaded).salary).toBe(2761.08);
  });
  it('uses smooth seniority steps and bounded performance without paying for skill changes alone', () => {
    expect([0, 12, 36, 72].map(m => employmentPay(employed(m)).salary)).toEqual([2400, 2760, 3240, 3840]);
    const skilled = { ...employed(12), skills: { communication: 0, leadership: 0, knowledge: 100 } };
    expect(employmentPay(skilled).salary).toBe(2832);
    const locked = ensureEmploymentPay(employed(12));
    expect(employmentPay({ ...locked, skills: skilled.skills }).salary).toBe(2760);
  });
  it('personal salary increases never debit or credit other account domains', () => {
    const c = ensureEmploymentPay(employed());
    const next = reviewPromotion({ ...c, workMonths: 12 }, '2026-04-01').career;
    expect(next.money).toBe(c.money);
    expect(next.campaign).toBe(c.campaign);
    expect(next.warChest).toBe(c.warChest);
    expect(next.businesses).toBe(c.businesses);
    expect(next.treasury).toBe(c.treasury);
  });
});