import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft } from '@/lib/game/career';
import { budgetAuthority, baselineSpend, currentBudget, indicators, proposeBudget, revenueWithTaxes, tradeOffs } from '@/lib/game/budget';
import { billAction } from '@/lib/game/legislation';
import { ensureApproval } from '@/lib/game/approval';

const base = () => createCareer({ ...defaultDraft, name: 'Alex Morgan', party: 'Democrat' });
const withOffice = (id: string, title: string) => ({ ...base(), date: '2028-06-01', publicOffice: true, reputation: 50, actions: 75, office: { id, title, jurisdiction: 'Test jurisdiction', since: '2028-01-01', party: 'Democrat' as const, elected: '2027-11-01', termEnd: '2032-01-01', margin: 8 } });
const enact = (c: ReturnType<typeof withOffice>, spending: ReturnType<typeof baselineSpend>) => {
  const strong = ensureApproval({ ...c, relationships: 100, skills: { ...c.skills, leadership: 100 } });
  const r = proposeBudget(strong, spending, 'hold');
  if (!r.ok) throw new Error(r.message);
  let n = r.career;
  const id = n.bills[0]?.id;
  if (!id) throw new Error('Missing budget');
  for (const a of ['consider', 'vote', 'approve'] as const) {
    const result = billAction(n, id, a);
    if (!result.ok) throw new Error(result.message);
    n = result.career;
  }
  return n;
};

describe('Public budgets and taxes', () => {
  it('only executives can propose budgets; legislators cannot', () => {
    expect(budgetAuthority(withOffice('mayor', 'Mayor')).canPropose).toBe(true);
    expect(budgetAuthority(withOffice('governor', 'Governor')).canPropose).toBe(true);
    expect(budgetAuthority(withOffice('president', 'President')).canPropose).toBe(true);
    expect(budgetAuthority(withOffice('council', 'City Council Member')).canPropose).toBe(false);
    expect(budgetAuthority(withOffice('stateLeg', 'State Legislator')).canPropose).toBe(false);
    expect(budgetAuthority(withOffice('senate', 'U.S. Senator')).canPropose).toBe(false);
    expect(budgetAuthority(base()).canPropose).toBe(false);
  });

  it('an over-budget proposal is rejected and nothing changes', () => {
    const c = withOffice('mayor', 'Mayor');
    const base = baselineSpend(c);
    const revenue = revenueWithTaxes(c, 'hold');
    const overspend = { ...base, services: revenue * 2 } as Record<string, number>;
    const r = proposeBudget(c, overspend, 'hold');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('Over budget');
    expect(c.budget).toBeNull();
    expect(c.actions).toBe(75);
  });

  it('a balanced proposal is pending, costs 1 action, and cannot automatically be adopted', () => {
    const c = withOffice('mayor', 'Mayor');
    const r = proposeBudget(c, baselineSpend(c), 'hold');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.career.actions).toBe(60);
    expect(r.career.budget).toBeNull();
    expect(r.career.bills[0]?.stage).toBe('proposed');
    const adopted = enact(c, baselineSpend(c));
    expect(adopted.budget?.proposals).toHaveLength(1);
    expect(adopted.budget?.proposals[0]?.result).toContain('surplus');
    expect(r.career.newsQueue.some(s => s.h.includes('budget'))).toBe(true);
  });

  it('raising taxes increases revenue; cutting taxes reduces it', () => {
    const c = withOffice('governor', 'Governor');
    const hold = revenueWithTaxes(c, 'hold');
    expect(revenueWithTaxes(c, 'raise')).toBeGreaterThan(hold);
    expect(revenueWithTaxes(c, 'cut')).toBeLessThan(hold);
  });

  it('every spending choice shows a trade-off and moves approval with a cause', () => {
    const c = withOffice('mayor', 'Mayor');
    const base = baselineSpend(c);
    const boosted = { ...base, education: base['education']! * 1.3, services: base['services']! * 0.5 };
    const n = enact(c, boosted);
    const approval = n.approval;
    if (!approval) throw new Error('Missing approval');
    const reasons = approval.history.map(h => h.reason).join(' ');
    expect(reasons).toContain('Education');
    expect(reasons).toContain('Public services');
    expect(approval.history.every(h => h.reason.length > 0)).toBe(true);
    // Groups reacted differently: education boost pleased youth, service cuts angered them less than workers/seniors.
    const g = approval.groups;
    expect(g['youth'] ?? 0).toBeGreaterThan(g['working'] ?? 0);
  });

  it('indicators respond to spending levels', () => {
    const c = withOffice('mayor', 'Mayor');
    const balanced = indicators(c);
    const cut = { ...c, budget: { year: 2028, revenue: 0, taxes: 'hold' as const, spending: { ...baselineSpend(c), infrastructure: 0 }, proposals: [] } };
    expect(indicators(cut).infrastructure).toBeLessThan(balanced.infrastructure);
  });

  it('trade-off text exists for every category and direction', () => {
    for (const cat of ['services', 'infrastructure', 'safety', 'education', 'administration'] as const) {
      expect(tradeOffs(cat, 'more').text.length).toBeGreaterThan(10);
      expect(tradeOffs(cat, 'less').text.length).toBeGreaterThan(10);
    }
    const b = currentBudget(withOffice('mayor', 'Mayor'));
    expect(b.total).toBeGreaterThan(0);
    expect(b.balance).toBe(b.revenue - b.total);
  });
});
