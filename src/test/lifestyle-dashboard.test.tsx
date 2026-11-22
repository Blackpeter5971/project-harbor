import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { createCareer, defaultDraft } from '@/lib/game/career';
import { ensureLife, quarterlyExpenses } from '@/lib/game/life';
import { energyStatus, selectLifestyle, stressStatus } from '@/lib/game/lifestyle';
import { LifestylePanel } from '@/components/game/life-view';

const make = (money: number, energy = 80, stress = 20) => { const c = ensureLife({ ...createCareer({ ...defaultDraft, name: 'V' }), money }); return { ...c, life: { ...c.life!, energy, stress } }; };

describe('Lifestyle & vitality dashboard', () => {
  it('gauges match saved energy and stress', () => {
    render(<LifestylePanel career={{ ...make(5000, 42, 77), actions: 42 }} />);
    expect(screen.getByTestId('energy-value').textContent).toBe('42%');
    expect(screen.getByTestId('energy-status').textContent).toBe('Tired');
    expect(screen.getByTestId('stress-value').textContent).toBe('77%');
    expect(screen.getByTestId('stress-status').textContent).toBe('Burnout Risk');
    expect([90, 60, 30, 10].map(energyStatus)).toEqual(['Peak', 'Energetic', 'Tired', 'Exhausted']);
    expect([10, 30, 60, 80].map(stressStatus)).toEqual(['Serene', 'Manageable', 'Stressed', 'Burnout Risk']);
  });
  it('switching lifestyle updates the active tier and the quarterly budget', () => {
    const c = make(20_000);
    const before = quarterlyExpenses(c);
    const r = selectLifestyle(c, 'affluent'); if (!r.ok) throw new Error(r.message);
    const after = quarterlyExpenses(r.career);
    expect(after.lifestyle).toBe(3600);
    expect(after.total - before.total).toBe(3600 - 1200);
    render(<LifestylePanel career={r.career} />);
    expect(within(screen.getByRole('article', { name: 'Affluent / High-End' })).getByText('Current lifestyle')).toBeTruthy();
    expect(screen.getByTestId('cost-lifestyle').textContent).toBe('$3,600');
  });
  it('insufficient personal cash disables higher tiers', () => {
    render(<LifestylePanel career={make(3000)} onResult={() => {}} />);
    const lux = screen.getByRole('article', { name: 'Luxury / Elite' });
    expect((within(lux).getByRole('button', { name: 'Select Lifestyle' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(lux).getByText(/You need \$7,500 more/)).toBeTruthy();
    const aff = screen.getByRole('article', { name: 'Affluent / High-End' });
    expect((within(aff).getByRole('button', { name: 'Select Lifestyle' }) as HTMLButtonElement).disabled).toBe(true);
    const min = screen.getByRole('article', { name: 'Frugal / Minimalist' });
    expect((within(min).getByRole('button', { name: 'Select Lifestyle' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
