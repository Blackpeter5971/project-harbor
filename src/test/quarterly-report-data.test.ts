import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft } from '@/lib/game/career';
import { quarterlyReportData } from '@/components/game/quarterly-report-data';

describe('quarterly report presentation data', () => {
  it('groups actual personal receipts and excludes older and future quarters', () => {
    const career = { ...createCareer({ ...defaultDraft, name: 'Alex Morgan' }), date: '2026-10-01', ledger: [
      { month: '2026-07-01', label: 'Salary', amount: 1000 },
      { month: '2026-08-01', label: 'Salary', amount: 1000 },
      { month: '2026-09-01', label: 'Dividends', amount: 250 },
      { month: '2026-07-01', label: 'Groceries', amount: -300 },
      { month: '2026-07-01', label: 'Taxes', amount: -200 },
      { month: '2026-06-01', label: 'Old salary', amount: 9000 },
      { month: '2027-01-01', label: 'Future salary', amount: 9000 },
    ] };
    const before = JSON.stringify(career);
    const report = quarterlyReportData(career);
    expect(report.totalIncome).toBe(2250);
    expect(report.totalExpenses).toBe(500);
    expect(report.net).toBe(1750);
    expect(report.income.find(entry => entry.label === 'Salary')?.amount).toBe(2000);
    expect(JSON.stringify(career)).toBe(before);
  });
  it('reads signed stat changes without inventing missing gains', () => {
    const career = { ...createCareer({ ...defaultDraft, name: 'Alex Morgan' }), date: '2027-01-01', report: { period: 'Oct–Dec 2026', lines: [
      'Reputation 15 (−2) · Experience 10 (+3) · Relationships 5 · Contacts 2',
      'Approval fell to 49% (-4).',
    ] } };
    const data = quarterlyReportData(career);
    expect(data.reputationDelta).toBe(-2);
    expect(data.experienceDelta).toBe(3);
    expect(data.approvalDelta).toBe(-4);
    expect(quarterlyReportData({ ...career, report: null }).experienceDelta).toBe(0);
  });
});