import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { healthStatus, quarterlyExpenses, selectDiet, selectInsurance } from '@/lib/game/life';
import { FoodHealthPanel } from '@/components/game/life-view';

afterEach(cleanup);
const make = (over: Partial<Career> = {}): Career => ({ ...createCareer({ ...defaultDraft, name: 'Meter' }), ...over });

describe('Food & health dashboard', () => {
  it('health meter matches career.health with the right status', () => {
    render(<FoodHealthPanel career={make({ health: 42 })} />);
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('42');
    expect(screen.getByTestId('health-value').textContent).toBe('42%');
    expect(screen.getByTestId('health-status').textContent).toBe('Fatigued');
  });

  it('health status thresholds', () => {
    expect([90, 70, 40, 20].map(healthStatus)).toEqual(['Vibrant', 'Healthy', 'Fatigued', 'Ill']);
  });

  it('switching diet updates the active diet and recalculates next quarter costs', () => {
    const c = make({ money: 10_000 });
    const rent = c.housing!.status === 'renting' ? c.housing!.monthlyRent * 3 : 0;
    expect(quarterlyExpenses(c)).toEqual({ housing: rent, groceries: 1050, medical: 0, lifestyle: 1200, total: rent + 2250 });
    const r = selectDiet(c, 'premium');
    if (!r.ok) throw new Error(r.message);
    const ins = selectInsurance(r.career, 'basic_hmo');
    if (!ins.ok) throw new Error(ins.message);
    expect(quarterlyExpenses(ins.career)).toEqual({ housing: rent, groceries: 2250, medical: 300, lifestyle: 1200, total: rent + 3750 });
    render(<FoodHealthPanel career={ins.career} />);
    expect(within(screen.getByRole('article', { name: 'Premium Dining & Delivery' })).getByText('Current diet')).toBeTruthy();
    expect(screen.getByTestId('cost-groceries').textContent).toBe('$2,250');
    expect(screen.getByTestId('cost-total').textContent).toBe(`$${(rent + 3750).toLocaleString('en-US')}`);
  });

  it('blocks luxury meal plans when personal cash cannot cover the quarter, ignoring campaign money', () => {
    const c = make({ money: 4499, warChest: 1_000_000 });
    expect(selectDiet(c, 'organic_chef').ok).toBe(false);
    render(<FoodHealthPanel career={c} onResult={() => {}} />);
    const chef = screen.getByRole('article', { name: 'Private Nutritionist & Chef' });
    expect((within(chef).getByRole('button', { name: 'Select Diet' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(chef).getByText(/You need \$1 more/)).toBeTruthy();
    expect(selectDiet({ ...c, money: 4500 }, 'organic_chef').ok).toBe(true);
  });

  it('shows the healthcare plan with prices and out-of-pocket share', () => {
    render(<FoodHealthPanel career={make({ money: 2000 })} onResult={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Healthcare & Insurance' }));
    expect(screen.getByTestId('insurance-name').textContent).toContain('No Insurance');
    const ppo = screen.getByRole('article', { name: 'Executive Plan' });
    expect(within(ppo).getByRole('button', { name: 'Switch to Executive Plan · $350/mo' })).toBeTruthy();
    expect(within(ppo).getByText('10%')).toBeTruthy();
  });
});
